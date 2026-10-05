import { describe, expect, it } from 'vitest';
import { withUserTx } from '../src/db';
import { makeStaff, nextPhone, setup, signInWithGoogle, signInWithPhone, uid, type Ctx, type Signed } from './helpers';

const R = '/v1/rishtey';
const A = '/admin/api';
const PUBLIC_KEYS = ['age', 'district', 'education', 'first_name', 'gender', 'gotra', 'height_cm', 'id', 'my_interest', 'occupation', 'published_by', 'state'];

async function flagOn(t: Ctx) {
  await t.pg.query(`INSERT INTO app_config (key, value) VALUES ('features', '{"web_app":false,"ocr":false,"invitation_cards":false,"analytics":true,"rishtey_discovery":true}')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
}

interface P { first_name?: string; gender?: 'male' | 'female'; age?: number; gotra?: string; district?: string; state?: string; contact?: string; height_cm?: number }
const base = (o: P = {}) => ({ first_name: 'Asha', gender: 'female', age: 25, gotra: 'Kashyap', district: 'Dungarpur', state: 'Rajasthan', education: 'B.Ed', occupation: 'Teacher', height_cm: 160, contact: '9000011111', published_by: 'self', ...o });

/** A signed-in person whose profile is already approved (moderation is covered separately). */
async function person(t: Ctx, o: P = {}, status = 'approved'): Promise<Signed & { pid: string }> {
  const s = await signInWithPhone(t, nextPhone());
  const body = base(o);
  const put = await t.call('PUT', `${R}/profile`, { token: s.accessToken, body });
  expect(put.status, put.text).toBe(200);
  await t.pg.query(`UPDATE rishtey_profiles SET status = $2, consent_at = now(), published_at = now() WHERE user_id = $1`, [s.user.id, status]);
  return { ...s, pid: put.json.profile.id };
}

describe('feature flag', () => {
  it('every endpoint is dark (404) until features.rishtey_discovery is on, then needs a session', async () => {
    const t = await setup();
    const u = await signInWithPhone(t, nextPhone());
    for (const [m, p] of [['GET', '/profile'], ['PUT', '/profile'], ['GET', '/search'], ['GET', '/interests']] as const) {
      expect((await t.call(m, R + p, { token: u.accessToken, body: m === 'PUT' ? base() : undefined })).status, p).toBe(404);
    }
    await flagOn(t);
    expect((await t.call('GET', `${R}/profile`)).status).toBe(401);
    expect((await t.call('GET', `${R}/profile`, { token: u.accessToken })).json).toMatchObject({ profile: null, phone_verified: true });
  });
});

describe('own profile and publishing', () => {
  it('saves a draft, validates input, and publishing needs consent, a verified phone and the basics', async () => {
    const t = await setup();
    await flagOn(t);
    const u = await signInWithPhone(t, nextPhone());
    const tok = u.accessToken;
    expect((await t.call('PUT', `${R}/profile`, { token: tok, body: { age: 12 } })).status).toBe(400);
    expect((await t.call('PUT', `${R}/profile`, { token: tok, body: { gender: 'x' } })).status).toBe(400);
    expect((await t.call('PUT', `${R}/profile`, { token: tok, body: { contact: 'call me' } })).status).toBe(400);
    const draft = await t.call('PUT', `${R}/profile`, { token: tok, body: { first_name: 'Asha', published_by: 'parent' } });
    expect(draft.json.profile).toMatchObject({ status: 'draft', first_name: 'Asha', published_by: 'parent' });
    expect((await t.call('POST', `${R}/profile/publish`, { token: tok, body: {} })).json.error).toBe('consent_required');
    const inc = await t.call('POST', `${R}/profile/publish`, { token: tok, body: { consent: true } });
    expect(inc.status).toBe(400);
    expect(inc.json.missing).toEqual(['age', 'gender', 'contact']);
    await t.call('PUT', `${R}/profile`, { token: tok, body: base() });
    const pub = await t.call('POST', `${R}/profile/publish`, { token: tok, body: { consent: true } });
    expect(pub.status, pub.text).toBe(200);
    expect(pub.json.profile.status).toBe('pending');
    expect(pub.json.profile.consent_at).toBeTruthy();
    // the phone must be verified (database flag on the users row)
    await t.pg.query('UPDATE users SET phone_verified = false WHERE id = $1', [u.user.id]);
    await t.call('POST', `${R}/profile/hide`, { token: tok });
    expect((await t.call('POST', `${R}/profile/publish`, { token: tok, body: { consent: true } })).json.error).toBe('phone_not_verified');
  });

  it('a Google-only account (no verified phone) cannot publish', async () => {
    const t = await setup();
    await flagOn(t);
    const g = await signInWithGoogle(t, 'g-rishtey');
    await t.call('PUT', `${R}/profile`, { token: g.accessToken, body: base() });
    const r = await t.call('POST', `${R}/profile/publish`, { token: g.accessToken, body: { consent: true } });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('phone_not_verified');
  });

  it('a user cannot approve their own profile, nor read anyone else\'s row; staff have no table access either', async () => {
    const t = await setup();
    await flagOn(t);
    const a = await person(t, {}, 'draft');
    const b = await person(t, { first_name: 'Bina' }, 'pending');
    await expect(withUserTx(t.db, a.user.id, 'user', (q) => q.query(`UPDATE rishtey_profiles SET status = 'approved' WHERE user_id = $1`, [a.user.id]))).rejects.toMatchObject({ code: '42501' });
    await expect(withUserTx(t.db, a.user.id, 'user', (q) => q.query(`INSERT INTO rishtey_profiles (user_id, status) VALUES ($1, 'approved')`, [uid(7)]))).rejects.toBeTruthy();
    await expect(withUserTx(t.db, a.user.id, 'user', (q) => q.query(`UPDATE rishtey_profiles SET reject_reason = 'x' WHERE user_id = $1`, [a.user.id]))).rejects.toMatchObject({ code: '42501' });
    // an approved profile's public details cannot be edited in place either (moderation is not skippable)
    const live = await person(t, { first_name: 'Live' });
    await expect(withUserTx(t.db, live.user.id, 'user', (q) => q.query(`UPDATE rishtey_profiles SET occupation = 'Spy' WHERE user_id = $1`, [live.user.id]))).rejects.toMatchObject({ code: '42501' });
    const seen = await withUserTx(t.db, a.user.id, 'user', (q) => q.query<{ user_id: string }>('SELECT user_id FROM rishtey_profiles'));
    expect(seen.map((r) => r.user_id)).toEqual([a.user.id]);
    const owner = await makeStaff(t, 'owner');
    expect(await withUserTx(t.db, owner.user.id, 'owner', (q) => q.query('SELECT 1 FROM rishtey_profiles'))).toHaveLength(0);
    expect(b.pid).toBeTruthy();
  });

  it('editing an approved profile\'s public details sends it back for review; contact alone does not', async () => {
    const t = await setup();
    await flagOn(t);
    const a = await person(t);
    const same = await t.call('PUT', `${R}/profile`, { token: a.accessToken, body: base({ contact: '9000022222' }) });
    expect(same.status, same.text).toBe(200);
    expect(same.json.profile.status).toBe('approved');
    const edit = await t.call('PUT', `${R}/profile`, { token: a.accessToken, body: { ...base(), occupation: 'Doctor' } });
    expect(edit.json.profile.status).toBe('pending');
  });

  it('hide takes it out of search; delete removes the profile and its interests for good', async () => {
    const t = await setup();
    await flagOn(t);
    const a = await person(t);
    const b = await person(t, { first_name: 'Bina', gender: 'male', gotra: 'Vashishth' });
    expect((await t.call('GET', `${R}/search`, { token: a.accessToken })).json.items).toHaveLength(1);
    await t.call('POST', `${R}/interests`, { token: a.accessToken, body: { profile_id: b.pid } });
    expect((await t.call('POST', `${R}/profile/hide`, { token: b.accessToken })).json.profile.status).toBe('hidden');
    expect((await t.call('GET', `${R}/search`, { token: a.accessToken })).json.items).toHaveLength(0);
    expect((await t.call('DELETE', `${R}/profile`, { token: b.accessToken })).status).toBe(200);
    expect((await t.pg.query('SELECT count(*)::int AS n FROM rishtey_profiles WHERE user_id = $1', [b.user.id])).rows[0]).toEqual({ n: 0 });
    expect((await t.pg.query('SELECT count(*)::int AS n FROM rishtey_interests')).rows[0]).toEqual({ n: 0 });
    expect((await t.call('DELETE', `${R}/profile`, { token: b.accessToken })).status).toBe(200); // idempotent
  });

  it('deleting the whole account removes every रिश्ते row', async () => {
    const t = await setup();
    await flagOn(t);
    const a = await person(t);
    const b = await person(t, { gotra: 'Vashishth' });
    await t.call('POST', `${R}/interests`, { token: a.accessToken, body: { profile_id: b.pid } });
    await t.call('POST', `${R}/block`, { token: a.accessToken, body: { profile_id: b.pid } });
    await t.call('POST', `${R}/report`, { token: a.accessToken, body: { profile_id: b.pid, reason: 'spam' } });
    expect((await t.call('DELETE', '/v1/account', { token: a.accessToken })).status).toBe(200);
    for (const table of ['rishtey_profiles', 'rishtey_interests', 'rishtey_blocks', 'rishtey_reports']) {
      const n = (await t.pg.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${table === 'rishtey_profiles' ? 'user_id' : '1=1'} ${table === 'rishtey_profiles' ? '= $1' : ''}`, table === 'rishtey_profiles' ? [a.user.id] : [])).rows[0] as { n: number };
      expect(n.n, table).toBe(0);
    }
    expect((await t.pg.query('SELECT count(*)::int AS n FROM rishtey_profiles')).rows[0]).toEqual({ n: 1 }); // b is untouched
  });
});

