import { describe, expect, it } from 'vitest';
import { setup, signInWithGoogle, signInWithPhone, type Ctx } from './helpers';

const DEFAULT = '00000000-0000-4000-8000-000000000001';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const T = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();
const hh = (n: number) => ({ id: id(n), headName: `H${n}`, fatherName: 'कालू', jati: 'भील', atak: 'डामोर', village: 'सरवन', fala: 'ऊपला', phone: null, createdAt: T(0), updatedAt: T(1) });
const en = (n: number, house: number, extra: Record<string, unknown> = {}) => ({
  id: id(n), eventId: id(900), otherHouseholdId: id(house), direction: 'AAYA', cashPaise: 50100, inKindItem: null, inKindValuePaise: 0,
  paymentMode: 'CASH', recordedBy: 'me', createdAt: T(n), correctsEntryId: null, isVoid: false, ...extra,
});
const ev = (n: number, host: number) => ({ id: id(n), hostHouseholdId: id(host), occasion: 'SHAADI', date: '2026-11-21', panchApproved: true, invitationType: 'KUMKUM', status: 'PLANNED', createdAt: T(0), updatedAt: T(1) });
const lg = (n: number) => ({ id: id(n), name: 'सीता', kind: 'PERSONAL', createdAt: T(0), updatedAt: T(1) });
const profile = (house: number) => ({ myHouseholdId: id(house), increment: { type: 'FIXED', rupees: 51 }, updatedAt: T(5) });

const push = (t: Ctx, token: string, b: object) => t.call('POST', '/v1/sync/push', { token, body: b });
const count = async (t: Ctx, table: string, userId: string) =>
  (await t.pg.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [userId])).rows[0] as { n: number };

async function fill(t: Ctx, token: string, base: number) {
  const r = await push(t, token, {
    ledgers: [lg(base + 5)], households: [hh(base + 1)], events: [ev(base + 2, base + 1)],
    entries: [en(base + 3, base + 1, { eventId: id(base + 2) }), en(base + 4, base + 1)], profile: profile(base + 1),
  });
  expect(r.json.rejected).toEqual([]);
}

