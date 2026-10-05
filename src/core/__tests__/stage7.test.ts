import {
  cleanOccasionText, checkEntryRule, directionForHost, entryDate, isLegacyEventId, legacyEventId, matchesSearch, monthGrid,
  normalizeIndianMobile, occasionName, OCCASIONS, OCCASION_LABEL, parseSearch, paginateDoc, phoneSearchDigits, readBackWithSettlement,
  filterLabels, filterRange, reportHtml, settleEntries, sortChronological, splitAgainstBalance, sumUtarChadhav, utarChadhavText,
  type Entry,
} from '../index';

let n = 0;
const E = (o: Partial<Entry> & Pick<Entry, 'direction' | 'cashPaise'>): Entry => ({
  id: `e${++n}`, otherHouseholdId: 'A', inKindValuePaise: 0, paymentMode: 'CASH', recordedBy: 'me',
  createdAt: `2026-01-01T00:00:${String(n).padStart(2, '0')}.000Z`, eventId: 'ev', ...o,
});
const rs = (p: number) => p * 100;

describe('उतार / चढ़ाव', () => {
  it('splitAgainstBalance: the worked example (they gave 501, I give 701)', () => {
    expect(splitAgainstBalance('GAYA', rs(701), rs(501))).toEqual({ utarPaise: rs(501), chadhavPaise: rs(200) });
  });
  it('settles the example end to end and keeps the running balance', () => {
    const rows = settleEntries([E({ direction: 'AAYA', cashPaise: rs(501) }), E({ direction: 'GAYA', cashPaise: rs(701) })]);
    expect(rows.map((r) => [r.utarPaise, r.chadhavPaise, r.netBefore, r.netAfter])).toEqual([
      [0, rs(501), 0, rs(501)], // first gift from them: all चढ़ाव (I now owe 501)
      [rs(501), rs(200), rs(501), -rs(200)], // I give 701: 501 repays, 200 is new (they owe me 200)
    ]);
  });
  it('is symmetric: when I receive against what they owe me', () => {
    const rows = settleEntries([E({ direction: 'GAYA', cashPaise: rs(1001) }), E({ direction: 'AAYA', cashPaise: rs(1501) })]);
    expect(rows[1]).toMatchObject({ utarPaise: rs(1001), chadhavPaise: rs(500), netAfter: rs(500) });
    // receiving less than they owed leaves it all उतार
    const r2 = settleEntries([E({ direction: 'GAYA', cashPaise: rs(1001) }), E({ direction: 'AAYA', cashPaise: rs(401) })]);
    expect(r2[1]).toMatchObject({ utarPaise: rs(401), chadhavPaise: 0, netAfter: -rs(600) });
  });
  it('giving less than I owed is all उतार, and exact repayment leaves nothing open', () => {
    const rows = settleEntries([E({ direction: 'AAYA', cashPaise: rs(501) }), E({ direction: 'GAYA', cashPaise: rs(251) }), E({ direction: 'GAYA', cashPaise: rs(250) })]);
    expect(rows.slice(1).map((r) => [r.utarPaise, r.chadhavPaise])).toEqual([[rs(251), 0], [rs(250), 0]]);
    expect(rows[2]!.netAfter).toBe(0);
  });
  it('multiple rounds: each gift is judged against the balance at that moment', () => {
    const rows = settleEntries([
      E({ direction: 'GAYA', cashPaise: rs(501) }), // I give: चढ़ाव 501
      E({ direction: 'AAYA', cashPaise: rs(551) }), // they return 551: उतार 501, चढ़ाव 50
      E({ direction: 'GAYA', cashPaise: rs(601) }), // I give 601: I still owed 50: उतार 50, चढ़ाव 551
      E({ direction: 'AAYA', cashPaise: rs(701) }), // they give 701 against 551: उतार 551, चढ़ाव 150
    ]);
    expect(rows.map((r) => [r.utarPaise / 100, r.chadhavPaise / 100])).toEqual([[0, 501], [501, 50], [50, 551], [551, 150]]);
    expect(sumUtarChadhav(rows)).toEqual({ utarPaise: rs(1102), chadhavPaise: rs(1252) });
  });
  it('counts in-kind value with the cash', () => {
    const rows = settleEntries([E({ direction: 'AAYA', cashPaise: rs(500), inKindValuePaise: rs(1000), inKindItem: 'बकरी' }), E({ direction: 'GAYA', cashPaise: rs(1001) })]);
    expect(rows[1]).toMatchObject({ valuePaise: rs(1001), utarPaise: rs(1001), chadhavPaise: 0, netAfter: rs(499) });
  });
  it('households never mix', () => {
    const rows = settleEntries([E({ direction: 'AAYA', cashPaise: rs(500) }), E({ direction: 'GAYA', cashPaise: rs(500), otherHouseholdId: 'B' })]);
    expect(rows[1]).toMatchObject({ utarPaise: 0, chadhavPaise: rs(500) });
  });
  it('corrections and voids: only active entries take part, a correction counts in place of the original', () => {
    const a = E({ direction: 'AAYA', cashPaise: rs(500) });
    const fix = E({ direction: 'AAYA', cashPaise: rs(501), correctsEntryId: a.id, occurredOn: entryDate(a) });
    const g = E({ direction: 'GAYA', cashPaise: rs(701) });
    const g2 = E({ direction: 'GAYA', cashPaise: rs(100) });
    const voidG2 = E({ direction: 'GAYA', cashPaise: 0, isVoid: true, correctsEntryId: g2.id });
    const rows = settleEntries([a, fix, g, g2, voidG2]);
    expect(rows.map((r) => r.entry.id)).toEqual([fix.id, g.id]);
    expect(rows[1]).toMatchObject({ utarPaise: rs(501), chadhavPaise: rs(200) });
  });
  it('follows the diary date, not the typing order (an old entry added later goes where it belongs)', () => {
    const late = E({ direction: 'GAYA', cashPaise: rs(1001), occurredOn: '2026-09-01' });
    const old = E({ direction: 'AAYA', cashPaise: rs(701), occurredOn: '2026-01-10' }); // typed later, happened earlier
    const rows = settleEntries([late, old]);
    expect(rows.map((r) => r.entry.id)).toEqual([old.id, late.id]);
    expect(rows[1]).toMatchObject({ utarPaise: rs(701), chadhavPaise: rs(300) });
    expect(sortChronological([late, old])[0]).toBe(old);
  });
  it('text', () => {
    expect(utarChadhavText(rs(501), rs(200))).toBe('इसमें ₹501 उतार और ₹200 चढ़ाव');
    expect(utarChadhavText(rs(501), 0)).toBe('इसमें ₹501 उतार');
    expect(utarChadhavText(0, rs(200))).toBe('इसमें ₹200 चढ़ाव');
    expect(utarChadhavText(0, 0)).toBe('');
    const e = E({ direction: 'GAYA', cashPaise: rs(701) });
    expect(readBackWithSettlement(e, { headName: 'सुरेश' }, rs(501), rs(200))).toBe('आपने सुरेश को 701 रुपये दिए। इसमें ₹501 उतार और ₹200 चढ़ाव। सही है?');
  });
});

