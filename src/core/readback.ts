import { formatINR } from './money';
import { Entry, Household } from './types';

/**
 * Hindi (Devanagari) read-back sentence for an entry, spoken/shown after every save.
 * AAYA: "सुरेश ने 501 रुपये दिए। सही है?"   GAYA: "आपने सुरेश को 501 रुपये दिए। सही है?"
 * In-kind is appended: "... 501 रुपये और 10 किलो गेहूं दिए। ..."
 */
export function readBack(
  entry: Pick<Entry, 'direction' | 'cashPaise' | 'inKindItem'>,
  household: Pick<Household, 'headName'>,
): string {
  const name = household.headName.trim();
  const item = entry.inKindItem?.trim();
  const parts: string[] = [];
  if (entry.cashPaise > 0 || !item) parts.push(`${formatINR(entry.cashPaise, { symbol: false })} रुपये`);
  if (item) parts.push(item);
  const what = parts.join(' और ');
  return entry.direction === 'AAYA'
    ? `${name} ने ${what} दिए। सही है?`
    : `आपने ${name} को ${what} दिए। सही है?`;
}
