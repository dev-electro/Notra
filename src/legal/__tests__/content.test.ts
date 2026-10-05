import { CONTACT, LEGAL, LEGAL_UPDATED } from '../content';

const all = (id: keyof typeof LEGAL, lang: 'hi' | 'en') =>
  LEGAL[id].sections.map((s) => `${s[lang].h}\n${s[lang].p.join('\n')}`).join('\n');

describe('legal text', () => {
  it('every document has Hindi and English for every section', () => {
    for (const doc of Object.values(LEGAL)) {
      expect(doc.titleHi.length).toBeGreaterThan(0);
      expect(doc.titleEn.length).toBeGreaterThan(0);
      expect(doc.sections.length).toBeGreaterThan(0);
      for (const s of doc.sections) {
        for (const l of [s.hi, s.en]) {
          expect(l.h.trim()).not.toBe('');
          expect(l.p.length).toBeGreaterThan(0);
          l.p.forEach((p) => expect(p.trim()).not.toBe(''));
        }
        expect(s.hi.p.length).toBe(s.en.p.length); // same content in both languages
        expect(/[ऀ-ॿ]/.test(s.hi.h)).toBe(true);
      }
    }
  });

  it('privacy text matches what the app really does', () => {
    const hi = all('privacy', 'hi');
    const en = all('privacy', 'en');
    for (const must of ['एनक्रिप्टेड', 'ऑफ़लाइन|बिना इंटरनेट', 'संपर्क.*SMS|SMS', 'विज्ञापन', 'बेचते नहीं', 'कर्ज़', 'खाता हटाएं', 'Google', 'मोबाइल नंबर', 'एंड-टू-एंड']) {
      expect(new RegExp(must).test(hi)).toBe(true);
    }
    for (const must of ['encrypted database', 'without internet', 'contacts, SMS, call log', 'no ads|ads', 'do not sell', 'no loans', 'Delete account', 'not end-to-end', 'Data Protection Board']) {
      expect(new RegExp(must, 'i').test(en)).toBe(true);
    }
    // it must not promise things the app does not do
    expect(en).not.toMatch(/we (use|collect) (your )?(contacts|location)/i);
    expect(en).not.toMatch(/analytics (are|is) used|we use analytics/i);
  });

  it('grievance officer: placeholder name/email/phone and the 30-day response time', () => {
    const hi = all('grievance', 'hi');
    const en = all('grievance', 'en');
    expect(CONTACT.responseDays).toBe(30);
    for (const v of [CONTACT.officerName, CONTACT.email, CONTACT.phone]) {
      expect(hi).toContain(v);
      expect(en).toContain(v);
    }
    expect(hi).toContain('30 दिन');
    expect(en).toContain('30 days');
  });

  it('terms say the app is a diary, not a lender, and entries are append-only', () => {
    const en = all('terms', 'en');
    expect(en).toMatch(/not a bank/i);
    expect(en).toMatch(/no loans or interest/i);
    expect(en).toMatch(/not erased/i);
    expect(all('terms', 'hi')).toContain('कर्ज़');
  });

  it('delete-account page explains the in-app steps and the email route', () => {
    const hi = all('delete-account', 'hi');
    expect(hi).toContain('सेटिंग');
    expect(hi).toContain('खाता हटाएं');
    expect(hi).toContain(CONTACT.email);
    expect(all('delete-account', 'en')).toContain(CONTACT.email);
  });

  it('every document opens with 3-4 plain summary bullets in both languages', () => {
    for (const d of Object.values(LEGAL)) {
      expect(d.summary.hi.length).toBeGreaterThanOrEqual(3);
      expect(d.summary.hi.length).toBeLessThanOrEqual(4);
      expect(d.summary.en.length).toBe(d.summary.hi.length);
    }
  });

  it('uses neutral wording, never "defaulter"', () => {
    for (const id of Object.keys(LEGAL) as (keyof typeof LEGAL)[]) {
      expect(all(id, 'en').toLowerCase()).not.toContain('defaulter');
      expect(all(id, 'hi')).not.toContain('डिफ़ॉल्टर');
    }
  });

  it('placeholders are obviously placeholders and dated', () => {
    expect(CONTACT.email).toMatch(/\.example$/);
    expect(LEGAL_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
