import { applyProfile, getLocalProfile } from '../sync/profile';
import {
  entryToWire, eventToWire, householdToWire, ledgerToWire, isoMs,
  type EntryRow, type EventRow, type HouseholdRow, type LedgerRow,
  type WireEntry, type WireEvent, type WireHousehold, type WireLedger, type WireProfile,
} from '../sync/wire';
import type { Db } from '../db/types';
import { BackupError } from './crypto';

/**
 * What goes into a backup file: the chosen ledgers (with their events and entries), the shared family directory and the
 * profile. Never PINs or hashes, photos or voice notes (they are local files). Same shapes as the cloud wire format.
 */
export interface Snapshot {
  app: 'notra-diary';
  version: 1;
  exportedAt: string;
  ledgers: WireLedger[];
  households: WireHousehold[];
  events: WireEvent[];
  entries: WireEntry[];
  profile: WireProfile | null;
}

const marks = (n: number) => Array.from({ length: n }, () => '?').join(',');

export async function buildSnapshot(db: Db, ledgerIds: readonly string[], now: Date = new Date()): Promise<Snapshot> {
  const ids = [...ledgerIds];
  const ledgers = ids.length
    ? await db.getAllAsync<LedgerRow>(`SELECT id, name, kind, created_at, updated_at FROM ledgers WHERE id IN (${marks(ids.length)}) ORDER BY created_at, rowid`, ids)
    : [];
  const events = ids.length
    ? await db.getAllAsync<EventRow>(
        `SELECT id, host_household_id, occasion, date, panch_approved, invitation_type, status, ledger_id, created_at, updated_at
         FROM events WHERE ledger_id IN (${marks(ids.length)}) ORDER BY created_at, rowid`, ids)
    : [];
  const entries = ids.length
    ? await db.getAllAsync<EntryRow>(
        `SELECT id, event_id, other_household_id, direction, cash_paise, in_kind_item, in_kind_value_paise, payment_mode,
                recorded_by, created_at, corrects_entry_id, is_void, ledger_id
         FROM entries WHERE ledger_id IN (${marks(ids.length)}) ORDER BY created_at, rowid`, ids)
    : [];
  const households = await db.getAllAsync<HouseholdRow>(
    'SELECT id, head_name, father_name, jati, atak, village, fala, phone, created_at, updated_at FROM households ORDER BY created_at, rowid', []);
  return {
    app: 'notra-diary', version: 1, exportedAt: now.toISOString(),
    ledgers: ledgers.map(ledgerToWire), households: households.map(householdToWire),
    events: events.map(eventToWire), entries: entries.map(entryToWire),
    profile: await getLocalProfile(db),
  };
}

// ---------- validation of a decrypted file ----------
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]{5,16}Z$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const txt = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max && !v.includes('\u0000');
const optTxt = (v: unknown, max = 500) => v === null || v === undefined || txt(v, max);
const idv = (v: unknown): v is string => typeof v === 'string' && ID.test(v);
const optId = (v: unknown) => v === null || v === undefined || idv(v);
const paise = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1e12;
const iso = (v: unknown): v is string => typeof v === 'string' && ISO.test(v);
const oneOf = (v: unknown, a: readonly string[]) => typeof v === 'string' && a.includes(v);

function okLedger(r: Obj): boolean {
  return idv(r.id) && txt(r.name, 100) && (r.name as string).trim() !== '' && oneOf(r.kind, ['HOUSEHOLD', 'PERSONAL']) && iso(r.createdAt) && iso(r.updatedAt);
}
function okHousehold(r: Obj): boolean {
  return idv(r.id) && ['headName', 'fatherName', 'jati', 'atak', 'village', 'fala'].every((k) => txt(r[k], 200)) && optTxt(r.phone, 32) && iso(r.createdAt) && iso(r.updatedAt);
}
function okEvent(r: Obj): boolean {
  return idv(r.id) && idv(r.hostHouseholdId) && oneOf(r.occasion, ['SHAADI', 'BIMARI', 'MAKAAN', 'OTHER']) && typeof r.date === 'string' && DAY.test(r.date)
    && typeof r.panchApproved === 'boolean' && oneOf(r.invitationType, ['YELLOW_RICE', 'KUMKUM', 'CARD']) && oneOf(r.status, ['PLANNED', 'HELD', 'SETTLED'])
    && idv(r.ledgerId) && iso(r.createdAt) && iso(r.updatedAt);
}
function okEntry(r: Obj): boolean {
  const isVoid = r.isVoid === true;
  return idv(r.id) && optId(r.eventId) && idv(r.otherHouseholdId) && oneOf(r.direction, ['AAYA', 'GAYA']) && paise(r.cashPaise) && optTxt(r.inKindItem)
    && paise(r.inKindValuePaise) && oneOf(r.paymentMode, ['CASH', 'UPI']) && txt(r.recordedBy, 200) && iso(r.createdAt) && optId(r.correctsEntryId)
    && idv(r.ledgerId) && (r.isVoid === undefined || typeof r.isVoid === 'boolean')
    && (!isVoid || (!!r.correctsEntryId && r.cashPaise === 0 && r.inKindValuePaise === 0));
}
function okProfile(p: unknown): p is WireProfile {
  if (!isObj(p) || !iso(p.updatedAt) || !optId(p.myHouseholdId)) return false;
  const inc = p.increment;
  return inc === null || inc === undefined || (isObj(inc) && ((inc.type === 'FIXED' && Number.isFinite(inc.rupees)) || (inc.type === 'PERCENT' && Number.isFinite(inc.pct))));
}

