import { describe, expect, it } from 'vitest';
import { withUserTx } from '../src/db';
import { makeStaff, nextPhone, seedLedger, setup, signInWithPhone, STAMP, uid } from './helpers';

const LEDGER_TABLES = ['households', 'events', 'entries', 'ledgers'];

async function twoUsers() {
  const t = await setup();
  const a = await signInWithPhone(t, nextPhone());
  const b = await signInWithPhone(t, nextPhone());
  await seedLedger(t, a.accessToken, 10);
  await seedLedger(t, b.accessToken, 20);
  return { t, a, b };
}
const count = (t: Awaited<ReturnType<typeof setup>>, userId: string, role: string, table: string) =>
  withUserTx(t.db, userId, role, async (q) => Number((await q.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`))[0]!.n));

describe('Row Level Security: the database itself keeps diaries private', () => {
  it('a user sees only their own rows, even with NO where clause', async () => {
    const { t, a, b } = await twoUsers();
    for (const table of ['households', 'events', 'entries']) {
      expect(await count(t, a.user.id, 'user', table)).toBe(table === 'entries' ? 2 : 1);
      expect(await count(t, b.user.id, 'user', table)).toBe(table === 'entries' ? 2 : 1);
    }
    const all = (await t.pg.query('SELECT count(*)::int AS n FROM households')).rows[0] as { n: number };
    expect(all.n).toBe(2); // the superuser sees both: proves the isolation above comes from RLS, not from missing data
  });

  it('a forged role setting does not widen access: role=owner with a user id still sees only that user', async () => {
    const { t, a, b } = await twoUsers();
    for (const forged of ['viewer', 'support', 'admin', 'owner', 'system']) {
      for (const table of LEDGER_TABLES) {
        const rows = await withUserTx(t.db, a.user.id, forged, (q) => q.query<{ user_id: string }>(`SELECT user_id FROM ${table}`));
        expect(rows.every((r) => r.user_id === a.user.id), `${forged}/${table}`).toBe(true);
        expect(rows.some((r) => r.user_id === b.user.id)).toBe(false);
      }
    }
  });

  it('an empty context (no set_config) returns nothing', async () => {
    const { t } = await twoUsers();
    for (const table of LEDGER_TABLES) {
      expect(Number((await t.db.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`))[0]!.n)).toBe(0);
    }
  });

  it('a user cannot write into, update or delete another user\'s rows', async () => {
    const { t, a, b } = await twoUsers();
    await expect(
      withUserTx(t.db, a.user.id, 'user', (q) =>
        q.query(`INSERT INTO households (user_id, id, head_name, father_name, jati, atak, village, fala, created_at, updated_at, server_seq)
                 VALUES ($1, $2, 'x', 'x', 'x', 'x', 'x', 'x', 'a', 'b', 1)`, [b.user.id, uid(99)])),
    ).rejects.toMatchObject({ message: expect.stringMatching(/row-level security/i) });
    const upd = await withUserTx(t.db, a.user.id, 'user', (q) => q.query(`UPDATE households SET head_name = 'hacked' WHERE user_id = $1 RETURNING 1`, [b.user.id]));
    const del = await withUserTx(t.db, a.user.id, 'user', (q) => q.query(`DELETE FROM entries WHERE user_id = $1 RETURNING 1`, [b.user.id]));
    expect(upd).toHaveLength(0);
    expect(del).toHaveLength(0);
    expect((await t.pg.query(`SELECT head_name FROM households WHERE user_id = $1`, [b.user.id])).rows[0]).toEqual({ head_name: 'SENTINEL_HEAD' });
  });

  it('an admin token gets ZERO ledger rows, at the database and through every admin route', async () => {
    const { t, a } = await twoUsers();
    const admin = await makeStaff(t, 'owner');
    for (const table of LEDGER_TABLES) expect(await count(t, admin.user.id, 'owner', table)).toBe(0);
    // support view without a consent grant is refused
    for (const table of LEDGER_TABLES) {
      const r = await t.call('GET', `/admin/api/support-view/${a.user.id}/${table}`, { token: admin.accessToken });
      expect(r.status).toBe(403);
      expect(r.json.error).toBe('no_active_grant');
    }
    // the admin's own sync pull is just their own (empty) data
    const pull = await t.call('GET', '/v1/sync/pull', { token: admin.accessToken });
    expect(pull.json.households).toEqual([]);
  });

  it('users cannot promote themselves or un-suspend themselves (column privileges)', async () => {
    const { t, a } = await twoUsers();
    await seedLedger(t, a.accessToken, 30); // creates a profiles row
    await expect(withUserTx(t.db, a.user.id, 'user', (q) => q.query(`UPDATE profiles SET role = 'owner' WHERE user_id = $1`, [a.user.id]))).rejects.toMatchObject({ code: '42501' });
    await expect(withUserTx(t.db, a.user.id, 'user', (q) => q.query(`INSERT INTO profiles (user_id, updated_at, server_seq, role) VALUES ($1, 'x', 1, 'owner') ON CONFLICT (user_id) DO NOTHING`, [uid(500)]))).rejects.toBeTruthy();
    await expect(withUserTx(t.db, a.user.id, 'user', (q) => q.query(`UPDATE users SET status = 'active' WHERE id = $1`, [a.user.id]))).rejects.toMatchObject({ code: '42501' });
    await expect(withUserTx(t.db, a.user.id, 'user', (q) => q.query(`SELECT staff_set_role($1, 'owner')`, [a.user.id]))).rejects.toMatchObject({ code: '42501' });
  });

  it('the runtime role has no BYPASSRLS, owns nothing, and every user_id table is FORCE RLS', async () => {
    const { t } = await setup().then((x) => ({ t: x }));
    const role = (await t.pg.query(`SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'notra_app'`)).rows[0] as { rolbypassrls: boolean; rolsuper: boolean };
    expect(role).toEqual({ rolbypassrls: false, rolsuper: false });
    const owned = (await t.pg.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE r.rolname IN ('notra_app') AND c.relnamespace = 'public'::regnamespace`)).rows[0] as { n: number };
    expect(owned.n).toBe(0);
    // Every public table with a user_id column must have RLS enabled AND forced (add new user-data tables to the RLS migration).
    const bad = (await t.pg.query(
      `SELECT c.relname FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname IN ('user_id') AND NOT a.attisdropped
       WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)`)).rows;
    expect(bad).toEqual([]);
    const users = (await t.pg.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'public.users'::regclass`)).rows[0];
    expect(users).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });

  it('analytics internals are not directly readable, and its functions refuse ordinary users', async () => {
    const { t, a } = await twoUsers();
    await expect(withUserTx(t.db, a.user.id, 'user', (q) => q.query('SELECT * FROM analytics.effective_entries'))).rejects.toMatchObject({ code: '42501' });
    await expect(withUserTx(t.db, a.user.id, 'user', (q) => q.query('SELECT * FROM analytics.events_per_month()'))).rejects.toMatchObject({ code: '42501' });
    await expect(withUserTx(t.db, a.user.id, 'user', (q) => q.query('SELECT * FROM admin_user_counts($1)', [a.user.id]))).rejects.toMatchObject({ code: '42501' });
    const viewerRows = await withUserTx(t.db, a.user.id, 'viewer', (q) => q.query('SELECT * FROM admin_user_counts($1)', [a.user.id]));
    expect(viewerRows[0]).toEqual({ households: 1, events: 1, entries: 2, ledgers: 0 }); // counts only
  });
});

