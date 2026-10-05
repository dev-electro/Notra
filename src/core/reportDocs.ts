import { escapeHtml } from './exportHtml';
import { displayDate } from './date';
import { longDateHi } from './calendar';
import { MONTHS_HI, OCCASION_LABEL, occasionName } from './labels';
import { formatINR } from './money';
import type { OccasionRow } from './reports';
import type { Occasion } from './types';
import { LEGACY_EVENT_LABEL } from './eventRules';

/**
 * Printable report model. ONE structure feeds the on-phone image sheet (react-native-view-shot) and the PDF HTML, so a
 * report looks the same everywhere. Builders below turn SQL rows into a doc; they are pure and unit-tested.
 */
export type Tone = 'received' | 'given' | 'ink' | 'muted';
export interface ReportColumn {
  label: string;
  flex: number;
  align?: 'left' | 'right';
}
export interface ReportCell {
  text: string;
  sub?: string;
  tone?: Tone;
}
export interface ReportTotal {
  label: string;
  value: string;
  tone?: Tone;
}
export interface ReportDoc {
  id: string;
  title: string;
  /** my household's name, printed in the header */
  familyName: string;
  /** "साल: 2026", "तारीख: 01/01/2026 से 31/03/2026" */
  filters: string[];
  /** ISO date */
  generatedOn: string;
  columns: ReportColumn[];
  rows: ReportCell[][];
  totals: ReportTotal[];
  /** a short line under the title (e.g. the event) */
  subtitle?: string;
  /** a plain-words note printed at the bottom */
  note?: string;
}
export interface ReportMeta {
  familyName: string;
  filters: string[];
  generatedOn: string;
}

const f = (p: number) => formatINR(p);
const who = (name: string, father: string, village: string): ReportCell => ({
  text: name,
  sub: [father && `${father} का`, village].filter(Boolean).join(' · ') || undefined,
});
/** Total value as the main text; with an in-kind item the sub line says how it splits ("नकद ₹500 + घी ₹200"). */
const amount = (cash: number, item: string | null | undefined, kindValue: number, tone: Tone): ReportCell => ({
  text: f(cash + kindValue),
  sub: item ? `${cash > 0 ? `नकद ${f(cash)} + ` : ''}${item}${kindValue > 0 ? ` ${f(kindValue)}` : ''}` : undefined,
  tone,
});
const utarChadhav = (utar: number, chadhav: number): ReportCell => ({
  text: utar > 0 ? `उतार ${f(utar)}` : 'उतार —',
  sub: chadhav > 0 ? `चढ़ाव ${f(chadhav)}` : 'चढ़ाव —',
});
const programName = (occasion: Occasion | null, legacy: boolean, label?: string | null): string =>
  legacy ? LEGACY_EVENT_LABEL : occasion ? occasionName(occasion, label) : '—';

// ---------- a. किसको, किस दिन, कितना दिया ----------
export interface GivenRow {
  date: string;
  name: string;
  father: string;
  village: string;
  occasion: Occasion | null;
  occasionLabel?: string | null;
  eventDate: string | null;
  legacy: boolean;
  cashPaise: number;
  inKindItem: string | null;
  inKindValuePaise: number;
  utarPaise: number;
  chadhavPaise: number;
}
export interface GivenTotals {
  count: number;
  totalPaise: number;
  utarPaise: number;
  chadhavPaise: number;
}
export function givenDoc(rows: readonly GivenRow[], t: GivenTotals, m: ReportMeta): ReportDoc {
  return {
    id: 'given', title: 'किसको, किस दिन, कितना दिया', ...m,
    columns: [
      { label: 'तारीख', flex: 1.1 }, { label: 'परिवार', flex: 2.3 }, { label: 'कार्यक्रम', flex: 1.4 },
      { label: 'रकम', flex: 1.3, align: 'right' }, { label: 'उतार / चढ़ाव', flex: 1.6, align: 'right' },
    ],
    rows: rows.map((r) => [
      { text: displayDate(r.date) }, who(r.name, r.father, r.village),
      { text: programName(r.occasion, r.legacy, r.occasionLabel), sub: r.eventDate && !r.legacy ? displayDate(r.eventDate) : undefined },
      amount(r.cashPaise, r.inKindItem, r.inKindValuePaise, 'given'),
      utarChadhav(r.utarPaise, r.chadhavPaise),
    ]),
    totals: [
      { label: `कुल दिया (${t.count} एंट्री)`, value: f(t.totalPaise), tone: 'given' },
      { label: 'कुल उतार', value: f(t.utarPaise) },
      { label: 'कुल चढ़ाव', value: f(t.chadhavPaise) },
    ],
  };
}