export interface ParsedSnapshot {
  snapshot: Snapshot;
  /** Rows dropped because they were malformed. */
  invalid: number;
}

/** Parse + validate decrypted text. Malformed rows are dropped and counted; a malformed file as a whole throws. */
export function parseSnapshot(text: string): ParsedSnapshot {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    throw new BackupError('invalid_data');
  }
  if (!isObj(j) || j.app !== 'notra-diary' || j.version !== 1 || typeof j.exportedAt !== 'string') throw new BackupError('invalid_data');
  const list = (k: string): Obj[] => {
    const v = j[k];
    if (v === undefined) return [];
    if (!Array.isArray(v)) throw new BackupError('invalid_data');
    return v.filter(isObj);
  };
  let invalid = 0;
  const keep = <T,>(rows: Obj[], ok: (r: Obj) => boolean): T[] => {
    const good = rows.filter(ok);
    invalid += rows.length - good.length;
    return good as unknown as T[];
  };
  const snapshot: Snapshot = {
    app: 'notra-diary', version: 1, exportedAt: j.exportedAt,
    ledgers: keep<WireLedger>(list('ledgers'), okLedger),
    households: keep<WireHousehold>(list('households'), okHousehold),
    events: keep<WireEvent>(list('events'), okEvent),
    entries: keep<WireEntry>(list('entries'), okEntry),
    profile: okProfile(j.profile) ? { myHouseholdId: j.profile.myHouseholdId ?? null, increment: j.profile.increment ?? null, updatedAt: isoMs(j.profile.updatedAt) } : null,
  };
  return { snapshot, invalid };
}

// ---------- merge ----------
export interface Count {
  added: number;
  updated: number;
  /** already on the phone (entries) or the phone's copy is newer (others) */
  same: number;
}
export interface MergeReport {
  ledgers: Count;
  households: Count;
  events: Count;
  entries: Count;
  /** rows dropped: malformed, or pointing at a family/ledger that is nowhere to be found */
  skipped: number;
  profileApplied: boolean;
}

const none = (): Count => ({ added: 0, updated: 0, same: 0 });

/**
 * Merge a backup into this phone, in one transaction. Entries are insert-or-ignore (immutable, so restoring twice or onto
 * a phone that already has them changes nothing); ledgers, families and events are last-write-wins by updated_at. Everything
 * added or changed is marked dirty so cloud backup (if on) picks it up. PINs are never touched.
 */