describe('search', () => {
  it('returns approved profiles with PUBLIC fields only, never contact or the account id', async () => {
    const t = await setup();
    await flagOn(t);
    const me = await person(t, { gender: 'male', first_name: 'Raj', gotra: 'Vashishth', contact: '9111111111' });
    const her = await person(t, { contact: '9222222222' });
    await person(t, { first_name: 'Draft', contact: '9333333333' }, 'draft');
    await person(t, { first_name: 'Pending', contact: '9444444444' }, 'pending');
    await person(t, { first_name: 'Hidden', contact: '9555555555' }, 'hidden');
    const r = await t.call('GET', `${R}/search?gender=female`, { token: me.accessToken });
    expect(r.status).toBe(200);
    expect(r.json.items).toHaveLength(1);
    expect(Object.keys(r.json.items[0]).sort()).toEqual(PUBLIC_KEYS);
    expect(r.json.items[0]).toMatchObject({ id: her.pid, first_name: 'Asha', age: 25, my_interest: null });
    for (const secret of ['9222222222', her.user.id, 'contact', 'user_id']) expect(r.text).not.toContain(secret);
    const detail = await t.call('GET', `${R}/profiles/${her.pid}`, { token: me.accessToken });
    expect(Object.keys(detail.json.profile).sort()).toEqual(PUBLIC_KEYS);
    expect(detail.text).not.toContain('9222222222');
    expect((await t.call('GET', `${R}/profiles/${me.pid}`, { token: me.accessToken })).status).toBe(404); // not myself
    expect((await t.call('GET', `${R}/profiles/not-an-id`, { token: me.accessToken })).status).toBe(400);
  });

  it('needs my own approved profile', async () => {
    const t = await setup();
    await flagOn(t);
    const pending = await person(t, {}, 'pending');
    const r = await t.call('GET', `${R}/search`, { token: pending.accessToken });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('profile_not_approved');
  });

  it('filters by gender, age, district, state; excludes the same gotra by default; paginates', async () => {
    const t = await setup();
    await flagOn(t);
    const me = await person(t, { gender: 'male', first_name: 'Raj', gotra: 'Kashyap' });
    await person(t, { first_name: 'A1', age: 22, district: 'Dungarpur', gotra: 'Vashishth' });
    await person(t, { first_name: 'A2', age: 28, district: 'Udaipur', gotra: 'Bharadwaj' });
    await person(t, { first_name: 'A3', age: 31, district: 'Udaipur', state: 'Gujarat', gotra: 'Atri' });
    await person(t, { first_name: 'SameGotra', age: 26, gotra: ' kashyap ' });
    await person(t, { first_name: 'Male', gender: 'male', gotra: 'Atri' });
    const names = async (qs: string) => (await t.call('GET', `${R}/search?${qs}`, { token: me.accessToken })).json.items.map((i: { first_name: string }) => i.first_name).sort();
    expect(await names('gender=female')).toEqual(['A1', 'A2', 'A3']); // SameGotra excluded
    expect(await names('gender=female&same_gotra=1')).toEqual(['A1', 'A2', 'A3', 'SameGotra']);
    expect(await names('gender=male')).toEqual(['Male']);
    expect(await names('gender=female&age_min=25&age_max=30')).toEqual(['A2']);
    expect(await names('gender=female&district=udaipur')).toEqual(['A2', 'A3']);
    expect(await names('gender=female&state=Gujarat')).toEqual(['A3']);
    expect((await t.call('GET', `${R}/search?gender=other`, { token: me.accessToken })).status).toBe(400);
    const p1 = await t.call('GET', `${R}/search?gender=female&limit=2`, { token: me.accessToken });
    expect(p1.json.items).toHaveLength(2);
    expect(p1.json.next_offset).toBe(2);
    const p2 = await t.call('GET', `${R}/search?gender=female&limit=2&offset=2`, { token: me.accessToken });
    expect(p2.json.items).toHaveLength(1);
    expect(p2.json.next_offset).toBeNull();
  });

  it('never shows blocked people, in either direction', async () => {
    const t = await setup();
    await flagOn(t);
    const me = await person(t, { gender: 'male', gotra: 'Atri' });
    const a = await person(t, { first_name: 'A', gotra: 'Vashishth' });
    const b = await person(t, { first_name: 'B', gotra: 'Bharadwaj' });
    expect((await t.call('GET', `${R}/search`, { token: me.accessToken })).json.items).toHaveLength(2);
    expect((await t.call('POST', `${R}/block`, { token: me.accessToken, body: { profile_id: a.pid } })).status).toBe(201);
    await t.call('POST', `${R}/block`, { token: b.accessToken, body: { profile_id: me.pid } });
    expect((await t.call('GET', `${R}/search`, { token: me.accessToken })).json.items).toHaveLength(0);
    expect((await t.call('GET', `${R}/search`, { token: b.accessToken })).json.items.map((i: { id: string }) => i.id)).toEqual([a.pid]);
    expect((await t.call('GET', `${R}/profiles/${a.pid}`, { token: me.accessToken })).status).toBe(404);
    expect((await t.call('POST', `${R}/interests`, { token: me.accessToken, body: { profile_id: a.pid } })).status).toBe(404);
  });
});

