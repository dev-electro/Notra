/**
 * Ads service. EVERYTHING native is loaded lazily (require inside functions) and only ~3 s after the first render, after
 * interactions have settled, and only when a screen that may show an ad asks. If the phone is offline or anything fails, nothing
 * renders and nothing is reserved. No ledger data is ever passed to the SDK: ad requests carry no keywords, content URL or
 * location; only `requestNonPersonalizedAdsOnly` until consent is resolved.
 */
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { AppState, InteractionManager, Platform } from 'react-native';
import { getDb } from '@/db/database';
import { getSetting, setSetting } from '@/db/repository';
import type { Db } from '@/db/types';
import { onLocalWrite } from '@/db/writes';
import { isOnlineHint, markOnline } from '@/remote/online';
import { getRemote } from '@/remote/state';
import { adDecision, countToday, EMPTY_LOG, parseLog, recordInterstitial, type AdScreen, type InterstitialLog } from './policy';
import { getAdsState, patchAds } from './state';
import { e2eInstallAt, resolveUnits, type AdsExtra, type ResolvedUnits } from './units';

const LOG_KEY = 'ads_interstitial_log_v1';
const ARM_DELAY_MS = 3000;

const extra = () => (Constants.expoConfig?.extra as { ads?: AdsExtra } | undefined)?.ads;
export const adUnits = (): ResolvedUnits =>
  resolveUnits({ dev: __DEV__, platform: Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web', extra: extra() });

/** End-to-end test build: banners and native cards appear, but never a full-screen ad (it would block the test runner). */
const e2eBuild = () => !!extra()?.e2e && adUnits().test;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lib = () => require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads');

let lastEntryAt: number | null = null;

/** Root layout: arm ads ~3 s after the first render (never blocks startup) and remember when data was last saved. */
export function startAds(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timer = null;
    InteractionManager.runAfterInteractions(() => {
      const test = adUnits().test;
      const forced = e2eInstallAt(extra(), test, Date.now());
      void (forced !== null ? Promise.resolve(forced) : Application.getInstallationTimeAsync().then((d) => d.getTime()).catch(() => null)).then((installAt) =>
        patchAds({ armed: true, installAt }),
      );
    });
  }, ARM_DELAY_MS);
  const offWrite = onLocalWrite(() => {
    lastEntryAt = Date.now();
  });
  const sub = AppState.addEventListener('change', (st) => {
    if (st === 'active' && getAdsState().armed && !getAdsState().ready) void initAds(); // retry after being offline
  });
  return () => {
    if (timer) clearTimeout(timer);
    offWrite();
    sub.remove();
  };
}

let initPromise: Promise<void> | null = null;
let failedAt = 0;

/** Consent (UMP: shows a form only where the law requires one) then the SDK. Safe to call many times. */
export function initAds(): Promise<void> {
  const st = getAdsState();
  if (st.ready) return Promise.resolve();
  if (initPromise) return initPromise;
  if (Date.now() - failedAt < 60_000) return Promise.resolve();
  initPromise = (async () => {
    try {
      const { default: mobileAds, AdsConsent, MaxAdContentRating } = lib();
      const { test } = adUnits();

      await mobileAds().setRequestConfiguration({
        maxAdContentRating: MaxAdContentRating.PG,
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: false,
        testDeviceIdentifiers: test ? ['EMULATOR'] : [],
      });
      let info;
      try {
        await AdsConsent.requestInfoUpdate();
        info = await AdsConsent.loadAndShowConsentFormIfRequired();
      } catch {
        info = await AdsConsent.getConsentInfo(); // offline: UMP's cached answer, if any
      }
      patchAds({
        privacyOptions: info.privacyOptionsRequirementStatus === 'REQUIRED',
        consentResolved: info.status === 'OBTAINED' || info.status === 'NOT_REQUIRED',
      });
      if (!info.canRequestAds) throw new Error('consent');
      await mobileAds().initialize();
      patchAds({ ready: true });
      markOnline(true);
    } catch (e) {
      failedAt = Date.now();
      if (!(e instanceof Error && e.message === 'consent')) markOnline(false);
    } finally {
      initPromise = null;
    }
  })();
  return initPromise;
}

/** Options for every ad request: no keywords, no content URL; non-personalised until consent is resolved. */
export const requestOptions = () => ({ requestNonPersonalizedAdsOnly: !getAdsState().consentResolved });

