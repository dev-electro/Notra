import { EMPTY_BIODATA } from '@/core';
import { ageFromDob, draftFromBiodata, draftProblems, EMPTY_DRAFT, errorMessageHi, heightCm, PUBLIC_ITEMS, searchQuery, toProfileBody } from '../logic';

const NOW = new Date(2026, 9, 6); // 6 Oct 2026

describe('prefill from the local biodata', () => {
  it('reads an age from common birth-date spellings, and never needs the date itself', () => {
    expect(ageFromDob('15/08/1998', NOW)).toBe('28');
    expect(ageFromDob('7-10-1998', NOW)).toBe('27'); // birthday is tomorrow
    expect(ageFromDob('06.10.1998', NOW)).toBe('28'); // birthday today
    expect(ageFromDob('1998-08-15', NOW)).toBe('28');
    expect(ageFromDob('१५/०८/१९९८', NOW)).toBe('28');
    expect(ageFromDob('15 अगस्त 1998', NOW)).toBe('');
    expect(ageFromDob('15/08/2015', NOW)).toBe(''); // under 18
    expect(ageFromDob('', NOW)).toBe('');
  });
  it('reads a height in cm or feet and inches', () => {
    expect(heightCm('168')).toBe('168');
    expect(heightCm('168 cm')).toBe('168');
    expect(heightCm("5'6")).toBe('168');
    expect(heightCm('5 ft 6 in')).toBe('168');
    expect(heightCm('५ फ़ुट ६ इंच')).toBe('168');
    expect(heightCm('tall')).toBe('');
    expect(heightCm('999')).toBe('');
  });
  it('copies only what the public profile needs; never father, mother, address or birth place', () => {
    const d = draftFromBiodata({ ...EMPTY_BIODATA, name: 'आशा कुमारी मीणा', dobDate: '15/08/1998', height: '5 ft 2 in', gotra: ' कश्यप ', education: 'बी.एड', occupation: 'शिक्षिका', father: 'रामलाल', address: 'गाँव X', birthPlace: 'Y', contact: '98765 43210 (घर)' }, NOW);
    expect(d).toEqual({ ...EMPTY_DRAFT, first_name: 'आशा', age: '28', height_cm: '157', gotra: 'कश्यप', education: 'बी.एड', occupation: 'शिक्षिका', contact: '98765 43210' });
    expect(JSON.stringify(d)).not.toMatch(/रामलाल|गाँव X/);
    expect(draftFromBiodata(null, NOW)).toEqual(EMPTY_DRAFT);
  });
});

describe('validation and request shapes', () => {
  const ok = { ...EMPTY_DRAFT, first_name: 'आशा', gender: 'female' as const, age: '28', contact: '9876543210' };
  it('lists what is missing, in form order', () => {
    expect(draftProblems(EMPTY_DRAFT)).toEqual(['first_name', 'gender', 'age', 'contact']);
    expect(draftProblems(ok)).toEqual([]);
    expect(draftProblems({ ...ok, age: '17' })).toEqual(['age']);
    expect(draftProblems({ ...ok, height_cm: '50' })).toEqual(['height_cm']);
    expect(draftProblems({ ...ok, contact: '12345' })).toEqual(['contact']);
  });
  it('sends numbers as numbers and empty text as null, with Latin digits', () => {
    expect(toProfileBody({ ...ok, age: '२८', height_cm: '', gotra: '  ', contact: '९८७६५ 43210' })).toMatchObject({
      first_name: 'आशा', age: 28, height_cm: null, gotra: null, contact: '98765 43210', gender: 'female', published_by: 'self',
    });
  });
  it('builds the search query from the filters, dropping empty or unreadable ones', () => {
    expect(searchQuery({ gender: 'female', ageMin: '', ageMax: '', district: '', sameGotra: false })).toBe('gender=female');
    expect(searchQuery({ gender: 'male', ageMin: '22', ageMax: 'x', district: ' उदयपुर ', sameGotra: true }, 20)).toBe('gender=male&age_min=22&district=%E0%A4%89%E0%A4%A6%E0%A4%AF%E0%A4%AA%E0%A5%81%E0%A4%B0&same_gotra=1&offset=20');
  });
});

describe('consent and messages', () => {
  it('lists exactly the public items, and the contact number is not one of them', () => {
    expect(PUBLIC_ITEMS).toHaveLength(8);
    expect(PUBLIC_ITEMS.join(' ')).not.toMatch(/संपर्क|नंबर|फ़ोन/);
  });
  it('turns server codes into Hindi', () => {
    expect(errorMessageHi(429, 'interest_cap')).toMatch(/10/);
    expect(errorMessageHi(403, 'phone_not_verified')).toMatch(/फ़ोन/);
    expect(errorMessageHi(null, null)).toMatch(/इंटरनेट/);
    expect(errorMessageHi(404, 'not_found')).toMatch(/उपलब्ध नहीं/);
  });
});
