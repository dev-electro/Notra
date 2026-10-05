import type { Queryable } from './db';
import { ApiError } from './errors';

/**
 * Rewards (इनाम): daily check-in, rewarded video, referrals. Points are an achievement score only (no cash redemption).
 * The server decides the IST day; the unique indexes in migration 104 make double claims impossible even under races.
 * Every function runs inside the user's own transaction (withUserTx), so Row Level Security scopes all reads to their rows.
 */
export const CHECKIN_POINTS = 2;
export const VIDEO_POINTS = 5;
export const VIDEOS_PER_DAY = 3;
export const STREAK_BONUSES: Record<number, number> = { 7: 10, 30: 50 };
export const REFERRAL_INVITER_POINTS = 50;
export const REFERRAL_INVITEE_POINTS = 20;
export const MIN_REFERRAL_ENTRIES = 5;
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** The Indian calendar day (YYYY-MM-DD) of an instant. */
export const istDay = (d: Date): string => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
export const addDays = (day: string, n: number): string => new Date(Date.parse(day) + n * DAY_MS).toISOString().slice(0, 10);

/** Length of the run of consecutive check-in days that ends today, or yesterday when today is not checked in yet. */
export function streakOf(days: ReadonlySet<string>, today: string): { length: number; start: string | null } {
  let d = days.has(today) ? today : addDays(today, -1);
  if (!days.has(d)) return { length: 0, start: null };
  let length = 0;
  while (days.has(d)) { length++; d = addDays(d, -1); }
  return { length, start: addDays(d, 1) };
}

const dayText = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

async function checkinDays(q: Queryable, today: string): Promise<Set<string>> {
  const rows = await q.query<{ day: unknown }>(`SELECT day FROM reward_ledger WHERE kind = 'checkin' AND day > $1::date - 40`, [today]);
  return new Set(rows.map((r) => dayText(r.day)));
}

export interface RewardsState {
  balance: number;
  today: { day: string; checkedIn: boolean; videosUsed: number; videosLimit: number };
  streak: number;
  history: { kind: string; points: number; day: string; at: string }[];
}

export async function getState(q: Queryable, now: Date): Promise<RewardsState> {
  const today = istDay(now);
  // Referrals that became qualified since the last visit are credited here (no background job).
  await q.query('SELECT rewards_evaluate_referrals($1::date)', [today]);
  const [sum] = await q.query<{ total: string | number }>('SELECT coalesce(sum(points), 0) AS total FROM reward_ledger');
  const [t] = await q.query<{ checked: string | number; videos: string | number }>(
    `SELECT count(*) FILTER (WHERE kind = 'checkin') AS checked, count(*) FILTER (WHERE kind = 'video') AS videos FROM reward_ledger WHERE day = $1::date`, [today],
  );
  const history = await q.query<{ kind: string; points: number; day: unknown; created_at: string | Date }>(
    'SELECT kind, points, day, created_at FROM reward_ledger ORDER BY id DESC LIMIT 20',
  );
  return {
    balance: Number(sum?.total ?? 0),
    today: { day: today, checkedIn: Number(t?.checked ?? 0) > 0, videosUsed: Number(t?.videos ?? 0), videosLimit: VIDEOS_PER_DAY },
    streak: streakOf(await checkinDays(q, today), today).length,
    history: history.map((h) => ({ kind: h.kind, points: Number(h.points), day: dayText(h.day), at: new Date(h.created_at).toISOString() })),
  };
}

/** One check-in per IST day. Awards the streak bonus when the run reaches 7 or 30 days. */
export async function checkin(q: Queryable, userId: string, now: Date): Promise<{ points: number; bonus: number; streak: number }> {
  const today = istDay(now);
  const ins = await q.query(`INSERT INTO reward_ledger (user_id, kind, points, day) VALUES ($1, 'checkin', $2, $3::date) ON CONFLICT DO NOTHING RETURNING id`, [userId, CHECKIN_POINTS, today]);
  if (!ins.length) throw new ApiError(409, 'already_claimed');
  const s = streakOf(await checkinDays(q, today), today);
  const bonus = STREAK_BONUSES[s.length] ?? 0;
  if (bonus) {
    await q.query(`INSERT INTO reward_ledger (user_id, kind, points, day, ref) VALUES ($1, 'streak_bonus', $2, $3::date, $4) ON CONFLICT DO NOTHING`, [userId, bonus, today, `${s.length}:${s.start}`]);
  }
  return { points: CHECKIN_POINTS, bonus, streak: s.length };
}

/** +5 per rewarded video, at most 3 per IST day: the slot number is part of a unique index, so concurrent calls cannot exceed the cap. */
export async function video(q: Queryable, userId: string, now: Date): Promise<{ points: number; videosUsed: number }> {
  const today = istDay(now);
  const [c] = await q.query<{ n: string | number }>(`SELECT count(*) AS n FROM reward_ledger WHERE kind = 'video' AND day = $1::date`, [today]);
  const slot = Number(c?.n ?? 0) + 1;
  if (slot > VIDEOS_PER_DAY) throw new ApiError(409, 'video_cap');
  const ins = await q.query(`INSERT INTO reward_ledger (user_id, kind, points, day, ref) VALUES ($1, 'video', $2, $3::date, $4) ON CONFLICT DO NOTHING RETURNING id`, [userId, VIDEO_POINTS, today, String(slot)]);
  if (!ins.length) throw new ApiError(409, 'video_cap'); // lost a race for this slot
  return { points: VIDEO_POINTS, videosUsed: slot };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const newCode = (): string => {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
};

export async function getReferral(q: Queryable, userId: string, now: Date): Promise<{ code: string; invited: number; qualified: number; redeemed: boolean }> {
  await q.query('SELECT rewards_evaluate_referrals($1::date)', [istDay(now)]);
  let [row] = await q.query<{ code: string }>('SELECT code FROM referral_codes WHERE user_id = $1', [userId]);
  for (let i = 0; !row && i < 5; i++) {
    [row] = await q.query<{ code: string }>('INSERT INTO referral_codes (user_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING code', [userId, newCode()]);
    if (!row) [row] = await q.query<{ code: string }>('SELECT code FROM referral_codes WHERE user_id = $1', [userId]);
  }
  if (!row) throw new ApiError(500, 'internal');
  const [s] = await q.query<{ invited: string | number; qualified: string | number; redeemed: string | number }>(
    `SELECT count(*) FILTER (WHERE inviter_id = $1) AS invited, count(*) FILTER (WHERE inviter_id = $1 AND status = 'qualified') AS qualified,
            count(*) FILTER (WHERE invitee_id = $1) AS redeemed FROM referrals`, [userId],
  );
  return { code: row.code, invited: Number(s?.invited ?? 0), qualified: Number(s?.qualified ?? 0), redeemed: Number(s?.redeemed ?? 0) > 0 };
}

export async function redeemReferral(q: Queryable, code: unknown, now: Date): Promise<void> {
  if (typeof code !== 'string' || !/^[A-Za-z0-9]{6,12}$/.test(code.trim())) throw new ApiError(400, 'invalid_code');
  const [r] = await q.query<{ r: string }>('SELECT rewards_redeem_referral($1, $2::timestamptz) AS r', [code.trim(), now.toISOString()]);
  switch (r?.r) {
    case 'ok': return;
    case 'invalid_code': throw new ApiError(404, 'invalid_code');
    case 'self': throw new ApiError(400, 'own_code');
    case 'too_old': throw new ApiError(403, 'account_too_old');
    default: throw new ApiError(409, 'already_redeemed');
  }
}
