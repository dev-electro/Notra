import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { createAdminApi } from '../src/admin/api';
import { rank, ROLES, type Role } from '../src/admin/auth';
import { maskContact, maskEmail, maskPhone } from '../src/admin/mask';
import { findForbidden, FORBIDDEN_KEYS, stripForbidden } from '../src/admin/privacy';
import { REPORT_NAMES } from '../src/admin/reports';
import { makeStaff, nextPhone, seedLedger, SENTINELS, setup, signInWithGoogle, signInWithPhone, type Ctx } from './helpers';

const A = '/admin/api';
const adminRoutes = async (t: Ctx) => createAdminApi({ db: t.db, config: t.config, sms: t.sms, googleKeys: t.google.keys }, { smsCostPaise: 25, serverVersion: 't' }, t.auth).routes;

describe('masking', () => {
  it('masks phones and e-mails as specified', () => {
    expect(maskPhone('+919876543210')).toBe('+91 98•••••210');
    expect(maskEmail('gaurav@gmail.com')).toBe('g•••@gmail.com');
    expect(maskContact('someone@example.org')).toBe('s•••@example.org');
    expect(maskContact('9876543210')).toBe('+91 98•••••210');
    expect(maskPhone(null)).toBeNull();
  });
  it('privacy helpers find and strip forbidden keys at any depth', () => {
    const v = { a: [{ ok: 1, head_name: 'x' }], b: { cash_paise: 5, in_kind_anything: 1, deep: { village: 'v' } }, phone_masked: 'ok' };
    expect(findForbidden(v).sort()).toEqual(['$.a[0].head_name', '$.b.cash_paise', '$.b.deep.village', '$.b.in_kind_anything']);
    expect(findForbidden(stripForbidden(v))).toEqual([]);
    for (const k of ['head_name', 'father_name', 'village', 'fala', 'atak', 'cash_paise', 'occasion_label', 'occasion_note', 'phone']) {
      expect(FORBIDDEN_KEYS as readonly string[]).toContain(k);
    }
  });
});

describe('admin authentication', () => {
  it('rejects missing, malformed, forged, tampered and expired sessions (401)', async () => {
    const t = await setup();
    expect((await t.call('GET', `${A}/me`)).status).toBe(401);
    expect((await t.call('GET', `${A}/me`, { token: 'garbage' })).status).toBe(401);
    const forged = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('00000000-0000-4000-8000-000000000001').setIssuer('notra-diary').setAudience('notra-api')
      .setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode('y'.repeat(40)));
    expect((await t.call('GET', `${A}/me`, { token: forged })).status).toBe(401);
    const owner = await makeStaff(t, 'owner');
    expect((await t.call('GET', `${A}/me`, { token: `${owner.accessToken.split('.')[0]}.AAAA` })).status).toBe(401); // tampered signature
    const other = await makeStaff(t, 'viewer');
    await t.pg.query(`UPDATE auth_sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1`, [other.user.id]);
    expect((await t.call('GET', `${A}/me`, { token: other.accessToken })).status).toBe(401); // expired session
    expect((await t.call('GET', `${A}/me`, { token: owner.accessToken })).json).toMatchObject({ role: 'owner' });
  });

  it('an ordinary user (role user) is not staff (403); a role in the token or request is ignored', async () => {
    const t = await setup();
    const u = await signInWithPhone(t, nextPhone());
    const r = await t.call('GET', `${A}/me`, { token: u.accessToken, headers: { 'x-role': 'owner', 'x-app-role': 'owner' } });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('not_staff');
  });

  it('a suspended staff member is locked out, and demotion takes effect immediately', async () => {
    const t = await setup();
    const owner = await makeStaff(t, 'owner');
    const s = await makeStaff(t, 'admin');
    expect((await t.call('GET', `${A}/me`, { token: s.accessToken })).status).toBe(200);
    await t.call('POST', `${A}/users/${s.user.id}/suspend`, { token: owner.accessToken, body: { reason: 'testing suspension' } });
    expect((await t.call('GET', `${A}/me`, { token: s.accessToken })).status).toBe(403);
    await t.call('POST', `${A}/users/${s.user.id}/unsuspend`, { token: owner.accessToken, body: { reason: 'testing unsuspend' } });
    await t.pg.query(`UPDATE profiles SET role = 'user' WHERE user_id = $1`, [s.user.id]);
    expect((await t.call('GET', `${A}/me`, { token: s.accessToken })).json.error).toBe('not_staff');
  });
});