describe('interests and contact', () => {
  it('contact is released only after the recipient accepts, and a decline is never shown to the sender', async () => {
    const t = await setup();
    await flagOn(t);
    const a = await person(t, { gender: 'male', first_name: 'Raj', gotra: 'Atri', contact: '9111111111' });
    const b = await person(t, { first_name: 'Asha', gotra: 'Vashishth', contact: '9222222222' });
    const c = await person(t, { first_name: 'Chhavi', gotra: 'Vashishth', contact: '9333333333' });
    const send = await t.call('POST', `${R}/interests`, { token: a.accessToken, body: { profile_id: b.pid } });
    expect(send.status).toBe(201);
    expect(send.json.status).toBe('sent');
    expect((await t.call('POST', `${R}/interests`, { token: a.accessToken, body: { profile_id: b.pid } })).json.error).toBe('interest_exists');
    expect((await t.call('GET', `${R}/contact/${b.pid}`, { token: a.accessToken })).json.error).toBe('contact_not_allowed');
    expect((await t.call('GET', `${R}/contact/${a.pid}`, { token: b.accessToken })).status).toBe(403); // sent is not accepted
    const inbox = await t.call('GET', `${R}/interests?box=received`, { token: b.accessToken });
    expect(inbox.json.items).toHaveLength(1);
    expect(inbox.json.items[0]).toMatchObject({ status: 'sent', profile: { id: a.pid, first_name: 'Raj' } });
    expect(inbox.text).not.toContain('9111111111');
    const iid = inbox.json.items[0].id;
    expect((await t.call('POST', `${R}/interests/${iid}/accept`, { token: a.accessToken })).status).toBe(404); // the sender cannot accept
    expect((await t.call('POST', `${R}/interests/${iid}/accept`, { token: c.accessToken })).status).toBe(404); // nor a stranger
    expect((await t.call('POST', `${R}/interests/${iid}/accept`, { token: b.accessToken })).status).toBe(200);
    expect((await t.call('POST', `${R}/interests/${iid}/accept`, { token: b.accessToken })).status).toBe(404); // already answered
    expect((await t.call('GET', `${R}/contact/${b.pid}`, { token: a.accessToken })).json).toEqual({ first_name: 'Asha', contact: '9222222222' });
    expect((await t.call('GET', `${R}/contact/${a.pid}`, { token: b.accessToken })).json).toEqual({ first_name: 'Raj', contact: '9111111111' });
    expect((await t.call('GET', `${R}/contact/${c.pid}`, { token: a.accessToken })).status).toBe(403); // no interest with c
    expect((await t.call('GET', `${R}/interests?box=sent`, { token: a.accessToken })).json.items[0].status).toBe('accepted');
    // blocking ends it
    await t.call('POST', `${R}/block`, { token: b.accessToken, body: { profile_id: a.pid } });
    expect((await t.call('GET', `${R}/contact/${b.pid}`, { token: a.accessToken })).status).toBe(403);

    // decline: the sender keeps seeing "sent"; the recipient's inbox drops it; no contact
    await t.call('POST', `${R}/interests`, { token: a.accessToken, body: { profile_id: c.pid } });
    const cin = (await t.call('GET', `${R}/interests?box=received`, { token: c.accessToken })).json.items[0].id;
    expect((await t.call('POST', `${R}/interests/${cin}/decline`, { token: c.accessToken })).json.status).toBe('declined');
    expect((await t.call('GET', `${R}/interests?box=sent`, { token: a.accessToken })).json.items.find((i: { profile: { id: string } }) => i.profile.id === c.pid).status).toBe('sent');
    expect((await t.call('GET', `${R}/interests?box=received`, { token: c.accessToken })).json.items).toHaveLength(0);
    expect((await t.call('GET', `${R}/contact/${c.pid}`, { token: a.accessToken })).status).toBe(403);
    expect((await t.call('GET', `${R}/interests?box=nope`, { token: a.accessToken })).status).toBe(400);
  });

  it('an interest toward someone who already sent one to me accepts it', async () => {
    const t = await setup();
    await flagOn(t);
    const a = await person(t, { gender: 'male', gotra: 'Atri' });
    const b = await person(t, { gotra: 'Vashishth' });
    await t.call('POST', `${R}/interests`, { token: a.accessToken, body: { profile_id: b.pid } });
    const r = await t.call('POST', `${R}/interests`, { token: b.accessToken, body: { profile_id: a.pid } });
    expect(r.json.status).toBe('accepted');
    expect((await t.call('GET', `${R}/contact/${a.pid}`, { token: b.accessToken })).status).toBe(200);
  });

  it('is capped at 10 interests per rolling day, enforced by the server', async () => {
    const t = await setup();
    await flagOn(t);
    const me = await person(t, { gender: 'male', gotra: 'Atri' });
    const targets: Awaited<ReturnType<typeof person>>[] = [];
    for (let i = 0; i < 11; i++) targets.push(await person(t, { first_name: `T${i}`, gotra: 'Vashishth' }));
    for (let i = 0; i < 10; i++) expect((await t.call('POST', `${R}/interests`, { token: me.accessToken, body: { profile_id: targets[i]!.pid } })).status, `#${i}`).toBe(201);
    const over = await t.call('POST', `${R}/interests`, { token: me.accessToken, body: { profile_id: targets[10]!.pid } });
    expect(over.status).toBe(429);
    expect(over.json.error).toBe('interest_cap');
    // a day later the window has moved on
    await t.pg.query(`UPDATE rishtey_interests SET created_at = now() - interval '25 hours' WHERE id IN (SELECT id FROM rishtey_interests LIMIT 3)`);
    expect((await t.call('POST', `${R}/interests`, { token: me.accessToken, body: { profile_id: targets[10]!.pid } })).status).toBe(201);
  });
});