describe('the two worlds: direction follows the event host', () => {
  it('my event = AAYA, another family event = GAYA', () => {
    expect(directionForHost('me', 'me')).toBe('AAYA');
    expect(directionForHost('them', 'me')).toBe('GAYA');
  });
  it('checkEntryRule', () => {
    const mine = { hostHouseholdId: 'me' };
    const theirs = { hostHouseholdId: 'x' };
    expect(checkEntryRule({ direction: 'AAYA' }, mine, 'me')).toEqual({ ok: false, reason: 'NO_EVENT' });
    expect(checkEntryRule({ direction: 'AAYA', eventId: 'e' }, undefined, 'me')).toEqual({ ok: false, reason: 'UNKNOWN_EVENT' });
    expect(checkEntryRule({ direction: 'AAYA', eventId: 'e' }, mine, 'me')).toEqual({ ok: true });
    expect(checkEntryRule({ direction: 'GAYA', eventId: 'e' }, mine, 'me')).toEqual({ ok: false, reason: 'WRONG_DIRECTION' });
    expect(checkEntryRule({ direction: 'GAYA', eventId: 'e' }, theirs, 'me')).toEqual({ ok: true });
    expect(checkEntryRule({ direction: 'AAYA', eventId: 'e' }, theirs, 'me')).toEqual({ ok: false, reason: 'WRONG_DIRECTION' });
  });
  it('is lenient only where it must be: unknown me, voids, corrections that keep event and direction', () => {
    const mine = { hostHouseholdId: 'me' };
    expect(checkEntryRule({ direction: 'GAYA', eventId: 'e' }, mine, null)).toEqual({ ok: true });
    expect(checkEntryRule({ direction: 'GAYA', eventId: 'e', isVoid: true }, mine, 'me')).toEqual({ ok: true });
    expect(checkEntryRule({ direction: 'GAYA', eventId: 'e' }, mine, 'me', { direction: 'GAYA', eventId: 'e' })).toEqual({ ok: true });
    expect(checkEntryRule({ direction: 'GAYA', eventId: 'e' }, mine, 'me', { direction: 'AAYA', eventId: 'e' })).toEqual({ ok: false, reason: 'WRONG_DIRECTION' });
  });
  it('legacy event ids are deterministic, uuid-shaped and recognisable', () => {
    const L = '00000000-0000-4000-8000-000000000001';
    const H = '3b9c4847-23a5-451f-86ad-43a2326ae451';
    const mine = legacyEventId('AAYA', L, H);
    const theirs = legacyEventId('GAYA', L, H);
    expect(mine).toBe('a1a1a1a1-0000-4000-8000-000000000001');
    expect(theirs).toBe('b2b2b2b2-23a5-451f-86ad-000000000001');
    for (const id of [mine, theirs]) expect(id).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    expect(isLegacyEventId(mine) && isLegacyEventId(theirs)).toBe(true);
    expect(isLegacyEventId(H)).toBe(false);
    expect(legacyEventId('GAYA', L, '11111111-2222-3333-4444-555555555555')).not.toBe(theirs);
  });
});

