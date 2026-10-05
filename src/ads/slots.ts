/** Where native ad cards go in a long list. Pure. */
import { MIN_ITEMS_FOR_NATIVE } from './policy';

export interface AdSlot {
  adSlot: true;
  /** 1-based number of this ad in the list. */
  n: number;
}
export const isAdSlot = (x: unknown): x is AdSlot => typeof x === 'object' && x !== null && (x as AdSlot).adSlot === true;

/** At most this many native cards in one list (each is a network request and some memory on a 2 GB phone). */
export const MAX_NATIVE_PER_LIST = 3;

/**
 * Insert an ad slot before every `every`-th real item (so after item `every`, `2*every`, ...), never first, never trailing, never
 * in a list with fewer than 6 items, and at most MAX_NATIVE_PER_LIST. Returns the same array when ads are off.
 */
export function withAdSlots<T>(items: readonly T[], every: number, on: boolean): (T | AdSlot)[] {
  if (!on || items.length < MIN_ITEMS_FOR_NATIVE || every < 5) return items as T[];
  const out: (T | AdSlot)[] = [];
  let n = 0;
  items.forEach((it, i) => {
    if (i > 0 && i % every === 0 && n < MAX_NATIVE_PER_LIST) out.push({ adSlot: true, n: ++n });
    out.push(it);
  });
  return out;
}
