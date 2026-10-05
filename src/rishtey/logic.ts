/**
 * रिश्ते community discovery: the pure parts (what becomes public, prefill from the local biodata, validation, Hindi messages).
 * No React / Expo / network imports. The server (server/src/rishtey.ts) is the authority; this only helps the person fill the form.
 */
import type { Biodata } from '@/core';

export type Gender = 'male' | 'female';
export type PublishedBy = 'self' | 'parent' | 'guardian' | 'sibling';
export type ProfileStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'hidden';
export type MyInterest = 'sent' | 'received' | 'accepted' | null;

export const PUBLISHED_BY: readonly { id: PublishedBy; label: string }[] = [
  { id: 'self', label: 'मैं खुद' },
  { id: 'parent', label: 'माता-पिता' },
  { id: 'guardian', label: 'अभिभावक' },
  { id: 'sibling', label: 'भाई-बहन' },
];

export const GENDER_LABEL: Record<Gender, string> = { female: 'लड़की', male: 'लड़का' };

/** Exactly what becomes visible to other people once approved. The consent screen lists THESE, word for word. */
export const PUBLIC_ITEMS: readonly string[] = [
  'पहला नाम',
  'उम्र (जन्म तारीख़ नहीं)',
  'लड़का या लड़की',
  'कद',
  'गोत्र',
  'शिक्षा और व्यवसाय',
  'ज़िला और राज्य',
  'यह जानकारी कौन डाल रहा है',
];
export const PRIVATE_NOTE = 'आपका संपर्क नंबर कभी सबको नहीं दिखता। वह सिर्फ़ उसे मिलता है जिसकी रुचि आप स्वीकार करें, या जिसने आपकी रुचि स्वीकार की।';
export const CONSENT_LINE = 'मैं समझता/समझती हूँ कि ऊपर की जानकारी जाँच के बाद समाज के लोगों को दिखेगी। मैं कभी भी इसे छिपा या हटा सकता/सकती हूँ।';

export const STATUS_LABEL: Record<ProfileStatus, string> = {
  draft: 'ड्राफ़्ट',
  pending: 'जाँच में है',
  approved: 'दिख रहा है',
  rejected: 'स्वीकार नहीं हुआ',
  hidden: 'छिपा है',
};

export interface ServerProfile {
  id: string;
  status: ProfileStatus;
  published_by: PublishedBy;
  gender: Gender | null;
  first_name: string | null;
  age: number | null;
  height_cm: number | null;
  gotra: string | null;
  education: string | null;
  occupation: string | null;
  district: string | null;
  state: string | null;
  contact: string | null;
  reject_reason: string | null;
}

/** What other people see (server rishtey_search / rishtey_get_public). */
export interface PublicProfile {
  id: string;
  first_name: string;
  age: number;
  gender: Gender;
  height_cm: number | null;
  gotra: string | null;
  education: string | null;
  occupation: string | null;
  district: string | null;
  state: string | null;
  published_by: PublishedBy;
  my_interest?: MyInterest;
}

/** The form: every value is text while typing. */
export interface ShareDraft {
  first_name: string;
  gender: Gender | null;
  age: string;
  height_cm: string;
  gotra: string;
  education: string;
  occupation: string;
  district: string;
  state: string;
  contact: string;
  published_by: PublishedBy;
}

export const EMPTY_DRAFT: ShareDraft = {
  first_name: '', gender: null, age: '', height_cm: '', gotra: '', education: '', occupation: '', district: '', state: 'राजस्थान', contact: '', published_by: 'self',
};

const DEVANAGARI_DIGITS = '०१२३४५६७८९';
/** "१५/०८/१९९८" -> "15/08/1998". */
const latinDigits = (s: string) => s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));