describe('occasions', () => {
  it('has the two new occasions next to the old ones and never a death-feast', () => {
    expect(OCCASIONS).toEqual(['SHAADI', 'GRIHAPRAVESH', 'MUNDAN', 'BIMARI', 'MAKAAN', 'OTHER']);
    expect(OCCASION_LABEL.GRIHAPRAVESH).toBe('गृहप्रवेश');
    expect(OCCASION_LABEL.MUNDAN).toBe('मुंडन संस्कार');
    expect(Object.keys(OCCASION_LABEL).join()).not.toMatch(/MRITYU|DEATH|TERHVI/i);
  });
  it('shows the custom name for OTHER, and falls back to "अन्य"', () => {
    expect(occasionName('OTHER')).toBe('अन्य');
    expect(occasionName('OTHER', '')).toBe('अन्य');
    expect(occasionName('OTHER', '   ')).toBe('अन्य');
    expect(occasionName('OTHER', null)).toBe('अन्य');
    expect(occasionName('OTHER', ' नामकरण ')).toBe('नामकरण');
    expect(occasionName('SHAADI', 'नामकरण')).toBe('शादी'); // a stray label never renames a standard occasion
  });
  it('cleans and limits the custom text; only OTHER keeps it', () => {
    expect(cleanOccasionText('OTHER', '  स्कूल   टीचर विकास ', ' आठवीं पास ')).toEqual({ label: 'स्कूल टीचर विकास', note: 'आठवीं पास' });
    expect(cleanOccasionText('OTHER', '', '')).toEqual({ label: undefined, note: undefined });
    expect(cleanOccasionText('MUNDAN', 'x', 'y')).toEqual({});
    expect(cleanOccasionText('OTHER', 'क'.repeat(100), 'ख'.repeat(900))).toEqual({ label: 'क'.repeat(60), note: 'ख'.repeat(500) });
  });
});

describe('calendar grid', () => {
  it('lays out a month with blanks (Sunday first)', () => {
    const g = monthGrid(2026, 2); // 1 Feb 2026 is a Sunday
    expect(g).toHaveLength(4);
    expect(g[0]![0]).toBe('2026-02-01');
    expect(g[3]![6]).toBe('2026-02-28');
    const oct = monthGrid(2026, 10); // 1 Oct 2026 is a Thursday
    expect(oct[0]!.slice(0, 4)).toEqual([null, null, null, null]);
    expect(oct[0]![4]).toBe('2026-10-01');
    expect(oct.flat().filter(Boolean)).toHaveLength(31);
    expect(oct.every((w) => w.length === 7)).toBe(true);
  });
  it('knows leap years and 6-week months', () => {
    expect(monthGrid(2024, 2).flat().filter(Boolean)).toHaveLength(29);
    expect(monthGrid(2026, 8)).toHaveLength(6); // 1 Aug 2026 is a Saturday: 31 days spill into a 6th week
  });
});

