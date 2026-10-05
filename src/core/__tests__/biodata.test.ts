import { biodataSections, EMPTY_BIODATA, hasContent, parseBiodata, serializeBiodata } from '../biodata';

describe('biodata', () => {
  it('round-trips and trims', () => {
    const b = { ...EMPTY_BIODATA, name: '  राहुल ', gotra: 'कश्यप' };
    expect(parseBiodata(serializeBiodata(b))).toMatchObject({ name: 'राहुल', gotra: 'कश्यप', father: '' });
  });
  it('rejects junk, empty and photo-only values', () => {
    expect(parseBiodata(null)).toBeNull();
    expect(parseBiodata('not json')).toBeNull();
    expect(parseBiodata('[]')).toBeNull();
    expect(parseBiodata(serializeBiodata({ ...EMPTY_BIODATA, photoUri: 'file:///x.jpg' }))).toBeNull();
  });
  it('drops unknown keys and non-strings, caps length', () => {
    const p = parseBiodata(JSON.stringify({ name: 'अ'.repeat(500), height: 5, evil: 'x' }));
    expect(p?.name).toHaveLength(300);
    expect(p?.height).toBe('');
    expect(p).not.toHaveProperty('evil');
  });
  it('sections skip empty fields and empty groups', () => {
    const s = biodataSections({ ...EMPTY_BIODATA, name: 'क', father: 'ख', height: '5 फ़ुट 8 इंच' });
    expect(s.map((x) => x.title)).toEqual(['व्यक्तिगत जानकारी', 'परिवार']);
    expect(s[1].rows).toEqual([{ label: 'पिता', value: 'ख' }]);
    expect(hasContent(EMPTY_BIODATA)).toBe(false);
  });
});
