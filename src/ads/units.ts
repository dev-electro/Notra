/**
 * Which ad unit ids to use. TEST ids (Google's published sample ids) are the default and are always used in development
 * (__DEV__) or when the build says test (NOTRA_ADS_TEST=1, or any real id missing: see app.config.js). Real ids come from the build
 * environment through app.config.js -> extra.ads, never from source. Pure: no native imports.
 */
export type AdKind = 'banner' | 'native' | 'interstitial' | 'rewarded';
export type UnitIds = Record<AdKind, string>;

export const TEST_APP_ID = { android: 'ca-app-pub-3940256099942544~3347511713', ios: 'ca-app-pub-3940256099942544~1458002511' } as const;

export const TEST_UNITS: { android: UnitIds; ios: UnitIds } = {
  android: {
    banner: 'ca-app-pub-3940256099942544/9214589741',
    native: 'ca-app-pub-3940256099942544/2247696110',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
  },
  ios: {
    banner: 'ca-app-pub-3940256099942544/2435281174',
    native: 'ca-app-pub-3940256099942544/3986624511',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
  },
};

/** What app.config.js puts in expo.extra.ads. */
export interface AdsExtra {
  test?: boolean;
  /** Test builds only: pretend the app was installed 2 days ago so end-to-end runs see ads. */
  e2e?: boolean;
  units?: Partial<UnitIds>;
}

export interface ResolvedUnits {
  test: boolean;
  units: UnitIds;
}

const KINDS: AdKind[] = ['banner', 'native', 'interstitial', 'rewarded'];

export function resolveUnits(o: { dev: boolean; platform: 'android' | 'ios' | 'web'; extra?: AdsExtra }): ResolvedUnits {
  const tests = TEST_UNITS[o.platform === 'ios' ? 'ios' : 'android'];
  const real = o.extra?.units;
  const complete = !!real && KINDS.every((k) => typeof real[k] === 'string' && real[k]!.startsWith('ca-app-pub-'));
  // iOS is not shipped: it always uses test ids. A real id is used only on Android, in a non-dev, non-test build with all four set.
  const test = o.dev || !!o.extra?.test || !complete || o.platform !== 'android';
  return { test, units: test ? tests : (real as UnitIds) };
}

/** Installed-at override for end-to-end runs; honoured only in a test build. */
export const e2eInstallAt = (extra: AdsExtra | undefined, test: boolean, now: number): number | null =>
  test && extra?.e2e ? now - 2 * 86_400_000 : null;