describe('consented support access (the user grants, read-only, max 7 days)', () => {
  it('works only while the grant is active, only for that user, read-only, and is audit-logged', async () => {
    const { t, a, b } = await twoUsers();
    const support = await makeStaff(t, 'support');
    const viewer = await makeStaff(t, 'viewer');
    const view = (token: string, userId = a.user.id, table = 'households') => t.call('GET', `/admin/api/support-view/${userId}/${table}`, { token });

    expect((await view(support.accessToken)).status).toBe(403); // no grant yet

    // only the user can grant; staff cannot create one for someone else (RLS)
    await expect(withUserTx(t.db, support.user.id, 'support', (q) =>
      q.query(`INSERT INTO support_access_grants (id, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')`, [uid(900), a.user.id]))).rejects.toMatchObject({ code: '42501' });

    expect((await t.call('POST', '/v1/support/access', { token: a.accessToken, body: { action: 'grant', hours: 169 } })).status).toBe(400);
    const g = await t.call('POST', '/v1/support/access', { token: a.accessToken, body: { action: 'grant', hours: 24 } });
    expect(g.status).toBe(201);
    expect(Date.parse(g.json.expiresAt) - Date.now()).toBeLessThan(25 * 3600_000);

    const ok = await view(support.accessToken);
    expect(ok.status).toBe(200);
    expect(ok.json.items).toHaveLength(1);
    expect(ok.json.items[0].head_name).toBe('SENTINEL_HEAD'); // readable ONLY here, by consent
    const entries = await view(support.accessToken, a.user.id, 'entries');
    expect(entries.json.items).toHaveLength(2);

    // another user's data stays invisible: at the database, support sees only A's rows, never B's
    const seen = await withUserTx(t.db, support.user.id, 'support', (q) => q.query<{ user_id: string }>('SELECT DISTINCT user_id FROM households'));
    expect(seen.map((r) => r.user_id)).toEqual([a.user.id]);
    expect((await view(support.accessToken, b.user.id)).status).toBe(403);

    // viewer role never gets data, even with a grant
    expect((await view(viewer.accessToken)).status).toBe(403);
    expect(await count(t, viewer.user.id, 'viewer', 'households')).toBe(0);

    // read-only: no write is possible for support, grant or not
    const upd = await withUserTx(t.db, support.user.id, 'support', (q) => q.query(`UPDATE households SET head_name = 'x' WHERE user_id = $1 RETURNING 1`, [a.user.id]));
    expect(upd).toHaveLength(0);
    await expect(withUserTx(t.db, support.user.id, 'support', (q) => q.query(`DELETE FROM entries WHERE user_id = $1 RETURNING 1`, [a.user.id]))).resolves.toHaveLength(0);

    // every read is audited
    const log = (await t.pg.query(`SELECT action, admin_user_id, target_id, after_meta FROM admin_audit_log WHERE action = 'support_data_view' ORDER BY id`)).rows as any[];
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ admin_user_id: support.user.id, target_id: a.user.id });
    expect(JSON.stringify(log)).not.toContain('SENTINEL');

    // revoke is immediate
    expect((await t.call('POST', '/v1/support/access', { token: a.accessToken, body: { action: 'revoke' } })).json.revoked).toBe(1);
    expect((await view(support.accessToken)).status).toBe(403);
    expect(await count(t, support.user.id, 'support', 'households')).toBe(0);

    // expiry
    await t.call('POST', '/v1/support/access', { token: a.accessToken, body: { action: 'grant', hours: 1 } });
    expect((await view(support.accessToken)).status).toBe(200);
    await t.pg.query(`UPDATE support_access_grants SET granted_at = now() - interval '3 hours', expires_at = now() - interval '2 hours'`);
    expect((await view(support.accessToken)).status).toBe(403);
    expect(await count(t, support.user.id, 'support', 'entries')).toBe(0);
  });

  it('the database caps a grant at 7 days', async () => {
    const { t, a } = await twoUsers();
    await expect(t.pg.query(`INSERT INTO support_access_grants (id, user_id, expires_at) VALUES ($1, $2, now() + interval '8 days')`, [uid(901), a.user.id])).rejects.toThrow();
  });
});