/** Fill a route template with fixture ids. */
const fill = (path: string, f: Record<string, string>) => path.replace(/:(\w+)/g, (_m, k: string) => f[k] ?? 'x');

describe('role gates, on every registered route', () => {
  it('each endpoint refuses roles below its minimum (403 forbidden) and lets the minimum role through', async () => {
    const t = await setup();
    const routes = await adminRoutes(t);
    expect(routes.length).toBeGreaterThan(30);
    const staff = {} as Record<Role, Awaited<ReturnType<typeof makeStaff>>>;
    for (const r of ROLES) staff[r] = await makeStaff(t, r);
    const target = await signInWithPhone(t, nextPhone());
    const f = { userId: target.user.id, ticketId: target.user.id, blockId: target.user.id, key: 'maintenance', report: 'signups', table: 'households' };
    for (const route of routes) {
      const url = A + fill(route.path, f);
      const below = ROLES.filter((r) => rank(r) < rank(route.min));
      for (const role of below.slice(-1)) {
        const res = await t.call(route.method, url, { token: staff[role].accessToken, body: route.mutating ? {} : undefined });
        expect(res.status, `${route.method} ${route.path} as ${role}`).toBe(403);
        expect(res.json.error).toBe('forbidden');
      }
      // unauthenticated is always 401
      expect((await t.call(route.method, url, { body: route.mutating ? {} : undefined })).status, `${route.method} ${route.path} anon`).toBe(401);
      // the minimum role is not stopped by the gate (it may still get 400/404 for the dummy ids)
      const ok = await t.call(route.method, url, { token: staff[route.min].accessToken, body: route.mutating ? {} : undefined });
      expect(ok.json?.error, `${route.method} ${route.path} as ${route.min}`).not.toBe('forbidden');
      expect(ok.status).not.toBe(401);
    }
  });
});

