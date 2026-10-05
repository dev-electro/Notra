import * as SecureStore from 'expo-secure-store';
import type { SessionSource } from '@/sync/http';

const USER = 'notra_auth_user_v1';
/** The pre-Better-Auth access + refresh tokens: dead after the migration, removed so nothing sensitive lingers in the keystore. */
const LEGACY_TOKENS = 'notra_auth_tokens_v1';
const OPTS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export interface AuthUser {
  id: string;
  displayName: string | null;
  phone: string | null;
  hasGoogle: boolean;
  hasPhone: boolean;
}

/**
 * The session itself (a Better Auth cookie) is stored by the Better Auth Expo client in the OS keystore (expo-secure-store),
 * under keys prefixed `notra_` (see client.ts). This object reads / clears it through that client, which is loaded lazily:
 * nothing from Better Auth is evaluated until something actually needs the network.
 */
export const secureSession: SessionSource = {
  async cookie() {
    try {
      const { getAuthClient } = await import('./client');
      return (await getAuthClient()).getCookie();
    } catch {
      return '';
    }
  },
  async clear() {
    const { clearLocalSession } = await import('./client');
    await clearLocalSession();
  },
};

export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const raw = await SecureStore.getItemAsync(USER);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export async function setAuthUser(u: AuthUser | null): Promise<void> {
  if (u) await SecureStore.setItemAsync(USER, JSON.stringify(u), OPTS);
  else await SecureStore.deleteItemAsync(USER);
}

export async function purgeLegacyTokens(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(LEGACY_TOKENS);
  } catch { /* nothing stored */ }
}