describe('phone numbers', () => {
  it('normalises to +91 E.164', () => {
    for (const raw of ['9876543210', '+91 98765 43210', '098765 43210', '0091-98765-43210', '(91) 98765-43210', '91 9876543210']) {
      expect(normalizeIndianMobile(raw)).toBe('+919876543210');
    }
  });
  it('refuses what is not an Indian mobile', () => {
    for (const raw of ['', '12345', '0294 2412345', '5876543210', '+1 415 555 0100', '98765432100']) expect(normalizeIndianMobile(raw)).toBeNull();
  });
  it('search digits ignore +91, a leading 0 and punctuation but keep short numbers as typed', () => {
    expect(phoneSearchDigits('+91 98765-43210')).toBe('9876543210');
    expect(phoneSearchDigits('098765 43210')).toBe('9876543210');
    expect(phoneSearchDigits('9876')).toBe('9876');
  });
});

describe('search matching (reference for the SQL)', () => {
  const h = { headName: 'Mohan', fatherName: 'सोहन', village: 'खेरवाड़ा', fala: 'ऊपला', phone: '+91 98765 43210' };
  it('parses a phone-looking box as a phone query, other text into words', () => {
    expect(parseSearch('+91 98765 43210')).toEqual({ tokens: [], phone: '9876543210' });
    expect(parseSearch('  Mohan  खेरवाड़ा ')).toEqual({ tokens: ['mohan', 'खेरवाड़ा'], phone: null });
    expect(parseSearch('')).toEqual({ tokens: [], phone: null });
    expect(parseSearch('12')).toEqual({ tokens: ['12'], phone: null });
  });
  it('matches name, father, village, fala and phone; every word must match', () => {
    for (const q of ['moh', 'सोह', 'खेर', 'ऊप', '98765', '+91 9876543210', '09876543210', 'mohan खेरवाड़ा', 'sohan'.replace('sohan', 'सोहन') + ' mohan']) {
      expect(matchesSearch(h, q)).toBe(true);
    }
    for (const q of ['ramesh', 'mohan उदयपुर', '99999', '+91 11111 11111']) expect(matchesSearch(h, q)).toBe(false);
    expect(matchesSearch({ ...h, phone: undefined }, '98765')).toBe(false);
    expect(matchesSearch(h, '')).toBe(true);
  });
});

describe('pages for image export', () => {
  it('splits rows into pages of 25; totals belong to the last page', () => {
    const doc = {
      id: 'x', title: 't', familyName: 'f', filters: [], generatedOn: '2026-01-01', columns: [{ label: 'a', flex: 1 }],
      rows: Array.from({ length: 60 }, (_, i) => [{ text: String(i) }]), totals: [],
    };
    const pages = paginateDoc(doc);
    expect(pages.map((p) => p.doc.rows.length)).toEqual([25, 25, 10]);
    expect(pages.map((p) => [p.page, p.pages, p.last])).toEqual([[1, 3, false], [2, 3, false], [3, 3, true]]);
    expect(paginateDoc({ ...doc, rows: [] })).toHaveLength(1);
    expect(paginateDoc({ ...doc, rows: doc.rows.slice(0, 25) })).toHaveLength(1);
  });
});


describe('report filter and PDF html', () => {
  it('year, all years and date range', () => {
    expect(filterRange({ year: 2026 })).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(filterRange({ year: null })).toEqual({});
    expect(filterRange({ year: null, from: '2026-01-01', to: '2026-03-31' })).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(filterLabels({ year: 2026 })).toEqual(['साल: 2026']);
    expect(filterLabels({ year: null })).toEqual(['साल: सभी']);
    expect(filterLabels({ year: null, from: '2026-01-01', to: '2026-03-31' })).toEqual(['तारीख: 01/01/2026 से 31/03/2026']);
  });
  it('the PDF carries family, title, filters, rows, totals and the date, and escapes text', () => {
    const html = reportHtml({
      id: 'x', title: 'किसको, किस दिन, कितना दिया', familyName: 'रमेश <b>', filters: ['साल: 2026'], generatedOn: '2026-10-05',
      columns: [{ label: 'परिवार', flex: 1 }, { label: 'रकम', flex: 1, align: 'right' }],
      rows: [[{ text: 'सुरेश & भाई', sub: 'गोपाल का · सरवन' }, { text: '₹701', tone: 'given' }]],
      totals: [{ label: 'कुल दिया', value: '₹701', tone: 'given' }], note: 'यह सूची सिर्फ़ मेरे लिए है।',
    });
    for (const t of ['रमेश &lt;b&gt;', 'किसको, किस दिन, कितना दिया', 'साल: 2026', 'सुरेश &amp; भाई', 'गोपाल का · सरवन', '₹701', 'कुल दिया', 'यह सूची सिर्फ़ मेरे लिए है।', '5 अक्टूबर 2026']) {
      expect(html).toContain(t);
    }
    expect(html).not.toContain('रमेश <b>');
  });
});