// ---------- b. मेरे प्रोग्राम में कौन आया ----------
export interface GuestRow {
  name: string;
  father: string;
  village: string;
  cashPaise: number;
  inKindItem: string | null;
  inKindValuePaise: number;
  utarPaise: number;
  chadhavPaise: number;
}
export interface GuestTotals {
  givers: number;
  totalPaise: number;
  utarPaise: number;
  chadhavPaise: number;
}
export function guestsDoc(eventLabel: string, rows: readonly GuestRow[], t: GuestTotals, m: ReportMeta): ReportDoc {
  return {
    id: 'guests', title: 'मेरे प्रोग्राम में कौन आया', subtitle: eventLabel, ...m,
    columns: [
      { label: '#', flex: 0.5 }, { label: 'परिवार', flex: 2.6 }, { label: 'रकम', flex: 1.4, align: 'right' },
      { label: 'उतार / चढ़ाव', flex: 1.7, align: 'right' },
    ],
    rows: rows.map((r, i) => [
      { text: String(i + 1) }, who(r.name, r.father, r.village),
      amount(r.cashPaise, r.inKindItem, r.inKindValuePaise, 'received'),
      utarChadhav(r.utarPaise, r.chadhavPaise),
    ]),
    totals: [
      { label: `कुल मिला (${t.givers} परिवार)`, value: f(t.totalPaise), tone: 'received' },
      { label: 'कुल उतार', value: f(t.utarPaise) },
      { label: 'कुल चढ़ाव', value: f(t.chadhavPaise) },
    ],
  };
}

// ---------- c. साल भर का हिसाब ----------
export interface MonthRow {
  month: number;
  givenPaise: number;
  receivedPaise: number;
  entries: number;
}
export interface YearSummary {
  year: number;
  givenPaise: number;
  receivedPaise: number;
  hosted: number;
  attended: number;
  months: MonthRow[];
  /** उतार/चढ़ाव of the entries I gave (GAYA) and the entries I received (AAYA) */
  givenUtar: number;
  givenChadhav: number;
  receivedUtar: number;
  receivedChadhav: number;
}
export function yearDoc(s: YearSummary, m: ReportMeta): ReportDoc {
  return {
    id: 'year', title: 'साल भर का हिसाब', subtitle: `साल ${s.year}`, ...m,
    columns: [
      { label: 'महीना', flex: 1.6 }, { label: 'मिला', flex: 1.4, align: 'right' },
      { label: 'दिया', flex: 1.4, align: 'right' }, { label: 'एंट्री', flex: 0.8, align: 'right' },
    ],
    rows: s.months.map((r) => [
      { text: MONTHS_HI[r.month - 1] },
      { text: f(r.receivedPaise), tone: 'received' }, { text: f(r.givenPaise), tone: 'given' }, { text: String(r.entries) },
    ]),
    totals: [
      { label: 'कुल मिला', value: f(s.receivedPaise), tone: 'received' },
      { label: 'कुल दिया', value: f(s.givenPaise), tone: 'given' },
      { label: 'मेरे नोतरे (मैंने बुलाए)', value: String(s.hosted) },
      { label: 'दूसरों के नोतरे में गया', value: String(s.attended) },
      { label: 'कुल उतार', value: f(s.givenUtar + s.receivedUtar) },
      { label: 'कुल चढ़ाव', value: f(s.givenChadhav + s.receivedChadhav) },
      { label: 'दिया: उतार / चढ़ाव', value: `${f(s.givenUtar)} / ${f(s.givenChadhav)}`, tone: 'given' },
      { label: 'मिला: उतार / चढ़ाव', value: `${f(s.receivedUtar)} / ${f(s.receivedChadhav)}`, tone: 'received' },
    ],
  };
}

