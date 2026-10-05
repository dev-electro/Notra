import { numberToHindiWords, rupeesInWords } from '../words';

describe('rupeesInWords', () => {
  it('reads the shagun amounts', () => {
    expect(rupeesInWords(101)).toBe('एक सौ एक रुपये');
    expect(rupeesInWords(251)).toBe('दो सौ इक्यावन रुपये');
    expect(rupeesInWords(501)).toBe('पाँच सौ एक रुपये');
    expect(rupeesInWords(1001)).toBe('एक हज़ार एक रुपये');
  });

  it('uses the singular for one rupee and nothing for zero', () => {
    expect(rupeesInWords(1)).toBe('एक रुपया');
    expect(rupeesInWords(0)).toBe('');
    expect(rupeesInWords(-5)).toBe('');
    expect(rupeesInWords(NaN)).toBe('');
  });

  it('handles thousands, lakhs and crores the Indian way', () => {
    expect(rupeesInWords(11000)).toBe('ग्यारह हज़ार रुपये');
    expect(rupeesInWords(51000)).toBe('इक्यावन हज़ार रुपये');
    expect(rupeesInWords(100000)).toBe('एक लाख रुपये');
    expect(rupeesInWords(250000)).toBe('दो लाख पचास हज़ार रुपये');
    expect(rupeesInWords(9999999)).toBe('निन्यानवे लाख निन्यानवे हज़ार नौ सौ निन्यानवे रुपये');
    expect(rupeesInWords(10000000)).toBe('एक करोड़ रुपये');
  });
});

describe('numberToHindiWords', () => {
  it('knows the irregular numbers below 100', () => {
    expect(numberToHindiWords(0)).toBe('शून्य');
    expect(numberToHindiWords(6)).toBe('छह');
    expect(numberToHindiWords(15)).toBe('पंद्रह');
    expect(numberToHindiWords(39)).toBe('उनतालीस');
    expect(numberToHindiWords(79)).toBe('उनासी');
    expect(numberToHindiWords(99)).toBe('निन्यानवे');
  });

  it('has a distinct word for every number 0-99', () => {
    const words = Array.from({ length: 100 }, (_, i) => numberToHindiWords(i));
    expect(new Set(words).size).toBe(100);
    expect(words.every((w) => w.length > 0)).toBe(true);
  });

  it('ignores the fraction', () => {
    expect(numberToHindiWords(500.9)).toBe('पाँच सौ');
  });
});
