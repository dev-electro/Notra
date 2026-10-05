import { CONTACT, LEGAL, LEGAL_UPDATED, type LegalDoc, type LegalId } from '../../src/legal/content';

/**
 * Public, static pages for the Play Store listing: /privacy, /terms, /grievance, /delete-account.
 * The text comes from src/legal/content.ts, the same file the app's legal screens use.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function body(doc: LegalDoc): string {
  const block = (lang: 'hi' | 'en') =>
    doc.sections
      .map((s) => `<section><h2>${esc(s[lang].h)}</h2>${s[lang].p.map((p) => `<p>${esc(p)}</p>`).join('')}</section>`)
      .join('');
  return `<h1>${esc(doc.titleHi)}</h1>${block('hi')}<hr><h1 lang="en">${esc(doc.titleEn)}</h1><div lang="en">${block('en')}</div>`;
}

export function renderPage(id: LegalId): string {
  const doc = LEGAL[id];
  return `<!doctype html>
<html lang="hi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.titleHi)} · ${esc(doc.titleEn)} — Notra Diary</title>
<style>
body{margin:0;background:#fbf7ec;color:#1b1b1f;font:18px/1.7 system-ui,"Noto Sans Devanagari","Mangal",sans-serif}
main{max-width:720px;margin:0 auto;padding:16px 16px 48px}
h1{color:#1f3a8a;font-size:28px;line-height:1.3}
h2{color:#1f3a8a;font-size:20px;margin:24px 0 0}
p{margin:8px 0}
hr{border:0;border-top:2px solid #cfd8e6;margin:40px 0}
footer{color:#5b5b66;font-size:14px;margin-top:32px}
a{color:#1f3a8a}
nav{margin-bottom:16px;font-size:16px}
</style>
</head>
<body>
<main>
<nav><a href="/privacy">गोपनीयता / Privacy</a> · <a href="/terms">नियम / Terms</a> · <a href="/grievance">शिकायत / Grievance</a> · <a href="/delete-account">खाता हटाएं / Delete account</a></nav>
${body(doc)}
<footer>Notra Diary (नोतरा डायरी) · ${esc(CONTACT.email)} · ${LEGAL_UPDATED}</footer>
</main>
</body>
</html>`;
}

export const PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'public, max-age=3600',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
  'referrer-policy': 'no-referrer',
} as const;