describe('every mutation is audit-logged, and no response leaks ledger content', () => {
  it('walks all mutating routes with real payloads, then scans every route\'s response', async () => {
    const t = await setup();
    const routes = await adminRoutes(t);
    const owner = await makeStaff(t, 'owner');
    const other = await makeStaff(t, 'support');
    const target = await signInWithPhone(t, '9812345678');
    await seedLedger(t, target.accessToken, 40);
    await t.call('GET', '/v1/sync/pull', { token: target.accessToken, headers: { 'x-app-version': '1.4.2', 'x-platform': 'android' } });
    const victim = await signInWithPhone(t, nextPhone());
    await seedLedger(t, victim.accessToken, 60);
    await t.call('POST', '/v1/support', { token: target.accessToken, body: { category: 'grievance', subject: 'Cannot sync', body: 'It fails' } });
    // a pending community profile (with a private contact number) and a report about it, for the rishtey moderation routes
    const poster = await signInWithPhone(t, nextPhone());
    const prof = (await t.pg.query(`INSERT INTO rishtey_profiles (user_id, status, gender, first_name, age, contact, consent_at, district, state)
      VALUES ($1, 'pending', 'female', 'SENTINEL_RISHTEY', 25, '9000011111', now(), 'Dungarpur', 'Rajasthan') RETURNING id`, [poster.user.id])).rows[0] as { id: string };
    const rep = (await t.pg.query(`INSERT INTO rishtey_reports (user_id, profile_id, reason, note) VALUES ($1, $2, 'fake', 'looks fake') RETURNING id`, [target.user.id, prof.id])).rows[0] as { id: string };
    const f: Record<string, string> = { userId: target.user.id, key: 'announcement', report: 'signups', table: 'households', profileId: prof.id, reportId: rep.id };
    const texts: string[] = [];
    const covered = new Set<string>();
    const audits = async () => Number(((await t.pg.query('SELECT count(*)::int AS n FROM admin_audit_log')).rows[0] as { n: number }).n);

    type Step = [method: string, path: string, body: unknown, capture?: (j: any) => void];
    const steps: Step[] = [
      ['POST', '/users/:userId/unmask', { field: 'phone', reason: 'caller asked on helpline' }],
      ['POST', '/users/:userId/notes', { body: 'called back, fine' }],
      ['POST', '/users/:userId/signout', { reason: 'phone was lost' }],
      ['POST', '/users/:userId/suspend', { reason: 'abuse report 123' }],
      ['POST', '/users/:userId/unsuspend', { reason: 'cleared after review' }],
      ['PUT', '/config/:key', { value: { enabled: true, message_hi: 'नया खाता खुला है', starts_at: null, ends_at: null, level: 'info' }, reason: 'launch' }],
      ['POST', '/tickets', { category: 'bug', subject: 'Phone call', body: 'Caller reports a bug', channel: 'phone', contact: '9812345678' }, (j) => { f.ticketId = j.id; }],
      ['PATCH', '/tickets/:ticketId', { priority: 'high', assignee: 'asha' }],
      ['POST', '/tickets/:ticketId/notes', { body: 'looking into it', kind: 'note' }],
      ['POST', '/tickets/:ticketId/resolve', { resolution: 'fixed in 1.0.1', status: 'resolved' }],
      ['POST', '/abuse/blocklist', { kind: 'ip', value: '203.0.113.9', reason: 'otp flood' }, (j) => { f.blockId = j.id; }],
      ['DELETE', '/abuse/blocklist/:blockId', { reason: 'false positive' }],
      ['POST', '/reports/recompute', { from: '2026-01-01', to: '2026-01-03' }],
      ['POST', '/staff', { user_id: other.user.id, role: 'admin', reason: 'promote for test' }],
      ['PATCH', '/staff/:userId', { role: 'viewer', reason: 'demote for test' }],
      ['DELETE', '/staff/:userId', { reason: 'remove from staff' }],
      ['POST', '/rishtey/profiles/:profileId/review', { decision: 'approve' }],
      ['POST', '/rishtey/reports/:reportId/resolve', { action: 'dismiss', reason: 'profile looks genuine' }],
      ['POST', '/users/:userId/delete', { reason: 'user asked by email', confirm: `delete ${target.user.id.slice(0, 8)}` }],
    ];
    for (const [method, path, body, capture] of steps) {
      const before = await audits();
      const p = path.includes('/staff') && path !== '/staff' ? path.replace(':userId', other.user.id) : path;
      const res = await t.call(method, A + fill(p, f), { token: owner.accessToken, body });
      expect(res.status, `${method} ${path}: ${res.text}`).toBeLessThan(300);
      expect(await audits(), `audit row for ${method} ${path}`).toBeGreaterThan(before);
      texts.push(res.text);
      capture?.(res.json);
      covered.add(`${method} ${path}`);
    }
    // a failed action (wrong confirmation) writes nothing
    const n = await audits();
    expect((await t.call('POST', `${A}/users/${victim.user.id}/delete`, { token: owner.accessToken, body: { reason: 'no confirmation', confirm: 'nope' } })).status).toBe(400);
    expect(await audits()).toBe(n);
    // every mutating route has a step above: adding a route without covering its audit trail fails here
    expect(routes.filter((r) => r.mutating).map((r) => `${r.method} ${r.path}`).filter((k) => !covered.has(k))).toEqual([]);

    // The audit rows carry before/after metadata but no ledger content, and the unmask itself does not store the number.
    const log = JSON.stringify((await t.pg.query('SELECT * FROM admin_audit_log')).rows);
    expect(log).not.toContain('9812345678');
    for (const s of SENTINELS) expect(log).not.toContain(s);

    // ---- privacy scan: every GET route (and every report, as JSON and CSV) as the most privileged role ----
    f.userId = victim.user.id;
    f.ticketId = ((await t.pg.query(`SELECT id FROM support_tickets LIMIT 1`)).rows[0] as { id: string } | undefined)?.id ?? f.ticketId ?? '';
    for (const route of routes.filter((r) => r.method === 'GET' && !r.path.startsWith('/support-view/'))) {
      const urls = route.path === '/reports/:report' ? REPORT_NAMES.flatMap((n) => [`${A}/reports/${n}`, `${A}/reports/${n}?format=csv`]) : [A + fill(route.path, f)];
      for (const url of urls) {
        const res = await t.call('GET', url, { token: owner.accessToken });
        expect(res.status, url).toBe(200);
        texts.push(res.text);
        if (res.json) expect(findForbidden(res.json), url).toEqual([]);
      }
    }
    const all = texts.join('\n');
    for (const s of SENTINELS) expect(all, `leaked ${s}`).not.toContain(s);
  });
});

