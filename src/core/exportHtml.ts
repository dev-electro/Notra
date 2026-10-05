import { activeEntries, entryValuePaise, sortChronological } from './ledger';
import { INVITATION_LABEL, occasionName, DIRECTION_LABEL, STATUS_LABEL } from './labels';
import { displayDate } from './date';
import { formatINR } from './money';
import type { Entry, Household, NotraEvent } from './types';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CSS = `
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
body { font-family: 'Noto Sans Devanagari', sans-serif; color: #2A2118; font-size: 13pt; line-height: 1.6; margin: 0; }
.page { background: #FBF6EC; padding: 12px 14px; border-left: 4px solid #E8A317; }
h1 { color: #1F3A93; font-size: 21pt; line-height: 1.5; margin: 0 0 4px; }
.sub { color: #5A5148; margin: 0 0 12px; line-height: 1.6; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
th { background: #E4E9F7; color: #1F3A93; text-align: left; border-bottom: 2px solid #1F3A93; padding: 6px 8px; line-height: 1.6; vertical-align: middle; }
td { padding: 6px 8px; border-bottom: 1px solid #E7DCC8; vertical-align: middle; line-height: 1.6; }
tr { page-break-inside: avoid; }
tbody tr:nth-child(even) td { background: #F3EBDA; }
td.n, th.n { text-align: right; white-space: nowrap; }
.small { font-size: 10.5pt; line-height: 1.6; color: #5A5148; }
.blue { color: #1F3A93; } .red { color: #9E2A2B; }
.total { font-size: 15pt; font-weight: 700; line-height: 1.6; margin-top: 12px; padding: 8px 12px; border: 2px solid #1F3A93; border-radius: 6px; background: #FFFFFF; page-break-inside: avoid; }
.foot { margin-top: 16px; font-size: 10pt; color: #5A5148; }
`;

function wrap(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${CSS}</style></head><body><div class="page">${body}<div class="foot">नोतरा बुक</div></div></body></html>`;
}

function who(h: Household | undefined): string {
  if (!h) return '—';
  const sub = [h.fatherName && `${h.fatherName} का`, h.village].filter(Boolean).join(', ');
  return `${escapeHtml(h.headName)}<div class="small">${escapeHtml(sub)}</div>`;
}

function kind(e: Entry): string {
  return e.inKindItem ? ` + ${escapeHtml(e.inKindItem)}` : '';
}

/** Event ledger (who gave how much at this event), one printable page set. */
export function eventLedgerHtml(event: NotraEvent, host: Household | undefined, entries: readonly Entry[], households: readonly Household[]): string {
  const byId = new Map(households.map((h) => [h.id, h]));
  const rows = sortChronological(activeEntries(entries));
  let total = 0;
  const body = rows
    .map((e, i) => {
      total += entryValuePaise(e);
      return `<tr><td>${i + 1}</td><td>${who(byId.get(e.otherHouseholdId))}</td><td class="n blue">${formatINR(e.cashPaise)}${kind(e)}</td></tr>`;
    })
    .join('');
  const givers = new Set(rows.map((e) => e.otherHouseholdId)).size;
  return wrap(
    'नोतरा बही',
    `<h1>${escapeHtml(occasionName(event.occasion, event.occasionLabel))} का नोतरा</h1>
<p class="sub">${escapeHtml(host?.headName ?? '')} · ${displayDate(event.date)} · ${INVITATION_LABEL[event.invitationType]} · ${STATUS_LABEL[event.status]}</p>
<table><thead><tr><th>#</th><th>नाम / पिता / गाँव</th><th class="n">रकम</th></tr></thead><tbody>${body}</tbody></table>
<div class="total blue">कुल: ${formatINR(total)} (${givers} परिवार)</div>`,
  );
}

/** Person (Lena-Dena) ledger for one household. Neutral wording: "लौटाना बाकी". */
export function personLedgerHtml(household: Household, entries: readonly Entry[]): string {
  const rows = sortChronological(activeEntries(entries));
  let given = 0;
  let received = 0;
  const body = rows
    .map((e) => {
      const v = entryValuePaise(e);
      if (e.direction === 'AAYA') received += v;
      else given += v;
      const cls = e.direction === 'AAYA' ? 'blue' : 'red';
      return `<tr><td>${displayDate(e.createdAt)}</td><td class="${cls}">${DIRECTION_LABEL[e.direction]}</td><td class="n ${cls}">${formatINR(e.cashPaise)}${kind(e)}</td></tr>`;
    })
    .join('');
  const pending = received - given;
  return wrap(
    'लेना-देना',
    `<h1>${escapeHtml(household.headName)}</h1>
<p class="sub">${who(household).replace(/<div class="small">|<\/div>/g, ' ')} ${escapeHtml([household.village, household.panchayat, household.tehsil, household.district].filter(Boolean).join(' · '))}</p>
<table><thead><tr><th>तारीख</th><th></th><th class="n">रकम</th></tr></thead><tbody>${body}</tbody></table>
<div class="total"><span class="red">कुल दिया: ${formatINR(given)}</span> · <span class="blue">कुल आया: ${formatINR(received)}</span></div>
${pending > 0 ? `<div class="total">लौटाना बाकी: ${formatINR(pending)}</div>` : ''}`,
  );
}
