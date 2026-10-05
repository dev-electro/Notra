import { showToast } from './toast';

export const SAVE_FAILED = 'सेव नहीं हो पाया। फिर से कोशिश करें।';

/**
 * Run a database write (or any action). On failure show a friendly toast and return undefined instead of letting the
 * error crash the screen. The error text is never shown (it is for developers); nothing is retried silently.
 */
export async function guarded<T>(action: () => Promise<T>, message: string = SAVE_FAILED, notify: (m: string) => void = showToast): Promise<T | undefined> {
  try {
    return await action();
  } catch {
    notify(message);
    return undefined;
  }
}
