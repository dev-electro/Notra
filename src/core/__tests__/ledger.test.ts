import { activeEntries, balances, Entry, pendingReturns, occasionWise, personWise, selfLedger, totals, Household, NotraEvent } from '..';

let n = 0;
function entry(p: Partial<Entry>): Entry {
  n += 1;
  return {
    id: p.id ?? `e${n}`,
    otherHouseholdId: 'h1',
    direction: 'AAYA',
    cashPaise: 0,
    inKindValuePaise: 0,
    paymentMode: 'CASH',
    recordedBy: 'me',
    createdAt: `2026-01-${String(n).padStart(2, '0')}T10:00:00Z`,
    ...p,
  };
}

describe('activeEntries', () => {
  it('keeps everything when there are no corrections', () => {
    const es = [entry({}), entry({})];
    expect(activeEntries(es)).toHaveLength(2);
  });
  it('drops a corrected entry', () => {
    const a = entry({ id: 'a', cashPaise: 100 });
    const b = entry({ id: 'b', cashPaise: 200, correctsEntryId: 'a' });
    expect(activeEntries([a, b]).map((e) => e.id)).toEqual(['b']);
  });
  it('handles correction chains', () => {
    const a = entry({ id: 'a' });
    const b = entry({ id: 'b', correctsEntryId: 'a' });
    const c = entry({ id: 'c', correctsEntryId: 'b' });
    expect(activeEntries([a, b, c]).map((e) => e.id)).toEqual(['c']);
  });
  it('ignores dangling correction pointers', () => {
    const b = entry({ id: 'b', correctsEntryId: 'zzz' });
    expect(activeEntries([b])).toHaveLength(1);
  });
});

describe('balances', () => {
  it('is empty for no entries', () => expect(balances([])).toEqual({}));
  it('sums cash + in-kind per household and direction', () => {
    const b = balances([
      entry({ cashPaise: 50100, inKindValuePaise: 100000 }),
      entry({ direction: 'GAYA', cashPaise: 20000 }),
      entry({ otherHouseholdId: 'h2', cashPaise: 10100 }),
    ]);
    expect(b.h1.totalReceived).toBe(150100);
    expect(b.h1.totalGiven).toBe(20000);
    expect(b.h2.totalReceived).toBe(10100);
  });
  it('tracks last given / last received by time', () => {
    const b = balances([
      entry({ cashPaise: 10000, createdAt: '2026-03-01T00:00:00Z' }),
      entry({ cashPaise: 50000, createdAt: '2026-05-01T00:00:00Z' }),
      entry({ cashPaise: 20000, createdAt: '2026-04-01T00:00:00Z' }),
      entry({ direction: 'GAYA', cashPaise: 30000, createdAt: '2026-06-01T00:00:00Z' }),
    ]).h1;
    expect(b.lastReceived).toBe(50000);
    expect(b.lastReceivedAt).toBe('2026-05-01T00:00:00Z');
    expect(b.lastGiven).toBe(30000);
  });
  it('suggests last received + increment, shagun-rounded', () => {
    const b = balances([entry({ cashPaise: 50100 })], { type: 'FIXED', rupees: 101 }).h1;
    expect(b.suggestedNext).toBe(61100);
  });
  it('uses default increment (51) when omitted', () => {
    expect(balances([entry({ cashPaise: 50100 })]).h1.suggestedNext).toBe(56100);
  });
  it('suggestedNext null if never received', () => {
    expect(balances([entry({ direction: 'GAYA', cashPaise: 10000 })]).h1.suggestedNext).toBeNull();
  });
  it('excludes superseded entries from totals', () => {
    const a = entry({ id: 'a', cashPaise: 50000 });
    const fix = entry({ id: 'fix', cashPaise: 55100, correctsEntryId: 'a' });
    const b = balances([a, fix]).h1;
    expect(b.totalReceived).toBe(55100);
    expect(b.lastReceived).toBe(55100);
  });
});

