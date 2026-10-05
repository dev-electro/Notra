/** Wires the pure sync pieces to the app: secure-store tokens, expo-constants URL, AppState, local-write hook. */
import Constants from 'expo-constants';
import { AppState } from 'react-native';
import { askAddPhoneData } from '@/auth/switch-prompt';
import { createAuthApi } from '@/auth/auth-api';
import { getAuthUser, purgeLegacyTokens, secureSession, setAuthUser, type AuthUser } from '@/auth/session';
import { getDb } from '@/db/database';
import { getSetting, setSetting } from '@/db/repository';
import { clearAllLocalData } from '@/db/maintenance';
import type { Db } from '@/db/types';
import { onLocalWrite } from '@/db/writes';
import { bindAccount, releaseOwner, type AskChoice } from './account';
import { syncOnce } from './engine';
import { appHeaders } from '@/remote/device';
import { setSuspended, syncPaused } from '@/remote/state';
import { apiTransport, createApi, SignedOutError, SuspendedError, type Api } from './http';
import { createScheduler, type Scheduler } from './scheduler';
import { countRejected } from './rejected';
import { getSyncState, pendingCount, setSyncEnabled } from './state';

const baseUrl = () => (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? '';

/** Sync / support / config calls: the Better Auth session cookie (kept by the Better Auth Expo client in the OS keystore) is sent as `Cookie`. */
export const api: Api = createApi({
  baseUrl: baseUrl(), session: secureSession, headers: appHeaders, onSuspended: setSuspended,
  onSignedOut: () => void setAuthUser(null), // no / ended session: the Settings screen shows "not signed in"
});
const dbOf = async () => (await getDb()) as unknown as Db;
/** Sign-in operations (Google ID token, phone OTP, linking, sign-out) through Better Auth. */
const authApi = createAuthApi(async () => (await import('@/auth/client')).getAuthClient(), { onSuspended: setSuspended });

/**
 * Set while a sign-in is between "Better Auth created the session" and "the person answered the account-switch prompt".
 * If the app dies in that window the new session must not be used to sync the phone's old data into another account, so the next
 * start discards it (see runOnce).
 */
const SIGNIN_PENDING = 'signin_pending';
let signInInFlight = false;

let scheduler: Scheduler | null = null;
let lastError = false;

async function runOnce(): Promise<boolean> {
  const db = await dbOf();
  if (!(await getSyncState(db)).enabled) return true;
  if (!signInInFlight && (await getSetting(db, SIGNIN_PENDING)) === '1') {
    // an interrupted sign-in: forget its session (the phone's data and the old account link are untouched)
    await secureSession.clear();
    await setAuthUser(null);
    await setSetting(db, SIGNIN_PENDING, '');
    return true;
  }
  if (!(await getAuthUser())) return true; // not signed in: nothing to do
  await keepSessionFresh();
  if (syncPaused()) return true; // maintenance or suspended account: only sync waits, the diary keeps working
  try {
    await syncOnce(db, apiTransport(api));
    lastError = false;
    return true;
  } catch (e) {
    lastError = true;
    return e instanceof SignedOutError || e instanceof SuspendedError; // signed out / suspended: don't hammer the server
  }
}

let lastRefresh = 0;
/** At most once a day: re-read the session so the server extends it and the Expo client stores the new expiry (sliding 60 days). */
async function keepSessionFresh(): Promise<void> {
  if (Date.now() - lastRefresh < 24 * 3_600_000) return;
  lastRefresh = Date.now();
  await authApi.refreshSession().catch(() => {});
}

/** Start background sync once (root layout). Triggers: app start, app foregrounded, ~10 s after a local write. */
export function startSync(): () => void {
  if (scheduler) return () => {};
  void purgeLegacyTokens();
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
 * After Better Auth created the session: read who signed in, decide whether this phone's data may be uploaded into this account
 * (see account.ts) BEFORE anything is saved or synced. If the account does not match the data on the phone, the person is asked first.
 * Returns 'cancelled' (nothing changed, the new session is revoked) or 'done' (backup on: signing in is the opt-in).
 */
export async function completeSignIn(ask: AskChoice = askAddPhoneData): Promise<'done' | 'cancelled'> {
  const db = await dbOf();
  try {
    const { user } = await api.request<{ user: AuthUser }>('GET', '/v1/me', { auth: true });
    const out = await bindAccount(db, user.id, ask);
    if (out.status === 'cancelled') {
      await authApi.signOut().catch(() => {});
      await secureSession.clear();
      return 'cancelled';
    }
    setSuspended(null);
    await setAuthUser(user);
    await setSyncEnabled(db, true);
    syncSoon();
    return 'done';
  } catch (e) {
    await authApi.signOut().catch(() => {});
    await secureSession.clear();
    throw e;
  } finally {
    await setSetting(db, SIGNIN_PENDING, '');
    signInInFlight = false;
  }
}

async function signInThen(step: () => Promise<unknown>): Promise<'done' | 'cancelled'> {
  signInInFlight = true;
  await setSetting(await dbOf(), SIGNIN_PENDING, '1');
  try {
    await step();
  } catch (e) {
    await setSetting(await dbOf(), SIGNIN_PENDING, '');
    signInInFlight = false;
    throw e;
  }
  return completeSignIn();
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

export const signInGoogle = (idToken: string) => signInThen(() => authApi.signInGoogle(idToken));
export const otpStart = (digits: string) => authApi.otpStart(digits);
export const otpVerify = (digits: string, code: string) => signInThen(() => authApi.otpVerify(digits, code));

async function refreshUser(): Promise<void> {
  const { user } = await api.request<{ user: AuthUser }>('GET', '/v1/me', { auth: true });
  await setAuthUser(user);
}
export const linkGoogle = (idToken: string) => authApi.linkGoogle(idToken).then(refreshUser);
export const linkPhone = (digits: string, code: string) => authApi.linkPhone(digits, code).then(refreshUser);

/** Sign out: revoke the session on the server (best effort) and forget it here, then stop syncing. Local data is kept unless `clearLocal` is chosen. */
export async function signOut(clearLocal = false): Promise<void> {
  await authApi.signOut().catch(() => {});
  await secureSession.clear();
  setSuspended(null);
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
  await secureSession.clear();
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