/** Whole years from a typed birth date (dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy or yyyy-mm-dd), or '' when it cannot be read. The date itself is never sent. */
export function ageFromDob(dob: string, now: Date): string {
  const t = latinDigits(dob).trim();
  let d: number, m: number, y: number;
  let r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (r) [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else return '';
  if (m < 1 || m > 12 || d < 1 || d > 31) return '';
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age >= 18 && age <= 80 ? String(age) : '';
}

/** "168", "168 cm", "5 ft 6 in", "5'6", "5.6" -> centimetres as text, or ''. */
export function heightCm(text: string): string {
  const t = latinDigits(text).toLowerCase().trim();
  const ft = /^(\d)\s*(?:ft|feet|foot|'|’|\.|फ़ुट|फीट|फुट)\s*(\d{1,2})?\s*(?:in|inch|inches|"|”|इंच)?$/.exec(t);
  if (ft) return String(Math.round(Number(ft[1]) * 30.48 + Number(ft[2] ?? 0) * 2.54));
  const cm = /^(\d{3})\s*(?:cm|सेमी)?$/.exec(t);
  if (cm) {
    const n = Number(cm[1]);
    return n >= 100 && n <= 230 ? String(n) : '';
  }
  return '';
}

/** Start the form from the local biodata so the person types as little as possible. Only fields that exist in the biodata; the rest stay empty. */
export function draftFromBiodata(b: Biodata | null, now: Date): ShareDraft {
  if (!b) return { ...EMPTY_DRAFT };
  return {
    ...EMPTY_DRAFT,
    first_name: b.name.trim().split(/\s+/)[0] ?? '',
    age: ageFromDob(b.dobDate, now),
    height_cm: heightCm(b.height),
    gotra: b.gotra.trim(),
    education: b.education.trim(),
    occupation: b.occupation.trim(),
    contact: b.contact.replace(/[^0-9+ -]/g, '').trim(),
  };
}

export function draftFromServer(p: ServerProfile): ShareDraft {
  return {
    first_name: p.first_name ?? '', gender: p.gender, age: p.age === null ? '' : String(p.age), height_cm: p.height_cm === null ? '' : String(p.height_cm),
    gotra: p.gotra ?? '', education: p.education ?? '', occupation: p.occupation ?? '', district: p.district ?? '', state: p.state ?? '', contact: p.contact ?? '',
    published_by: p.published_by,
  };
}

export type DraftProblem = 'first_name' | 'gender' | 'age' | 'contact' | 'height_cm';
const DIGITS = (s: string) => latinDigits(s).replace(/\D/g, '');

/** What is missing or wrong, in form order. Empty = can be sent for review. */
export function draftProblems(d: ShareDraft): DraftProblem[] {
  const out: DraftProblem[] = [];
  if (!d.first_name.trim()) out.push('first_name');
  if (!d.gender) out.push('gender');
  const age = Number(latinDigits(d.age));
  if (!Number.isInteger(age) || age < 18 || age > 80) out.push('age');
  if (d.height_cm.trim()) {
    const h = Number(latinDigits(d.height_cm));
    if (!Number.isInteger(h) || h < 100 || h > 230) out.push('height_cm');
  }
  if (DIGITS(d.contact).length < 10) out.push('contact');
  return out;
}

export const PROBLEM_LABEL: Record<DraftProblem, string> = {
  first_name: 'पहला नाम लिखें',
  gender: 'लड़का या लड़की चुनें',
  age: 'उम्र 18 से 80 के बीच लिखें',
  height_cm: 'कद सेंटीमीटर में लिखें (जैसे 165)',
  contact: 'संपर्क नंबर लिखें (10 अंक)',
};

const nul = (s: string) => (s.trim() ? s.trim() : null);

/** The PUT /v1/rishtey/profile body. */
export function toProfileBody(d: ShareDraft) {
  return {
    gender: d.gender,
    first_name: nul(d.first_name),
    age: d.age.trim() ? Number(latinDigits(d.age)) : null,
    height_cm: d.height_cm.trim() ? Number(latinDigits(d.height_cm)) : null,
    gotra: nul(d.gotra), education: nul(d.education), occupation: nul(d.occupation), district: nul(d.district), state: nul(d.state),
    contact: nul(latinDigits(d.contact)),
    published_by: d.published_by,
  };
}

/** One line under the name: "ज़िला, राज्य" or just what is there. */
export const placeOf = (p: Pick<PublicProfile, 'district' | 'state'>): string => [p.district, p.state].filter((x) => x && x.trim()).join(', ');
export const heightLabel = (cm: number | null): string => (cm ? `${cm} सेमी` : '');

export interface SearchFilters {
  gender: Gender;
  ageMin: string;
  ageMax: string;
  district: string;
  sameGotra: boolean;
}

/** Query string for GET /v1/rishtey/search. Empty or unreadable filters are left out. */
export function searchQuery(f: SearchFilters, offset = 0): string {
  const p: [string, string][] = [['gender', f.gender]];
  const lo = Number(latinDigits(f.ageMin));
  const hi = Number(latinDigits(f.ageMax));
  if (Number.isInteger(lo) && lo >= 18 && lo <= 80) p.push(['age_min', String(lo)]);
  if (Number.isInteger(hi) && hi >= 18 && hi <= 80) p.push(['age_max', String(hi)]);
  if (f.district.trim()) p.push(['district', f.district.trim()]);
  if (f.sameGotra) p.push(['same_gotra', '1']);
  if (offset > 0) p.push(['offset', String(offset)]);
  return p.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

/** Show the opposite gender of my own profile first. */
export const defaultSeeking = (mine: Gender | null): Gender => (mine === 'male' ? 'female' : 'male');

export const INTEREST_LABEL: Record<'sent' | 'received' | 'accepted', string> = { sent: 'रुचि भेजी', received: 'आपको रुचि भेजी', accepted: 'दोनों राज़ी' };

export type ReportReason = 'fake' | 'inappropriate' | 'spam' | 'harassment' | 'other';
export const REPORT_REASONS: readonly { id: ReportReason; label: string }[] = [
  { id: 'fake', label: 'झूठी जानकारी' },
  { id: 'inappropriate', label: 'अनुचित' },
  { id: 'spam', label: 'स्पैम' },
  { id: 'harassment', label: 'परेशान किया' },
  { id: 'other', label: 'कुछ और' },
];

/** The server's error code -> plain Hindi. */
export function errorMessageHi(status: number | null, code: string | null): string {
  switch (code) {
    case 'phone_not_verified': return 'पहले अपना फ़ोन नंबर पक्का करें (सेटिंग्स में फ़ोन से साइन इन करें)।';
    case 'consent_required': return 'आगे बढ़ने के लिए सहमति का निशान लगाएँ।';
    case 'incomplete': return 'कुछ ज़रूरी जानकारी बाकी है।';
    case 'profile_not_approved': return 'आपकी जानकारी की जाँच पूरी होने के बाद ही आप खोज सकेंगे।';
    case 'interest_cap': return 'आज की 10 रुचि पूरी हो गईं। कल फिर कोशिश करें।';
    case 'interest_exists': return 'आप पहले ही रुचि भेज चुके हैं।';
    case 'contact_not_allowed': return 'संपर्क तब दिखेगा जब दोनों तरफ़ से रुचि स्वीकार हो।';
    case 'invalid_input': return 'जानकारी जाँचें और फिर कोशिश करें।';
  }
  if (status === 404) return 'यह सुविधा अभी उपलब्ध नहीं है।';
  if (status === 401) return 'पहले साइन इन करें।';
  if (status === 429) return 'थोड़ी देर बाद फिर कोशिश करें।';
  return 'इंटरनेट नहीं है, दोबारा कोशिश करें।';
}
