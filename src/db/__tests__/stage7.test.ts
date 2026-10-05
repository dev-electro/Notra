/** Stage 7 on the real migrations + repository + SQL (node:sqlite): v7 upgrade, the event/direction rule, उतार/चढ़ाव, search, reports. */
import {
  DEFAULT_LEDGER_ID as L, givenDoc, guestsDoc, householdLedgerDoc, legacyEventId, matchesSearch, settleEntries, sumUtarChadhav, yearDoc,
  type Entry,
} from '../../core';
import { MIGRATIONS, migrate } from '../migrations';
import { memDb } from '../mem-db.testutil';
import {
  listEntriesPage, searchHouseholds, sqlEntrySettlement, sqlEventCards,
} from '../queries';
import {
  sqlGivenRows, sqlGivenTotals, sqlGuestRows, sqlGuestTotals, sqlHouseholdLedger, sqlNotCome, sqlOccasionRange, sqlPersonRange,
  sqlYearSummary,
} from '../reports';
import {
  addEntry, correctEntry, createEvent, createHousehold, findOrCreateEvent, getEvent, listEntries, listEvents, recentOccasionLabels,
  setMyHouseholdId, updateEventDetails, voidEntry,
} from '../repository';
import { beginApplying, endApplying } from '../legacy';
import type { Db } from '../types';

const hh = (n: string, extra: Partial<{ fatherName: string; village: string; fala: string; panchayat: string; phone: string }> = {}) => ({
  headName: n, fatherName: 'कालू', jati: 'भील', atak: 'डामोर', village: 'सरवन', fala: 'ऊपला', ...extra,
});
const base = { inKindValuePaise: 0, paymentMode: 'CASH' as const, recordedBy: 'me' };
const rs = (p: number) => p * 100;
const ev = (host: string, date: string, occasion: 'SHAADI' | 'MUNDAN' | 'OTHER' | 'GRIHAPRAVESH' | 'BIMARI' = 'SHAADI', ledgerId?: string) =>
  ({ hostHouseholdId: host, occasion, date, panchApproved: false, invitationType: 'CARD' as const, status: 'HELD' as const, ledgerId });

let t = 0;
const at = () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++)).toISOString();

/** me + two families who each hold programs; I hold programs too. */
async function world() {
  const db = memDb();
  await migrate(db);
  const me = await createHousehold(db, hh('मैं'));
  await setMyHouseholdId(db, me.id);
  const a = await createHousehold(db, hh('रमेश', { village: 'खेरवाड़ा', phone: '+91 98765 43210' }));
  const b = await createHousehold(db, hh('सुरेश', { fatherName: 'गोपाल', panchayat: 'नीचला' }));
  const c = await createHousehold(db, hh('Mohan', { phone: '09123456789' }));
  return { db, me, a, b, c };
}

