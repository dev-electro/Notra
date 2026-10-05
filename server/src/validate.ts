/**
 * Tiny hand-written validators for the sync payload. They normalise to snake_case rows ready for SQL.
 *
 * Validation errors are PER ROW: a row that fails is reported back in `rejected` (table, id, index, reason) and the rest
 * of the batch is stored. One bad row must never block everything behind it (a "poison row"). Only problems with the
 * request as a whole (not JSON, wrong shape, too many rows) are a 400.
 */
import { ApiError } from './errors';

export const MAX_BATCH = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/; // updated_at: fixed width so text order == time order
const ISO_ANY = /^\d{4}-\d{2}-\d{2}T[\d:.]{5,16}Z$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const DEFAULT_LEDGER_ID = '00000000-0000-4000-8000-000000000001';

const bad = (path: string): never => {
  throw new ApiError(400, 'invalid_payload', { field: path });
};
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

// Postgres text cannot hold a NUL character: one such string would otherwise fail the whole batch.
const clean = (v: string) => !v.includes('\u0000');

function str(o: Obj, k: string, path: string, max = 200): string {
  const v = o[k];
  if (typeof v !== 'string' || v.length > max || !clean(v)) return bad(`${path}.${k}`);
  return v;
}
function optStr(o: Obj, k: string, path: string, max = 500): string | null {
  const v = o[k];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || v.length > max || !clean(v)) return bad(`${path}.${k}`);
  return v;
}
function uuid(o: Obj, k: string, path: string): string {
  const v = o[k];
  if (typeof v !== 'string' || !UUID.test(v)) return bad(`${path}.${k}`);
  return v.toLowerCase();
}
function optUuid(o: Obj, k: string, path: string): string | null {
  return o[k] === undefined || o[k] === null ? null : uuid(o, k, path);
}
function oneOf<T extends string>(o: Obj, k: string, path: string, allowed: readonly T[]): T {
  const v = o[k];
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : bad(`${path}.${k}`);
}
function paise(o: Obj, k: string, path: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1e12) return bad(`${path}.${k}`);
  return v;
}
function iso(o: Obj, k: string, path: string, re: RegExp): string {
  const v = o[k];
  return typeof v === 'string' && re.test(v) ? v : bad(`${path}.${k}`);
}

export interface LedgerRow {
  id: string; name: string; kind: string; created_at: string; updated_at: string;
}
export interface HouseholdRow {
  id: string; head_name: string; father_name: string; jati: string; atak: string; village: string; fala: string;
  phone: string | null; created_at: string; updated_at: string;
}
export interface EventRow {
  id: string; host_household_id: string; occasion: string; date: string; panch_approved: boolean; invitation_type: string;
  status: string; ledger_id: string; created_at: string; updated_at: string;
}
export interface EntryRow {
  id: string; event_id: string | null; other_household_id: string; direction: string; cash_paise: number;
  in_kind_item: string | null; in_kind_value_paise: number; payment_mode: string; recorded_by: string;
  created_at: string; corrects_entry_id: string | null; is_void: boolean; ledger_id: string;
}
export interface ProfileRow {
  my_household_id: string | null;
  increment: { type: 'FIXED'; rupees: number } | { type: 'PERCENT'; pct: number } | null;
  updated_at: string;
}
export interface PushBatch {
  ledgers: LedgerRow[];
  households: HouseholdRow[];
  events: EventRow[];
  entries: EntryRow[];
  profile: ProfileRow | null;
}
export type RejectTable = 'ledgers' | 'households' | 'events' | 'entries' | 'profile';
export interface Rejection {
  table: RejectTable;
  /** The id the client sent for the row, when it sent a usable string. */
  id: string | null;
  /** Position of the row in the array the client sent for `table`. */
  index: number;
  reason: string;
}

function list(body: Obj, key: string): unknown[] {
  const v = body[key];
  if (v === undefined) return [];
  if (!Array.isArray(v)) return bad(key);
  return v;
}