describe('reports and blocks', () => {
  it('reports are validated, de-duplicated, and three different reporters hide the profile pending review', async () => {
    const t = await setup();
    await flagOn(t);
    const target = await person(t, { gotra: 'Vashishth' });
    const reporters = [await person(t, { gender: 'male', gotra: 'A' }), await person(t, { gender: 'male', gotra: 'B' }), await person(t, { gender: 'male', gotra: 'C' })];
    expect((await t.call('POST', `${R}/report`, { token: reporters[0]!.accessToken, body: { profile_id: target.pid, reason: 'rude' } })).status).toBe(400);
    expect((await t.call('POST', `${R}/report`, { token: reporters[0]!.accessToken, body: { profile_id: target.pid, reason: 'fake', note: 'photo is not hers' } })).status).toBe(201);
    expect((await t.call('POST', `${R}/report`, { token: reporters[0]!.accessToken, body: { profile_id: target.pid, reason: 'fake' } })).status).toBe(201); // same reporter: still one report
    expect((await t.pg.query(`SELECT count(*)::int AS n FROM rishtey_reports`)).rows[0]).toEqual({ n: 1 });
    await t.call('POST', `${R}/report`, { token: reporters[1]!.accessToken, body: { profile_id: target.pid, reason: 'spam' } });
    expect((await t.pg.query('SELECT status FROM rishtey_profiles WHERE id = $1', [target.pid])).rows[0]).toEqual({ status: 'approved' });
    await t.call('POST', `${R}/report`, { token: reporters[2]!.accessToken, body: { profile_id: target.pid, reason: 'harassment' } });
    expect((await t.pg.query('SELECT status FROM rishtey_profiles WHERE id = $1', [target.pid])).rows[0]).toEqual({ status: 'hidden' });
    expect((await t.call('POST', `${R}/report`, { token: reporters[0]!.accessToken, body: { profile_id: '00000000-0000-4000-8000-000000000000', reason: 'spam' } })).status).toBe(404);
    // a reporter cannot read other people's reports
    expect(await withUserTx(t.db, reporters[0]!.user.id, 'user', (q) => q.query('SELECT 1 FROM rishtey_reports'))).toHaveLength(1);
  });
});

