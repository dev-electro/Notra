import { resolveVoiceEntry } from '../voiceResolve';
import type { Household } from '../types';

const h = (id: string, headName: string, fatherName: string, village: string): Household => ({
  id, headName, fatherName, village, jati: 'भील', atak: 'डामोर', fala: 'ऊपला', panchayat: '', tehsil: '', district: '', kind: 'FAMILY',
});
const list = [h('1', 'रमेश', 'कालू', 'छोटी सरवन'), h('2', 'रमेश', 'भूरा', 'बड़ी सरवन')];

describe('resolveVoiceEntry', () => {
  it('parses and picks the clear best household', () => {
    const r = resolveVoiceEntry('रमेश कालू का बेटा छोटी सरवन 501', list);
    expect(r.parsed.amountRupees).toBe(501);
    expect(r.best?.id).toBe('1');
  });

  it('offers candidates without a best when ambiguous', () => {
    const r = resolveVoiceEntry('रमेश 501', list);
    expect(r.matches.length).toBe(2);
    expect(r.best).toBeUndefined();
  });

  it('returns no match for unknown people and empty input', () => {
    expect(resolveVoiceEntry('गोविंद 101', list).matches).toEqual([]);
    expect(resolveVoiceEntry('', list).matches).toEqual([]);
  });
});