/** Settings: open Google's privacy options form (only offered where one exists). */
export async function showPrivacyOptions(): Promise<void> {
  try {
    await lib().AdsConsent.showPrivacyOptionsForm();
  } catch {
    /* form unavailable: nothing to do */
  }
}

// ---------- policy glue ----------
async function readLog(): Promise<InterstitialLog> {
  try {
    return parseLog(await getSetting((await getDb()) as unknown as Db, LOG_KEY));
  } catch {
    return EMPTY_LOG;
  }
}

/** Decision with the live state filled in (config, install date, online hint, SDK state). */
export function liveDecision(placement: Parameters<typeof adDecision>[0]['placement'], screen: AdScreen, more: { itemCount?: number; index?: number; log?: InterstitialLog; assumeReady?: boolean } = {}) {
  const st = getAdsState();
  const now = Date.now();
  const log = more.log ?? EMPTY_LOG;
  return adDecision({
    placement, screen, ads: getRemote().config.ads, now, installAt: st.installAt, lastInterstitialAt: log.lastAt, interstitialsToday: countToday(log, now),
    online: isOnlineHint(), sdkReady: st.ready || !!more.assumeReady, lastEntryAt, itemCount: more.itemCount, index: more.index,
  });
}

// ---------- interstitial: ONLY after a report export / share completed ----------
type Loaded = { show(): Promise<void> | void; addAdEventListener(t: string, l: (e?: unknown) => void): () => void; load(): void } | null;
let interstitial: { ad: Loaded; loaded: boolean } | null = null;

/** Call when an export starts: loads an interstitial in the background so it is ready when the export completes (if policy allows it). */
export async function prepareExportInterstitial(): Promise<void> {
  if (interstitial || e2eBuild()) return;
  if (!getAdsState().armed) return;
  await initAds();
  if (!liveDecision('interstitial', 'report_export', { log: await readLog() }).show) return;
  try {
    const { InterstitialAd, AdEventType } = lib();
    const ad = InterstitialAd.createForAdRequest(adUnits().units.interstitial, requestOptions());
    const rec = { ad: ad as unknown as Loaded, loaded: false };
    interstitial = rec;
    ad.addAdEventListener(AdEventType.LOADED, () => void (rec.loaded = true));
    ad.addAdEventListener(AdEventType.ERROR, () => {
      if (interstitial === rec) interstitial = null;
    });
    ad.addAdEventListener(AdEventType.CLOSED, () => {
      if (interstitial === rec) interstitial = null;
    });
    ad.load();
  } catch {
    interstitial = null;
  }
}

/** The natural break after a report export/share finished. Re-checks the policy at this moment; shows nothing if it says no. */
export async function showExportInterstitial(): Promise<boolean> {
  const rec = interstitial;
  if (!rec?.loaded) return false;
  const log = await readLog();
  if (!liveDecision('interstitial', 'report_export', { log }).show) return false;
  try {
    await rec.ad!.show();
    const next = recordInterstitial(log, Date.now());
    await setSetting((await getDb()) as unknown as Db, LOG_KEY, JSON.stringify(next));
    return true;
  } catch {
    interstitial = null;
    return false;
  }
}

// ---------- rewarded (opt-in): remove the watermark from one export ----------
export function rewardedAllowed(): boolean {
  if (e2eBuild()) return false;
  return liveDecision('rewarded', 'report_export').show;
}

/** Resolves true only if the person watched to the reward. Any failure or timeout resolves false (the export then goes with the watermark). */
export async function watchRewardedAd(loadTimeoutMs = 10_000): Promise<boolean> {
  try {
    await initAds();
    if (!rewardedAllowed()) return false;
    const { RewardedAd, RewardedAdEventType, AdEventType } = lib();
    const ad = RewardedAd.createForAdRequest(adUnits().units.rewarded, requestOptions());
    return await new Promise<boolean>((resolve) => {
      let earned = false;
      const offs: (() => void)[] = [];
      const done = (v: boolean) => {
        offs.forEach((o) => o());
        clearTimeout(timer);
        resolve(v);
      };
      const timer = setTimeout(() => done(false), loadTimeoutMs);
      offs.push(ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        clearTimeout(timer);
        void ad.show().catch(() => done(false));
      }));
      offs.push(ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => void (earned = true)));
      offs.push(ad.addAdEventListener(AdEventType.CLOSED, () => done(earned)));
      offs.push(ad.addAdEventListener(AdEventType.ERROR, () => done(false)));
      ad.load();
    });
  } catch {
    return false;
  }
}
