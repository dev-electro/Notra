/** Wires the pure sync pieces to the app: secure-store tokens, expo-constants URL, AppState, local-write hook. */
import Constants from 'expo-constants';
import { AppState } from 'react-native';
import { askAddPhoneData } from '@/auth/switch-prompt';
import { getAuthUser, secureTokenStore, setAuthUser, type AuthUser } from '@/auth/session';
import { getDb } from '@/db/database';
import { clearAllLocalData } from '@/db/maintenance';
import type { Db } from '@/db/types';
import { onLocalWrite } from '@/db/writes';
import { bindAccount, releaseOwner, type AskChoice } from './account';
import { syncOnce } from './engine';
import { apiTransport, createApi, SignedOutError, type Api } from './http';
import { createScheduler, type Scheduler } from './scheduler';
import { countRejected } from './rejected';
import { getSyncState, pendingCount, setSyncEnabled } from './state';

const baseUrl = () => (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? '';

export const api: Api = createApi({ baseUrl: baseUrl(), tokens: secureTokenStore });
const dbOf = async () => (await getDb()) as unknown as Db;

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

let scheduler: Scheduler | null = null;
let lastError = false;

async function runOnce(): Promise<boolean> {
  const db = await dbOf();
  if (!(await getSyncState(db)).enabled) return true;
  if (!(await secureTokenStore.get())) return true; // not signed in: nothing to do
  try {
    await syncOnce(db, apiTransport(api));
    lastError = false;
    return true;
  } catch (e) {
    lastError = true;
    return e instanceof SignedOutError; // signed out: don't hammer the server
  }
}

/** Start background sync once (root layout). Triggers: app start, app foregrounded, ~10 s after a local write. */
export function startSync(): () => void {
  if (scheduler) return () => {};
  const s = (scheduler = createScheduler({ run: runOnce }));
  const offWrite = onLocalWrite(() => s.schedule());
  const sub = AppState.addEventListener('change', (st) => st === 'active' && s.trigger());
  s.trigger();
  return () => {
    offWrite();
    sub.remove();
    s.stop();
    scheduler = null;
  };
}

export const syncSoon = () => scheduler?.trigger();
export const lastSyncFailed = () => lastError;

/**
 * After a successful sign-in: decide whether this phone's data may be uploaded into this account (see account.ts) BEFORE
 * anything is saved or synced. If the account does not match the data on the phone, the person is asked first. Returns
 * 'cancelled' (nothing changed, the new session is revoked) or 'done' (session saved, backup on: signing in is the opt-in).
 */
export async function completeSignIn(r: AuthResponse, ask: AskChoice = askAddPhoneData): Promise<'done' | 'cancelled'> {
  const db = await dbOf();
  const out = await bindAccount(db, r.user.id, ask);
  if (out.status === 'cancelled') {
    await api.request('POST', '/v1/auth/logout', { body: { refreshToken: r.refreshToken } }).catch(() => {});
    return 'cancelled';
  }
  await secureTokenStore.set({ accessToken: r.accessToken, refreshToken: r.refreshToken });
  await setAuthUser(r.user);
  await setSyncEnabled(db, true);
  syncSoon();
  return 'done';
}

/**
 * Pull the account's data right now (a restored phone should have its household and entries before first-run setup is
 * offered). Returns false if it could not finish (offline): the app then just continues and the background sync catches up.
 */
export async function restoreNow(timeoutMs = 25_000): Promise<boolean> {
  try {
    const db = await dbOf();
    await Promise.race([
      syncOnce(db, apiTransport(api)),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    return true;
  } catch {
    return false;
  }
}

export const signInGoogle = (idToken: string) => api.request<AuthResponse>('POST', '/v1/auth/google', { body: { idToken } }).then((r) => completeSignIn(r));
export const otpStart = (phone: string) =>
  api.request<{ resendAfter: number; expiresIn: number }>('POST', '/v1/auth/otp/start', { body: { phone } });
export const otpVerify = (phone: string, code: string) =>
  api.request<AuthResponse>('POST', '/v1/auth/otp/verify', { body: { phone, code } }).then((r) => completeSignIn(r));

async function refreshUser(user: AuthUser): Promise<void> {
  await setAuthUser(user);
}
export const linkGoogle = (idToken: string) =>
  api.request<{ user: AuthUser }>('POST', '/v1/auth/link/google', { body: { idToken }, auth: true }).then((r) => refreshUser(r.user));
export const linkPhone = (phone: string, code: string) =>
  api.request<{ user: AuthUser }>('POST', '/v1/auth/link/phone', { body: { phone, code }, auth: true }).then((r) => refreshUser(r.user));

/** Sign out: revoke the refresh token and stop syncing. Local data is kept unless `clearLocal` is chosen. */
export async function signOut(clearLocal = false): Promise<void> {
  const t = await secureTokenStore.get();
  if (t) await api.request('POST', '/v1/auth/logout', { body: { refreshToken: t.refreshToken } }).catch(() => {});
  await secureTokenStore.set(null);
  await setAuthUser(null);
  const db = await dbOf();
  await setSyncEnabled(db, false);
  if (clearLocal) await clearAllLocalData(db);
}

/**
 * Delete the cloud account and everything stored for it (server DELETE /v1/account), then sign out. The phone's own data is
 * erased only if `wipeLocal` is true, and only AFTER the server confirmed the deletion, so a failure never loses anything.
 * Without a wipe the data stays on the phone as "never synced" (the next sign-in will ask what to do with it).
 */
export async function deleteMyAccount(wipeLocal: boolean): Promise<void> {
  await api.request('DELETE', '/v1/account', { auth: true });
  await secureTokenStore.set(null);
  await setAuthUser(null);
  const db = await dbOf();
  await releaseOwner(db);
  if (wipeLocal) await clearAllLocalData(db);
}

export async function setBackup(on: boolean): Promise<void> {
  await setSyncEnabled(await dbOf(), on);
  if (on) syncSoon();
}

export interface SyncStatus {
  enabled: boolean;
  lastSyncAt: string | null;
  pending: number;
  user: AuthUser | null;
  failed: boolean;
  /** Rows the server refused (bad data): kept on the phone, shown in Settings. */
  rejected: number;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const db = await dbOf();
  const [s, pending, user, rejected] = await Promise.all([getSyncState(db), pendingCount(db), getAuthUser(), countRejected(db)]);
  return { enabled: s.enabled, lastSyncAt: s.lastSyncAt, pending, user, failed: lastError, rejected };
}