describe('v7 migration on an old (v6) database', () => {
  async function v6() {
    const db = memDb();
    await db.execAsync('PRAGMA foreign_keys = ON;');
    for (let i = 0; i < 6; i++) await db.execAsync(MIGRATIONS[i]!);
    await db.execAsync('PRAGMA user_version = 6;');
    return db;
  }
  const N = (s: string) => `2026-01-01T00:00:${s}.000Z`;

  it('keeps every row, adds occurred_on, and attaches event-less entries to a "पुराना हिसाब" event per direction', async () => {
    const db = await v6();
    const ins = (id: string, name: string) => db.runAsync(
      `INSERT INTO households (id, head_name, father_name, jati, atak, village, fala, created_at, updated_at) VALUES (?, ?, 'f', 'j', 'a', 'v', 'fa', 'n', 'n')`, [id, name]);
    const me = '11111111-1111-4111-8111-111111111111';
    const ra = '22222222-2222-4222-8222-222222222222';
    const sb = '33333333-3333-4333-8333-333333333333';
    await ins(me, 'मैं'); await ins(ra, 'रमेश'); await ins(sb, 'सुरेश');
    await db.runAsync("INSERT INTO settings (key, value, updated_at) VALUES ('my_household_id', ?, 'n')", [me]);
    await db.runAsync(`INSERT INTO events (id, host_household_id, occasion, date, panch_approved, invitation_type, status, created_at, updated_at, ledger_id)
      VALUES ('44444444-4444-4444-8444-444444444444', ?, 'SHAADI', '2026-02-01', 1, 'KUMKUM', 'HELD', 'n', 'n', ?)`, [me, L]);
    const entry = (id: string, h: string, dir: string, cash: number, ev: string | null, at: string) => db.runAsync(
      `INSERT INTO entries (id, event_id, other_household_id, direction, cash_paise, in_kind_value_paise, payment_mode, recorded_by, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 'CASH', 'me', ?)`, [id, ev, h, dir, cash, at]);
    await entry('e1', ra, 'AAYA', 50100, null, N('01'));
    await entry('e2', sb, 'AAYA', 25100, null, N('02'));
    await entry('e3', ra, 'GAYA', 10100, null, N('03'));
    await entry('e4', sb, 'GAYA', 20100, null, '2025-12-31T00:00:00.000Z');
    await entry('e5', ra, 'AAYA', 70100, '44444444-4444-4444-8444-444444444444', N('05'));
    expect(await migrate(db)).toBe(MIGRATIONS.length);

    const rows = await db.getAllAsync<{ id: string; event_id: string; occurred_on: string }>('SELECT id, event_id, occurred_on FROM entries ORDER BY id', []);
    expect(rows.map((r) => r.occurred_on)).toEqual(['2026-01-01', '2026-01-01', '2026-01-01', '2025-12-31', '2026-01-01']);
    expect(rows.every((r) => !!r.event_id)).toBe(true);
    const mineId = legacyEventId('AAYA', L, ra);
    expect(rows.find((r) => r.id === 'e1')!.event_id).toBe(mineId);
    expect(rows.find((r) => r.id === 'e2')!.event_id).toBe(mineId); // one "mine" event per ledger
    expect(rows.find((r) => r.id === 'e3')!.event_id).toBe(legacyEventId('GAYA', L, ra));
    expect(rows.find((r) => r.id === 'e4')!.event_id).toBe(legacyEventId('GAYA', L, sb));
    expect(rows.find((r) => r.id === 'e5')!.event_id).toBe('44444444-4444-4444-8444-444444444444'); // untouched
    const evs = await db.getAllAsync<{ id: string; host_household_id: string; occasion: string; date: string }>('SELECT id, host_household_id, occasion, date FROM events ORDER BY id', []);
    expect(evs).toHaveLength(4);
    expect(evs.find((e) => e.id === mineId)).toMatchObject({ host_household_id: me, occasion: 'OTHER', date: '2026-01-01' });
    expect(evs.find((e) => e.id === legacyEventId('GAYA', L, sb))).toMatchObject({ host_household_id: sb, date: '2025-12-31' });
    // the old event survived the table rebuild, and the migrated data reads right through the new views
    expect(await db.getFirstAsync('SELECT occasion FROM events WHERE id = ?', ['44444444-4444-4444-8444-444444444444'])).toEqual({ occasion: 'SHAADI' });
    const s = await db.getAllAsync<{ id: string; utar: number; chadhav: number }>('SELECT id, utar, chadhav FROM entry_settlement ORDER BY id', []);
    expect(s.find((x) => x.id === 'e3')).toMatchObject({ utar: 10100, chadhav: 0 });
    // immutability is back (and now covers occurred_on); old rows can still be voided
    await expect(db.runAsync("UPDATE entries SET occurred_on = '2020-01-01' WHERE id = 'e1'", [])).rejects.toThrow(/immutable/);
    await expect(db.runAsync("UPDATE entries SET event_id = NULL WHERE id = 'e1'", [])).rejects.toThrow(/immutable/);
    await expect(db.runAsync("DELETE FROM entries WHERE id = 'e1'", [])).rejects.toThrow(/append-only/);
  });

  it('adds the two new occasions and the custom label columns; still refuses a death-feast occasion', async () => {
    const db = await v6();
    await migrate(db);
    const h = '22222222-2222-4222-8222-222222222222';
    await db.runAsync(`INSERT INTO households (id, head_name, father_name, jati, atak, village, fala, created_at, updated_at) VALUES (?, 'a','f','j','a','v','fa','n','n')`, [h]);
    const put = (id: string, o: string) => db.runAsync(
      `INSERT INTO events (id, host_household_id, occasion, date, invitation_type, status, created_at, updated_at, occasion_label, occasion_note) VALUES (?, ?, ?, '2026-01-01', 'CARD', 'PLANNED', 'n', 'n', 'नामकरण', 'विवरण')`, [id, h, o]);
    await put('g', 'GRIHAPRAVESH');
    await put('m', 'MUNDAN');
    await expect(put('x', 'MRITYU_BHOJ')).rejects.toThrow();
    expect(await db.getFirstAsync('SELECT occasion_label AS l, occasion_note AS n FROM events WHERE id = ?', ['m'])).toEqual({ l: 'नामकरण', n: 'विवरण' });
  });

  it('works on an empty old database (nothing to attach) and is idempotent', async () => {
    const db = await v6();
    expect(await migrate(db)).toBe(MIGRATIONS.length);
    expect(await migrate(db)).toBe(MIGRATIONS.length);
    expect(await db.getFirstAsync('SELECT COUNT(*) AS n FROM events', [])).toEqual({ n: 0 });
  });
});

