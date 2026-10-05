import type { Direction, EventStatus, InvitationType, Occasion } from './types';

/** Hindi labels and emoji icons. No death-feast occasion exists, by design. */
export const OCCASION_LABEL: Record<Occasion, string> = {
  SHAADI: 'शादी',
  GRIHAPRAVESH: 'गृहप्रवेश',
  MUNDAN: 'मुंडन संस्कार',
  BIMARI: 'बीमारी',
  MAKAAN: 'मकान',
  OTHER: 'अन्य',
};
export const OCCASION_ICON: Record<Occasion, string> = {
  SHAADI: '💍',
  GRIHAPRAVESH: '🏡',
  MUNDAN: '👶',
  BIMARI: '🏥',
  MAKAAN: '🏠',
  OTHER: '📜',
};
export const STATUS_LABEL: Record<EventStatus, string> = {
  PLANNED: 'तय हुआ',
  HELD: 'हो गया',
  SETTLED: 'हिसाब पूरा',
};
export const STATUS_ORDER: readonly EventStatus[] = ['PLANNED', 'HELD', 'SETTLED'];
export const INVITATION_LABEL: Record<InvitationType, string> = {
  YELLOW_RICE: 'पीले चावल',
  KUMKUM: 'कुमकुम',
  CARD: 'कार्ड',
};
export const DIRECTION_LABEL: Record<Direction, string> = {
  AAYA: 'आया',
  GAYA: 'गया',
};

export interface InKindKind {
  key: string;
  label: string;
  icon: string;
}
export const IN_KIND_KINDS: readonly InKindKind[] = [
  { key: 'grain', label: 'अनाज', icon: '🌾' },
  { key: 'ghee', label: 'घी', icon: '🧈' },
  { key: 'goat', label: 'बकरी', icon: '🐐' },
  { key: 'utensil', label: 'बर्तन', icon: '🍲' },
  { key: 'other', label: 'अन्य', icon: '📦' },
];

export const SHAGUN_QUICK_RUPEES: readonly number[] = [101, 251, 501, 1001];

export const MONTHS_HI: readonly string[] = [
  'जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
  'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर',
];

export const OCCASION_LABEL_MAX = 60;
export const OCCASION_NOTE_MAX = 500;

/** The name to show for an occasion: the custom label for OTHER when it is set, else the standard Hindi name ("अन्य" for OTHER). */
export function occasionName(occasion: Occasion, label?: string | null): string {
  const l = occasion === 'OTHER' ? label?.trim() : '';
  return l ? l : OCCASION_LABEL[occasion];
}

/** Trim and clamp the custom label/details. Only OTHER keeps them; empty text becomes undefined. */
export function cleanOccasionText(occasion: Occasion, label?: string | null, note?: string | null): { label?: string; note?: string } {
  if (occasion !== 'OTHER') return {};
  const l = (label ?? '').replace(/\s+/g, ' ').trim().slice(0, OCCASION_LABEL_MAX);
  const n = (note ?? '').trim().slice(0, OCCASION_NOTE_MAX);
  return { label: l || undefined, note: n || undefined };
}
