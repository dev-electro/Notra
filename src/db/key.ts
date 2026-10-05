import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';

const KEY_NAME = 'notra_diary_db_key_v1';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Generate the SQLCipher key once (256-bit, hex) and keep it in the OS keystore afterwards. */
export async function getOrCreateDbKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing) return existing;
  const key = toHex(getRandomBytes(32));
  await SecureStore.setItemAsync(KEY_NAME, key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  return key;
}