const hs: Household[] = [
  { id: 'h1', headName: 'Suresh', fatherName: 'Kalu', jati: 'Bhil', atak: 'Damor', village: 'Sarwan', fala: 'Upla', panchayat: '', tehsil: '', district: '', kind: 'FAMILY' },
  { id: 'h2', headName: 'Ramesh', fatherName: 'Dhula', jati: 'Bhil', atak: 'Katara', village: 'Kherwara', fala: 'Nichla', panchayat: '', tehsil: '', district: '', kind: 'FAMILY' },
];
const evs: NotraEvent[] = [
  { id: 'ev1', hostHouseholdId: 'me', occasion: 'SHAADI', date: '2026-02-01', panchApproved: true, invitationType: 'YELLOW_RICE', status: 'HELD' },
  { id: 'ev2', hostHouseholdId: 'h1', occasion: 'MAKAAN', date: '2026-03-01', panchApproved: false, invitationType: 'KUMKUM', status: 'HELD' },
];

describe('reports', () => {
  const es = [
    entry({ eventId: 'ev1', cashPaise: 50100 }),
    entry({ eventId: 'ev1', otherHouseholdId: 'h2', cashPaise: 20100 }),
    entry({ eventId: 'ev2', direction: 'GAYA', cashPaise: 30100 }),
    entry({ otherHouseholdId: 'h2', direction: 'GAYA', cashPaise: 90100 }),
  ];
  it('personWise sorted by name with net', () => {
    const rows = personWise(es, hs);
    expect(rows.map((r) => r.household?.headName)).toEqual(['Ramesh', 'Suresh']);
    expect(rows[1].net).toBe(50100 - 30100);
  });
  it('personWise keeps unknown households last', () => {
    const rows = personWise([...es, entry({ otherHouseholdId: 'zz', cashPaise: 100 })], hs);
    expect(rows[rows.length - 1].householdId).toBe('zz');
  });
  it('occasionWise joins events and counts', () => {
    const rows = occasionWise(es, evs);
    const shaadi = rows.find((r) => r.occasion === 'SHAADI')!;
    expect(shaadi.totalReceived).toBe(70200);
    expect(shaadi.eventCount).toBe(1);
    expect(shaadi.entryCount).toBe(2);
    expect(rows.find((r) => r.occasion === 'MAKAAN')!.totalGiven).toBe(30100);
    expect(rows.find((r) => r.occasion === 'OTHER')!.totalGiven).toBe(90100);
  });
  it('selfLedger is chronological with running balance (received - given)', () => {
    const rows = selfLedger([...es].reverse());
    expect(rows.map((r) => r.runningBalance)).toEqual([50100, 70200, 40100, -50000]);
    expect(rows[3].delta).toBe(-90100);
  });
  it('selfLedger excludes superseded', () => {
    const a = entry({ id: 'x1', cashPaise: 100 });
    const b = entry({ id: 'x2', cashPaise: 300, correctsEntryId: 'x1' });
    expect(selfLedger([a, b]).map((r) => r.runningBalance)).toEqual([300]);
  });
  it('totals', () => {
    expect(totals(es)).toEqual({ receivedPaise: 70200, givenPaise: 120200 });
  });
});

describe('pendingReturns (Lautana baaki)', () => {
  it('lists only households where received > given, largest first', () => {
    const es = [
      entry({ cashPaise: 50100 }),
      entry({ direction: 'GAYA', cashPaise: 10000 }),
      entry({ otherHouseholdId: 'h2', cashPaise: 20100 }),
      entry({ otherHouseholdId: 'h3', cashPaise: 10000 }),
      entry({ otherHouseholdId: 'h3', direction: 'GAYA', cashPaise: 10000 }),
    ];
    const rows = pendingReturns(es, hs);
    expect(rows.map((r) => r.householdId)).toEqual(['h1', 'h2']);
    expect(rows[0].pendingPaise).toBe(40100);
    expect(rows[0].suggestedNext).toBe(56100);
  });
  it('uses neutral wording only', () => {
    const src = JSON.stringify(pendingReturns([entry({ cashPaise: 100 })]));
    expect(src.toLowerCase()).not.toContain('default');
  });
});