describe('every entry belongs to an event, and the host decides the direction', () => {
  it('repository: an event is required, my event takes only AAYA, another family event only GAYA', async () => {
    const { db, me, a } = await world();
    const mine = await createEvent(db, ev(me.id, '2026-03-10'));
    const theirs = await createEvent(db, ev(a.id, '2026-03-12'));
    const e = { ...base, otherHouseholdId: a.id, cashPaise: 50100 };
    await expect(addEntry(db, { ...e, direction: 'AAYA' })).rejects.toThrow(/NO_EVENT/);
    await expect(addEntry(db, { ...e, direction: 'AAYA', eventId: 'nope' })).rejects.toThrow(/UNKNOWN_EVENT/);
    await expect(addEntry(db, { ...e, direction: 'GAYA', eventId: mine.id })).rejects.toThrow(/WRONG_DIRECTION/);
    await expect(addEntry(db, { ...e, direction: 'AAYA', eventId: theirs.id })).rejects.toThrow(/WRONG_DIRECTION/);
    await addEntry(db, { ...e, direction: 'AAYA', eventId: mine.id });
    await addEntry(db, { ...e, direction: 'GAYA', eventId: theirs.id });
    expect(await listEntries(db, L)).toHaveLength(2);
  });

  it('database triggers hold the same line even for raw SQL', async () => {
    const { db, me, a } = await world();
    const mine = await createEvent(db, ev(me.id, '2026-03-10'));
    const theirs = await createEvent(db, ev(a.id, '2026-03-12'));
    const raw = (event: string | null, dir: string, extra = '') => db.runAsync(
      `INSERT INTO entries (id, event_id, other_household_id, direction, cash_paise, in_kind_value_paise, payment_mode, recorded_by, created_at, occurred_on ${extra ? ', ' + extra.split('=')[0] : ''})
       VALUES (lower(hex(randomblob(8))), ?, ?, ?, 100, 0, 'CASH', 'me', '2026-01-01T00:00:00.000Z', '2026-01-01' ${extra ? ', ' + extra.split('=')[1] : ''})`, [event, a.id, dir]);
    await expect(raw(null, 'AAYA')).rejects.toThrow(/belongs to an event/);
    await expect(raw(mine.id, 'GAYA')).rejects.toThrow(/direction must follow/);
    await expect(raw(theirs.id, 'AAYA')).rejects.toThrow(/direction must follow/);
    await raw(mine.id, 'AAYA');
    await raw(theirs.id, 'GAYA');
    await expect(db.runAsync(
      `INSERT INTO entries (id, event_id, other_household_id, direction, cash_paise, in_kind_value_paise, payment_mode, recorded_by, created_at, occurred_on)
       VALUES ('x', ?, ?, 'AAYA', 1, 0, 'CASH', 'me', 'n', 'kal')`, [mine.id, a.id])).rejects.toThrow(/occurred_on/);
  });

  it('a sync or backup page may carry rows as they were written elsewhere (the trigger stands aside only then)', async () => {
    const { db, me, a } = await world();
    const mine = await createEvent(db, ev(me.id, '2026-03-10'));
    const odd = (id: string) => db.runAsync(
      `INSERT INTO entries (id, event_id, other_household_id, direction, cash_paise, in_kind_value_paise, payment_mode, recorded_by, created_at, occurred_on)
       VALUES (?, ?, ?, 'GAYA', 1, 0, 'CASH', 'me', 'n', '2026-01-01')`, [id, mine.id, a.id]);
    await expect(odd('o1')).rejects.toThrow();
    await beginApplying(db);
    await odd('o2');
    await endApplying(db);
    await expect(odd('o3')).rejects.toThrow();
  });

  it('voids and corrections that keep event and direction are always allowed, so old data can be fixed', async () => {
    const { db, me, a } = await world();
    const mine = await createEvent(db, ev(me.id, '2026-03-10'));
    const e = await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'AAYA', eventId: mine.id, cashPaise: 100 });
    const fixed = await correctEntry(db, e, { cashPaise: 200 });
    expect(fixed).toMatchObject({ eventId: mine.id, direction: 'AAYA', occurredOn: e.occurredOn });
    await voidEntry(db, fixed);
    // but a correction cannot move an entry into the other world
    const e2 = await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'AAYA', eventId: mine.id, cashPaise: 100 });
    await expect(correctEntry(db, e2, { direction: 'GAYA' })).rejects.toThrow(/WRONG_DIRECTION/);
  });

  it('with my household not known yet only the event is required', async () => {
    const db = memDb();
    await migrate(db);
    const a = await createHousehold(db, hh('रमेश'));
    const event = await createEvent(db, ev(a.id, '2026-03-10'));
    await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'AAYA', eventId: event.id, cashPaise: 1 });
  });
});

describe('diary date (occurred_on)', () => {
  it('defaults to the date part of createdAt and may be set to any past date', async () => {
    const { db, me, a } = await world();
    const mine = await createEvent(db, ev(me.id, '2019-05-17'));
    const x = await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'AAYA', eventId: mine.id, cashPaise: 100, createdAt: '2026-03-04T10:00:00.000Z' });
    const y = await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'AAYA', eventId: mine.id, cashPaise: 100, occurredOn: '2019-05-17' });
    expect(x.occurredOn).toBe('2026-03-04');
    expect(y.occurredOn).toBe('2019-05-17');
    expect((await listEntries(db, L)).map((e) => e.occurredOn)).toEqual(['2019-05-17', '2026-03-04']); // diary order
  });
});