describe('DELETE /v1/account', () => {
  it('requires authentication', async () => {
    const t = await setup();
    expect((await t.call('DELETE', '/v1/account')).status).toBe(401);
    expect((await t.call('DELETE', '/v1/account', { token: 'garbage' })).status).toBe(401);
  });

  it('removes the user, households, events, entries, ledgers, profile, refresh tokens and OTP rows', async () => {
    const t = await setup();
    const a = await signInWithPhone(t, '9876543210');
    await fill(t, a.accessToken, 100);
    expect((await count(t, 'households', a.user.id)).n).toBe(1);
    expect((await t.pg.query("SELECT count(*)::int AS n FROM otp_requests WHERE phone_e164 = '+919876543210'")).rows[0]).toEqual({ n: 1 });

    const r = await t.call('DELETE', '/v1/account', { token: a.accessToken });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true });
    for (const table of ['households', 'events', 'entries', 'ledgers', 'profiles', 'refresh_tokens']) {
      expect((await count(t, table, a.user.id)).n, table).toBe(0);
    }
    expect((await t.pg.query('SELECT count(*)::int AS n FROM users WHERE id = $1', [a.user.id])).rows[0]).toEqual({ n: 0 });
    expect((await t.pg.query('SELECT count(*)::int AS n FROM otp_requests')).rows[0]).toEqual({ n: 0 });
  });

  it('never touches anyone else\'s data, even when ids and the phone-less identity overlap', async () => {
    const t = await setup();
    const a = await signInWithPhone(t, '9876543210');
    const b = await signInWithGoogle(t, 'g-b');
    const c = await signInWithPhone(t, '9123456780');
    await fill(t, a.accessToken, 100);
    await fill(t, b.accessToken, 100); // same ids on purpose
    await fill(t, c.accessToken, 200);
    await t.call('DELETE', '/v1/account', { token: a.accessToken });
    for (const u of [b, c]) {
      for (const [table, n] of [['households', 1], ['events', 1], ['entries', 2], ['ledgers', 1], ['profiles', 1]] as const) {
        expect((await count(t, table, u.user.id)).n, `${table} of ${u.user.id}`).toBe(n);
      }
      expect((await count(t, 'refresh_tokens', u.user.id)).n).toBeGreaterThan(0);
    }
    // B and C still sync normally
    expect((await t.call('GET', '/v1/sync/pull', { token: b.accessToken })).json.households).toHaveLength(1);
    expect((await t.pg.query("SELECT count(*)::int AS n FROM otp_requests WHERE phone_e164 = '+919123456780'")).rows[0]).toEqual({ n: 1 });
  });

  it('is all-or-nothing: a failure part-way leaves everything in place', async () => {
    const t = await setup();
    const a = await signInWithPhone(t);
    await fill(t, a.accessToken, 100);
    // make the very last statement fail, after every earlier delete ran
    await t.pg.exec(`CREATE OR REPLACE FUNCTION block_user_delete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'blocked'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER block_user_delete BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION block_user_delete();`);
    try {
      const r = await t.call('DELETE', '/v1/account', { token: a.accessToken });
      expect(r.status).toBe(500);
      for (const [table, n] of [['households', 1], ['events', 1], ['entries', 2], ['ledgers', 1], ['profiles', 1]] as const) {
        expect((await count(t, table, a.user.id)).n, table).toBe(n);
      }
      expect((await count(t, 'refresh_tokens', a.user.id)).n).toBeGreaterThan(0);
    } finally {
      await t.pg.exec('DROP TRIGGER block_user_delete ON users; DROP FUNCTION block_user_delete();');
    }
  });

  it('is idempotent, kills refresh tokens, and a stale access token cannot write rows for the deleted user', async () => {
    const t = await setup();
    const a = await signInWithGoogle(t, 'g-1');
    await fill(t, a.accessToken, 100);
    expect((await t.call('DELETE', '/v1/account', { token: a.accessToken })).status).toBe(200);
    expect((await t.call('DELETE', '/v1/account', { token: a.accessToken })).status).toBe(200); // already gone
    expect((await t.call('POST', '/v1/auth/refresh', { body: { refreshToken: a.refreshToken } })).status).toBe(401);
    const stale = await push(t, a.accessToken, { households: [hh(1)] }); // token still valid for minutes: must not resurrect data
    expect(stale.status).toBe(401);
    expect((await t.pg.query('SELECT count(*)::int AS n FROM households')).rows[0]).toEqual({ n: 0 });
    // signing in again with the same Google account starts a fresh, empty account
    const fresh = await signInWithGoogle(t, 'g-1');
    expect(fresh.user.id).not.toBe(a.user.id);
    expect((await t.call('GET', '/v1/sync/pull', { token: fresh.accessToken })).json).toMatchObject({ households: [], entries: [], profile: null });
  });
});

