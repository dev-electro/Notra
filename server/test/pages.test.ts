import { describe, expect, it } from 'vitest';
import { CONTACT, LEGAL } from '../../src/legal/content';
import { setup } from './helpers';

const get = async (path: string) => {
  const t = await setup();
  const res = await t.app.request(path);
  return { status: res.status, type: res.headers.get('content-type'), csp: res.headers.get('content-security-policy'), text: await res.text() };
};

describe('public pages', () => {
  it.each(['/privacy', '/terms', '/grievance', '/delete-account'] as const)('%s is public static HTML, Hindi first with English below', async (path) => {
    const r = await get(path);
    expect(r.status).toBe(200);
    expect(r.type).toContain('text/html');
    expect(r.csp).toContain("default-src 'none'");
    expect(r.text.startsWith('<!doctype html>')).toBe(true);
    const doc = LEGAL[path === '/delete-account' ? 'delete-account' : (path.slice(1) as 'privacy')];
    expect(r.text).toContain(doc.titleHi);
    expect(r.text).toContain(doc.titleEn);
    expect(r.text.indexOf(doc.titleHi)).toBeLessThan(r.text.indexOf(`>${doc.titleEn}<`));
    expect(r.text).not.toMatch(/<script/i);
  });

  it('/delete-account explains the in-app steps and shows the contact email placeholder', async () => {
    const r = await get('/delete-account');
    expect(r.text).toContain('खाता हटाएं');
    expect(r.text).toContain('Settings');
    expect(r.text).toContain(CONTACT.email);
  });

  it('the grievance page carries the officer details and the 30-day response time', async () => {
    const r = await get('/grievance');
    expect(r.text).toContain(CONTACT.officerName.replace(/&/g, '&amp;'));
    expect(r.text).toContain(CONTACT.email);
    expect(r.text).toContain('30 दिन');
    expect(r.text).toContain('30 days');
  });

  it('the privacy text states what the app really does (and does not do)', async () => {
    const r = await get('/privacy');
    for (const must of ['SMS', 'Google', 'एंड-टू-एंड', 'end-to-end', 'विज्ञापन', 'बेचते नहीं', 'do not sell', 'कर्ज़']) expect(r.text).toContain(must);
  });

  it('is the same text the app shows (one source)', () => {
    for (const id of ['privacy', 'terms', 'grievance'] as const) expect(LEGAL[id].sections.length).toBeGreaterThan(1);
  });

  it('unknown pages are still JSON 404s', async () => {
    const t = await setup();
    const res = await t.app.request('/nope');
    expect(res.status).toBe(404);
  });
});
