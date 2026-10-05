import { requireOptionalNativeModule } from 'expo';

/** A picked contact: the display name and the number exactly as the contacts app stores it. */
export interface PickedContact {
  name: string;
  number: string;
}

interface Native {
  pickPhone(): Promise<PickedContact | null>;
}

const native = requireOptionalNativeModule<Native>('NotraContactPicker');

/** false on iOS / Expo Go (the native module is only in the Android build). */
export const isContactPickerAvailable = (): boolean => native !== null;

/** Opens the system contact picker; resolves with the ONE chosen contact, or null if cancelled. No READ_CONTACTS permission. */
export async function pickPhoneContact(): Promise<PickedContact | null> {
  if (!native) return null;
  return native.pickPhone();
}
