import { parseVoiceEntry } from '..';

describe('parseVoiceEntry: structured', () => {
  it('Latin with commas', () => {
    expect(parseVoiceEntry('Ramesh, Kalu ka beta, Chhoti Sarwan, 501')).toEqual({
      name: 'Ramesh', fatherName: 'Kalu', village: 'Chhoti Sarwan', amountRupees: 501, confidence: 1,
    });
  });
  it('Devanagari without commas', () => {
    expect(parseVoiceEntry('रमेश कालू का बेटा छोटी सरवन 501')).toEqual({
      name: 'रमेश', fatherName: 'कालू', village: 'छोटी सरवन', amountRupees: 501, confidence: 1,
    });
  });
  it('Devanagari digits', () => {
    expect(parseVoiceEntry('रमेश कालू का बेटा छोटी सरवन ५०१').amountRupees).toBe(501);
  });
  it('ki beti', () => {
    const r = parseVoiceEntry('Sita, Mohan ki beti, Kherwara, 251');
    expect(r).toMatchObject({ name: 'Sita', fatherName: 'Mohan', village: 'Kherwara', amountRupees: 251 });
  });
  it('ka ladka', () => {
    expect(parseVoiceEntry('Dinesh Hira ka ladka 101')).toMatchObject({ name: 'Dinesh', fatherName: 'Hira', amountRupees: 101 });
  });
  it('Devanagari की बेटी', () => {
    expect(parseVoiceEntry('सीता मोहन की बेटी 251')).toMatchObject({ name: 'सीता', fatherName: 'मोहन', amountRupees: 251 });
  });
  it('s/o', () => {
    expect(parseVoiceEntry('Ramesh s/o Kalu, Sarwan, 501')).toMatchObject({ name: 'Ramesh', fatherName: 'Kalu', village: 'Sarwan', amountRupees: 501 });
  });
  it('son of', () => {
    expect(parseVoiceEntry('Ramesh son of Kalu 501')).toMatchObject({ name: 'Ramesh', fatherName: 'Kalu', amountRupees: 501 });
  });
  it('multi-word father with commas', () => {
    expect(parseVoiceEntry('Ramesh, Kalu Ram ka beta, Sarwan, 1001')).toMatchObject({ name: 'Ramesh', fatherName: 'Kalu Ram', village: 'Sarwan', amountRupees: 1001 });
  });
  it('two-word name before father without commas', () => {
    expect(parseVoiceEntry('Ramesh Kumar Kalu ka beta 501')).toMatchObject({ name: 'Ramesh Kumar', fatherName: 'Kalu' });
  });
  it('three plain segments = name, father, village', () => {
    expect(parseVoiceEntry('Ramesh, Kalu, Sarwan, 501')).toMatchObject({ name: 'Ramesh', fatherName: 'Kalu', village: 'Sarwan' });
  });
  it('village keyword', () => {
    expect(parseVoiceEntry('Ramesh Kalu ka beta Sarwan gaon 501').village).toBe('Sarwan');
  });
  it('currency symbols and words are ignored', () => {
    expect(parseVoiceEntry('Ramesh ₹501 rupaye')).toMatchObject({ name: 'Ramesh', amountRupees: 501 });
    expect(parseVoiceEntry('Ramesh Rs. 501')).toMatchObject({ name: 'Ramesh', amountRupees: 501 });
  });
  it('comma-grouped digits', () => {
    expect(parseVoiceEntry('Ramesh, 1,001').amountRupees).toBe(1001);
  });
});

describe('parseVoiceEntry: ne ... diye with number words', () => {
  it.each([
    ['Suresh ne paanch sau ek diye', 501],
    ['Suresh ne ek hazaar ek diye', 1001],
    ['Suresh ne ikyavan diye', 51],
    ['Suresh ne ekyavan rupaye diye', 51],
    ['Suresh ne ikkis diye', 21],
    ['Suresh ne dhai sau diye', 250],
    ['Suresh ne dedh sau diye', 150],
    ['Suresh ne ek sau ek diye', 101],
    ['Suresh ne do hazaar paanch sau ek diye', 2501],
    ['Suresh ne gyarah sau diye', 1100],
    ['Suresh ne bees diye', 20],
    ['Suresh ne das rupaye diye', 10],
    ['Suresh ne hajar diye', 1000],
    ['Suresh ne dhai hazaar diye', 2500],
    ['Suresh ne sawa sau diye', 125],
    ['Suresh ne 5 sau ek diye', 501],
    ['सुरेश ने पाँच सौ एक दिए', 501],
    ['सुरेश ने एक हज़ार एक दिए', 1001],
    ['सुरेश ने इक्यावन रुपये दिए', 51],
    ['सुरेश ने ढाई सौ दिए', 250],
    ['सुरेश ने डेढ़ सौ दिए', 150],
    ['सुरेश ने ग्यारह सौ एक दिए', 1101],
  ])('%s -> %p', (t, v) => {
    const r = parseVoiceEntry(t);
    expect(r.amountRupees).toBe(v);
    expect(r.name).toBe(t.startsWith('Suresh') ? 'Suresh' : 'सुरेश');
  });
  it('name only plus amount gives 0.7', () => {
    expect(parseVoiceEntry('Suresh ne paanch sau ek diye').confidence).toBe(0.7);
  });
  it('"de do 501" does not glue do onto 501', () => {
    expect(parseVoiceEntry('Suresh ne de do 501').amountRupees).toBe(501);
  });
  it('digit run beats a trailing name that looks like a number word', () => {
    expect(parseVoiceEntry('Mohan Das, 501').amountRupees).toBe(501);
  });
});

describe('parseVoiceEntry: robustness', () => {
  it.each(['', '   ', '???', ',,,', '12', 'ek', undefined as unknown as string, null as unknown as string, 42 as unknown as string])(
    'never throws on %p',
    (t) => {
      const r = parseVoiceEntry(t);
      expect(typeof r.confidence).toBe('number');
    },
  );
  it('empty => confidence 0', () => expect(parseVoiceEntry('')).toEqual({ confidence: 0 }));
  it('name without amount', () => {
    const r = parseVoiceEntry('Ramesh Kalu ka beta');
    expect(r.amountRupees).toBeUndefined();
    expect(r.name).toBe('Ramesh');
    expect(r.confidence).toBeLessThan(0.7);
  });
});