/** Keep one row per id: the newest updated_at wins (ties: the later one in the batch). */
function dedupeLww<T extends { id: string; updated_at: string }>(rows: T[]): T[] {
  const m = new Map<string, T>();
  for (const r of rows) {
    const cur = m.get(r.id);
    if (!cur || r.updated_at >= cur.updated_at) m.set(r.id, r);
  }
  return [...m.values()];
}

const rawId = (raw: unknown): string | null => (isObj(raw) && typeof raw.id === 'string' ? raw.id.slice(0, 64) : null);

/** "households[3].headName" -> "invalid_payload:headName" (never echoes the value itself). */
const reasonOf = (e: unknown): string => {
  if (e instanceof ApiError && e.code === 'invalid_payload') {
    const f = String(e.extra?.field ?? '');
    const last = f.slice(f.lastIndexOf('.') + 1);
    return `invalid_payload:${/^[A-Za-z]+$/.test(last) ? last : 'row'}`;
  }
  throw e;
};

function validateLedger(raw: unknown, p: string): LedgerRow {
  if (!isObj(raw)) return bad(p);
  const name = str(raw, 'name', p, 100);
  if (name.trim() === '') bad(`${p}.name`);
  return {
    id: uuid(raw, 'id', p), name, kind: oneOf(raw, 'kind', p, ['HOUSEHOLD', 'PERSONAL']),
    created_at: iso(raw, 'createdAt', p, ISO_ANY), updated_at: iso(raw, 'updatedAt', p, ISO_MS),
  };
}
function validateHousehold(raw: unknown, p: string): HouseholdRow {
  if (!isObj(raw)) return bad(p);
  return {
    id: uuid(raw, 'id', p), head_name: str(raw, 'headName', p), father_name: str(raw, 'fatherName', p),
    jati: str(raw, 'jati', p), atak: str(raw, 'atak', p), village: str(raw, 'village', p), fala: str(raw, 'fala', p),
    phone: optStr(raw, 'phone', p, 32), created_at: iso(raw, 'createdAt', p, ISO_ANY), updated_at: iso(raw, 'updatedAt', p, ISO_MS),
  };
}
function validateEvent(raw: unknown, p: string): EventRow {
  if (!isObj(raw)) return bad(p);
  const date = str(raw, 'date', p, 10);
  if (!DAY.test(date)) bad(`${p}.date`);
  if (typeof raw.panchApproved !== 'boolean') bad(`${p}.panchApproved`);
  return {
    id: uuid(raw, 'id', p), host_household_id: uuid(raw, 'hostHouseholdId', p),
    occasion: oneOf(raw, 'occasion', p, ['SHAADI', 'BIMARI', 'MAKAAN', 'OTHER']), date,
    panch_approved: raw.panchApproved as boolean,
    invitation_type: oneOf(raw, 'invitationType', p, ['YELLOW_RICE', 'KUMKUM', 'CARD']),
    status: oneOf(raw, 'status', p, ['PLANNED', 'HELD', 'SETTLED']),
    ledger_id: raw.ledgerId === undefined || raw.ledgerId === null ? DEFAULT_LEDGER_ID : uuid(raw, 'ledgerId', p),
    created_at: iso(raw, 'createdAt', p, ISO_ANY), updated_at: iso(raw, 'updatedAt', p, ISO_MS),
  };
}
function validateEntry(raw: unknown, p: string): EntryRow {
  if (!isObj(raw)) return bad(p);
  const id = uuid(raw, 'id', p);
  const isVoid = raw.isVoid === undefined ? false : raw.isVoid;
  if (typeof isVoid !== 'boolean') return bad(`${p}.isVoid`);
  const row: EntryRow = {
    id, event_id: optUuid(raw, 'eventId', p), other_household_id: uuid(raw, 'otherHouseholdId', p),
    direction: oneOf(raw, 'direction', p, ['AAYA', 'GAYA']), cash_paise: paise(raw, 'cashPaise', p),
    in_kind_item: optStr(raw, 'inKindItem', p, 500), in_kind_value_paise: paise(raw, 'inKindValuePaise', p),
    payment_mode: oneOf(raw, 'paymentMode', p, ['CASH', 'UPI']), recorded_by: str(raw, 'recordedBy', p),
    created_at: iso(raw, 'createdAt', p, ISO_ANY), corrects_entry_id: optUuid(raw, 'correctsEntryId', p), is_void: isVoid,
    ledger_id: raw.ledgerId === undefined || raw.ledgerId === null ? DEFAULT_LEDGER_ID : uuid(raw, 'ledgerId', p),
  };
  if (isVoid && (!row.corrects_entry_id || row.cash_paise !== 0 || row.in_kind_value_paise !== 0)) bad(`${p}.isVoid`);
  return row;
}
function validateProfile(raw: unknown): ProfileRow {
  const p = 'profile';
  if (!isObj(raw)) return bad(p);
  const inc = raw.increment;
  let increment: ProfileRow['increment'] = null;
  if (inc !== undefined && inc !== null) {
    if (!isObj(inc)) return bad(`${p}.increment`);
    if (inc.type === 'FIXED' && typeof inc.rupees === 'number' && Number.isFinite(inc.rupees) && inc.rupees >= 0 && inc.rupees <= 1e7) {
      increment = { type: 'FIXED', rupees: inc.rupees };
    } else if (inc.type === 'PERCENT' && typeof inc.pct === 'number' && Number.isFinite(inc.pct) && inc.pct >= 0 && inc.pct <= 1000) {
      increment = { type: 'PERCENT', pct: inc.pct };
    } else bad(`${p}.increment`);
  }
  return { my_household_id: optUuid(raw, 'myHouseholdId', p), increment, updated_at: iso(raw, 'updatedAt', p, ISO_MS) };
}