describe('profile sync (my household + increment)', () => {
  it('stores one profile per user, last write wins, and a second device pulls it', async () => {
    const t = await setup();
    const a = await signInWithGoogle(t, 'g-1');
    const r = await push(t, a.accessToken, { profile: profile(1) });
    expect(r.json).toMatchObject({ accepted: { profile: 1 }, rejected: [] });
    // older write loses, equal timestamp does not replace, newer wins
    expect((await push(t, a.accessToken, { profile: { ...profile(2), updatedAt: T(4) } })).json.accepted.profile).toBe(0);
    expect((await push(t, a.accessToken, { profile: { ...profile(2), updatedAt: T(5) } })).json.accepted.profile).toBe(0);
    expect((await push(t, a.accessToken, { profile: { myHouseholdId: id(3), increment: { type: 'PERCENT', pct: 10 }, updatedAt: T(6) } })).json.accepted.profile).toBe(1);

    const fresh = await signInWithGoogle(t, 'g-1');
    const p = (await t.call('GET', '/v1/sync/pull', { token: fresh.accessToken })).json;
    expect(p.profile).toEqual({ myHouseholdId: id(3), increment: { type: 'PERCENT', pct: 10 }, updatedAt: T(6) });
    // nothing new after the cursor
    const again = (await t.call('GET', `/v1/sync/pull?since=${p.nextCursor}`, { token: fresh.accessToken })).json;
    expect(again.profile).toBeNull();
  });

  it('is private to its user and may omit fields', async () => {
    const t = await setup();
    const a = await signInWithGoogle(t, 'g-a');
    const b = await signInWithGoogle(t, 'g-b');
    await push(t, a.accessToken, { profile: profile(1) });
    expect((await t.call('GET', '/v1/sync/pull', { token: b.accessToken })).json.profile).toBeNull();
    await push(t, b.accessToken, { profile: { myHouseholdId: null, increment: null, updatedAt: T(1) } });
    expect((await t.call('GET', '/v1/sync/pull', { token: b.accessToken })).json.profile).toEqual({ myHouseholdId: null, increment: null, updatedAt: T(1) });
  });

  it('rejects malformed profiles per row without failing the batch', async () => {
    const t = await setup();
    const a = await signInWithGoogle(t);
    const bads = [
      { myHouseholdId: 'nope', increment: null, updatedAt: T(1) },
      { myHouseholdId: id(1), increment: { type: 'FIXED', rupees: -5 }, updatedAt: T(1) },
      { myHouseholdId: id(1), increment: { type: 'PERCENT', pct: 'x' }, updatedAt: T(1) },
      { myHouseholdId: id(1), increment: { type: 'WEIRD' }, updatedAt: T(1) },
      { myHouseholdId: id(1), increment: null, updatedAt: 'yesterday' },
      'str',
    ];
    for (const profile of bads) {
      const r = await push(t, a.accessToken, { households: [hh(1)], profile });
      expect(r.status).toBe(200);
      expect(r.json.accepted.households).toBeGreaterThanOrEqual(0);
      expect(r.json.rejected).toEqual([expect.objectContaining({ table: 'profile', id: null, index: 0 })]);
    }
  });
});

describe('ledgers', () => {
  it('syncs personal ledgers and ledger_id on events and entries (default ledger when omitted)', async () => {
    const t = await setup();
    const a = await signInWithGoogle(t);
    await push(t, a.accessToken, {
      ledgers: [lg(7)], households: [hh(1)], events: [{ ...ev(10, 1), ledgerId: id(7) }],
      entries: [en(20, 1, { ledgerId: id(7), eventId: id(10) }), en(21, 1)],
    });
    const p = (await t.call('GET', '/v1/sync/pull', { token: a.accessToken })).json;
    expect(p.ledgers).toEqual([lg(7)]);
    expect(p.events[0].ledgerId).toBe(id(7));
    expect(Object.fromEntries(p.entries.map((e: any) => [e.id, e.ledgerId]))).toEqual({ [id(20)]: id(7), [id(21)]: DEFAULT });
  });

  it('ledger names are last-write-wins; an event\'s ledger never changes', async () => {
    const t = await setup();
    const a = await signInWithGoogle(t);
    await push(t, a.accessToken, { ledgers: [lg(7)], events: [{ ...ev(10, 1), ledgerId: id(7) }] });
    await push(t, a.accessToken, { ledgers: [{ ...lg(7), name: 'सीता देवी', updatedAt: T(9) }], events: [{ ...ev(10, 1), ledgerId: id(8), updatedAt: T(9), status: 'HELD' }] });
    const p = (await t.call('GET', '/v1/sync/pull', { token: a.accessToken })).json;
    expect(p.ledgers[0].name).toBe('सीता देवी');
    expect(p.events[0]).toMatchObject({ status: 'HELD', ledgerId: id(7) });
  });

  it('migration default: rows pushed by an older app land in the household ledger', async () => {
    const t = await setup();
    const a = await signInWithGoogle(t);
    const old = { ...en(20, 1) };
    delete (old as Record<string, unknown>).ledgerId;
    await push(t, a.accessToken, { entries: [old] });
    expect((await t.call('GET', '/v1/sync/pull', { token: a.accessToken })).json.entries[0].ledgerId).toBe(DEFAULT);
  });
});
