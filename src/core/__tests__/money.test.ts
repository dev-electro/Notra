import { formatINR, paiseToRupees, roundUpToShagun, rupeesToPaise, suggestReturn } from '..';

describe('formatINR', () => {
  it.each([
    [0, '₹0'],
    [100, '₹1'],
    [50100, '₹501'],
    [100100, '₹1,001'],
    [10000100, '₹1,00,001'],
    [123456700, '₹12,34,567'],
    [100, '₹1'],
    [150, '₹1.50'],
    [-50100, '-₹501'],
  ])('formats %p paise as %s', (p, s) => expect(formatINR(p)).toBe(s));
  it('can omit the symbol', () => expect(formatINR(10000100, { symbol: false })).toBe('1,00,001'));
  it('handles NaN safely', () => expect(formatINR(NaN)).toBe('₹0'));
});

describe('rupee/paise helpers', () => {
  it('converts', () => {
    expect(rupeesToPaise(501)).toBe(50100);
    expect(rupeesToPaise(1.1)).toBe(110);
    expect(paiseToRupees(50100)).toBe(501);
  });
});

describe('roundUpToShagun', () => {
  it.each([[550, 551], [600, 601], [1000, 1001], [501, 501], [1, 1], [2, 11], [0, 1], [599.5, 601], [1001, 1001], [1002, 1011]])(
    '%p -> %p',
    (x, y) => expect(roundUpToShagun(x)).toBe(y),
  );
});

describe('suggestReturn', () => {
  it('fixed 51 on 500 -> 551', () => expect(suggestReturn(50000, { type: 'FIXED', rupees: 51 })).toBe(55100));
  it('fixed 101 on 500 -> 601', () => expect(suggestReturn(50000, { type: 'FIXED', rupees: 101 })).toBe(60100));
  it('fixed 101 on 501 -> 602 -> 611', () => expect(suggestReturn(50100, { type: 'FIXED', rupees: 101 })).toBe(61100));
  it('percent 10 on 1000 -> 1100 -> 1101', () => expect(suggestReturn(100000, { type: 'PERCENT', pct: 10 })).toBe(110100));
  it('percent 10 on 501 -> 551.1 -> 561', () => expect(suggestReturn(50100, { type: 'PERCENT', pct: 10 })).toBe(56100));
  it('already shagun stays', () => expect(suggestReturn(50000, { type: 'FIXED', rupees: 1 })).toBe(50100));
  it('zero -> null', () => expect(suggestReturn(0, { type: 'FIXED', rupees: 51 })).toBeNull());
  it('negative / NaN -> null', () => {
    expect(suggestReturn(-5, { type: 'FIXED', rupees: 51 })).toBeNull();
    expect(suggestReturn(NaN, { type: 'FIXED', rupees: 51 })).toBeNull();
  });
});
