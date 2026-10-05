/** The steps of every PIN screen (unlock, set, change, remove) as a tiny pure state machine, so the rules are testable. */
export type PinStep = 'verify' | 'new' | 'confirm' | 'done';

export interface PinFlowOptions {
  /** Ask for the current PIN first (unlock, change, remove, turn off). */
  verify: boolean;
  /** Then ask for a new PIN twice (set, change). false = nothing new to choose (unlock, remove, turn off). */
  askNew: boolean;
}
export interface PinFlowState {
  step: PinStep;
  /** The first entry of the new PIN, kept until the confirmation matches. */
  firstPin?: string;
  /** The PIN chosen (only in step 'done' and only when askNew). */
  pin?: string;
  mismatch?: boolean;
}

export const startFlow = (o: PinFlowOptions): PinFlowState => ({ step: o.verify ? 'verify' : o.askNew ? 'new' : 'done' });

export const afterVerify = (o: PinFlowOptions): PinFlowState => ({ step: o.askNew ? 'new' : 'done' });

export const afterNew = (pin: string): PinFlowState => ({ step: 'confirm', firstPin: pin });

/** Matching confirmation finishes; a mismatch starts the choice over (never saves a PIN the person did not repeat). */
export function afterConfirm(s: PinFlowState, pin: string): PinFlowState {
  return pin === s.firstPin ? { step: 'done', pin } : { step: 'new', mismatch: true };
}

/** A PIN that is trivially guessable. Allowed (the person's choice) but the screen warns. */
export const isWeakPin = (pin: string): boolean => /^(\d)\1{3}$/.test(pin) || pin === '1234' || pin === '4321' || pin === '0123';
