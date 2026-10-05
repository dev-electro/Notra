import type { Db } from '../db/types';

/** Rows the server refused. They are kept on the phone and counted, never silently dropped. */
export interface RejectedRow {
  table: 'entries' | 'households' | 'events' | 'ledgers';
  id: string;
  /** Short Hindi description of the row, to recognise it ("रमेश · ₹501 आया"). */
  label: string;
  reason: string;
}

export async function countRejected(db: Db): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM entries WHERE sync_error IS NOT NULL) + (SELECT COUNT(*) FROM households WHERE sync_error IS NOT NULL)
          + (SELECT COUNT(*) FROM events WHERE sync_error IS NOT NULL) + (SELECT COUNT(*) FROM ledgers WHERE sync_error IS NOT NULL) AS n`,
    [],
  );
  return r?.n ?? 0;
}

const rupees = (paise: number) => `₹${Math.round(paise / 100)}`;

export async function listRejected(db: Db, limit = 100): Promise<RejectedRow[]> {
  const out: RejectedRow[] = [];
  const entries = await db.getAllAsync<{ id: string; sync_error: string; direction: string; cash: number; name: string | null }>(
    `SELECT e.id, e.sync_error, e.direction, e.cash_paise + e.in_kind_value_paise AS cash, h.head_name AS name
     FROM entries e LEFT JOIN households h ON h.id = e.other_household_id
     WHERE e.sync_error IS NOT NULL ORDER BY e.created_at DESC LIMIT ?`, [limit]);
  for (const e of entries) {
    out.push({ table: 'entries', id: e.id, reason: e.sync_error, label: `${e.name ?? '—'} · ${rupees(e.cash)} ${e.direction === 'AAYA' ? 'आया' : 'गया'}` });
  }
  const hs = await db.getAllAsync<{ id: string; sync_error: string; head_name: string; village: string }>(
    'SELECT id, sync_error, head_name, village FROM households WHERE sync_error IS NOT NULL LIMIT ?', [limit]);
  for (const h of hs) out.push({ table: 'households', id: h.id, reason: h.sync_error, label: `परिवार: ${h.head_name} · ${h.village}` });
  const evs = await db.getAllAsync<{ id: string; sync_error: string; occasion: string; date: string }>(
    'SELECT id, sync_error, occasion, date FROM events WHERE sync_error IS NOT NULL LIMIT ?', [limit]);
  for (const e of evs) out.push({ table: 'events', id: e.id, reason: e.sync_error, label: `कार्यक्रम: ${e.date}` });
  const ls = await db.getAllAsync<{ id: string; sync_error: string; name: string }>(
    'SELECT id, sync_error, name FROM ledgers WHERE sync_error IS NOT NULL LIMIT ?', [limit]);
  for (const l of ls) out.push({ table: 'ledgers', id: l.id, reason: l.sync_error, label: `खाता: ${l.name}` });
  return out.slice(0, limit);
}

/** Give the rejected rows another chance (e.g. after an app update that fixes the data). They are pushed again next sync. */
export async function retryRejected(db: Db): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const t of ['entries', 'households', 'events', 'ledgers']) {
      await db.runAsync(`UPDATE ${t} SET sync_error = NULL WHERE sync_error IS NOT NULL`, []);
    }
  });
}
