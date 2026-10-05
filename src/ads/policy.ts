/**
 * The ONE place that decides whether an ad may show. Pure: every input is passed in, nothing is read from the phone, so each
 * rule is unit-tested. Callers never show an ad without asking this first, and a "no" means render nothing (no gap).
 *
 * Rules, in the order they are checked (the first failing rule is the reason):
 *  not-ready      the ads SDK is not initialised / consent does not allow requesting ads
 *  disabled       remote config ads.enabled is off
 *  placement-off  remote config switch of this placement is off
 *  offline        no network: nothing could load anyway, and nothing may reserve space
 *  screen         the placement is not allowed on this screen (allow-list below; everything else is ad-free)
 *  first-day      first 24 h after install: no banner/native/rewarded when first_day_ads_free, and NEVER an interstitial
 *  data-entry     interstitial only: not within 2 minutes of the last entry/edit save
 *  interval       interstitial only: at least ads.interstitial_min_interval_sec since the last one
 *  daily-cap      interstitial only: at most 3 per calendar day
 *  too-few-items  native only: the list has fewer than 6 items
 *  first-item     native only: never as the first item
 */
import type { RemoteConfig } from '@/remote/config';

export type AdPlacement = 'banner' | 'native' | 'interstitial' | 'rewarded';

/** Screens that exist for ad purposes. Anything not named in ALLOWED is ad-free, including every screen not listed here. */
export type AdScreen =
  | 'home' | 'hisab' | 'mera' | 'doosre' | 'report_list' | 'report_export'
  | 'event_ledger' | 'entry_form' | 'keypad' | 'lock' | 'onboarding' | 'signin' | 'settings' | 'legal' | 'backup' | 'account_delete' | 'error' | 'other';

export const ALLOWED_SCREENS: Record<AdPlacement, readonly AdScreen[]> = {
  banner: ['home', 'hisab'],
  native: ['mera', 'doosre', 'report_list'],
  interstitial: ['report_export'],
  rewarded: ['report_export'],
};

export const DAY_MS = 86_400_000;
export const MAX_INTERSTITIALS_PER_DAY = 3;
export const ENTRY_COOLDOWN_MS = 120_000;
export const MIN_ITEMS_FOR_NATIVE = 6;

export interface PolicyInput {
  placement: AdPlacement;
  screen: AdScreen;
  ads: RemoteConfig['ads'];
  now: number;
  /** When the app was installed (ms). null = unknown: treated as the first day (fail closed). */
  installAt: number | null;
  lastInterstitialAt: number | null;
  interstitialsToday: number;
  online: boolean;
  /** SDK initialised and consent allows requesting ads. */
  sdkReady: boolean;
  /** Time of the last entry / edit save (ms), if any this session. */
  lastEntryAt?: number | null;
  /** Native only: how many real items the list has, and the position the ad would take. */
  itemCount?: number;
  index?: number;
}

export type DenyReason =
  | 'not-ready' | 'disabled' | 'placement-off' | 'offline' | 'screen' | 'first-day'
  | 'data-entry' | 'interval' | 'daily-cap' | 'too-few-items' | 'first-item';
export type Decision = { show: true } | { show: false; reason: DenyReason };

const no = (reason: DenyReason): Decision => ({ show: false, reason });

export const isFirstDay = (installAt: number | null, now: number) => installAt === null || now - installAt < DAY_MS;

export function adDecision(i: PolicyInput): Decision {
  if (!i.sdkReady) return no('not-ready');
  if (!i.ads.enabled) return no('disabled');
  if (!i.ads[i.placement]) return no('placement-off');
  if (!i.online) return no('offline');
  if (!ALLOWED_SCREENS[i.placement].includes(i.screen)) return no('screen');
  const first = isFirstDay(i.installAt, i.now);
  if (first && (i.placement === 'interstitial' || i.ads.first_day_ads_free)) return no('first-day');
  if (i.placement === 'interstitial') {
    if (i.lastEntryAt != null && i.now - i.lastEntryAt < ENTRY_COOLDOWN_MS) return no('data-entry');
    if (i.lastInterstitialAt != null && i.now - i.lastInterstitialAt < i.ads.interstitial_min_interval_sec * 1000) return no('interval');
    if (i.interstitialsToday >= MAX_INTERSTITIALS_PER_DAY) return no('daily-cap');
  }
  if (i.placement === 'native') {
    if ((i.itemCount ?? 0) < MIN_ITEMS_FOR_NATIVE) return no('too-few-items');
    if (i.index !== undefined && i.index <= 0) return no('first-item');
  }
  return { show: true };
}

export const mayShow = (i: PolicyInput) => adDecision(i).show;

// ---- interstitial counters (persisted by the service as JSON) ----
export interface InterstitialLog {
  lastAt: number | null;
  /** Local calendar day of `count` (YYYY-MM-DD). */
  day: string;
  count: number;
}

export function dayKey(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Today's count: the stored count resets when the calendar day changes. */
export const countToday = (log: InterstitialLog, now: number) => (log.day === dayKey(now) ? log.count : 0);

export function recordInterstitial(log: InterstitialLog, now: number): InterstitialLog {
  return { lastAt: now, day: dayKey(now), count: countToday(log, now) + 1 };
}

export const EMPTY_LOG: InterstitialLog = { lastAt: null, day: '', count: 0 };

export function parseLog(raw: string | null): InterstitialLog {
  try {
    const j = raw ? (JSON.parse(raw) as Partial<InterstitialLog>) : null;
    if (j && typeof j.day === 'string' && typeof j.count === 'number' && (j.lastAt === null || typeof j.lastAt === 'number')) {
      return { lastAt: j.lastAt ?? null, day: j.day, count: j.count };
    }
  } catch {
    /* fall through */
  }
  return EMPTY_LOG;
}
