/**
 * Fetch GET /v1/config on start and on foreground (at most once per 5 minutes), keep the last good copy in SQLite settings, and
 * work with no server at all (defaults, or the cached copy). Every failure is silent: the diary never waits for this.
 */
import { AppState } from 'react-native';
import { getDb } from '@/db/database';
import { getSetting, setSetting } from '@/db/repository';
import type { Db } from '@/db/types';
import { flushSupport } from '@/support/service';
import { api } from '@/sync/runtime';
import { DEFAULT_CONFIG, parseConfig, shouldFetchConfig } from './config';
import { markOnline } from './online';
import { setRemoteConfig } from './state';

const CACHE_KEY = 'remote_config_v1';
let lastAttempt: number | null = null;
let inflight = false;

async function loadCached(): Promise<void> {
  try {
    const raw = await getSetting((await getDb()) as unknown as Db, CACHE_KEY);
    if (raw) setRemoteConfig(parseConfig(JSON.parse(raw), DEFAULT_CONFIG));
  } catch {
    /* no cache: defaults */
  }
}

export async function refreshConfig(force = false): Promise<void> {
  if (inflight || (!force && !shouldFetchConfig(lastAttempt, Date.now()))) return;
  inflight = true;
  lastAttempt = Date.now();
  try {
    const raw = await api.request<unknown>('GET', '/v1/config');
    const next = parseConfig(raw, DEFAULT_CONFIG);
    markOnline(true);
    setRemoteConfig(next);
    await setSetting((await getDb()) as unknown as Db, CACHE_KEY, JSON.stringify(next));
  } catch (e) {
    // 404 (server not built yet), offline, timeout: keep whatever we have
    if (!(e instanceof Error && /^\d{3} /.test(e.message))) markOnline(false);
  } finally {
    inflight = false;
  }
}

/** Root layout: cached config first, then the network; again whenever the app comes to the foreground. */
export function startRemoteConfig(): () => void {
  void loadCached().then(() => refreshConfig(true)).then(() => flushSupport()).catch(() => undefined);
  const sub = AppState.addEventListener('change', (st) => {
    if (st !== 'active') return;
    void refreshConfig();
    void flushSupport().catch(() => undefined); // queued complaints go out when the internet is back
  });
  return () => sub.remove();
}