describe('users', () => {
  it('lists with filters, masks by default, and shows counts only (no rows)', async () => {
    const t = await setup();
    const owner = await makeStaff(t, 'owner');
    const viewer = await makeStaff(t, 'viewer');
    const u = await signInWithPhone(t, '9876543210');
    await seedLedger(t, u.accessToken, 1);
    await t.call('GET', '/v1/sync/pull', { token: u.accessToken, headers: { 'x-app-version': '2.0.1', 'x-platform': 'ios', 'x-os-version': '17.4' } });

    const list = await t.call('GET', `${A}/users?q=3210`, { token: viewer.accessToken });
    expect(list.json.total).toBe(1);
    expect(list.json.items[0]).toMatchObject({ id: u.user.id, phone_masked: '+91 98•••••210', app_version: '2.0.1', platform: 'ios', status: 'active', sign_in_methods: ['phone'] });
    expect(list.text).not.toContain('9876543210');
    expect((await t.call('GET', `${A}/users?q=12`, { token: viewer.accessToken })).status).toBe(400);
    expect((await t.call('GET', `${A}/users?q=${u.user.id}`, { token: viewer.accessToken })).json.total).toBe(1);
    expect((await t.call('GET', `${A}/users?method=google`, { token: viewer.accessToken })).json.total).toBe(0);
    expect((await t.call('GET', `${A}/users?status=suspended`, { token: viewer.accessToken })).json.total).toBe(0);
    expect((await t.call('GET', `${A}/users?created_from=2999-01-01`, { token: viewer.accessToken })).json.total).toBe(0);
    expect((await t.call('GET', `${A}/users?page_size=1&page=1`, { token: viewer.accessToken })).json.items).toHaveLength(1);

    const d = await t.call('GET', `${A}/users/${u.user.id}`, { token: viewer.accessToken });
    expect(d.json.counts).toMatchObject({ households: 2, events: 2, entries: 2, ledgers: 0 });
    expect(d.json.devices[0]).toMatchObject({ platform: 'ios', app_version: '2.0.1', os_version: '17.4' });
    expect(d.json.last_sync_at).toBeTruthy();
    expect(JSON.stringify(d.json)).not.toContain('SENTINEL');

    // google sign-in shows a masked e-mail
    const g = await signInWithGoogle(t, 'g-77', { email: 'Gaurav@Gmail.com' });
    const gl = await t.call('GET', `${A}/users?q=gmail`, { token: owner.accessToken });
    expect(gl.json.items).toHaveLength(1); // the placeholder e-mail of phone accounts is not searchable
    expect(gl.json.items[0]).toMatchObject({ id: g.user.id, email_masked: 'g•••@gmail.com', sign_in_methods: ['google'] });
  });

  it('unmask: admin/owner only, needs a reason, is audited without storing the value', async () => {
    const t = await setup();
    const owner = await makeStaff(t, 'owner');
    const support = await makeStaff(t, 'support');
    const u = await signInWithPhone(t, '9876543210');
    const url = `${A}/users/${u.user.id}/unmask`;
    expect((await t.call('POST', url, { token: support.accessToken, body: { field: 'phone', reason: 'support wants it' } })).status).toBe(403);
    expect((await t.call('POST', url, { token: owner.accessToken, body: { field: 'phone' } })).json.error).toBe('reason_required');
    const ok = await t.call('POST', url, { token: owner.accessToken, body: { field: 'phone', reason: 'verify caller identity' } });
    expect(ok.json).toEqual({ field: 'phone', value: '+919876543210' });
    const row = (await t.pg.query(`SELECT * FROM admin_audit_log WHERE action = 'user.unmask'`)).rows as any[];
    expect(row).toHaveLength(1);
    expect(row[0]).toMatchObject({ admin_user_id: owner.user.id, target_id: u.user.id, reason: 'verify caller identity', admin_role: 'owner' });
    expect(JSON.stringify(row)).not.toContain('9876543210');
  });

  it('delete account: admin+, typed confirmation, wipes everything, counts the deletion', async () => {
    const t = await setup();
    const admin = await makeStaff(t, 'admin');
    const support = await makeStaff(t, 'support');
    const u = await signInWithPhone(t, nextPhone());
    await seedLedger(t, u.accessToken, 1);
    const url = `${A}/users/${u.user.id}/delete`;
    const confirm = `delete ${u.user.id.slice(0, 8)}`;
    expect((await t.call('POST', url, { token: support.accessToken, body: { reason: 'support tries', confirm } })).status).toBe(403);
    expect((await t.call('POST', url, { token: admin.accessToken, body: { reason: 'abc', confirm } })).json.error).toBe('reason_required');
    expect((await t.call('POST', url, { token: admin.accessToken, body: { reason: 'user asked', confirm: 'yes' } })).json.error).toBe('confirmation_required');
    expect((await t.call('POST', url, { token: admin.accessToken, body: { reason: 'user asked', confirm } })).status).toBe(200);
    for (const table of ['users', 'households', 'events', 'entries', 'auth_sessions', 'auth_accounts', 'profiles']) {
      expect(((await t.pg.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${table === 'users' ? 'id' : 'user_id'} = $1`, [u.user.id])).rows[0] as { n: number }).n, table).toBe(0);
    }
    expect((await t.pg.query(`SELECT count(*)::int AS n FROM account_deletions WHERE source = 'admin'`)).rows[0]).toEqual({ n: 1 });
    expect((await t.call('GET', `${A}/users/${u.user.id}`, { token: admin.accessToken })).status).toBe(404);
  });

  it('suspend blocks sign-in, refresh and sync with the Hindi 403; unsuspend restores access; force sign-out deletes the sessions', async () => {
    const t = await setup();
    const support = await makeStaff(t, 'support');
    const phone = nextPhone();
    const u = await signInWithPhone(t, phone);
    const MSG = 'आपका खाता अस्थायी रूप से रोका गया है। सहायता से संपर्क करें।';
    const susp = await t.call('POST', `${A}/users/${u.user.id}/suspend`, { token: support.accessToken, body: { reason: 'fraud complaint' } });
    expect(susp.status).toBe(200);
    expect((await t.call('POST', `${A}/users/${u.user.id}/suspend`, { token: support.accessToken, body: { reason: 'twice' } })).status).toBe(409);
    const push = await t.call('POST', '/v1/sync/push', { token: u.accessToken, body: {} });
    expect(push.status).toBe(403);
    expect(push.json).toMatchObject({ error: 'account_suspended', message_hi: MSG });
    expect((await t.call('GET', '/v1/sync/pull', { token: u.accessToken })).status).toBe(403);
    expect((await t.call('GET', '/v1/me', { token: u.accessToken })).json.message_hi).toBe(MSG);
    // a new sign-in (phone OTP or Google) is refused with the same Hindi message, and creates no session
    await t.pg.query(`UPDATE otp_events SET at = at - interval '1 hour'`);
    await t.call('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: phone } }).then((s) => expect(s.status).toBe(200));
    const verify = await t.call('POST', '/api/auth/phone-number/verify', { body: { phoneNumber: phone, code: t.sms.last().code } });
    expect(verify.status).toBe(403);
    expect(verify.json).toMatchObject({ error: 'account_suspended', message_hi: MSG });
    expect((await t.pg.query('SELECT 1 FROM auth_sessions WHERE user_id = $1', [u.user.id])).rows).toHaveLength(1); // only the old one
    expect((await t.call('DELETE', '/v1/account', { token: u.accessToken })).status).toBe(403);

    await t.call('POST', `${A}/users/${u.user.id}/unsuspend`, { token: support.accessToken, body: { reason: 'resolved' } });
    expect((await t.call('GET', '/v1/sync/pull', { token: u.accessToken })).status).toBe(200);

    const out = await t.call('POST', `${A}/users/${u.user.id}/signout`, { token: support.accessToken, body: { reason: 'lost phone' } });
    expect(out.json.revoked_tokens).toBeGreaterThan(0);
    expect((await t.call('GET', '/v1/sync/pull', { token: u.accessToken })).status).toBe(401); // the session is gone
  });

  it('notes are staff-only and invisible to the user', async () => {
    const t = await setup();
    const support = await makeStaff(t, 'support');
    const viewer = await makeStaff(t, 'viewer');
    const u = await signInWithPhone(t, nextPhone());
    await t.call('POST', `${A}/users/${u.user.id}/notes`, { token: support.accessToken, body: { body: 'prefers calls in the evening' } });
    expect((await t.call('GET', `${A}/users/${u.user.id}/notes`, { token: support.accessToken })).json.items).toHaveLength(1);
    expect((await t.call('GET', `${A}/users/${u.user.id}/notes`, { token: viewer.accessToken })).status).toBe(403);
    const { withUserTx } = await import('../src/db');
    expect(await withUserTx(t.db, u.user.id, 'user', (q) => q.query('SELECT * FROM user_notes'))).toHaveLength(0);
  });
});

describe('staff roles (owner only)', () => {
  it('owner grants and changes roles by phone/e-mail/id; the last owner cannot be demoted or removed', async () => {
    const t = await setup();
    const owner = await makeStaff(t, 'owner');
    const admin = await makeStaff(t, 'admin');
    const p = nextPhone();
    const newbie = await signInWithPhone(t, p);
    expect((await t.call('GET', `${A}/staff`, { token: admin.accessToken })).status).toBe(403);
    expect((await t.call('POST', `${A}/staff`, { token: admin.accessToken, body: { phone: p, role: 'viewer', reason: 'admin tries' } })).status).toBe(403);
    expect((await t.call('POST', `${A}/staff`, { token: owner.accessToken, body: { phone: '9000000001', role: 'viewer', reason: 'not signed up' } })).status).toBe(404);
    const add = await t.call('POST', `${A}/staff`, { token: owner.accessToken, body: { phone: p, role: 'support', reason: 'new helpline hire' } });
    expect(add.json).toMatchObject({ role: 'support', previous_role: 'user' });
    expect((await t.call('GET', `${A}/me`, { token: newbie.accessToken })).json.role).toBe('support');
    const list = await t.call('GET', `${A}/staff`, { token: owner.accessToken });
    expect(list.json.items.map((s: any) => s.role).sort()).toEqual(['admin', 'owner', 'support']);
    expect(list.text).not.toContain(p);

    // last-owner protection
    for (const attempt of [
      () => t.call('PATCH', `${A}/staff/${owner.user.id}`, { token: owner.accessToken, body: { role: 'admin', reason: 'self demote' } }),
      () => t.call('DELETE', `${A}/staff/${owner.user.id}`, { token: owner.accessToken, body: { reason: 'self remove' } }),
    ]) {
      const r = await attempt();
      expect(r.status).toBe(409);
      expect(r.json.error).toBe('last_owner');
    }
    expect((await t.call('GET', `${A}/me`, { token: owner.accessToken })).json.role).toBe('owner');
    // with a second owner, the first can step down
    await t.call('PATCH', `${A}/staff/${admin.user.id}`, { token: owner.accessToken, body: { role: 'owner', reason: 'second owner' } });
    expect((await t.call('PATCH', `${A}/staff/${owner.user.id}`, { token: owner.accessToken, body: { role: 'admin', reason: 'stepping down' } })).status).toBe(200);
    // ... and now the remaining owner is protected
    expect((await t.call('DELETE', `${A}/staff/${admin.user.id}`, { token: admin.accessToken, body: { reason: 'removing owner' } })).status).toBe(409);
    expect((await t.call('PATCH', `${A}/staff/${admin.user.id}`, { token: owner.accessToken, body: { role: 'viewer', reason: 'not owner anymore' } })).status).toBe(403);
    const audit = (await t.pg.query(`SELECT before_meta, after_meta FROM admin_audit_log WHERE action LIKE 'staff.%' ORDER BY id`)).rows as any[];
    expect(audit.length).toBe(3);
    expect(audit[0].before_meta).toEqual({ role: 'user' });
  });

  it('the database refuses role changes from a non-owner even if the API were bypassed', async () => {
    const t = await setup();
    const admin = await makeStaff(t, 'admin');
    const { withUserTx } = await import('../src/db');
    await expect(withUserTx(t.db, admin.user.id, 'admin', (q) => q.query(`SELECT staff_set_role($1, 'owner')`, [admin.user.id]))).rejects.toMatchObject({ code: '42501' });
    await expect(withUserTx(t.db, admin.user.id, 'admin', (q) => q.query(`UPDATE profiles SET role = 'owner'`))).rejects.toMatchObject({ code: '42501' });
  });
});
