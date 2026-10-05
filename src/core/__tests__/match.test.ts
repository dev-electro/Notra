import { foldName, matchHouseholds, nameSimilarity } from '../match';
import type { Household } from '../types';

const h = (id: string, headName: string, fatherName: string, village: string): Household => ({
  id, headName, fatherName, village, jati: 'भील', atak: 'डामोर', fala: 'ऊपला', panchayat: '', tehsil: '', district: '', kind: 'FAMILY',
});
const list = [
  h('1', 'रमेश', 'कालू', 'छोटी सरवन'),
  h('2', 'रमेश', 'भूरा', 'बड़ी सरवन'),
  h('3', 'सुरेश', 'कालू', 'छोटी सरवन'),
  h('4', 'Ramesh', 'Dhula', 'Kherwara'),
];

describe('match', () => {
  it('folds spelling variants', () => {
    expect(foldName('सरवन')).toBe(foldName('सरवण'));
    expect(foldName('Chhoti')).toBe(foldName('choti'));
    expect(nameSimilarity('रमेश', 'रमेश')).toBe(1);
    expect(nameSimilarity('', 'x')).toBe(0);
  });

  it('tells same names apart by father and village', () => {
    const m = matchHouseholds({ name: 'रमेश', fatherName: 'कालू', village: 'छोटी सरवन' }, list);
    expect(m[0].household.id).toBe('1');
    const m2 = matchHouseholds({ name: 'रमेश', fatherName: 'भूरा', village: 'बड़ी सरवन' }, list);
    expect(m2[0].household.id).toBe('2');
  });

  it('is tolerant to small speech variations and Latin script', () => {
    expect(matchHouseholds({ name: 'Ramesh', village: 'Kherwara' }, list)[0].household.id).toBe('4');
    expect(matchHouseholds({ name: 'रमेश', fatherName: 'कालु', village: 'छोटी सरवण' }, list)[0].household.id).toBe('1');
  });

  it('never matches on village alone or without a name', () => {
    expect(matchHouseholds({ village: 'छोटी सरवन' }, list)).toEqual([]);
    expect(matchHouseholds({ name: 'गोविंद', village: 'छोटी सरवन' }, list)).toEqual([]);
    expect(matchHouseholds({ name: 'x' }, [])).toEqual([]);
  });

  it('respects limit', () => {
    expect(matchHouseholds({ name: 'रमेश' }, list, { limit: 1 })).toHaveLength(1);
  });
});
