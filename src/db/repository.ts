import {
  Entry,
  EventStatus,
  Household,
  Increment,
  DEFAULT_INCREMENT,
  NotraEvent,
  newId,
} from '../core';
import type { Db } from './types';

const nowIso = () => new Date().toISOString();

// ---------- row mappers ----------
type HouseholdRow = {
  id: string; head_name: string; father_name: string; jati: string; atak: string; village: string;
  fala: string; phone: string | null; photo_uri: string | null; created_at: string; updated_at: string;
};
const toHousehold = (r: HouseholdRow): Household => ({
  id: r.id, headName: r.head_name, fatherName: r.father_name, jati: r.jati, atak: r.atak,
  village: r.village, fala: r.fala, phone: r.phone ?? undefined, photoUri: r.photo_uri ?? undefined,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

type EventRow = {
  id: string; host_household_id: string; occasion: NotraEvent['occasion']; date: string;
  panch_approved: number; invitation_type: NotraEvent['invitationType']; lekhak_name: string | null;
  status: EventStatus; created_at: string; updated_at: string;
};
const toEvent = (r: EventRow): NotraEvent => ({
  id: r.id, hostHouseholdId: r.host_household_id, occasion: r.occasion, date: r.date,
  panchApproved: r.panch_approved === 1, invitationType: r.invitation_type,
  lekhakName: r.lekhak_name ?? undefined, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
});

type EntryRow = {
  id: string; event_id: string | null; other_household_id: string; direction: Entry['direction'];
  cash_paise: number; in_kind_item: string | null; in_kind_value_paise: number;
  payment_mode: Entry['paymentMode']; recorded_by: string; voice_note_uri: string | null;
  created_at: string; corrects_entry_id: string | null;
};
const toEntry = (r: EntryRow): Entry => ({
  id: r.id, eventId: r.event_id ?? undefined, otherHouseholdId: r.other_household_id,
  direction: r.direction, cashPaise: r.cash_paise, inKindItem: r.in_kind_item ?? undefined,
  inKindValuePaise: r.in_kind_value_paise, paymentMode: r.payment_mode, recordedBy: r.recorded_by,
  voiceNoteUri: r.voice_note_uri ?? undefined, createdAt: r.created_at,
  correctsEntryId: r.corrects_entry_id ?? undefined,
});

// ---------- households ----------
export async function createHousehold(db: Db, input: Omit<Household, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Household> {
  const now = nowIso();
  const h: Household = { ...input, id: input.id ?? newId(), createdAt: now, updatedAt: now };
  await db.runAsync(
    `INSERT INTO households (id, head_name, father_name, jati, atak, village, fala, phone, photo_uri, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [h.id, h.headName, h.fatherName, h.jati, h.atak, h.village, h.fala, h.phone ?? null, h.photoUri ?? null, now, now],
  );
  return h;
}

export async function updateHousehold(db: Db, h: Household): Promise<void> {
  await db.runAsync(
    `UPDATE households SET head_name=?, father_name=?, jati=?, atak=?, village=?, fala=?, phone=?, photo_uri=?, updated_at=? WHERE id=?`,
    [h.headName, h.fatherName, h.jati, h.atak, h.village, h.fala, h.phone ?? null, h.photoUri ?? null, nowIso(), h.id],
  );
}

export async function getHousehold(db: Db, id: string): Promise<Household | null> {
  const r = await db.getFirstAsync<HouseholdRow>('SELECT * FROM households WHERE id = ?', [id]);
  return r ? toHousehold(r) : null;
}

export async function listHouseholds(db: Db): Promise<Household[]> {
  return (await db.getAllAsync<HouseholdRow>('SELECT * FROM households ORDER BY head_name COLLATE NOCASE', [])).map(toHousehold);
}

// ---------- events ----------
export async function createEvent(db: Db, input: Omit<NotraEvent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<NotraEvent> {
  const now = nowIso();
  const e: NotraEvent = { ...input, id: input.id ?? newId(), createdAt: now, updatedAt: now };
  await db.runAsync(
    `INSERT INTO events (id, host_household_id, occasion, date, panch_approved, invitation_type, lekhak_name, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [e.id, e.hostHouseholdId, e.occasion, e.date, e.panchApproved ? 1 : 0, e.invitationType, e.lekhakName ?? null, e.status, now, now],
  );
  return e;
}

export async function setEventStatus(db: Db, id: string, status: EventStatus): Promise<void> {
  await db.runAsync('UPDATE events SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), id]);
}

export async function listEvents(db: Db): Promise<NotraEvent[]> {
  return (await db.getAllAsync<EventRow>('SELECT * FROM events ORDER BY date DESC', [])).map(toEvent);
}

// ---------- entries (append-only) ----------
export async function addEntry(db: Db, input: Omit<Entry, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): Promise<Entry> {
  const e: Entry = { ...input, id: input.id ?? newId(), createdAt: input.createdAt ?? nowIso() };
  await db.runAsync(
    `INSERT INTO entries (id, event_id, other_household_id, direction, cash_paise, in_kind_item, in_kind_value_paise,
       payment_mode, recorded_by, voice_note_uri, created_at, corrects_entry_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [e.id, e.eventId ?? null, e.otherHouseholdId, e.direction, e.cashPaise, e.inKindItem ?? null, e.inKindValuePaise,
      e.paymentMode, e.recordedBy, e.voiceNoteUri ?? null, e.createdAt, e.correctsEntryId ?? null],
  );
  return e;
}

/** Correct an entry by inserting a new one that points at it. The old row is never touched. */
export async function correctEntry(
  db: Db,
  original: Entry,
  changes: Partial<Omit<Entry, 'id' | 'correctsEntryId'>>,
): Promise<Entry> {
  const { id, createdAt: _original, ...rest } = original;
  void _original;
  return addEntry(db, { ...rest, ...changes, correctsEntryId: id });
}

/** All rows including superseded ones (pass to core functions, which filter). */
export async function listEntries(db: Db): Promise<Entry[]> {
  return (await db.getAllAsync<EntryRow>('SELECT * FROM entries ORDER BY created_at, rowid', [])).map(toEntry);
}

export async function listEntriesForHousehold(db: Db, householdId: string): Promise<Entry[]> {
  return (
    await db.getAllAsync<EntryRow>('SELECT * FROM entries WHERE other_household_id = ? ORDER BY created_at, rowid', [householdId])
  ).map(toEntry);
}

export async function listEntriesForEvent(db: Db, eventId: string): Promise<Entry[]> {
  return (await db.getAllAsync<EntryRow>('SELECT * FROM entries WHERE event_id = ? ORDER BY created_at, rowid', [eventId])).map(toEntry);
}

// ---------- settings ----------
export async function getSetting(db: Db, key: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return r?.value ?? null;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at',
    [key, value, nowIso()],
  );
}

const INCREMENT_KEY = 'village_increment';

export async function getIncrement(db: Db): Promise<Increment> {
  const raw = await getSetting(db, INCREMENT_KEY);
  if (!raw) return DEFAULT_INCREMENT;
  try {
    const v = JSON.parse(raw) as Increment;
    if ((v.type === 'FIXED' && Number.isFinite(v.rupees)) || (v.type === 'PERCENT' && Number.isFinite(v.pct))) return v;
  } catch {
    /* fall through */
  }
  return DEFAULT_INCREMENT;
}

export async function setIncrement(db: Db, inc: Increment): Promise<void> {
  await setSetting(db, INCREMENT_KEY, JSON.stringify(inc));
}
