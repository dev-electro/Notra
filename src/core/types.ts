/** Money is always integer paise. 1 rupee = 100 paise. Timestamps are ISO-8601 strings. */

export type Occasion = 'SHAADI' | 'BIMARI' | 'MAKAAN' | 'OTHER'; // never a death-feast category
export const OCCASIONS: readonly Occasion[] = ['SHAADI', 'BIMARI', 'MAKAAN', 'OTHER'];

export type InvitationType = 'YELLOW_RICE' | 'KUMKUM' | 'CARD';
export type EventStatus = 'PLANNED' | 'HELD' | 'SETTLED';
export type Direction = 'AAYA' | 'GAYA'; // AAYA = received by me, GAYA = given by me
export type PaymentMode = 'CASH' | 'UPI';

export interface Household {
  id: string;
  headName: string;
  fatherName: string;
  jati: string;
  atak: string;
  village: string;
  fala: string;
  phone?: string;
  photoUri?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface NotraEvent {
  id: string;
  hostHouseholdId: string;
  occasion: Occasion;
  /** ISO date, e.g. 2026-11-21 */
  date: string;
  panchApproved: boolean;
  invitationType: InvitationType;
  status: EventStatus;
  /** Which ledger (household or a family member's personal one) this event belongs to. Defaults to the household ledger. */
  ledgerId?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Immutable ledger line. A correction is a NEW entry whose correctsEntryId points at the old one. */
export interface Entry {
  id: string;
  eventId?: string;
  otherHouseholdId: string;
  direction: Direction;
  cashPaise: number;
  inKindItem?: string;
  inKindValuePaise: number;
  paymentMode: PaymentMode;
  recordedBy: string;
  voiceNoteUri?: string;
  createdAt: string;
  correctsEntryId?: string;
  /** A void cancels `correctsEntryId` and counts as nothing itself (zero amounts). */
  isVoid?: boolean;
  /** Which ledger this entry belongs to. Absent = the household ledger (DEFAULT_LEDGER_ID). */
  ledgerId?: string;
}

export type Increment =
  | { type: 'FIXED'; rupees: number }
  | { type: 'PERCENT'; pct: number };

export const DEFAULT_INCREMENT: Increment = { type: 'FIXED', rupees: 51 };
