/** The word the person must type to confirm deleting their cloud account (both common spellings accepted). */
export const DELETE_PHRASE = 'हटाएं';

export function isDeleteConfirmed(input: string): boolean {
  const t = input.normalize('NFC').trim().replace(/\s+/g, ' ');
  return t === 'हटाएं' || t === 'हटाएँ';
}
