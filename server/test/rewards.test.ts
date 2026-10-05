import { describe, expect, it } from 'vitest';
import { istDay, streakOf } from '../src/rewards';
import { makeStaff, seedLedger, setup, signInWithPhone, nextPhone, type Ctx } from './helpers';

let clock = new Date('2026-10-06T10:00:00Z');
const T = () => setup({ now: () => clock });
const user = (t: Ctx) => signInWithPhone(t, nextPhone());
const get = (t: Ctx, tok: string, path = '/v1/rewards') => t.call('GET', path, { token: tok });
const post = (t: Ctx, tok: string, path: string, body?: unknown) => t.call('POST', path, { token: tok, body });

describe('IST day and streak helpers', () => {
  it('rolls over at 18:30 UTC', () => {
    expect(istDay(new Date('2026-10-06T18:29:00Z'))).toBe('2026-10-06');
    expect(istDay(new Date('2026-10-06T18:30:00Z'))).toBe('2026-10-07');
  });
  it('counts the run ending today or yesterday', () => {
    expect(streakOf(new Set(['2026-10-05', '2026-10-04', '2026-10-02']), '2026-10-06')).toEqual({ length: 2, start: '2026-10-04' });
    expect(streakOf(new Set(['2026-10-03']), '2026-10-06').length).toBe(0);
  });
});

