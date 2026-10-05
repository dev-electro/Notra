import { formatINR } from './money';
import { Entry, Household } from './types';
import { utarChadhavText } from './settlement';

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

/** The read-back plus the उतार/चढ़ाव line: "आपने सुरेश को 701 रुपये दिए। इसमें ₹501 उतार और ₹200 चढ़ाव। सही है?" */
export function readBackWithSettlement(
  entry: Pick<Entry, 'direction' | 'cashPaise' | 'inKindItem'>,
  household: Pick<Household, 'headName'>,
  utarPaise: number,
  chadhavPaise: number,
): string {
  const base = readBack(entry, household);
  const extra = utarChadhavText(utarPaise, chadhavPaise);
  return extra ? base.replace(' सही है?', ` ${extra}। सही है?`) : base;
}
