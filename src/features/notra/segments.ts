import { getDb, getSetting, setSetting, type Db } from '@/db';

export type NotraSeg = 'mera' | 'doosre' | 'hisab';
export const NOTRA_SEGMENTS: readonly { id: NotraSeg; label: string }[] = [
  { id: 'mera', label: 'मेरा' },
  { id: 'doosre', label: 'दूसरों का' },
  { id: 'hisab', label: 'हिसाब' },
];

const KEY = 'notra_segment_v1';
export const asSeg = (v: unknown): NotraSeg | null => (v === 'mera' || v === 'doosre' || v === 'hisab' ? v : null);

/** Last segment used, remembered in the settings store (and in memory so switching tabs does not flicker). */
let memory: NotraSeg | null = null;
export const rememberedSeg = (): NotraSeg | null => memory;

export async function loadSeg(): Promise<NotraSeg | null> {
  try {
    memory ??= asSeg(await getSetting((await getDb()) as unknown as Db, KEY));
  } catch {
    /* in-memory only */
  }
  return memory;
}

export function saveSeg(seg: NotraSeg): void {
  memory = seg;
  void (async () => {
    try {
      await setSetting((await getDb()) as unknown as Db, KEY, seg);
    } catch {
      /* ignore */
    }
  })();
}
