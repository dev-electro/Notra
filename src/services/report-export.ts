import { reportHtml, type ReportDoc } from '@/core';
import { sharePdf } from '@/services/export';

/** Most rows an image export will draw (20 pages of 25). Longer reports go out as a PDF, or the year / dates are narrowed. */
export const MAX_IMAGE_ROWS = 500;

/** The report as a PDF (Devanagari, diary paper, header + filters + date) through the share sheet. Modules load on tap. */
export function shareReportPdf(doc: ReportDoc): Promise<boolean> {
  return sharePdf(reportHtml(doc), doc.title);
}

/** Share one captured page image (PNG) with WhatsApp etc. */
export async function shareImageFile(uri: string, title: string): Promise<boolean> {
  const Sharing = await import('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: title, UTI: 'public.png' });
  return true;
}

/** Capture a laid-out view to a PNG file. `width`/`height` are the output pixels (a fixed width keeps every phone's picture the same size). */
export async function captureView(ref: React.RefObject<unknown>, width: number, height: number): Promise<string> {
  const { captureRef } = await import('react-native-view-shot');
  return captureRef(ref as never, { format: 'png', quality: 1, result: 'tmpfile', width, height });
}