// ---------- d. मेरे नोतरे में कौन नहीं आया (private) ----------
export interface NotComeRow {
  name: string;
  father: string;
  village: string;
  /** what I gave them minus what they gave me, before the event: > 0 */
  pendingPaise: number;
}
export function notComeDoc(eventLabel: string, rows: readonly NotComeRow[], m: ReportMeta): ReportDoc {
  return {
    id: 'notcome', title: 'मेरे नोतरे में कौन नहीं आया', subtitle: eventLabel, ...m,
    note: 'ये वे परिवार हैं जिनका नोतरा मैंने दिया था और जिनका लौटाना बाकी था, पर इस कार्यक्रम में उनकी एंट्री नहीं है। यह सूची सिर्फ़ मेरे लिए है।',
    columns: [{ label: '#', flex: 0.5 }, { label: 'परिवार', flex: 3 }, { label: 'लौटाना बाकी', flex: 1.5, align: 'right' }],
    rows: rows.map((r, i) => [{ text: String(i + 1) }, who(r.name, r.father, r.village), { text: f(r.pendingPaise), tone: 'given' }]),
    totals: [{ label: `कुल बाकी (${rows.length} परिवार)`, value: f(rows.reduce((a, r) => a + r.pendingPaise, 0)), tone: 'given' }],
  };
}

// ---------- e. person-wise, pending, occasion-wise, self ledger ----------
export interface PersonDocRow {
  name: string;
  father: string;
  village: string;
  receivedPaise: number;
  givenPaise: number;
}
export function personDoc(rows: readonly PersonDocRow[], m: ReportMeta): ReportDoc {
  const rec = rows.reduce((a, r) => a + r.receivedPaise, 0);
  const giv = rows.reduce((a, r) => a + r.givenPaise, 0);
  return {
    id: 'person', title: 'किसका कितना', ...m,
    columns: [
      { label: 'परिवार', flex: 2.6 }, { label: 'मिला', flex: 1.3, align: 'right' },
      { label: 'दिया', flex: 1.3, align: 'right' }, { label: 'लौटाना बाकी', flex: 1.4, align: 'right' },
    ],
    rows: rows.map((r) => [
      who(r.name, r.father, r.village), { text: f(r.receivedPaise), tone: 'received' }, { text: f(r.givenPaise), tone: 'given' },
      { text: r.receivedPaise > r.givenPaise ? f(r.receivedPaise - r.givenPaise) : '—' },
    ]),
    totals: [{ label: 'कुल मिला', value: f(rec), tone: 'received' }, { label: 'कुल दिया', value: f(giv), tone: 'given' }],
  };
}

export function pendingDoc(rows: readonly PersonDocRow[], m: ReportMeta): ReportDoc {
  const pend = rows.filter((r) => r.receivedPaise > r.givenPaise);
  return {
    id: 'pending', title: 'लौटाना बाकी', ...m,
    columns: [{ label: 'परिवार', flex: 2.8 }, { label: 'मिला', flex: 1.2, align: 'right' }, { label: 'दिया', flex: 1.2, align: 'right' }, { label: 'लौटाना बाकी', flex: 1.4, align: 'right' }],
    rows: pend.map((r) => [
      who(r.name, r.father, r.village), { text: f(r.receivedPaise), tone: 'received' }, { text: f(r.givenPaise), tone: 'given' },
      { text: f(r.receivedPaise - r.givenPaise), tone: 'given' },
    ]),
    totals: [{ label: `कुल लौटाना बाकी (${pend.length} परिवार)`, value: f(pend.reduce((a, r) => a + r.receivedPaise - r.givenPaise, 0)), tone: 'given' }],
  };
}