/** The big one: SQL (page query, single-entry query, entry_settlement view) must equal the pure core. */
async function ledgerWithHistory() {
  const w = await world();
  const { db, me, a, b, c } = w;
  const myEv1 = await createEvent(db, ev(me.id, '2026-01-10'));
  const myEv2 = await createEvent(db, ev(me.id, '2026-06-10', 'MUNDAN'));
  const aEv1 = await createEvent(db, ev(a.id, '2025-12-01', 'OTHER'));
  const aEv2 = await createEvent(db, ev(a.id, '2026-09-01', 'GRIHAPRAVESH'));
  const bEv = await createEvent(db, ev(b.id, '2026-02-02'));
  const add = (h: string, direction: 'AAYA' | 'GAYA', eventId: string, cash: number, occurredOn: string, extra: Partial<Entry> = {}) =>
    addEntry(db, { ...base, otherHouseholdId: h, direction, eventId, cashPaise: rs(cash), occurredOn, createdAt: at(), ...extra });
  const x1 = await add(a.id, 'GAYA', aEv1.id, 501, '2025-12-01');
  const x2 = await add(a.id, 'AAYA', myEv1.id, 701, '2026-01-10'); // 501 उतार, 200 चढ़ाव
  const x3 = await add(a.id, 'GAYA', aEv2.id, 1001, '2026-09-01'); // typed before x4 but happened after it
  const x4 = await add(a.id, 'AAYA', myEv2.id, 251, '2026-06-10');
  const y1 = await add(b.id, 'GAYA', bEv.id, 300, '2026-02-02', { inKindItem: 'घी', inKindValuePaise: rs(200) });
  const y2 = await add(b.id, 'AAYA', myEv1.id, 1000, '2026-01-10'); // earlier than y1 by diary date
  const wrong = await add(b.id, 'AAYA', myEv2.id, 999, '2026-06-10');
  const fixed = await correctEntry(db, wrong, { cashPaise: rs(555), createdAt: at() });
  const gone = await add(c.id, 'GAYA', (await createEvent(db, ev(c.id, '2026-04-04'))).id, 777, '2026-04-04');
  await voidEntry(db, gone, at());
  return { ...w, myEv1, myEv2, aEv1, aEv2, bEv, x1, x2, x3, x4, y1, y2, wrong, fixed };
}

describe('उतार / चढ़ाव in SQL == core', () => {
  it('the worked example, and diary order beats typing order', async () => {
    const { db, x1, x2, x3, x4 } = await ledgerWithHistory();
    const all = await listEntries(db, L);
    const s = new Map(settleEntries(all).map((r) => [r.entry.id, r]));
    expect([x1, x2, x3, x4].map((e) => [s.get(e.id)!.utarPaise / 100, s.get(e.id)!.chadhavPaise / 100])).toEqual([
      [0, 501], [501, 200], [451, 550], [0, 251],
    ]);
    // x4 (June) comes before x3 (Sept): at x3 I owed 200 + 251 = 451
  });

  it('listEntriesPage, sqlEntrySettlement and the entry_settlement view all agree with core', async () => {
    const { db } = await ledgerWithHistory();
    const all = await listEntries(db, L);
    const ref = new Map(settleEntries(all).map((r) => [r.entry.id, r]));
    const page = await listEntriesPage(db, { ledgerId: L, limit: 100 });
    const active = page.filter((p) => !p.superseded);
    expect(active).toHaveLength(ref.size);
    for (const p of active) {
      expect([p.id, p.utarPaise, p.chadhavPaise]).toEqual([p.id, ref.get(p.id)!.utarPaise, ref.get(p.id)!.chadhavPaise]);
      expect(await sqlEntrySettlement(db, p.id)).toEqual({ utarPaise: ref.get(p.id)!.utarPaise, chadhavPaise: ref.get(p.id)!.chadhavPaise });
    }
    expect(page.filter((p) => p.superseded).every((p) => p.utarPaise === null && p.chadhavPaise === null)).toBe(true);
    const view = await db.getAllAsync<{ id: string; utar: number; chadhav: number }>('SELECT id, utar, chadhav FROM entry_settlement', []);
    expect(view).toHaveLength(ref.size);
    for (const v of view) expect([v.utar, v.chadhav]).toEqual([ref.get(v.id)!.utarPaise, ref.get(v.id)!.chadhavPaise]);
  });

  it('household and event pages carry the program and the same numbers', async () => {
    const { db, a, myEv1, x2 } = await ledgerWithHistory();
    const hist = await listEntriesPage(db, { ledgerId: L, householdId: a.id, limit: 10 });
    expect(hist.map((h) => h.occurredOn)).toEqual(['2026-09-01', '2026-06-10', '2026-01-10', '2025-12-01']); // newest diary date first
    expect(hist.find((h) => h.id === x2.id)).toMatchObject({ utarPaise: rs(501), chadhavPaise: rs(200), program: { occasion: 'SHAADI', date: '2026-01-10', legacy: false } });
    const atEvent = await listEntriesPage(db, { ledgerId: L, eventId: myEv1.id, activeOnly: true, limit: 10 });
    expect(atEvent.map((e) => e.direction)).toEqual(['AAYA', 'AAYA']);
  });
});