describe('admin moderation', () => {
  it('support sees the queue with public details only, approves / rejects with an audit trail, and viewers are refused', async () => {
    const t = await setup();
    await flagOn(t);
    const support = await makeStaff(t, 'support');
    const viewer = await makeStaff(t, 'viewer');
    const u = await signInWithPhone(t, nextPhone());
    await t.call('PUT', `${R}/profile`, { token: u.accessToken, body: base({ contact: '9876501234' }) });
    await t.call('POST', `${R}/profile/publish`, { token: u.accessToken, body: { consent: true } });

    expect((await t.call('GET', `${A}/rishtey/queue`, { token: viewer.accessToken })).status).toBe(403);
    const q = await t.call('GET', `${A}/rishtey/queue`, { token: support.accessToken });
    expect(q.status).toBe(200);
    expect(q.json.total).toBe(1);
    expect(q.json.items[0]).toMatchObject({ first_name: 'Asha', age: 25, place: 'Dungarpur, Rajasthan', published_by: 'self', status: 'pending' });
    for (const secret of ['9876501234', u.user.id, 'contact', 'user_id']) expect(q.text).not.toContain(secret);
    const id = q.json.items[0].id;
    expect((await t.pg.query(`SELECT action FROM admin_audit_log WHERE action = 'rishtey.queue_view'`)).rows).toHaveLength(1);

    expect((await t.call('POST', `${A}/rishtey/profiles/${id}/review`, { token: support.accessToken, body: { decision: 'reject' } })).json.error).toBe('reason_required');
    const rej = await t.call('POST', `${A}/rishtey/profiles/${id}/review`, { token: support.accessToken, body: { decision: 'reject', reason: 'Please remove the phone number from occupation' } });
    expect(rej.json.status).toBe('rejected');
    expect((await t.call('GET', `${R}/profile`, { token: u.accessToken })).json.profile).toMatchObject({ status: 'rejected', reject_reason: 'Please remove the phone number from occupation' });
    expect((await t.call('POST', `${A}/rishtey/profiles/${id}/review`, { token: support.accessToken, body: { decision: 'approve' } })).status).toBe(409); // only pending ones

    await t.call('POST', `${R}/profile/publish`, { token: u.accessToken, body: { consent: true } });
    expect((await t.call('POST', `${A}/rishtey/profiles/${id}/review`, { token: support.accessToken, body: { decision: 'approve' } })).json.status).toBe('approved');
    expect((await t.call('GET', `${R}/profile`, { token: u.accessToken })).json.profile).toMatchObject({ status: 'approved', reject_reason: null });
    const log = (await t.pg.query(`SELECT action, target_id, admin_user_id FROM admin_audit_log WHERE action IN ('rishtey.reject', 'rishtey.approve') ORDER BY id`)).rows as { action: string; target_id: string; admin_user_id: string }[];
    expect(log.map((l) => l.action)).toEqual(['rishtey.reject', 'rishtey.approve']);
    expect(log.every((l) => l.target_id === id && l.admin_user_id === support.user.id)).toBe(true);
    expect(JSON.stringify((await t.pg.query('SELECT * FROM admin_audit_log')).rows)).not.toContain('9876501234');
    expect((await t.call('POST', `${A}/rishtey/profiles/${id}/review`, { token: support.accessToken, body: { decision: 'maybe' } })).status).toBe(400);
  });

  it('lists reports, and "hide" hides the profile and closes its open reports', async () => {
    const t = await setup();
    await flagOn(t);
    const support = await makeStaff(t, 'support');
    const target = await person(t, { gotra: 'Vashishth' });
    const r1 = await person(t, { gender: 'male', gotra: 'A' });
    const r2 = await person(t, { gender: 'male', gotra: 'B' });
    await t.call('POST', `${R}/report`, { token: r1.accessToken, body: { profile_id: target.pid, reason: 'fake', note: 'wrong photo' } });
    await t.call('POST', `${R}/report`, { token: r2.accessToken, body: { profile_id: target.pid, reason: 'spam' } });
    const list = await t.call('GET', `${A}/rishtey/reports`, { token: support.accessToken });
    expect(list.json.total).toBe(2);
    expect(list.json.items[0]).toMatchObject({ first_name: 'Asha', profile_status: 'approved', open_reports: 2 });
    expect(list.text).not.toContain('9000011111');
    expect((await t.call('POST', `${A}/rishtey/reports/${list.json.items[0].id}/resolve`, { token: support.accessToken, body: { action: 'hide' } })).json.error).toBe('reason_required');
    const hid = await t.call('POST', `${A}/rishtey/reports/${list.json.items[0].id}/resolve`, { token: support.accessToken, body: { action: 'hide', reason: 'photo is not hers' } });
    expect(hid.json.status).toBe('actioned');
    expect((await t.pg.query('SELECT status FROM rishtey_profiles WHERE id = $1', [target.pid])).rows[0]).toEqual({ status: 'hidden' });
    expect((await t.call('GET', `${A}/rishtey/reports`, { token: support.accessToken })).json.total).toBe(0);
    expect((await t.call('GET', `${A}/rishtey/reports?status=actioned`, { token: support.accessToken })).json.total).toBe(2);
  });
});