export function occasionDoc(rows: readonly OccasionRow[], m: ReportMeta): ReportDoc {
  return {
    id: 'occasion', title: 'अवसर के हिसाब से', ...m,
    columns: [{ label: 'अवसर', flex: 1.8 }, { label: 'मिला', flex: 1.4, align: 'right' }, { label: 'दिया', flex: 1.4, align: 'right' }, { label: 'कार्यक्रम', flex: 1, align: 'right' }],
    rows: rows.map((r) => [
      { text: OCCASION_LABEL[r.occasion] }, { text: f(r.totalReceived), tone: 'received' }, { text: f(r.totalGiven), tone: 'given' },
      { text: String(r.eventCount), sub: `${r.entryCount} एंट्री` },
    ]),
    totals: [
      { label: 'कुल मिला', value: f(rows.reduce((a, r) => a + r.totalReceived, 0)), tone: 'received' },
      { label: 'कुल दिया', value: f(rows.reduce((a, r) => a + r.totalGiven, 0)), tone: 'given' },
    ],
  };
}

export interface LedgerDocRow {
  date: string;
  direction: 'AAYA' | 'GAYA';
  program: string;
  cashPaise: number;
  inKindItem: string | null;
  inKindValuePaise: number;
  utarPaise: number;
  chadhavPaise: number;
  /** my net balance with this family after this row: given - received (> 0: they owe me, < 0: lautana baaki) */
  runningNet?: number;
  name?: string;
}

/** One family's full two-sided ledger (every मिला and दिया, with उतार/चढ़ाव). */
export function householdLedgerDoc(h: { name: string; father: string; village: string }, rows: readonly LedgerDocRow[], m: ReportMeta): ReportDoc {
  let rec = 0;
  let giv = 0;
  for (const r of rows) {
    if (r.direction === 'AAYA') rec += r.cashPaise + r.inKindValuePaise;
    else giv += r.cashPaise + r.inKindValuePaise;
  }
  const pending = rec - giv;
  return {
    id: 'ledger', title: `${h.name} का पूरा हिसाब`, subtitle: [h.father && `${h.father} का`, h.village].filter(Boolean).join(' · '), ...m,
    columns: [
      { label: 'तारीख', flex: 1.1 }, { label: 'मिला / दिया', flex: 1.2 }, { label: 'कार्यक्रम', flex: 1.4 },
      { label: 'रकम', flex: 1.3, align: 'right' }, { label: 'उतार / चढ़ाव', flex: 1.6, align: 'right' },
    ],
    rows: rows.map((r) => [
      { text: displayDate(r.date) },
      { text: r.direction === 'AAYA' ? 'मिला (आया)' : 'दिया (गया)', tone: r.direction === 'AAYA' ? 'received' : 'given' },
      { text: r.program },
      amount(r.cashPaise, r.inKindItem, r.inKindValuePaise, r.direction === 'AAYA' ? 'received' : 'given'),
      utarChadhav(r.utarPaise, r.chadhavPaise),
    ]),
    totals: [
      { label: 'कुल मिला', value: f(rec), tone: 'received' },
      { label: 'कुल दिया', value: f(giv), tone: 'given' },
      ...(pending > 0 ? [{ label: 'लौटाना बाकी', value: f(pending) }] : []),
    ],
  };
}

export function selfDoc(rows: readonly (LedgerDocRow & { name: string })[], m: ReportMeta): ReportDoc {
  return {
    id: 'self', title: 'मेरा खाता (क्रम से)', ...m,
    columns: [{ label: 'तारीख', flex: 1.1 }, { label: 'परिवार', flex: 2.2 }, { label: 'रकम', flex: 1.4, align: 'right' }, { label: 'जोड़', flex: 1.3, align: 'right' }],
    rows: rows.map((r) => [
      { text: displayDate(r.date) }, { text: r.name, sub: r.direction === 'AAYA' ? 'मिला' : 'दिया' },
      { text: f(r.cashPaise + r.inKindValuePaise), tone: r.direction === 'AAYA' ? 'received' : 'given' },
      { text: f(r.runningNet ?? 0) },
    ]),
    totals: [],
  };
}