export async function mergeSnapshot(db: Db, parsed: ParsedSnapshot): Promise<MergeReport> {
  const s = parsed.snapshot;
  const rep: MergeReport = { ledgers: none(), households: none(), events: none(), entries: none(), skipped: parsed.invalid, profileApplied: false };
  const exists = async (table: string, id: string) => (await db.getFirstAsync<{ n: number }>(`SELECT 1 AS n FROM ${table} WHERE id = ?`, [id])) !== null;
  /** added / updated (incoming is newer, so it wins) / same (the phone's copy is as new or newer). */
  const kind = async (table: string, id: string, incoming: string): Promise<'added' | 'updated' | 'same'> => {
    const prev = await db.getFirstAsync<{ updated_at: string }>(`SELECT updated_at FROM ${table} WHERE id = ?`, [id]);
    return !prev ? 'added' : incoming > prev.updated_at ? 'updated' : 'same';
  };
  const localIds = async (table: string) => new Set((await db.getAllAsync<{ id: string }>(`SELECT id FROM ${table}`, [])).map((r) => r.id));

  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.withTransactionAsync(async () => {
      const ledgerIds = await localIds('ledgers');
      const householdIds = await localIds('households');
      for (const l of s.ledgers) {
        rep.ledgers[await kind('ledgers', l.id, l.updatedAt)]++;
        await db.runAsync(
          `INSERT INTO ledgers (id, name, kind, created_at, updated_at, dirty) VALUES (?,?,?,?,?,1)
           ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at, dirty=1
           WHERE excluded.updated_at > ledgers.updated_at`,
          [l.id, l.name, l.kind, l.createdAt, l.updatedAt],
        );
        ledgerIds.add(l.id);
      }
      for (const h of s.households) {
        rep.households[await kind('households', h.id, h.updatedAt)]++;
        await db.runAsync(
          `INSERT INTO households (id, head_name, father_name, jati, atak, village, fala, phone, created_at, updated_at, dirty)
           VALUES (?,?,?,?,?,?,?,?,?,?,1)
           ON CONFLICT(id) DO UPDATE SET head_name=excluded.head_name, father_name=excluded.father_name, jati=excluded.jati,
             atak=excluded.atak, village=excluded.village, fala=excluded.fala, phone=excluded.phone,
             updated_at=excluded.updated_at, dirty=1, sync_error=NULL
           WHERE excluded.updated_at > households.updated_at`,
          [h.id, h.headName, h.fatherName, h.jati, h.atak, h.village, h.fala, h.phone, h.createdAt, h.updatedAt],
        );
        householdIds.add(h.id);
      }
      for (const e of s.events) {
        if (!ledgerIds.has(e.ledgerId) || !householdIds.has(e.hostHouseholdId)) {
          rep.skipped++;
          continue;
        }
        rep.events[await kind('events', e.id, e.updatedAt)]++;
        await db.runAsync(
          `INSERT INTO events (id, host_household_id, occasion, date, panch_approved, invitation_type, status, ledger_id, created_at, updated_at, dirty)
           VALUES (?,?,?,?,?,?,?,?,?,?,1)
           ON CONFLICT(id) DO UPDATE SET host_household_id=excluded.host_household_id, occasion=excluded.occasion, date=excluded.date,
             panch_approved=excluded.panch_approved, invitation_type=excluded.invitation_type, status=excluded.status,
             updated_at=excluded.updated_at, dirty=1, sync_error=NULL
           WHERE excluded.updated_at > events.updated_at`,
          [e.id, e.hostHouseholdId, e.occasion, e.date, e.panchApproved ? 1 : 0, e.invitationType, e.status, e.ledgerId, e.createdAt, e.updatedAt],
        );
      }
      for (const e of s.entries) {
        if (!ledgerIds.has(e.ledgerId) || !householdIds.has(e.otherHouseholdId)) {
          rep.skipped++;
          continue;
        }
        if (await exists('entries', e.id)) {
          rep.entries.same++;
          continue;
        }
        await db.runAsync(
          `INSERT INTO entries (id, event_id, other_household_id, direction, cash_paise, in_kind_item, in_kind_value_paise,
             payment_mode, recorded_by, created_at, corrects_entry_id, is_void, ledger_id, dirty)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
          [e.id, e.eventId, e.otherHouseholdId, e.direction, e.cashPaise, e.inKindItem, e.inKindValuePaise, e.paymentMode,
            e.recordedBy, e.createdAt, e.correctsEntryId, e.isVoid ? 1 : 0, e.ledgerId],
        );
        rep.entries.added++;
      }
      if (s.profile) rep.profileApplied = await applyProfile(db, s.profile);
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
  return rep;
}

/** Short Hindi summary of a merge, for the result screen. */
export function describeMerge(r: MergeReport): string {
  const lines = [
    `नई एंट्री जुड़ीं: ${r.entries.added}`,
    `पहले से फ़ोन में थीं: ${r.entries.same}`,
    `परिवार: ${r.households.added} नए, ${r.households.updated} अपडेट`,
    `कार्यक्रम: ${r.events.added} नए, ${r.events.updated} अपडेट`,
  ];
  if (r.ledgers.added) lines.push(`नए खाते: ${r.ledgers.added}`);
  if (r.skipped) lines.push(`छोड़ी गईं (सही नहीं थीं): ${r.skipped}`);
  return lines.join('\n');
}
