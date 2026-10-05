import { normalizeIndianMobile } from '@/core';

export interface PickedPhone {
  name: string;
  /** +91XXXXXXXXXX, or null when the contact's number is not an Indian mobile (then `raw` is shown and nothing is filled in) */
  phone: string | null;
  raw: string;
}

/**
 * "फ़ोन से नंबर चुनें": the system contact picker opens, the person taps ONE contact, and only that name and number come back.
 * No READ_CONTACTS permission (it stays in blockedPermissions): see modules/notra-contact-picker. The native module is loaded only
 * when the button is pressed. Returns null if cancelled or unavailable.
 */
export async function pickContactPhone(): Promise<PickedPhone | null> {
  try {
    const mod = await import('../../modules/notra-contact-picker/src');
    if (!mod.isContactPickerAvailable()) return null;
    const c = await mod.pickPhoneContact();
    if (!c) return null;
    return { name: c.name.trim(), phone: normalizeIndianMobile(c.number), raw: c.number };
  } catch {
    return null;
  }
}

export async function canPickContact(): Promise<boolean> {
  try {
    return (await import('../../modules/notra-contact-picker/src')).isContactPickerAvailable();
  } catch {
    return false;
  }
}
