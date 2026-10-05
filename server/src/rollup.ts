import { SYSTEM_USER_ID, withUserTx, type Db } from './db';

/**
 * Nightly job (Cloudflare Cron Trigger): recompute the last `daysBack` days of daily_stats (phones sync late, so recent days
 * keep changing) and purge old detail rows. Runs as the 'system' role; the work happens inside analytics.* SECURITY DEFINER
 * functions, so it produces aggregates and never hands rows to this code.
 */
export async function runScheduled(db: Db, now: Date, daysBack = 7): Promise<{ days: string[] }> {
  const days: string[] = [];
  for (let i = daysBack - 1; i >= 0; i--) days.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  await withUserTx(db, SYSTEM_USER_ID, 'system', async (q) => {
    for (const d of days) await q.query('SELECT analytics.rollup_day($1::date)', [d]);
    await q.query('SELECT analytics.purge_old()');
  });
  return { days };
}