// ---------- pages (image export: ~25 rows each) ----------
export const ROWS_PER_PAGE = 25;
export interface ReportPage {
  doc: ReportDoc;
  page: number;
  pages: number;
  /** totals and the note are drawn on the last page only */
  last: boolean;
}
export function paginateDoc(doc: ReportDoc, perPage = ROWS_PER_PAGE): ReportPage[] {
  const pages = Math.max(1, Math.ceil(doc.rows.length / perPage));
  return Array.from({ length: pages }, (_, i) => ({
    doc: { ...doc, rows: doc.rows.slice(i * perPage, (i + 1) * perPage) },
    page: i + 1,
    pages,
    last: i === pages - 1,
  }));
}

// ---------- PDF (HTML for expo-print) ----------
const PDF_CSS = `
@page { margin: 12mm; }
body { font-family: 'Noto Sans Devanagari', 'Noto Sans', sans-serif; color: #2A2118; font-size: 12pt; }
.page { background-color: #FBF6EC; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 31px, #E7DCC8 31px, #E7DCC8 32px); padding: 8px 8px 8px 36px; border-left: 3px solid #E8A317; }
.brand { color: #9E2A2B; font-size: 11pt; margin: 0; }
h1 { color: #1F3A93; font-size: 20pt; margin: 2px 0 2px; }
h2 { color: #2A2118; font-size: 14pt; margin: 0 0 4px; }
.sub { color: #5A5148; margin: 0 0 8px; font-size: 11pt; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; }
th { color: #1F3A93; text-align: left; border-bottom: 2px solid #1F3A93; padding: 4px; font-size: 11pt; }
td { padding: 4px; border-bottom: 1px solid #E7DCC8; vertical-align: top; }
tr { page-break-inside: avoid; }
td.r, th.r { text-align: right; white-space: nowrap; }
.small { font-size: 10pt; color: #5A5148; }
.received { color: #1F3A93; } .given { color: #9E2A2B; } .muted { color: #5A5148; }
.tot { display: flex; justify-content: space-between; font-size: 13pt; font-weight: 700; margin-top: 6px; }
.note { margin-top: 12px; font-size: 10.5pt; color: #5A5148; border: 1px solid #E7DCC8; padding: 6px; }
.foot { margin-top: 14px; font-size: 9.5pt; color: #5A5148; }
`;

const cls = (t?: Tone) => (t && t !== 'ink' ? ` class="${t}"` : '');

/** Printable HTML: header (family, report, filters, date), the table, totals. Used by expo-print. */
export function reportHtml(doc: ReportDoc): string {
  const head = doc.columns.map((c) => `<th${c.align === 'right' ? ' class="r"' : ''}>${escapeHtml(c.label)}</th>`).join('');
  const body = doc.rows
    .map((r) => `<tr>${r.map((c, i) => `<td${doc.columns[i]?.align === 'right' ? ' class="r"' : ''}><span${cls(c.tone)}>${escapeHtml(c.text)}</span>${c.sub ? `<div class="small">${escapeHtml(c.sub)}</div>` : ''}</td>`).join('')}</tr>`)
    .join('');
  const totals = doc.totals.map((t) => `<div class="tot"><span>${escapeHtml(t.label)}</span><span${cls(t.tone)}>${escapeHtml(t.value)}</span></div>`).join('');
  const filters = doc.filters.length ? `<p class="sub">${doc.filters.map(escapeHtml).join(' · ')}</p>` : '';
  return `<!DOCTYPE html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(doc.title)}</title><style>${PDF_CSS}</style></head><body><div class="page">
<p class="brand">नोतरा बुक${doc.familyName ? ` · ${escapeHtml(doc.familyName)} परिवार` : ''}</p>
<h1>${escapeHtml(doc.title)}</h1>
${doc.subtitle ? `<h2>${escapeHtml(doc.subtitle)}</h2>` : ''}${filters}
<table><tr>${head}</tr>${body}</table>
${totals}${doc.note ? `<div class="note">${escapeHtml(doc.note)}</div>` : ''}
<div class="foot">बनाया: ${longDateHi(doc.generatedOn)} · नोतरा बुक</div></div></body></html>`;
}
