import {
  eventLedgerHtml,
  personLedgerHtml,
  type Entry,
  type Household,
  type NotraEvent,
} from '@/core';

/** Render HTML to a PDF and open the share sheet (WhatsApp etc.). Works offline; modules load on tap. */
export async function sharePdf(html: string, dialogTitle: string): Promise<boolean> {
  const Print = await import('expo-print');
  const { uri } = await Print.printToFileAsync({ html });
  const Sharing = await import('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle, UTI: 'com.adobe.pdf' });
  return true;
}

export function shareEventLedger(event: NotraEvent, host: Household | undefined, entries: Entry[], households: Household[]) {
  return sharePdf(eventLedgerHtml(event, host, entries, households), 'नोतरा बही');
}

export function sharePersonLedger(household: Household, entries: Entry[]) {
  return sharePdf(personLedgerHtml(household, entries), 'लेना-देना');
}
