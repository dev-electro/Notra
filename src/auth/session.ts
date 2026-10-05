import * as SecureStore from 'expo-secure-store';
import type { TokenStore, Tokens } from '@/sync/http';

const TOKENS = 'notra_auth_tokens_v1';
const USER = 'notra_auth_user_v1';
const OPTS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export interface AuthUser {
  id: string;
  displayName: string | null;
  phone: string | null;
  hasGoogle: boolean;
  hasPhone: boolean;
}

/** Access + refresh tokens live in the OS keystore (expo-secure-store), never in SQLite or logs. */
export const secureTokenStore: TokenStore = {
  async get() {
    try {
      const raw = await SecureStore.getItemAsync(TOKENS);
      return raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      return null;
    }
  },
  async set(t) {
    if (t) await SecureStore.setItemAsync(TOKENS, JSON.stringify(t), OPTS);
    else await SecureStore.deleteItemAsync(TOKENS);
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
