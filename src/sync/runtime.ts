/** Wires the pure sync pieces to the app: secure-store tokens, expo-constants URL, AppState, local-write hook. */
import Constants from 'expo-constants';
import { AppState } from 'react-native';
import { getAuthUser, secureTokenStore, setAuthUser, type AuthUser } from '@/auth/session';
import { getDb } from '@/db/database';
import { clearAllLocalData } from '@/db/maintenance';
import type { Db } from '@/db/types';
import { onLocalWrite } from '@/db/writes';
import { syncOnce } from './engine';
import { apiTransport, createApi, SignedOutError, type Api } from './http';
import { createScheduler, type Scheduler } from './scheduler';
import { bindUser, getSyncState, pendingCount, setSyncEnabled } from './state';

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

/** Save the session after any successful sign-in and turn backup on (signing in is the opt-in). Restore = pull from 0. */
export async function completeSignIn(r: AuthResponse): Promise<void> {
  await secureTokenStore.set({ accessToken: r.accessToken, refreshToken: r.refreshToken });
  await setAuthUser(r.user);
  const db = await dbOf();
  await bindUser(db, r.user.id);
  await setSyncEnabled(db, true);
  syncSoon();
}

export const signInGoogle = (idToken: string) => api.request<AuthResponse>('POST', '/v1/auth/google', { body: { idToken } }).then(completeSignIn);
export const otpStart = (phone: string) =>
  api.request<{ resendAfter: number; expiresIn: number }>('POST', '/v1/auth/otp/start', { body: { phone } });
export const otpVerify = (phone: string, code: string) =>
  api.request<AuthResponse>('POST', '/v1/auth/otp/verify', { body: { phone, code } }).then(completeSignIn);

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
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const db = await dbOf();
  const [s, pending, user] = await Promise.all([getSyncState(db), pendingCount(db), getAuthUser()]);
  return { enabled: s.enabled, lastSyncAt: s.lastSyncAt, pending, user, failed: lastError };
}