describe('RLS and the rest of the schema', () => {
  it('account deletion and sync still work under RLS (cross-user isolation on push)', async () => {
    const { t, a, b } = await twoUsers();
    // A pushes a row with B's household id: it must not touch B's row
    await t.call('POST', '/v1/sync/push', { token: a.accessToken, body: { households: [{ id: uid(20), headName: 'overwrite', fatherName: 'x', jati: 'x', atak: 'x', village: 'x', fala: 'x', phone: null, createdAt: STAMP(0), updatedAt: STAMP(50) }] } });
    expect((await t.pg.query(`SELECT head_name FROM households WHERE user_id = $1 AND id = $2`, [b.user.id, uid(20)])).rows[0]).toEqual({ head_name: 'SENTINEL_HEAD' });
    expect((await t.call('DELETE', '/v1/account', { token: a.accessToken })).status).toBe(200);
    expect((await t.pg.query(`SELECT count(*)::int AS n FROM households WHERE user_id = $1`, [a.user.id])).rows[0]).toEqual({ n: 0 });
    expect((await t.pg.query(`SELECT count(*)::int AS n FROM households WHERE user_id = $1`, [b.user.id])).rows[0]).toEqual({ n: 1 });
    expect((await t.pg.query(`SELECT count(*)::int AS n FROM account_deletions WHERE source = 'self'`)).rows[0]).toEqual({ n: 1 });
  });
});