describe('search: name, father, village, panchayat and phone', () => {
  async function seedSearch() {
    const { db, a, b, c } = await world();
    const d = await createHousehold(db, hh('गीता', { fatherName: 'मोहन', village: 'Udaipur', phone: '+91 91234-56780' }));
    return { db, a, b, c, d };
  }
  const names = async (db: Db, q: string) => (await searchHouseholds(db, q, 50)).map((h) => h.headName);

  it('finds by every field, with +91 / spaces / leading 0 ignored for phones', async () => {
    const { db } = await seedSearch();
    expect(await names(db, 'रमेश')).toEqual(['रमेश']);
    expect(await names(db, 'गोपाल')).toEqual(['सुरेश']); // father
    expect(await names(db, 'खेरवाड़ा')).toEqual(['रमेश']); // village
    expect(await names(db, 'नीचला')).toEqual(['सुरेश']); // panchayat
    for (const q of ['98765', '9876543210', '+91 98765 43210', '+919876543210', '098765 43210', '987-654']) expect(await names(db, q)).toEqual(['रमेश']);
    expect(await names(db, '91234')).toEqual(['Mohan', 'गीता']); // inside 09123456789 and 91234-56780, not inside रमेश's number
    expect(await names(db, '09123456789')).toEqual(['Mohan']);
  });
  it('is case-insensitive for Latin, ANDs several words, and ranks names that start with the word first', async () => {
    const { db } = await seedSearch();
    expect(await names(db, 'mohan')).toEqual(['Mohan']); // गीता's father मोहन is Devanagari: not a match for Latin text
    expect(await names(db, 'MOHAN')).toEqual(['Mohan']);
    expect(await names(db, 'gopal')).toEqual([]);
    expect(await names(db, 'रमेश खेरवाड़ा')).toEqual(['रमेश']);
    expect(await names(db, 'रमेश सरवन')).toEqual([]); // रमेश's village is खेरवाड़ा
    expect(await names(db, 'कालू सरवन')).toEqual(['Mohan', 'मैं']); // सुरेश's father is गोपाल
    expect(await names(db, '')).toHaveLength(5);
  });
  it('pages, and equals the core matcher for many queries', async () => {
    const { db } = await seedSearch();
    const all = await searchHouseholds(db, '', 100);
    expect(await searchHouseholds(db, '', 2, 0)).toHaveLength(2);
    expect(await searchHouseholds(db, '', 2, 4)).toHaveLength(1);
    for (const q of ['', 'मो', 'mo', 'सरवन', 'ऊपला', '9', '98', '987', '+91', '+91 98765', 'a b', 'कालू ऊपला रमेश', 'udaipur', '0912']) {
      const sql = (await searchHouseholds(db, q, 100)).map((h) => h.id).sort();
      expect(sql).toEqual(all.filter((h) => matchesSearch(h, q)).map((h) => h.id).sort());
    }
  });
});

describe('programs and the custom name for "अन्य"', () => {
  it('findOrCreateEvent reuses the same host + occasion + date (+ custom name), else creates one', async () => {
    const { db, a } = await world();
    const q = { ledgerId: L, hostHouseholdId: a.id, occasion: 'SHAADI' as const, date: '2019-05-17' };
    const e1 = await findOrCreateEvent(db, q);
    expect((await findOrCreateEvent(db, q)).id).toBe(e1.id);
    expect(e1.status).toBe('HELD'); // a past date
    expect((await findOrCreateEvent(db, { ...q, occasion: 'MUNDAN' })).id).not.toBe(e1.id);
    expect((await findOrCreateEvent(db, { ...q, date: '2019-05-18' })).id).not.toBe(e1.id);
    expect((await findOrCreateEvent(db, { ...q, date: '2999-01-01' })).status).toBe('PLANNED');
    const o1 = await findOrCreateEvent(db, { ...q, occasion: 'OTHER', occasionLabel: 'नामकरण' });
    expect((await findOrCreateEvent(db, { ...q, occasion: 'OTHER', occasionLabel: ' नामकरण ' })).id).toBe(o1.id);
    expect((await findOrCreateEvent(db, { ...q, occasion: 'OTHER', occasionLabel: 'स्कूल' })).id).not.toBe(o1.id);
    expect((await findOrCreateEvent(db, { ...q, occasion: 'OTHER' })).id).not.toBe(o1.id);
  });

  it('stores the custom label/details for OTHER only, trims and clamps, and can be edited later (dirty again, updated_at moves)', async () => {
    const { db, me } = await world();
    const e = await createEvent(db, { ...ev(me.id, '2026-05-05', 'OTHER'), occasionLabel: '  स्कूल   टीचर विकास ', occasionNote: ' आठवीं पास ' });
    expect(await getEvent(db, e.id)).toMatchObject({ occasion: 'OTHER', occasionLabel: 'स्कूल टीचर विकास', occasionNote: 'आठवीं पास' });
    const std = await createEvent(db, { ...ev(me.id, '2026-05-06', 'SHAADI'), occasionLabel: 'नहीं', occasionNote: 'नहीं' });
    expect(await getEvent(db, std.id)).toMatchObject({ occasionLabel: undefined, occasionNote: undefined });
    await db.runAsync('UPDATE events SET dirty = 0 WHERE id = ?', [e.id]);
    await new Promise((r) => setTimeout(r, 3));
    await updateEventDetails(db, e.id, { occasionLabel: 'नामकरण', occasionNote: '' });
    const after = await getEvent(db, e.id);
    expect(after).toMatchObject({ occasionLabel: 'नामकरण', occasionNote: undefined });
    expect(after!.updatedAt! > e.updatedAt!).toBe(true);
    expect(await db.getFirstAsync('SELECT dirty FROM events WHERE id = ?', [e.id])).toEqual({ dirty: 1 });
    await updateEventDetails(db, e.id, { occasion: 'MUNDAN' }); // changing the kind drops the custom text
    expect(await getEvent(db, e.id)).toMatchObject({ occasion: 'MUNDAN', occasionLabel: undefined });
    await expect(updateEventDetails(db, 'missing', {})).rejects.toThrow();
  });

  it('remembers recently used custom names (newest first, no repeats)', async () => {
    const { db, me } = await world();
    expect(await recentOccasionLabels(db)).toEqual([]);
    for (const [i, l] of ['नामकरण', 'स्कूल', 'नामकरण', 'जन्मदिन'].entries()) {
      await createEvent(db, { ...ev(me.id, `2026-05-0${i + 1}`, 'OTHER'), occasionLabel: l });
      await new Promise((r) => setTimeout(r, 2));
    }
    await createEvent(db, ev(me.id, '2026-05-09', 'OTHER')); // no label: not a chip
    expect(await recentOccasionLabels(db)).toEqual(['जन्मदिन', 'नामकरण', 'स्कूल']);
    expect(await recentOccasionLabels(db, 2)).toEqual(['जन्मदिन', 'नामकरण']);
  });

  it('event cards: मेरा नोतरा lists only my events, दूसरों का नोतरा only other families\', with their totals and the custom name', async () => {
    const { db, me, a } = await world();
    const mine = await createEvent(db, { ...ev(me.id, '2026-03-10', 'OTHER'), occasionLabel: 'नामकरण' });
    const theirs = await createEvent(db, ev(a.id, '2026-04-10'));
    await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'AAYA', eventId: mine.id, cashPaise: rs(501) });
    await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'GAYA', eventId: theirs.id, cashPaise: rs(701) });
    const m = await sqlEventCards(db, L, me.id, { mine: true });
    const o = await sqlEventCards(db, L, me.id, { mine: false });
    expect(m.map((x) => x.event.id)).toEqual([mine.id]);
    expect(m[0]).toMatchObject({ receivedPaise: rs(501), givenPaise: 0, giverCount: 1, event: { occasionLabel: 'नामकरण' }, host: { headName: 'मैं' } });
    expect(o.map((x) => x.event.id)).toEqual([theirs.id]);
    expect(o[0]).toMatchObject({ givenPaise: rs(701), host: { headName: 'रमेश', village: 'खेरवाड़ा' } });
    expect((await sqlEventCards(db, L, me.id, { mine: false, from: '2026-05-01', to: '2026-05-31' }))).toEqual([]);
    expect(await sqlEventCards(db, L, me.id, { mine: true, onlyWithEntries: true })).toHaveLength(1);
    expect((await listEvents(db, L)).length).toBe(2);
  });
});

