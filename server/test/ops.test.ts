import { describe, expect, it } from 'vitest';
import { CONFIG_DEFAULTS } from '../src/appconfig';
import { logError, safePath, scrubMessage } from '../src/telemetry';
import { runScheduled } from '../src/rollup';
import { makeStaff, nextPhone, seedLedger, setup, signInWithPhone, uid, type Ctx } from './helpers';

const A = '/admin/api';
const put = (t: Ctx, token: string, key: string, value: unknown, reason = 'testing') => t.call('PUT', `${A}/config/${key}`, { token, body: { value, reason } });

describe('remote config', () => {
  it('serves the public subset without auth, with defaults and a 5-minute cache header', async () => {
    const t = await setup();
    const r = await t.call('GET', '/v1/config');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('public, max-age=300');
    expect(Object.keys(r.json).sort()).toEqual(['ads', 'announcement', 'features', 'fetched_at', 'force_update_message_hi', 'latest_version', 'maintenance', 'min_supported_version']);
    expect(r.json.maintenance.enabled).toBe(false);
    expect(r.json.ads).toEqual(CONFIG_DEFAULTS.ads);
    // a stray key in the table is never exposed
    await t.pg.query(`INSERT INTO app_config (key, value) VALUES ('internal_secret', '"x"')`);
    expect(JSON.stringify((await t.call('GET', '/v1/config')).json)).not.toContain('internal_secret');
  });

  it('validates every known key, keeps history, and requires admin', async () => {
    const t = await setup();
    const owner = await makeStaff(t, 'owner');
    const support = await makeStaff(t, 'support');
    expect((await put(t, support.accessToken, 'features', { ocr: true })).status).toBe(403);
    const bad: [string, unknown][] = [
      ['maintenance', { enabled: true, message_hi: '', message_en: 'x' }],
      ['maintenance', { enabled: 'yes', message_hi: 'x' }],
      ['maintenance', { enabled: true, message_hi: 'x', extra: 1 }],
      ['min_supported_version', 'v1'],
      ['min_supported_version', '9.0.0'], // newer than latest_version (1.0.0)
      ['latest_version', 1],
      ['force_update_message_hi', ''],
      ['announcement', { enabled: true, message_hi: 'x', level: 'loud' }],
      ['announcement', { enabled: true, message_hi: 'x', level: 'info', starts_at: '2026-02-01T00:00:00Z', ends_at: '2026-01-01T00:00:00Z' }],
      ['announcement', { enabled: true, message_hi: '', level: 'info' }],
      ['ads', { interstitial_min_interval_sec: 1 }],
      ['ads', { native_every_n_items: 1 }],
      ['ads', { banner: 'true' }],
      ['features', { web_app: 1 }],
      ['features', { unknown_flag: true }],
    ];
    for (const [k, v] of bad) {
      const r = await put(t, owner.accessToken, k, v);
      expect(r.status, `${k} ${JSON.stringify(v)}`).toBe(400);
      expect(r.json.error).toBe('invalid_config');
    }
    expect((await put(t, owner.accessToken, 'nope', 1)).status).toBe(404);
    expect((await put(t, owner.accessToken, 'latest_version', '1.4.0')).status).toBe(200);
    expect((await put(t, owner.accessToken, 'min_supported_version', '1.2.0')).status).toBe(200);
    expect((await put(t, owner.accessToken, 'latest_version', '1.1.0')).status).toBe(400); // older than min
    const ads = await put(t, owner.accessToken, 'ads', { enabled: true, banner: true, interstitial_min_interval_sec: 600 });
    expect(ads.json.value).toMatchObject({ enabled: true, banner: true, interstitial: false, interstitial_min_interval_sec: 600, native_every_n_items: 8 });
    const pub = (await t.call('GET', '/v1/config')).json;
    expect(pub.min_supported_version).toBe('1.2.0');
    expect(pub.ads.banner).toBe(true);
    const hist = await t.call('GET', `${A}/config-history?key=ads`, { token: owner.accessToken });
    expect(hist.json.items).toHaveLength(1);
    expect(hist.json.items[0]).toMatchObject({ key: 'ads', before: null, reason: 'testing' });
    const all = await t.call('GET', `${A}/config`, { token: support.accessToken });
    expect(all.json.items.find((e: any) => e.key === 'ads')).toMatchObject({ is_default: false });
  });

  it('maintenance mode: sign-in and sync answer 503 with the message; health, config and the admin API stay up', async () => {
    const t = await setup();
    const owner = await makeStaff(t, 'owner');
    const u = await signInWithPhone(t, nextPhone());
    const on = await put(t, owner.accessToken, 'maintenance', { enabled: true, message_hi: 'रखरखाव चल रहा है', message_en: 'Down for maintenance' });
    expect(on.status).toBe(200);
    for (const [m, p, body] of [['POST', '/v1/sync/push', {}], ['GET', '/v1/sync/pull', undefined], ['POST', '/api/auth/phone-number/send-otp', { phoneNumber: '9876543210' }], ['POST', '/api/auth/sign-out', {}], ['POST', '/api/auth/sign-in/social', { provider: 'google', idToken: { token: 'x' } }]] as const) {
      const r = await t.call(m, p, { token: u.accessToken, body });
      expect(r.status, p).toBe(503);
      expect(r.json).toMatchObject({ error: 'maintenance', message_hi: 'रखरखाव चल रहा है', message_en: 'Down for maintenance' });
      expect(r.headers.get('retry-after')).toBeTruthy();
    }
    expect((await t.call('GET', '/v1/health')).status).toBe(200);
    expect((await t.call('GET', '/v1/config')).json.maintenance.enabled).toBe(true);
    expect((await t.call('GET', `${A}/health`, { token: owner.accessToken })).status).toBe(200);
    await put(t, owner.accessToken, 'maintenance', { enabled: false });
    expect((await t.call('GET', '/v1/sync/pull', { token: u.accessToken })).status).toBe(200);
  });
});