export function validatePush(body: unknown): { batch: PushBatch; rejected: Rejection[] } {
  if (!isObj(body)) return bad('body');
  const ls = list(body, 'ledgers');
  const hs = list(body, 'households');
  const evs = list(body, 'events');
  const ens = list(body, 'entries');
  if (ls.length + hs.length + evs.length + ens.length > MAX_BATCH) throw new ApiError(400, 'batch_too_large', { max: MAX_BATCH });

  const rejected: Rejection[] = [];
  function rows<T>(table: Exclude<RejectTable, 'profile'>, raws: unknown[], one: (raw: unknown, p: string) => T): T[] {
    const out: T[] = [];
    raws.forEach((raw, index) => {
      try {
        out.push(one(raw, `${table}[${index}]`));
      } catch (e) {
        rejected.push({ table, id: rawId(raw), index, reason: reasonOf(e) });
      }
    });
    return out;
  }

  const ledgers = rows('ledgers', ls, validateLedger);
  const households = rows('households', hs, validateHousehold);
  const events = rows('events', evs, validateEvent);
  const allEntries = rows('entries', ens, validateEntry);
  const seen = new Set<string>();
  const entries = allEntries.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true))); // immutable: first copy wins

  let profile: ProfileRow | null = null;
  if (body.profile !== undefined && body.profile !== null) {
    try {
      profile = validateProfile(body.profile);
    } catch (e) {
      rejected.push({ table: 'profile', id: null, index: 0, reason: reasonOf(e) });
    }
  }
  return { batch: { ledgers: dedupeLww(ledgers), households: dedupeLww(households), events: dedupeLww(events), entries, profile }, rejected };
}

export function parsePull(q: { since?: string; limit?: string }): { since: number; limit: number } {
  const since = q.since === undefined ? 0 : Number(q.since);
  const limit = q.limit === undefined ? MAX_BATCH : Number(q.limit);
  if (!Number.isInteger(since) || since < 0 || since > Number.MAX_SAFE_INTEGER) bad('since');
  if (!Number.isInteger(limit) || limit < 1) bad('limit');
  return { since, limit: Math.min(limit, MAX_BATCH) };
}
