/**
 * Privacy-safe analytics (Google Analytics for Firebase). Read src/analytics/events.ts first: only a closed allow-list of event
 * names and param values can leave the phone, never anything from the diary.
 *
 * Rules kept here:
 *  - nothing runs before the first render: startAnalytics() is called from the root layout after interactions, native code is
 *    required lazily and is a silent no-op where it is missing (Expo Go, jest);
 *  - track() never throws, never waits and never touches the network on the caller's side;
 *  - collection follows consent.ts: Settings toggle (on by default) + remote flag features.analytics + Google UMP;
 *  - no user id and no user properties are ever set. The only identifier is Firebase's own app-instance id.
 */
import { getAdsState, subscribeAds } from '@/ads/state';
import { getDb } from '@/db/database';
import { getSetting, setSetting } from '@/db/repository';
import type { Db } from '@/db/types';
import { getRemote, subscribeRemote } from '@/remote/state';
import { collectionPlan, parseOptIn, type CollectionPlan } from './consent';
import { sanitizeEvent, type EventName, type EventParams } from './events';
import { nativeLogEvent, nativeReset, nativeSetCollection, nativeSetConsent } from './native';

export const OPT_IN_KEY = 'analytics_opt_in';
const QUEUE_MAX = 20;
/** Analytics wakes up this long after the root layout mounted, so first paint and the splash never wait for it. */
export const START_DELAY_MS = 500;

let started = false;
let optIn = true; // default on; replaced by the stored choice once read
let plan: CollectionPlan | null = null; // null until the first apply()
let queue: { name: string; params: Record<string, string | number> }[] = [];
const listeners = new Set<() => void>();

export const getAnalyticsOptIn = () => optIn;
export const subscribeAnalyticsOptIn = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Push the current decision to the native side (only when it changed) and send what was waiting. */
function apply(): void {
  if (!started) return;
  const next = collectionPlan({
    userOptIn: optIn,
    remoteEnabled: getRemote().config.features.analytics,
    consentBlocked: getAdsState().consentBlocked,
    adsConsentResolved: getAdsState().consentResolved,
  });
  const prev = plan;
  plan = next;
  if (!prev || prev.adSignals !== next.adSignals || prev.collect !== next.collect) nativeSetConsent(next.adSignals, next.collect);
  if (!prev || prev.collect !== next.collect) nativeSetCollection(next.collect);
  if (next.collect) {
    const q = queue;
    queue = [];
    q.forEach((e) => nativeLogEvent(e.name, e.params));
  } else {
    queue = [];
  }
}

/** Log one allow-listed event. Anything not on the allow-list is dropped (see events.ts). Safe to call from anywhere, any time. */
export function track<N extends EventName>(name: N, ...args: keyof EventParams<N> extends never ? [] : [params: EventParams<N>]): void {
  try {
    const ev = sanitizeEvent(name, args[0]);
    if (!ev) return;
    if (plan === null) {
      if (queue.length < QUEUE_MAX) queue.push(ev); // started later (first render not done yet): keep a few, send once allowed
    } else if (plan.collect) nativeLogEvent(ev.name, ev.params);
  } catch {
    /* analytics must never break the app */
  }
}

/** Root layout, in an effect (after the first render). Returns the cleanup. */
export function startAnalytics(): () => void {
  let cancelled = false;
  const unsubs: (() => void)[] = [];
  const timer = setTimeout(async () => {
    try {
      optIn = parseOptIn(await getSetting((await getDb()) as unknown as Db, OPT_IN_KEY));
    } catch {
      /* unreadable: keep the default (on) */
    }
    if (cancelled) return;
    started = true;
    unsubs.push(subscribeRemote(apply), subscribeAds(apply));
    listeners.forEach((l) => l());
    apply();
    track('app_open_ready');
  }, START_DELAY_MS);
  return () => {
    cancelled = true;
    clearTimeout(timer);
    unsubs.forEach((u) => u());
  };
}

/** Settings toggle. Turning it off stops collection at once and clears Firebase's local analytics data (new app-instance id on re-enable). */
export async function setAnalyticsOptIn(on: boolean): Promise<void> {
  optIn = on;
  listeners.forEach((l) => l());
  apply();
  if (!on) nativeReset();
  try {
    await setSetting((await getDb()) as unknown as Db, OPT_IN_KEY, on ? '1' : '0');
  } catch {
    /* the in-memory choice still holds for this session */
  }
}

/** Tests only. */
export function resetAnalyticsForTests() {
  started = false;
  optIn = true;
  plan = null;
  queue = [];
}
export const __testing = { apply, markStarted: () => void (started = true) };