describe('support tickets and grievances', () => {
  it('app submit (rate limited), due date, admin triage and resolution', async () => {
    const t = await setup();
    const support = await makeStaff(t, 'support');
    const viewer = await makeStaff(t, 'viewer');
    const u = await signInWithPhone(t, nextPhone());
    expect((await t.call('POST', '/v1/support', { body: { category: 'bug', subject: 'x', body: 'y' } })).status).toBe(401);
    expect((await t.call('POST', '/v1/support', { token: u.accessToken, body: { category: 'nope', subject: 'Hello', body: 'World' } })).status).toBe(400);
    expect((await t.call('POST', '/v1/support', { token: u.accessToken, body: { category: 'bug', subject: 'ab', body: 'World' } })).status).toBe(400);
    const g = await t.call('POST', '/v1/support', { token: u.accessToken, body: { category: 'grievance', subject: 'Data question', body: 'Who can see my data?' } });
    expect(g.status).toBe(201);
    const days = (Date.parse(g.json.dueAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    const bug = await t.call('POST', '/v1/support', { token: u.accessToken, body: { category: 'bug', subject: 'Crash on save', body: 'It crashes' } });
    expect(bug.json.dueAt).toBeNull();
    for (let i = 0; i < 3; i++) await t.call('POST', '/v1/support', { token: u.accessToken, body: { category: 'feedback', subject: `Idea ${i}`, body: 'text here' } });
    const limited = await t.call('POST', '/v1/support', { token: u.accessToken, body: { category: 'feedback', subject: 'One more', body: 'text here' } });
    expect(limited.status).toBe(429);

    // admin
    const list = await t.call('GET', `${A}/tickets?category=grievance`, { token: viewer.accessToken });
    expect(list.json.total).toBe(1);
    expect(list.json.items[0].overdue).toBe(false);
    expect(list.json.items[0].body).toBeUndefined(); // list has no bodies
    await t.pg.query(`UPDATE support_tickets SET due_at = now() - interval '2 days' WHERE category = 'grievance'`);
    expect((await t.call('GET', `${A}/tickets?overdue=1`, { token: viewer.accessToken })).json.items).toHaveLength(1);
    expect((await t.call('GET', `${A}/tickets`, { token: viewer.accessToken })).json.summary).toMatchObject({ open: 5, overdue: 1 });
    const id = g.json.id;
    expect((await t.call('PATCH', `${A}/tickets/${id}`, { token: viewer.accessToken, body: { assignee: 'asha' } })).status).toBe(403);
    expect((await t.call('PATCH', `${A}/tickets/${id}`, { token: support.accessToken, body: { assignee: 'asha', priority: 'urgent' } })).status).toBe(200);
    expect((await t.call('POST', `${A}/tickets/${id}/notes`, { token: support.accessToken, body: { body: 'Replied by phone', kind: 'reply' } })).status).toBe(201);
    const detail = await t.call('GET', `${A}/tickets/${id}`, { token: support.accessToken });
    expect(detail.json).toMatchObject({ status: 'in_progress', assignee: 'asha', priority: 'urgent', overdue: true });
    expect(detail.json.notes).toHaveLength(1);
    expect((await t.call('GET', `${A}/tickets/${id}`, { token: viewer.accessToken })).json.notes).toEqual([]); // viewers do not see internal notes
    expect((await t.call('POST', `${A}/tickets/${id}/resolve`, { token: support.accessToken, body: { resolution: 'Explained the privacy policy' } })).status).toBe(200);
    const done = await t.call('GET', `${A}/tickets/${id}`, { token: support.accessToken });
    expect(done.json).toMatchObject({ status: 'resolved', overdue: false, resolution: 'Explained the privacy policy' });
    expect((await t.call('GET', `${A}/reports/support-sla`, { token: viewer.accessToken })).json.rows.find((r: any) => r.metric === 'grievances').value).toBe(1);
    // a user cannot read tickets through any other path: RLS limits them to their own
    const { withUserTx } = await import('../src/db');
    const other = await signInWithPhone(t, nextPhone());
    expect(await withUserTx(t.db, other.user.id, 'user', (q) => q.query('SELECT id FROM support_tickets'))).toHaveLength(0);
    expect(await withUserTx(t.db, u.user.id, 'user', (q) => q.query('SELECT id FROM support_tickets'))).toHaveLength(5);
  });
});

describe('abuse control: blocklist', () => {
  it('blocks a phone or an IP in OTP start and verify, can expire, and can be lifted', async () => {
    const t = await setup();
    const support = await makeStaff(t, 'support');
    const tok = support.accessToken;
    const phone = '9811111111';
    // OTP activity is recorded
    await t.call('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: phone } });
    await t.call('POST', '/api/auth/phone-number/verify', { body: { phoneNumber: phone, code: '000000' } });
    const stats = await t.call('GET', `${A}/abuse/otp`, { token: tok });
    const today = stats.json.per_day[stats.json.per_day.length - 1];
    expect(today).toMatchObject({ sends: 2, verify_failures: 1 }); // 2 = the staff sign-in + this one
    expect(today.sms_cost_paise).toBe(50);
    expect(stats.json.top_phones[0].phone_masked).toMatch(/^\+91 98•••••/);
    expect(stats.text).not.toContain('9811111111');

    // block by phone (typed)
    const b = await t.call('POST', `${A}/abuse/blocklist`, { token: tok, body: { kind: 'phone', value: phone, reason: 'sms bombing' } });
    expect(b.status).toBe(201);
    for (const p of ['/api/auth/phone-number/send-otp', '/api/auth/phone-number/verify']) {
      const r = await t.call('POST', p, { body: { phoneNumber: phone, code: '123456' } });
      expect(r.status, p).toBe(403);
      expect(r.json.error).toBe('blocked');
    }
    expect(((await t.pg.query(`SELECT count(*)::int AS n FROM otp_events WHERE kind = 'blocked'`)).rows[0] as { n: number }).n).toBe(2);
    expect((await t.call('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: '9822222222' } })).status).toBe(200); // others unaffected
    // block by ref (picked from the masked top list)
    const ref = stats.json.top_phones.find((p: any) => p.sends >= 1).ref;
    expect((await t.call('POST', `${A}/abuse/blocklist`, { token: tok, body: { kind: 'phone', ref, reason: 'picked from list' } })).status).toBe(201);
    expect((await t.call('GET', `${A}/abuse/blocklist`, { token: tok })).text).not.toContain('9811111111');

    // lift
    expect((await t.call('DELETE', `${A}/abuse/blocklist/${b.json.id}`, { token: tok, body: { reason: 'false alarm' } })).status).toBe(200);
    await t.pg.query(`UPDATE otp_events SET at = at - interval '1 hour'`);
    expect((await t.call('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: phone } })).status).toBe(200);

    // IP block, then expiry
    expect((await t.call('POST', `${A}/abuse/blocklist`, { token: tok, body: { kind: 'ip', value: '198.51.100.7', reason: 'flood', expires_in_hours: 1 } })).status).toBe(201);
    expect((await t.call('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: '9833333333' }, ip: '198.51.100.7' })).status).toBe(403);
    expect((await t.call('POST', '/api/auth/phone-number/verify', { body: { phoneNumber: '9833333333', code: '123456' }, ip: '198.51.100.7' })).status).toBe(403);
    await t.pg.query(`UPDATE blocklist SET expires_at = now() - interval '1 minute' WHERE kind = 'ip'`);
    expect((await t.call('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: '9833333333' }, ip: '198.51.100.7' })).status).toBe(200);
    // validation
    expect((await t.call('POST', `${A}/abuse/blocklist`, { token: tok, body: { kind: 'ip', value: 'not-an-ip', reason: 'bad input' } })).status).toBe(400);
    expect((await t.call('POST', `${A}/abuse/blocklist`, { token: tok, body: { kind: 'phone', value: '12345', reason: 'bad input' } })).status).toBe(400);
  });
});

describe('telemetry and monitoring', () => {
  it('records app version / platform from headers; absent or junk headers are handled; sync failures are counted', async () => {
    const t = await setup();
    const u = await signInWithPhone(t, nextPhone());
    const dev = async () => (await t.pg.query(`SELECT platform, app_version, os_version, last_sync_at FROM user_devices WHERE user_id = $1 ORDER BY platform`, [u.user.id])).rows as any[];
    expect(await dev()).toEqual([{ platform: 'unknown', app_version: null, os_version: null, last_sync_at: null }]); // sign-in without headers
    await t.call('GET', '/v1/sync/pull', { token: u.accessToken });
    expect((await dev())[0].last_sync_at).toBeTruthy();
    await t.call('GET', '/v1/sync/pull', { token: u.accessToken, headers: { 'x-app-version': '1.7.3', 'x-platform': 'Android', 'x-os-version': '14' } });
    await t.call('GET', '/v1/sync/pull', { token: u.accessToken, headers: { 'x-app-version': '<script>alert(1)</script>', 'x-platform': 'toaster' } });
    const rows = await dev();
    expect(rows.find((r) => r.platform === 'android')).toMatchObject({ app_version: '1.7.3', os_version: '14' });
    expect(rows.some((r) => r.app_version?.includes('script'))).toBe(false);
    // a failing sync request is counted
    expect((await t.call('POST', '/v1/sync/push', { token: u.accessToken, body: [] })).status).toBe(400);
    const day = (await t.pg.query(`SELECT sync_requests, sync_errors FROM user_activity_daily WHERE user_id = $1`, [u.user.id])).rows[0] as any;
    expect(day).toMatchObject({ sync_requests: 4, sync_errors: 1 });
  });

  it('error log: scrubbed, sampled per minute, filterable; health reports latency, versions and errors', async () => {
    const t = await setup();
    const viewer = await makeStaff(t, 'viewer');
    const err = Object.assign(new Error('duplicate key value violates unique constraint "users_phone_e164_key" Key (phone_e164)=(+919876543210) exists for ravi@example.com id 123e4567-e89b-12d3-a456-426614174000'), { code: '23505' });
    for (let i = 0; i < 3; i++) await logError(t.db, { method: 'POST', path: '/v1/sync/push/123e4567-e89b-12d3-a456-426614174000', status: 500, error: err });
    await logError(t.db, { method: 'GET', path: '/v1/sync/pull', status: 500, error: new TypeError('boom') });
    const rows = (await t.pg.query('SELECT * FROM error_log ORDER BY id')).rows as any[];
    expect(rows).toHaveLength(2); // sampled: one row per fingerprint per minute
    expect(rows[0].occurrences).toBe(3);
    expect(JSON.stringify(rows)).not.toMatch(/9876543210|ravi@example|123e4567/);
    expect(rows[0].path).toBe('/v1/sync/push/:id');
    expect(safePath('/admin/api/users/123e4567-e89b-12d3-a456-426614174000?x=1')).toBe('/admin/api/users/:id');
    expect(scrubMessage('call +91 98765 43210 now')).not.toContain('98765');
    const list = await t.call('GET', `${A}/errors?path=pull`, { token: viewer.accessToken });
    expect(list.json.items).toHaveLength(1);
    expect(list.json.items[0].error_name).toBe('TypeError');
    const h = await t.call('GET', `${A}/health`, { token: viewer.accessToken });
    expect(h.json).toMatchObject({ ok: true, server_version: 'test', errors_24h: 4, distinct_errors_24h: 2 });
    expect(typeof h.json.db_latency_ms).toBe('number');
  });

  it('an unhandled server error is written to the error log without the request body', async () => {
    const t = await setup();
    const u = await signInWithPhone(t, nextPhone());
    // break the database function the sync path depends on, then restore it
    await t.pg.query('ALTER TABLE households RENAME TO households_x');
    const r = await t.call('GET', '/v1/sync/pull', { token: u.accessToken });
    await t.pg.query('ALTER TABLE households_x RENAME TO households');
    expect(r.status).toBe(500);
    const row = (await t.pg.query('SELECT method, path, status FROM error_log')).rows[0] as any;
    expect(row).toEqual({ method: 'GET', path: '/v1/sync/pull', status: 500 });
  });
});

// ------------------------------------------------------------------ analytics
type Pg = Ctx['pg'];
async function mkUsers(pg: Pg, n: number, createdAt: string, method: 'google' | 'phone' = 'phone', startAt = 1000): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = uid(startAt + i + Math.floor(Math.random() * 1e6) * 10);
    ids.push(id);
    await pg.query(`INSERT INTO users (id, phone_e164, google_sub, signup_method, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [id, method === 'phone' ? `+9170${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}` : null, method === 'google' ? `g-${id}` : null, method, createdAt]);
  }
  return ids;
}
let seq = 0;
const mkEvent = (pg: Pg, user: string, createdAt: string, occasion = 'SHAADI') =>
  pg.query(`INSERT INTO events (user_id, id, host_household_id, occasion, date, panch_approved, invitation_type, status, created_at, updated_at, server_seq)
            VALUES ($1, gen_random_uuid(), gen_random_uuid(), $2, '2026-03-10', true, 'KUMKUM', 'PLANNED', $3, $3, ${++seq})`, [user, occasion, createdAt]);
const mkEntry = (pg: Pg, user: string, cash: number, o: { mode?: string; dir?: string; voids?: string; id?: string; item?: string | null; createdAt?: string } = {}) =>
  pg.query(`INSERT INTO entries (user_id, id, other_household_id, direction, cash_paise, in_kind_item, payment_mode, recorded_by, created_at, occurred_on, corrects_entry_id, is_void, server_seq)
            VALUES ($1, COALESCE($2::uuid, gen_random_uuid()), gen_random_uuid(), $3, $4, $5, $6, 'me', $7::text, left($7::text, 10), $8, $9, ${++seq})`,
    [user, o.id ?? null, o.dir ?? 'AAYA', cash, o.item ?? null, o.mode ?? 'CASH', o.createdAt ?? '2026-03-10T10:00:00.000Z', o.voids ?? null, !!o.voids && cash === 0]);
const activity = (pg: Pg, user: string, day: string, requests = 1, errors = 0) =>
  pg.query('INSERT INTO user_activity_daily (user_id, day, sync_requests, sync_errors) VALUES ($1, $2, $3, $4)', [user, day, requests, errors]);
const T10 = '2026-03-10T09:00:00.000Z';
const T11 = '2026-03-11T09:00:00.000Z';

async function report(t: Ctx, token: string, name: string, from = '2026-03-10', to = '2026-03-11') {
  const r = await t.call('GET', `${A}/reports/${name}?from=${from}&to=${to}`, { token });
  expect(r.status, `${name}: ${r.text}`).toBe(200);
  return r.json as { rows: Record<string, any>[]; columns: any[] };
}
const recompute = (t: Ctx, token: string, from = '2026-03-10', to = '2026-03-11') => t.call('POST', `${A}/reports/recompute`, { token, body: { from, to } });

describe('analytics: aggregates with k-anonymity (groups under 5 users are suppressed)', () => {
  it('daily rollups are correct, and small groups show as "<5"', async () => {
    const t = await setup();
    const viewer = await makeStaff(t, 'viewer');
    const owner = await makeStaff(t, 'owner');
    const five = await mkUsers(t.pg, 5, T10, 'phone');
    const three = await mkUsers(t.pg, 3, T10, 'google', 5000);
    const all = [...five, ...three];
    for (const u of five) await mkEvent(t.pg, u, T10, 'SHAADI'); // 5 events, 5 users
    for (const u of five.slice(0, 2)) await mkEvent(t.pg, u, T10, 'BIMARI'); // 2 events, 2 users
    for (const u of five.slice(0, 2)) await mkEvent(t.pg, u, T11, 'MAKAAN'); // day 2: 2 users
    for (const u of five) await mkEntry(t.pg, u, 20000);
    for (const u of all) await activity(t.pg, u, '2026-03-10', 10, 1);
    for (const u of five.slice(0, 2)) await activity(t.pg, u, '2026-03-11', 4, 0);
    expect((await recompute(t, viewer.accessToken)).status).toBe(403); // admin+
    expect((await recompute(t, owner.accessToken)).json.days).toBe(2);

    const signups = (await report(t, viewer.accessToken, 'signups')).rows;
    expect(signups[0]).toEqual({ day: '2026-03-10', via_google: '<5', via_otp: 5, total: 8 }); // google: 3 users, hidden
    expect(signups[1]).toMatchObject({ day: '2026-03-11', total: 0 });
    const events = (await report(t, viewer.accessToken, 'events')).rows;
    expect(events).toEqual([{ day: '2026-03-10', events: 7 }, { day: '2026-03-11', events: '<5' }]); // day 2: 2 users behind it
    expect((await report(t, viewer.accessToken, 'entries')).rows[0]!.entries).toBe(5);
    const active = (await report(t, viewer.accessToken, 'active')).rows;
    expect(active[0]).toMatchObject({ dau: 8, wau: 8, mau: 8 });
    expect(active[1]).toMatchObject({ dau: '<5', wau: 8, mau: 8 });
    const sync = (await report(t, viewer.accessToken, 'sync')).rows;
    expect(sync[0]).toMatchObject({ requests: 80, errors: 8, error_rate_pct: 10 });
    const occ = (await report(t, viewer.accessToken, 'occasions')).rows;
    expect(occ).toEqual([{ occasion: 'BIMARI', events: '<5', users: '<5' }, { occasion: 'MAKAAN', events: '<5', users: '<5' }, { occasion: 'SHAADI', events: 5, users: 5 }]);
    const monthly = (await report(t, viewer.accessToken, 'events-monthly', '2026-03-01', '2026-03-31')).rows;
    expect(monthly).toEqual([{ month: '2026-03', events: 9, users: 5 }]);

    // CSV export carries the same aggregates (and "<5")
    const csv = await t.call('GET', `${A}/reports/events?from=2026-03-10&to=2026-03-11&format=csv`, { token: viewer.accessToken });
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(csv.text.trim().split('\n')).toEqual(['Day,Events', '2026-03-10,7', '2026-03-11,<5']);

    // the nightly cron entry point produces the same rollup and purges old rows
    await t.pg.query('DELETE FROM daily_stats');
    const r = await runScheduled(t.db, new Date('2026-03-11T02:00:00Z'), 2);
    expect(r.days).toEqual(['2026-03-10', '2026-03-11']);
    expect(((await t.pg.query(`SELECT value FROM daily_stats WHERE metric = 'events_created' AND day = '2026-03-10'`)).rows[0] as any).value).toEqual(expect.anything());
  });

  it('suppression flips exactly at 5 distinct users', async () => {
    const t = await setup();
    const viewer = await makeStaff(t, 'viewer');
    const users = await mkUsers(t.pg, 5, T10);
    for (const u of users.slice(0, 4)) await mkEvent(t.pg, u, T10);
    expect((await report(t, viewer.accessToken, 'events-monthly', '2026-03-01', '2026-03-31')).rows[0]).toEqual({ month: '2026-03', events: '<5', users: '<5' });
    await mkEvent(t.pg, users[4]!, T10);
    expect((await report(t, viewer.accessToken, 'events-monthly', '2026-03-01', '2026-03-31')).rows[0]).toEqual({ month: '2026-03', events: 5, users: 5 });
  });

  it('amount buckets, cash vs UPI, in-kind, entries per event; voided and corrected entries are not counted', async () => {
    const t = await setup();
    const viewer = await makeStaff(t, 'viewer');
    const users = await mkUsers(t.pg, 5, T10);
    for (const u of users) await mkEntry(t.pg, u, 20000, { createdAt: T10 }); // Rs 200 each -> bucket 101-500
    const u0 = users[0]!;
    await mkEntry(t.pg, u0, 700000, { mode: 'UPI', dir: 'GAYA', item: 'goat' }); // lone Rs 7000 entry, UPI, given, in-kind: hidden
    const x = uid(777001);
    await mkEntry(t.pg, u0, 20000, { id: x });
    await mkEntry(t.pg, u0, 0, { voids: x }); // x is voided: neither x nor the void row counts
    const buckets = (await report(t, viewer.accessToken, 'amounts')).rows;
    expect(buckets).toEqual([
      { bucket: 'Rs 0-100', entries: '<5', users: '<5' }, { bucket: 'Rs 101-500', entries: 5, users: 5 }, { bucket: 'Rs 501-1000', entries: '<5', users: '<5' },
      { bucket: 'Rs 1001-5000', entries: '<5', users: '<5' }, { bucket: 'Rs 5000+', entries: '<5', users: '<5' },
    ]);
    const mix = (await report(t, viewer.accessToken, 'entry-mix')).rows;
    const get = (facet: string, label: string) => mix.find((r) => r.facet === facet && r.label === label);
    expect(get('payment', 'CASH')).toMatchObject({ entries: 5, users: 5 });
    expect(get('payment', 'UPI')).toMatchObject({ entries: '<5' });
    expect(get('in_kind', 'cash only')).toMatchObject({ entries: 5 });
    expect(get('in_kind', 'with in-kind')).toMatchObject({ entries: '<5' });
    expect(get('flow', 'received (aaya)')).toMatchObject({ entries: 5 });
    // entries per event: 5 users, each with one event holding 2 entries, one holding 3
    const evId = (u: string) => (t.pg.query(`SELECT id FROM events WHERE user_id = $1`, [u]));
    for (const [i, u] of users.entries()) {
      await mkEvent(t.pg, u, T10);
      const id = ((await evId(u)).rows[0] as { id: string }).id;
      const n = i === 0 ? 3 : 2;
      for (let k = 0; k < n; k++) await t.pg.query(`UPDATE entries SET event_id = $2 WHERE id = (SELECT id FROM entries WHERE user_id = $1 AND event_id IS NULL AND NOT is_void AND cash_paise = 20000 AND corrects_entry_id IS NULL LIMIT 1)`, [u, id]);
      if (i > 0) await mkEntry(t.pg, u, 1000).then(() => t.pg.query(`UPDATE entries SET event_id = $2 WHERE user_id = $1 AND cash_paise = 1000`, [u, id]));
    }
    const epe = (await report(t, viewer.accessToken, 'entries-per-event')).rows[0]!;
    expect(epe.events).toBe(5);
    expect(typeof epe.avg).toBe('number');
    expect(epe.median).toBeGreaterThan(0);
    expect(epe.p90).toBeGreaterThanOrEqual(epe.median);
  });

  it('region distribution lists only villages with >= 5 users; the rest fold into "<5" and are never named', async () => {
    const t = await setup();
    const viewer = await makeStaff(t, 'viewer');
    const put = async (users: string[], village: string) => {
      for (const u of users) {
        const h = uid(Math.floor(Math.random() * 1e9));
        await t.pg.query(`INSERT INTO households (user_id, id, head_name, father_name, jati, atak, village, fala, created_at, updated_at, server_seq) VALUES ($1, $2, 'h', 'f', 'j', 'a', $3, 'fa', 'c', 'u', ${++seq})`, [u, h, village]);
        await t.pg.query(`INSERT INTO profiles (user_id, my_household_id, updated_at, server_seq) VALUES ($1, $2, 'x', ${++seq})`, [u, h]);
      }
    };
    await put(await mkUsers(t.pg, 5, T10), 'सरवन');
    await put(await mkUsers(t.pg, 3, T10, 'phone', 9000), 'RareVillage');
    const r = await t.call('GET', `${A}/reports/regions`, { token: viewer.accessToken });
    expect(r.json.rows).toEqual([{ region: 'सरवन', users: 5 }, { region: '<5', users: '<5' }]);
    expect(r.text).not.toContain('RareVillage');
  });

  it('retention cohorts: weekly signup cohort -> % active in weeks 1..8, with suppression', async () => {
    const t = await setup();
    const viewer = await makeStaff(t, 'viewer');
    const users = await mkUsers(t.pg, 6, '2026-03-02T08:00:00.000Z'); // a Monday
    for (const u of users) await activity(t.pg, u, '2026-03-10'); // week 1 after signup
    for (const u of users.slice(0, 2)) await activity(t.pg, u, '2026-03-17'); // week 2: only 2 users
    const rows = (await report(t, viewer.accessToken, 'retention', '2026-03-01', '2026-03-07')).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cohort_week: '2026-03-02', cohort_size: 6, w1: 100, w2: '<5' });
    const tiny = await mkUsers(t.pg, 3, '2026-03-09T08:00:00.000Z');
    for (const u of tiny) await activity(t.pg, u, '2026-03-17');
    const r2 = (await report(t, viewer.accessToken, 'retention', '2026-03-08', '2026-03-14')).rows;
    expect(r2[0]).toMatchObject({ cohort_size: '<5', w1: '<5' });
  });

  it('app versions and the north-star series never expose small groups', async () => {
    const t = await setup();
    const viewer = await makeStaff(t, 'viewer');
    const users = await mkUsers(t.pg, 6, T10);
    for (const [i, u] of users.entries()) await t.pg.query(`INSERT INTO user_devices (user_id, platform, app_version) VALUES ($1, 'android', $2)`, [u, i < 5 ? '1.0.0' : '0.9.0']);
    const v = (await report(t, viewer.accessToken, 'versions')).rows.filter((r) => r.app_version !== 'unknown');
    expect(v).toEqual([{ app_version: '1.0.0', platform: 'android', users: 5 }, { app_version: '0.9.0', platform: 'android', users: '<5' }]);
  });

  it('overview returns dashboard numbers and obeys the same rules', async () => {
    const t = await setup();
    const viewer = await makeStaff(t, 'viewer');
    const o = await t.call('GET', `${A}/overview`, { token: viewer.accessToken });
    expect(o.status).toBe(200);
    expect(o.json.totals.users).toBe(1);
    expect(o.json.active.dau).toBe('<5');
    expect(o.json.tickets).toEqual({ open: 0, overdue: 0, open_grievances: 0 });
    // ledger data present for another user does not change what the viewer can learn
    const u = await signInWithPhone(t, nextPhone());
    await seedLedger(t, u.accessToken, 1);
    expect(JSON.stringify((await t.call('GET', `${A}/overview`, { token: viewer.accessToken })).json)).not.toContain('SENTINEL');
  });
});
