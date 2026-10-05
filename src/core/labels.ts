import type { Direction, EventStatus, InvitationType, Occasion } from './types';

/** Hindi labels and emoji icons. No death-feast occasion exists, by design. */
export const OCCASION_LABEL: Record<Occasion, string> = {
  SHAADI: 'शादी',
  BIMARI: 'बीमारी',
  MAKAAN: 'मकान',
  OTHER: 'अन्य',
};
export const OCCASION_ICON: Record<Occasion, string> = {
  SHAADI: '💍',
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
