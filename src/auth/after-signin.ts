import { getDb, setSetting, type Db } from '@/db';
import { restoreNow } from '@/sync/runtime';

export const CANCELLED_MESSAGE = 'साइन इन रद्द किया। फ़ोन का हिसाब जैसा था वैसा ही है।';

/**
 * Common ending of every sign-in. 'cancelled' (the person chose रद्द करें) changes nothing. After a real sign-in the account's
 * data is pulled right away, so a restored phone already has "my household" before first-run setup could be offered.
 */
export async function afterSignIn(result: 'done' | 'cancelled'): Promise<boolean> {
  if (result === 'cancelled') return false;
  await restoreNow();
  await setSetting((await getDb()) as unknown as Db, 'signin_prompted', '1');
  return true;
}
