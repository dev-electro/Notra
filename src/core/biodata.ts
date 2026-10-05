/**
 * रिश्ते: the person's own marriage biodata. Local only: it is kept as one JSON value in the encrypted on-phone settings store
 * and is never sent anywhere except when the person shares the picture / PDF themselves.
 */
export const BIODATA_KEY = 'biodata_v1';

export interface Biodata {
  name: string;
  dobDate: string;
  dobTime: string;
  birthPlace: string;
  height: string;
  gotra: string;
  education: string;
  occupation: string;
  father: string;
  mother: string;
  siblings: string;
  address: string;
  contact: string;
  /** Local file URI of the photo (never uploaded). */
  photoUri: string;
}

export const EMPTY_BIODATA: Biodata = {
  name: '', dobDate: '', dobTime: '', birthPlace: '', height: '', gotra: '', education: '', occupation: '',
  father: '', mother: '', siblings: '', address: '', contact: '', photoUri: '',
};

const MAX_LEN = 300;

/** Safe parse of the stored value: unknown keys dropped, non-strings ignored, values trimmed and capped. */
export function parseBiodata(raw: string | null | undefined): Biodata | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const out: Biodata = { ...EMPTY_BIODATA };
  for (const k of Object.keys(EMPTY_BIODATA) as (keyof Biodata)[]) {
    const v = (obj as Record<string, unknown>)[k];
    if (typeof v === 'string') out[k] = v.trim().slice(0, MAX_LEN);
  }
  return hasContent(out) ? out : null;
}

export const serializeBiodata = (b: Biodata): string => JSON.stringify(b);

/** True when anything other than the photo is filled in. */
export const hasContent = (b: Biodata): boolean => (Object.keys(b) as (keyof Biodata)[]).some((k) => k !== 'photoUri' && b[k].trim() !== '');

export interface BiodataSection {
  title: string;
  rows: { label: string; value: string }[];
}

/** The preview / print layout: grouped sections, empty fields left out, empty sections left out. */
export function biodataSections(b: Biodata): BiodataSection[] {
  const sec = (title: string, rows: [string, string][]): BiodataSection => ({
    title,
    rows: rows.filter(([, v]) => v.trim() !== '').map(([label, value]) => ({ label, value: value.trim() })),
  });
  return [
    sec('व्यक्तिगत जानकारी', [['जन्म तिथि', b.dobDate], ['जन्म समय', b.dobTime], ['जन्म स्थान', b.birthPlace], ['कद', b.height], ['गोत्र', b.gotra]]),
    sec('शिक्षा और व्यवसाय', [['शिक्षा', b.education], ['व्यवसाय', b.occupation]]),
    sec('परिवार', [['पिता', b.father], ['माता', b.mother], ['भाई-बहन', b.siblings]]),
    sec('संपर्क', [['पता', b.address], ['संपर्क', b.contact]]),
  ].filter((s) => s.rows.length > 0);
}
