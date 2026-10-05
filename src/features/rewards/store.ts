import { addDay, EMPTY_ACTIVITY, isLegacyEventId, streakFromDays, todayIso, type Activity } from '@/core';
import { getDb, getMyHouseholdId, getSetting, setSetting, type Db } from '@/db';

/** इनाम counters live in the on-phone settings store only (never synced or uploaded). */
const DAYS_KEY = 'rw_days_v1';
const BACKUPS_KEY = 'rw_backups_v1';
const REPORTS_KEY = 'rw_reports_v1';

const asInt = (v: string | null): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** Remember that the app was used today (for the daily streak). Never throws. */
export async function touchToday(db?: Db): Promise<void> {
  try {
    const d = db ?? ((await getDb()) as unknown as Db);
    let days: string[] = [];
    try {
      const parsed: unknown = JSON.parse((await getSetting(d, DAYS_KEY)) ?? '[]');
      if (Array.isArray(parsed)) days = parsed.filter((x): x is string => typeof x === 'string');
    } catch {
      days = [];
    }
    const today = todayIso();
    if (days.includes(today)) return;
    await setSetting(d, DAYS_KEY, JSON.stringify(addDay(days, today)));
  } catch {
    /* rewards must never break the app */
  }
}

async function bump(key: string): Promise<void> {
  try {
    const d = (await getDb()) as unknown as Db;
    await setSetting(d, key, String(asInt(await getSetting(d, key)) + 1));
  } catch {
    /* ignore */
  }
}

export const recordBackup = () => bump(BACKUPS_KEY);
export const recordReport = () => bump(REPORTS_KEY);

/** Everything the points and badges are worked out from, for the open ledger. */
export async function loadActivity(db: Db, ledgerId: string): Promise<Activity> {
  const [e, ids, h, me, days, backups, reports] = await Promise.all([
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM active_entries WHERE ledger_id = ?', [ledgerId]),
    db.getAllAsync<{ id: string }>('SELECT id FROM events WHERE ledger_id = ?', [ledgerId]),
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM households', []),
    getMyHouseholdId(db),
    getSetting(db, DAYS_KEY),
    getSetting(db, BACKUPS_KEY),
    getSetting(db, REPORTS_KEY),
  ]);
  let list: string[] = [];
  try {
    const parsed: unknown = JSON.parse(days ?? '[]');
    if (Array.isArray(parsed)) list = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    list = [];
  }
  return {
    ...EMPTY_ACTIVITY,
    entries: e?.n ?? 0,
    events: ids.filter((r) => !isLegacyEventId(r.id)).length,
    households: Math.max(0, (h?.n ?? 0) - (me ? 1 : 0)),
    backups: asInt(backups),
    reports: asInt(reports),
    streak: streakFromDays(list, todayIso()),
  };
}
