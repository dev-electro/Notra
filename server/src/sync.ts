import { withUserTx, type Db, type Queryable } from './db';
import type { EntryRow, EventRow, HouseholdRow, LedgerRow, ProfileRow, PushBatch } from './validate';

/**
 * Push: households/events are last-write-wins by updated_at (strictly newer replaces); entries are immutable
 * (ON CONFLICT DO NOTHING). Each table is one set-based statement over a jsonb array. Everything is scoped by
 * user_id, and the conflict target includes user_id, so one user can never touch another user's rows.
 * A per-user advisory lock serialises push vs pull so a pull never observes a half-committed batch
 * (which could otherwise let a cursor skip rows whose sequence numbers commit out of order).
 */
export async function pushRows(
  db: Db, userId: string, b: PushBatch,
): Promise<{ ledgers: number; households: number; events: number; entries: number; profile: number }> {
  // Row Level Security: the transaction acts as this user with the plain 'user' role, whatever staff role they hold.
  return withUserTx(db, userId, 'user', async (q) => {
    await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sync:${userId}`]);
    const out = { ledgers: 0, households: 0, events: 0, entries: 0, profile: 0 };
    if (b.ledgers.length) {
      const r = await q.query(
        `INSERT INTO ledgers (user_id, id, name, kind, created_at, updated_at, server_seq)
         SELECT $1::uuid, t.id, t.name, t.kind, t.created_at, t.updated_at, nextval('sync_seq')
         FROM jsonb_to_recordset($2::text::jsonb) AS t(id uuid, name text, kind text, created_at text, updated_at text)
         ON CONFLICT (user_id, id) DO UPDATE SET name = EXCLUDED.name, updated_at = EXCLUDED.updated_at, server_seq = EXCLUDED.server_seq
         WHERE EXCLUDED.updated_at > ledgers.updated_at
         RETURNING 1`,
        [userId, JSON.stringify(b.ledgers)],
      );
      out.ledgers = r.length;
    }    if (b.households.length) {
      const r = await q.query(
        `INSERT INTO households (user_id, id, head_name, father_name, jati, atak, village, fala, phone, created_at, updated_at, server_seq)
         SELECT $1::uuid, t.id, t.head_name, t.father_name, t.jati, t.atak, t.village, t.fala, t.phone, t.created_at, t.updated_at, nextval('sync_seq')
         FROM jsonb_to_recordset($2::text::jsonb) AS t(id uuid, head_name text, father_name text, jati text, atak text, village text, fala text, phone text, created_at text, updated_at text)
         ON CONFLICT (user_id, id) DO UPDATE SET head_name = EXCLUDED.head_name, father_name = EXCLUDED.father_name,
           jati = EXCLUDED.jati, atak = EXCLUDED.atak, village = EXCLUDED.village, fala = EXCLUDED.fala, phone = EXCLUDED.phone,
           updated_at = EXCLUDED.updated_at, server_seq = EXCLUDED.server_seq
         WHERE EXCLUDED.updated_at > households.updated_at
         RETURNING 1`,
        [userId, JSON.stringify(b.households)],
      );
      out.households = r.length;
    }
    if (b.events.length) {
      const r = await q.query(
        `INSERT INTO events (user_id, id, host_household_id, occasion, date, panch_approved, invitation_type, status, ledger_id, created_at, updated_at, server_seq)
         SELECT $1::uuid, t.id, t.host_household_id, t.occasion, t.date, t.panch_approved, t.invitation_type, t.status, t.ledger_id, t.created_at, t.updated_at, nextval('sync_seq')
         FROM jsonb_to_recordset($2::text::jsonb) AS t(id uuid, host_household_id uuid, occasion text, date text, panch_approved boolean, invitation_type text, status text, ledger_id uuid, created_at text, updated_at text)
         ON CONFLICT (user_id, id) DO UPDATE SET host_household_id = EXCLUDED.host_household_id, occasion = EXCLUDED.occasion,
           date = EXCLUDED.date, panch_approved = EXCLUDED.panch_approved, invitation_type = EXCLUDED.invitation_type,
           status = EXCLUDED.status, updated_at = EXCLUDED.updated_at, server_seq = EXCLUDED.server_seq
         WHERE EXCLUDED.updated_at > events.updated_at
         RETURNING 1`,
        [userId, JSON.stringify(b.events)],
      );
      out.events = r.length;
    }
    if (b.entries.length) {
      const r = await q.query(
        `INSERT INTO entries (user_id, id, event_id, other_household_id, direction, cash_paise, in_kind_item, in_kind_value_paise,
           payment_mode, recorded_by, created_at, corrects_entry_id, is_void, ledger_id, server_seq)
         SELECT $1::uuid, t.id, t.event_id, t.other_household_id, t.direction, t.cash_paise, t.in_kind_item, t.in_kind_value_paise,
           t.payment_mode, t.recorded_by, t.created_at, t.corrects_entry_id, t.is_void, t.ledger_id, nextval('sync_seq')
         FROM jsonb_to_recordset($2::text::jsonb) AS t(id uuid, event_id uuid, other_household_id uuid, direction text, cash_paise bigint, in_kind_item text,
           in_kind_value_paise bigint, payment_mode text, recorded_by text, created_at text, corrects_entry_id uuid, is_void boolean, ledger_id uuid)
         ON CONFLICT (user_id, id) DO NOTHING
         RETURNING 1`,
        [userId, JSON.stringify(b.entries)],
      );
      out.entries = r.length;
    }
    if (b.profile) {
      const r = await q.query(
        `INSERT INTO profiles (user_id, my_household_id, increment, updated_at, server_seq)
         VALUES ($1, $2, $3::text::jsonb, $4, nextval('sync_seq'))
         ON CONFLICT (user_id) DO UPDATE SET my_household_id = EXCLUDED.my_household_id, increment = EXCLUDED.increment,
           updated_at = EXCLUDED.updated_at, server_seq = EXCLUDED.server_seq
         WHERE EXCLUDED.updated_at > profiles.updated_at
         RETURNING 1`,
        [userId, b.profile.my_household_id, b.profile.increment === null ? null : JSON.stringify(b.profile.increment), b.profile.updated_at],
      );
      out.profile = r.length;
    }
    return out;
  });
}

type Tagged<T> = T & { server_seq: number };
export interface PullResult {
  ledgers: Record<string, unknown>[];
  profile: Record<string, unknown> | null;
  households: Record<string, unknown>[];
  events: Record<string, unknown>[];
  entries: Record<string, unknown>[];
  nextCursor: number;
  hasMore: boolean;
}

const seqOf = (v: unknown) => Number(v);

/** Rows with server_seq > since for this user, at most `limit` rows in total across the three tables. */
export async function pullRows(db: Db, userId: string, since: number, limit: number): Promise<PullResult> {
  return withUserTx(db, userId, 'user', async (q: Queryable) => {
    await q.query('SELECT pg_advisory_xact_lock_shared(hashtext($1))', [`sync:${userId}`]);
    const take = limit + 1;
    const [ls, ps, hs, evs, ens] = [
      await q.query<Tagged<LedgerRow>>(
        `SELECT id, name, kind, created_at, updated_at, server_seq
         FROM ledgers WHERE user_id = $1 AND server_seq > $2 ORDER BY server_seq LIMIT $3`, [userId, since, take]),
      await q.query<Tagged<ProfileRow>>(
        `SELECT my_household_id, increment, updated_at, server_seq FROM profiles WHERE user_id = $1 AND server_seq > $2`, [userId, since]),
      await q.query<Tagged<HouseholdRow>>(
        `SELECT id, head_name, father_name, jati, atak, village, fala, phone, created_at, updated_at, server_seq
         FROM households WHERE user_id = $1 AND server_seq > $2 ORDER BY server_seq LIMIT $3`, [userId, since, take]),
      await q.query<Tagged<EventRow>>(
        `SELECT id, host_household_id, occasion, date, panch_approved, invitation_type, status, ledger_id, created_at, updated_at, server_seq
         FROM events WHERE user_id = $1 AND server_seq > $2 ORDER BY server_seq LIMIT $3`, [userId, since, take]),
      await q.query<Tagged<EntryRow>>(
        `SELECT id, event_id, other_household_id, direction, cash_paise::float8 AS cash_paise, in_kind_item,
                in_kind_value_paise::float8 AS in_kind_value_paise, payment_mode, recorded_by, created_at, corrects_entry_id, is_void, ledger_id, server_seq
         FROM entries WHERE user_id = $1 AND server_seq > $2 ORDER BY server_seq LIMIT $3`, [userId, since, take]),
    ];
    const merged = [
      ...ls.map((r) => ({ k: 'l' as const, r })),
      ...ps.map((r) => ({ k: 'p' as const, r })),
      ...hs.map((r) => ({ k: 'h' as const, r })),
      ...evs.map((r) => ({ k: 'e' as const, r })),
      ...ens.map((r) => ({ k: 'n' as const, r })),
    ].sort((a, b) => seqOf(a.r.server_seq) - seqOf(b.r.server_seq));
    const hasMore = merged.length > limit;
    const page = merged.slice(0, limit);
    const res: PullResult = {
      ledgers: [], profile: null, households: [], events: [], entries: [], hasMore,
      nextCursor: page.length ? seqOf(page[page.length - 1]!.r.server_seq) : since,
    };
    for (const { k, r } of page) {
      const { server_seq: _s, ...row } = r;
      void _s;
      if (k === 'l') res.ledgers.push(camelLedger(row as LedgerRow));
      else if (k === 'p') res.profile = camelProfile(row as ProfileRow);
      else if (k === 'h') res.households.push(camelHousehold(row as HouseholdRow));
      else if (k === 'e') res.events.push(camelEvent(row as EventRow));
      else res.entries.push(camelEntry(row as EntryRow));
    }
    return res;
  });
}

const camelLedger = (r: LedgerRow) => ({ id: r.id, name: r.name, kind: r.kind, createdAt: r.created_at, updatedAt: r.updated_at });
const camelProfile = (r: ProfileRow) => ({
  myHouseholdId: r.my_household_id,
  increment: typeof r.increment === 'string' ? (JSON.parse(r.increment) as ProfileRow['increment']) : r.increment,
  updatedAt: r.updated_at,
});
const camelHousehold = (r: HouseholdRow) => ({
  id: r.id, headName: r.head_name, fatherName: r.father_name, jati: r.jati, atak: r.atak, village: r.village, fala: r.fala,
  phone: r.phone, createdAt: r.created_at, updatedAt: r.updated_at,
});
const camelEvent = (r: EventRow) => ({
  id: r.id, hostHouseholdId: r.host_household_id, occasion: r.occasion, date: r.date, panchApproved: r.panch_approved,
  invitationType: r.invitation_type, status: r.status, ledgerId: r.ledger_id, createdAt: r.created_at, updatedAt: r.updated_at,
});
const camelEntry = (r: EntryRow) => ({
  id: r.id, eventId: r.event_id, otherHouseholdId: r.other_household_id, direction: r.direction, cashPaise: Number(r.cash_paise),
  inKindItem: r.in_kind_item, inKindValuePaise: Number(r.in_kind_value_paise), paymentMode: r.payment_mode, recordedBy: r.recorded_by,
  createdAt: r.created_at, correctsEntryId: r.corrects_entry_id, isVoid: r.is_void, ledgerId: r.ledger_id,
});
