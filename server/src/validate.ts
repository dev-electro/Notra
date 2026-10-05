/** Tiny hand-written validators for the sync payload. They normalise to snake_case rows ready for SQL. */
import { ApiError } from './errors';

export const MAX_BATCH = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/; // updated_at: fixed width so text order == time order
const ISO_ANY = /^\d{4}-\d{2}-\d{2}T[\d:.]{5,16}Z$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const bad = (path: string): never => {
  throw new ApiError(400, 'invalid_payload', { field: path });
};
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function str(o: Obj, k: string, path: string, max = 200): string {
  const v = o[k];
  if (typeof v !== 'string' || v.length > max) return bad(`${path}.${k}`);
  return v;
}
function optStr(o: Obj, k: string, path: string, max = 500): string | null {
  const v = o[k];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || v.length > max) return bad(`${path}.${k}`);
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

export interface HouseholdRow {
  id: string; head_name: string; father_name: string; jati: string; atak: string; village: string; fala: string;
  phone: string | null; created_at: string; updated_at: string;
}
export interface EventRow {
  id: string; host_household_id: string; occasion: string; date: string; panch_approved: boolean; invitation_type: string;
  status: string; created_at: string; updated_at: string;
}
export interface EntryRow {
  id: string; event_id: string | null; other_household_id: string; direction: string; cash_paise: number;
  in_kind_item: string | null; in_kind_value_paise: number; payment_mode: string; recorded_by: string;
  created_at: string; corrects_entry_id: string | null; is_void: boolean;
}
export interface PushBatch {
  households: HouseholdRow[];
  events: EventRow[];
  entries: EntryRow[];
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

export function validatePush(body: unknown): PushBatch {
  if (!isObj(body)) return bad('body');
  const hs = list(body, 'households');
  const evs = list(body, 'events');
  const ens = list(body, 'entries');
  if (hs.length + evs.length + ens.length > MAX_BATCH) throw new ApiError(400, 'batch_too_large', { max: MAX_BATCH });

  const households = hs.map((raw, i): HouseholdRow => {
    const p = `households[${i}]`;
    if (!isObj(raw)) return bad(p);
    return {
      id: uuid(raw, 'id', p), head_name: str(raw, 'headName', p), father_name: str(raw, 'fatherName', p),
      jati: str(raw, 'jati', p), atak: str(raw, 'atak', p), village: str(raw, 'village', p), fala: str(raw, 'fala', p),
      phone: optStr(raw, 'phone', p, 32), created_at: iso(raw, 'createdAt', p, ISO_ANY), updated_at: iso(raw, 'updatedAt', p, ISO_MS),
    };
  });
  const events = evs.map((raw, i): EventRow => {
    const p = `events[${i}]`;
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
      created_at: iso(raw, 'createdAt', p, ISO_ANY), updated_at: iso(raw, 'updatedAt', p, ISO_MS),
    };
  });
  const seen = new Set<string>();
  const entries: EntryRow[] = [];
  ens.forEach((raw, i) => {
    const p = `entries[${i}]`;
    if (!isObj(raw)) return bad(p);
    const id = uuid(raw, 'id', p);
    if (seen.has(id)) return; // immutable: first copy wins
    seen.add(id);
    const isVoid = raw.isVoid === undefined ? false : raw.isVoid;
    if (typeof isVoid !== 'boolean') return bad(`${p}.isVoid`);
    const row: EntryRow = {
      id, event_id: optUuid(raw, 'eventId', p), other_household_id: uuid(raw, 'otherHouseholdId', p),
      direction: oneOf(raw, 'direction', p, ['AAYA', 'GAYA']), cash_paise: paise(raw, 'cashPaise', p),
      in_kind_item: optStr(raw, 'inKindItem', p, 500), in_kind_value_paise: paise(raw, 'inKindValuePaise', p),
      payment_mode: oneOf(raw, 'paymentMode', p, ['CASH', 'UPI']), recorded_by: str(raw, 'recordedBy', p),
      created_at: iso(raw, 'createdAt', p, ISO_ANY), corrects_entry_id: optUuid(raw, 'correctsEntryId', p), is_void: isVoid,
    };
    if (isVoid && (!row.corrects_entry_id || row.cash_paise !== 0 || row.in_kind_value_paise !== 0)) bad(`${p}.isVoid`);
    entries.push(row);
  });
  return { households: dedupeLww(households), events: dedupeLww(events), entries };
}

export function parsePull(q: { since?: string; limit?: string }): { since: number; limit: number } {
  const since = q.since === undefined ? 0 : Number(q.since);
  const limit = q.limit === undefined ? MAX_BATCH : Number(q.limit);
  if (!Number.isInteger(since) || since < 0 || since > Number.MAX_SAFE_INTEGER) bad('since');
  if (!Number.isInteger(limit) || limit < 1) bad('limit');
  return { since, limit: Math.min(limit, MAX_BATCH) };
}
