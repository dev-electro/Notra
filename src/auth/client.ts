/**
 * The Better Auth client for the app (React client + the Expo plugin). The Expo plugin keeps the session cookie in expo-secure-store
 * and attaches it to every Better Auth call; `getCookie()` hands the same cookie to our own sync / support requests.
 *
 * Everything here is loaded lazily (dynamic import) so the app's start-up does not evaluate Better Auth. Unit tests never import this
 * file: they test auth-api.ts with a fake client.
 */
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { APP_SCHEME, COOKIE_PREFIX, STORAGE_PREFIX, type AuthClientLike } from './auth-api';

const OPTS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

/** expo-secure-store with the same "after first unlock, this device only" protection the rest of the app uses. */
const storage = {
  getItem: (k: string) => SecureStore.getItem(k),
  getItemAsync: (k: string) => SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) => SecureStore.setItem(k, v, OPTS),
  setItemAsync: (k: string, v: string) => SecureStore.setItemAsync(k, v, OPTS),
};

const baseURL = () => (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? '';

let client: Promise<AuthClientLike> | null = null;

export function getAuthClient(): Promise<AuthClientLike> {
  client ??= (async () => {
    const [{ createAuthClient }, { phoneNumberClient }, { expoClient }] = await Promise.all([
      import('better-auth/react'),
      import('better-auth/client/plugins'),
      import('@better-auth/expo/client'),
    ]);
    return createAuthClient({
      baseURL: baseURL().replace(/\/+$/, ''),
      plugins: [phoneNumberClient(), expoClient({ scheme: APP_SCHEME, storagePrefix: STORAGE_PREFIX, cookiePrefix: COOKIE_PREFIX, storage })],
    }) as unknown as AuthClientLike;
  })();
  return client;
}

/** Forget the session on this phone without calling the server (it already said the session is invalid). */
export async function clearLocalSession(): Promise<void> {
  for (const k of [`${STORAGE_PREFIX}_cookie`, `${STORAGE_PREFIX}_session_data`]) {
    try {
      await SecureStore.deleteItemAsync(k);
    } catch { /* nothing stored */ }
  }
  client = null; // a fresh client re-reads the (now empty) store
}