describe('reports (SQL) == the core reference', () => {
  it('a. किसको, किस दिन, कितना दिया: rows, totals, year filter, paging, and the printable doc', async () => {
    const { db, x1, x3, y1 } = await ledgerWithHistory();
    const rows = await sqlGivenRows(db, L, {});
    expect(rows.map((r) => [r.date, r.name])).toEqual([
      ['2025-12-01', 'रमेश'], ['2026-02-02', 'सुरेश'], ['2026-09-01', 'रमेश'],
    ]);
    expect(rows[1]).toMatchObject({ inKindItem: 'घी', cashPaise: rs(300), inKindValuePaise: rs(200), occasion: 'SHAADI' });
    expect(rows[2]).toMatchObject({ occasion: 'GRIHAPRAVESH', utarPaise: rs(451), chadhavPaise: rs(550) });
    const all = await listEntries(db, L);
    const ref = settleEntries(all).filter((s) => s.entry.direction === 'GAYA');
    expect(ref.map((s) => s.entry.id)).toEqual([x1.id, y1.id, x3.id]);
    const totals = await sqlGivenTotals(db, L, {});
    expect(totals).toEqual({ count: 3, totalPaise: ref.reduce((a, s) => a + s.valuePaise, 0), ...sumUtarChadhav(ref) });
    expect(await sqlGivenRows(db, L, { from: '2026-01-01', to: '2026-12-31' })).toHaveLength(2);
    expect(await sqlGivenTotals(db, L, { from: '2026-01-01', to: '2026-12-31' })).toMatchObject({ count: 2, totalPaise: rs(500) + rs(1001) });
    // a filtered year still carries the balance from before it: x3 is 451 उतार even in a "2026 only" report
    expect((await sqlGivenRows(db, L, { from: '2026-09-01', to: '2026-09-30' }))[0]).toMatchObject({ utarPaise: rs(451) });
    expect(await sqlGivenRows(db, L, {}, 1, 1)).toHaveLength(1);
    const doc = givenDoc(rows, totals, { familyName: 'मैं', filters: ['साल: सब'], generatedOn: '2026-10-05' });
    expect(doc.rows).toHaveLength(3);
    expect(doc.rows[1]![3]).toMatchObject({ text: '₹500', sub: 'नकद ₹300 + घी ₹200' });
    expect(doc.totals[0]).toMatchObject({ value: '₹2,002' });
  });

  it('b. मेरे प्रोग्राम में कौन आया', async () => {
    const { db, myEv1, myEv2 } = await ledgerWithHistory();
    const rows = await sqlGuestRows(db, L, myEv1.id);
    // सुरेश's 1000 comes first by diary date (Jan), before I gave him anything (Feb): all चढ़ाव
    expect(rows.map((r) => [r.name, r.cashPaise / 100, r.utarPaise / 100, r.chadhavPaise / 100])).toEqual([
      ['रमेश', 701, 501, 200], ['सुरेश', 1000, 0, 1000],
    ]);
    expect(await sqlGuestTotals(db, L, myEv1.id)).toEqual({ givers: 2, totalPaise: rs(1701), utarPaise: rs(501), chadhavPaise: rs(1200) });
    // the corrected entry replaces the original, the void/superseded ones are gone
    const r2 = await sqlGuestRows(db, L, myEv2.id);
    expect(r2.map((r) => [r.name, r.cashPaise / 100])).toEqual([['रमेश', 251], ['सुरेश', 555]]);
    const doc = guestsDoc('शादी · 10/01/2026', rows, await sqlGuestTotals(db, L, myEv1.id), { familyName: 'मैं', filters: [], generatedOn: '2026-10-05' });
    expect(doc.totals[0]).toMatchObject({ label: 'कुल मिला (2 परिवार)', value: '₹1,701' });
  });

  it('c. साल भर का हिसाब', async () => {
    const { db, me } = await ledgerWithHistory();
    const y = await sqlYearSummary(db, L, me.id, 2026);
    expect(y.receivedPaise).toBe(rs(701) + rs(251) + rs(1000) + rs(555));
    expect(y.givenPaise).toBe(rs(500) + rs(1001));
    expect(y.months.map((m) => m.entries)).toEqual([2, 1, 0, 0, 0, 2, 0, 0, 1, 0, 0, 0]);
    expect(y.months[0]).toMatchObject({ receivedPaise: rs(701) + rs(1000), givenPaise: 0 });
    expect(y.hosted).toBe(2); // my two programs of 2026
    expect(y.attended).toBe(2); // Feb (सुरेश) and Sept (रमेश) of 2026; the Dec-2025 one is last year; the voided Apr one does not count
    const ref = settleEntries(await listEntries(db, L)).filter((s) => s.entry.occurredOn!.startsWith('2026'));
    const gaya = ref.filter((s) => s.entry.direction === 'GAYA');
    const aaya = ref.filter((s) => s.entry.direction === 'AAYA');
    expect([y.givenUtar, y.givenChadhav]).toEqual([sumUtarChadhav(gaya).utarPaise, sumUtarChadhav(gaya).chadhavPaise]);
    expect([y.receivedUtar, y.receivedChadhav]).toEqual([sumUtarChadhav(aaya).utarPaise, sumUtarChadhav(aaya).chadhavPaise]);
    expect((await sqlYearSummary(db, L, me.id, 2031)).months.every((m) => m.entries === 0)).toBe(true);
    const doc = yearDoc(y, { familyName: 'मैं', filters: ['साल: 2026'], generatedOn: '2026-10-05' });
    expect(doc.rows).toHaveLength(12);
    expect(doc.totals.map((t) => t.label)).toEqual(expect.arrayContaining(['कुल मिला', 'कुल दिया', 'कुल उतार', 'कुल चढ़ाव']));
  });

  it('d. मेरे नोतरे में कौन नहीं आया: I had given, they still owed me a return, and they have no entry in this event', async () => {
    const w = await world();
    const { db, me, a, b, c } = w;
    const aEv = await createEvent(db, ev(a.id, '2026-01-05'));
    const bEv = await createEvent(db, ev(b.id, '2026-01-06'));
    const cEv = await createEvent(db, ev(c.id, '2026-01-07'));
    const mine = await createEvent(db, ev(me.id, '2026-03-01'));
    const earlier = await createEvent(db, ev(me.id, '2025-06-01'));
    const g = (h: string, e: string, cash: number, d: string) => addEntry(db, { ...base, otherHouseholdId: h, direction: 'GAYA', eventId: e, cashPaise: rs(cash), occurredOn: d });
    const r = (h: string, e: string, cash: number, d: string) => addEntry(db, { ...base, otherHouseholdId: h, direction: 'AAYA', eventId: e, cashPaise: rs(cash), occurredOn: d });
    await g(a.id, aEv.id, 501, '2026-01-05'); // a: I gave 501, owes me 501, did not come -> listed
    await g(b.id, bEv.id, 1001, '2026-01-06'); // b: owes 1001 but came to the event -> not listed
    await g(c.id, cEv.id, 251, '2026-01-07');
    await r(c.id, earlier.id, 251, '2025-06-01'); // c: gave me earlier... net before the event: given 251 - received 251 = 0 -> not listed
    await r(b.id, mine.id, 1001, '2026-03-01');
    await g(me.id, aEv.id, 99, '2026-01-05'); // my own household is never listed
    const d = await createHousehold(db, hh('देवी'));
    const dEv = await createEvent(db, ev(d.id, '2026-04-01')); // after my event: ignored by "as of that event's date"
    await g(d.id, dEv.id, 2001, '2026-04-01');
    const rows = await sqlNotCome(db, L, me.id, mine.id);
    expect(rows.map((x) => [x.name, x.pendingPaise / 100])).toEqual([['रमेश', 501]]);
    // a late entry from रमेश at my event removes them from the list
    await r(a.id, mine.id, 551, '2026-03-01');
    expect(await sqlNotCome(db, L, me.id, mine.id)).toEqual([]);
    // an earlier event: nobody had been given anything by then
    expect(await sqlNotCome(db, L, me.id, earlier.id)).toEqual([]);
    // biggest बाकी first; paging
    const later = await createEvent(db, ev(me.id, '2026-12-01'));
    const rows2 = await sqlNotCome(db, L, me.id, later.id);
    expect(rows2.map((x) => x.name)).toEqual(['देवी']);
    expect(rows2[0]).toMatchObject({ pendingPaise: rs(2001) });
    expect(await sqlNotCome(db, L, me.id, later.id, 1, 1)).toEqual([]);
    expect(await sqlNotCome(db, L, me.id, 'no-such-event')).toEqual([]);
  });

  it('e. person-wise, pending, occasion-wise and the household ledger, with year filters', async () => {
    const { db, a, b } = await ledgerWithHistory();
    const all = await sqlPersonRange(db, L, {});
    expect(all.map((p) => [p.name, p.receivedPaise / 100, p.givenPaise / 100])).toEqual([['रमेश', 952, 1502], ['सुरेश', 1555, 500]]);
    expect((await sqlPersonRange(db, L, { from: '2026-01-01', to: '2026-03-31' })).map((p) => [p.name, p.receivedPaise / 100, p.givenPaise / 100]))
      .toEqual([['रमेश', 701, 0], ['सुरेश', 1000, 500]]);
    expect((await sqlPersonRange(db, L, {}, { pendingOnly: true })).map((p) => p.name)).toEqual(['सुरेश']);
    // "pending as of a date" counts everything up to then: at the end of Jan 2026 रमेश (gave 501, got 701) is owed a return too
    expect((await sqlPersonRange(db, L, { to: '2026-01-31' }, { pendingOnly: true })).map((p) => [p.name, (p.receivedPaise - p.givenPaise) / 100]))
      .toEqual([['सुरेश', 1000], ['रमेश', 200]]);
    const occ = await sqlOccasionRange(db, L, { from: '2026-01-01', to: '2026-12-31' });
    expect(occ.find((o) => o.occasion === 'GRIHAPRAVESH')).toMatchObject({ totalGiven: rs(1001), eventCount: 1 });
    expect(occ.find((o) => o.occasion === 'MUNDAN')).toMatchObject({ totalReceived: rs(251) + rs(555) });
    const led = await sqlHouseholdLedger(db, L, a.id);
    expect(led.map((r) => [r.date, r.direction, r.program, r.utarPaise / 100, r.chadhavPaise / 100])).toEqual([
      ['2025-12-01', 'GAYA', 'अन्य', 0, 501], ['2026-01-10', 'AAYA', 'शादी', 501, 200], ['2026-06-10', 'AAYA', 'मुंडन संस्कार', 0, 251], ['2026-09-01', 'GAYA', 'गृहप्रवेश', 451, 550],
    ]);
    const doc = householdLedgerDoc({ name: 'रमेश', father: 'कालू', village: 'खेरवाड़ा' }, led, { familyName: 'मैं', filters: [], generatedOn: '2026-10-05' });
    expect(doc.title).toBe('रमेश का पूरा हिसाब');
    expect(doc.rows[0]![4]).toEqual({ text: 'उतार —', sub: 'चढ़ाव ₹501' });
    expect((await sqlHouseholdLedger(db, L, b.id)).length).toBe(3); // 300+200 given, 1000 received, 555 received (the 999 was corrected)
  });

  it('shows the custom name of an "अन्य" program in the reports, and "पुराना हिसाब" for migrated old data', async () => {
    const { db, me, a } = await world();
    const o = await createEvent(db, { ...ev(a.id, '2026-02-02', 'OTHER'), occasionLabel: 'नामकरण' });
    await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'GAYA', eventId: o.id, cashPaise: rs(101), occurredOn: '2026-02-02' });
    const plain = await createEvent(db, ev(a.id, '2026-02-03', 'OTHER'));
    await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'GAYA', eventId: plain.id, cashPaise: rs(51), occurredOn: '2026-02-03' });
    const legacy = await createEvent(db, { ...ev(a.id, '2026-02-04', 'OTHER'), id: legacyEventId('GAYA', L, a.id) });
    await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'GAYA', eventId: legacy.id, cashPaise: rs(21), occurredOn: '2026-02-04' });
    const rows = await sqlGivenRows(db, L, {});
    const doc = givenDoc(rows, await sqlGivenTotals(db, L, {}), { familyName: 'मैं', filters: [], generatedOn: '2026-10-05' });
    expect(doc.rows.map((r) => r[2]!.text)).toEqual(['नामकरण', 'अन्य', 'पुराना हिसाब']);
    const page = await listEntriesPage(db, { ledgerId: L, limit: 5 });
    expect(page.map((p) => p.program?.label)).toEqual([undefined, undefined, 'नामकरण']);
    expect(page.map((p) => p.program?.legacy)).toEqual([true, false, false]);
    void me;
  });
});