describe('rewards API', () => {
  it('requires sign-in', async () => {
    const t = await T();
    for (const [m, p] of [['GET', '/v1/rewards'], ['POST', '/v1/rewards/checkin'], ['POST', '/v1/rewards/video'], ['GET', '/v1/rewards/referral'], ['POST', '/v1/rewards/referral/redeem']] as const) {
      expect((await t.call(m, p)).status).toBe(401);
    }
  });

  it('check-in is once per IST day and builds a streak with +10 at 7 and +50 at 30', async () => {
    clock = new Date('2026-10-06T10:00:00Z');
    const t = await T();
    const u = await user(t);
    expect((await get(t, u.accessToken)).json).toMatchObject({ balance: 0, streak: 0, today: { day: '2026-10-06', checkedIn: false, videosUsed: 0 } });
    let bonusSeen: number[] = [];
    for (let i = 1; i <= 30; i++) {
      const r = await post(t, u.accessToken, '/v1/rewards/checkin');
      expect(r.status).toBe(200);
      expect(r.json.streak).toBe(i);
      if (r.json.bonus) bonusSeen.push(i * 1000 + r.json.bonus);
      if (i === 1) expect((await post(t, u.accessToken, '/v1/rewards/checkin')).status).toBe(409); // same day again
      clock = new Date(clock.getTime() + 86_400_000);
    }
    expect(bonusSeen).toEqual([7010, 30050]);
    clock = new Date(clock.getTime() - 86_400_000);
    const s = (await get(t, u.accessToken)).json;
    expect(s.balance).toBe(30 * 2 + 10 + 50);
    expect(s.streak).toBe(30);
    expect(s.today.checkedIn).toBe(true);
    expect(s.history.length).toBe(20);
    // a gap resets the streak
    clock = new Date(clock.getTime() + 3 * 86_400_000);
    expect((await get(t, u.accessToken)).json.streak).toBe(0);
    expect((await post(t, u.accessToken, '/v1/rewards/checkin')).json.streak).toBe(1);
  });

  it('check-in cannot be doubled by two parallel calls', async () => {
    clock = new Date('2026-11-01T10:00:00Z');
    const t = await T();
    const u = await user(t);
    const rs = await Promise.all([post(t, u.accessToken, '/v1/rewards/checkin'), post(t, u.accessToken, '/v1/rewards/checkin')]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await get(t, u.accessToken)).json.balance).toBe(2);
  });

  it('video pays +5, at most 3 a day, resets next IST day', async () => {
    clock = new Date('2026-10-06T10:00:00Z');
    const t = await T();
    const u = await user(t);
    for (let i = 1; i <= 3; i++) expect((await post(t, u.accessToken, '/v1/rewards/video')).json).toMatchObject({ points: 5, videosUsed: i });
    const r = await post(t, u.accessToken, '/v1/rewards/video');
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('video_cap');
    expect((await get(t, u.accessToken)).json).toMatchObject({ balance: 15, today: { videosUsed: 3, videosLimit: 3 } });
    clock = new Date('2026-10-06T19:00:00Z'); // 00:30 IST next day
    expect((await post(t, u.accessToken, '/v1/rewards/video')).status).toBe(200);
  });

  it('the database itself refuses a 4th video, a second check-in and edits to the ledger', async () => {
    const t = await T();
    const u = await user(t);
    const ins = (kind: string, ref: string | null) => t.db.tx(async (q) => {
      await q.query(`SELECT set_config('app.user_id', $1, true)`, [u.user.id]);
      return q.query(`INSERT INTO reward_ledger (user_id, kind, points, day, ref) VALUES ($1, $2, 5, '2026-10-06', $3)`, [u.user.id, kind, ref]);
    });
    await ins('video', '3');
    await expect(ins('video', '3')).rejects.toThrow();
    await expect(ins('video', '4')).rejects.toThrow();
    await ins('checkin', null);
    await expect(ins('checkin', null)).rejects.toThrow();
    await expect(t.db.tx(async (q) => {
      await q.query(`SELECT set_config('app.user_id', $1, true)`, [u.user.id]);
      await q.query('UPDATE reward_ledger SET points = 100');
    })).rejects.toThrow();
    await expect(t.db.tx(async (q) => {
      await q.query(`SELECT set_config('app.user_id', $1, true)`, [u.user.id]);
      await q.query('DELETE FROM reward_ledger');
    })).rejects.toThrow();
  });

  it('users only see their own rows', async () => {
    clock = new Date('2026-10-06T10:00:00Z');
    const t = await T();
    const a = await user(t);
    const b = await user(t);
    await post(t, a.accessToken, '/v1/rewards/checkin');
    expect((await get(t, b.accessToken)).json.balance).toBe(0);
    expect((await get(t, b.accessToken)).json.history).toEqual([]);
  });

  describe('referrals', () => {
    it('gives each user a stable code', async () => {
      const t = await T();
      const a = await user(t);
      const r1 = (await get(t, a.accessToken, '/v1/rewards/referral')).json;
      expect(r1.code).toMatch(/^[A-Z2-9]{6}$/);
      expect(r1).toMatchObject({ invited: 0, qualified: 0, redeemed: false });
      expect((await get(t, a.accessToken, '/v1/rewards/referral')).json.code).toBe(r1.code);
    });

    it('redeem: once, not own code, unknown code, account under 7 days', async () => {
      clock = new Date('2026-10-06T10:00:00Z');
      const t = await T();
      const inviter = await user(t);
      const invitee = await user(t);
      const code = (await get(t, inviter.accessToken, '/v1/rewards/referral')).json.code;
      const redeem = (tok: string, c: unknown) => post(t, tok, '/v1/rewards/referral/redeem', { code: c });
      expect((await redeem(inviter.accessToken, code)).json.error).toBe('own_code');
      expect((await redeem(invitee.accessToken, 'ZZZZZZ')).status).toBe(404);
      expect((await redeem(invitee.accessToken, 12)).status).toBe(400);
      expect((await redeem(invitee.accessToken, code.toLowerCase())).status).toBe(200);
      expect((await redeem(invitee.accessToken, code)).status).toBe(409);
      expect((await get(t, invitee.accessToken, '/v1/rewards/referral')).json.redeemed).toBe(true);
      expect((await get(t, inviter.accessToken, '/v1/rewards/referral')).json).toMatchObject({ invited: 1, qualified: 0 });
      // an old account may not redeem
      const old = await user(t);
      await t.pg.query(`UPDATE users SET created_at = $2 WHERE id = $1`, [old.user.id, '2026-09-01T00:00:00Z']);
      expect((await redeem(old.accessToken, code)).json.error).toBe('account_too_old');
    });

    it('qualifies after the invitee synced 5 entries: +50 inviter, +20 invitee, once', async () => {
      clock = new Date('2026-10-06T10:00:00Z');
      const t = await T();
      const inviter = await user(t);
      const invitee = await user(t);
      const code = (await get(t, inviter.accessToken, '/v1/rewards/referral')).json.code;
      await post(t, invitee.accessToken, '/v1/rewards/referral/redeem', { code });
      await seedLedger(t, invitee.accessToken, 1);
      await seedLedger(t, invitee.accessToken, 10);
      expect((await get(t, inviter.accessToken)).json.balance).toBe(0); // 4 entries: not yet
      await seedLedger(t, invitee.accessToken, 20);
      const a = (await get(t, inviter.accessToken)).json;
      expect(a.balance).toBe(50);
      expect(a.history[0]).toMatchObject({ kind: 'referral', points: 50 });
      expect((await get(t, inviter.accessToken)).json.balance).toBe(50); // no double credit
      expect((await get(t, invitee.accessToken)).json.balance).toBe(20);
      expect((await get(t, inviter.accessToken, '/v1/rewards/referral')).json).toMatchObject({ invited: 1, qualified: 1 });
    });
  });
});

describe('admin rewards report', () => {
  it('is aggregate-only: "<5" under 5 users, numbers from 5, viewer and above', async () => {
    clock = new Date('2026-10-06T10:00:00Z');
    const t = await T();
    const viewer = await makeStaff(t, 'viewer');
    const users = [];
    for (let i = 0; i < 5; i++) users.push(await user(t));
    await post(t, users[0]!.accessToken, '/v1/rewards/checkin');
    const day = '2026-10-06';
    const q = `?from=${day}&to=${day}`;
    const few = await t.call('GET', `/admin/api/reports/rewards${q}`, { token: viewer.accessToken });
    expect(few.status).toBe(200);
    expect(few.json.rows).toEqual([{ day, points: '<5', checkins: '<5', videos: '<5', referrals: '<5' }]);
    for (const u of users.slice(1)) await post(t, u.accessToken, '/v1/rewards/checkin');
    const many = await t.call('GET', `/admin/api/reports/rewards${q}`, { token: viewer.accessToken });
    expect(many.json.rows).toEqual([{ day, points: 10, checkins: 5, videos: 0, referrals: 0 }]);
    expect((await t.call('GET', `/admin/api/reports/rewards${q}`, { token: users[0]!.accessToken })).status).toBe(403);
  });
});
