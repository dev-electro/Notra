/* eslint-disable import/first -- jest.mock calls must precede the imports they replace */
jest.mock('../native', () => ({
  nativeLogEvent: jest.fn(),
  nativeSetCollection: jest.fn(),
  nativeSetConsent: jest.fn(),
  nativeReset: jest.fn(),
}));
const mockStore: Record<string, string> = {};
jest.mock('@/db/database', () => ({ getDb: async () => ({}) }));
jest.mock('@/db/repository', () => ({
  getSetting: async (_db: unknown, k: string) => mockStore[k] ?? null,
  setSetting: async (_db: unknown, k: string, v: string) => void (mockStore[k] = v),
}));

import { patchAds } from '@/ads/state';
import { DEFAULT_CONFIG } from '@/remote/config';
import { resetRemoteForTests, setRemoteConfig } from '@/remote/state';
import * as nativeModule from '../native';
import { __testing, START_DELAY_MS, getAnalyticsOptIn, OPT_IN_KEY, resetAnalyticsForTests, setAnalyticsOptIn, startAnalytics, track } from '../index';

const mockNative = { nativeLogEvent: nativeModule.nativeLogEvent, nativeSetCollection: nativeModule.nativeSetCollection, nativeSetConsent: nativeModule.nativeSetConsent, nativeReset: nativeModule.nativeReset } as unknown as Record<'nativeLogEvent' | 'nativeSetCollection' | 'nativeSetConsent' | 'nativeReset', jest.Mock>;
const flush = () => jest.advanceTimersByTimeAsync(START_DELAY_MS + 10);

beforeEach(() => {
  jest.useFakeTimers();
  (Object.keys(mockNative) as (keyof typeof mockNative)[]).forEach((k) => mockNative[k].mockClear());
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  resetAnalyticsForTests();
  resetRemoteForTests();
  patchAds({ consentBlocked: false, consentResolved: false });
});

afterEach(() => jest.useRealTimers());

describe('analytics service', () => {
  it('start: collection on by default, app_open_ready logged, ad signals denied', async () => {
    startAnalytics();
    await flush();
    expect(mockNative.nativeSetCollection).toHaveBeenCalledWith(true);
    expect(mockNative.nativeSetConsent).toHaveBeenCalledWith(false, true);
    expect(mockNative.nativeLogEvent).toHaveBeenCalledWith('app_open_ready', {});
  });

  it('events before start are queued and sent once collection is allowed', async () => {
    track('onboarding_complete');
    expect(mockNative.nativeLogEvent).not.toHaveBeenCalled();
    startAnalytics();
    await flush();
    const names = mockNative.nativeLogEvent.mock.calls.map((c) => c[0]);
    expect(names).toEqual(['onboarding_complete', 'app_open_ready']);
  });

  it('only sanitised params reach the native layer', async () => {
    startAnalytics();
    await flush();
    mockNative.nativeLogEvent.mockClear();
    // @ts-expect-error leaking fields are not even allowed by the types
    track('entry_saved', { side: 'mine_receive', has_in_kind: false, payment_mode: 'CASH', amount: 5001, name: 'Ramesh' });
    expect(mockNative.nativeLogEvent).toHaveBeenCalledWith('entry_saved', { side: 'mine_receive', has_in_kind: 0, payment_mode: 'CASH' });
    // @ts-expect-error not an allow-listed event
    track('household_created', { name: 'Ramesh' });
    expect(mockNative.nativeLogEvent).toHaveBeenCalledTimes(1);
  });

  it('Settings toggle off: stops collection, clears Firebase data, persists, nothing is logged after', async () => {
    startAnalytics();
    await flush();
    await setAnalyticsOptIn(false);
    expect(getAnalyticsOptIn()).toBe(false);
    expect(mockNative.nativeSetCollection).toHaveBeenLastCalledWith(false);
    expect(mockNative.nativeReset).toHaveBeenCalledTimes(1);
    expect(mockStore[OPT_IN_KEY]).toBe('0');
    mockNative.nativeLogEvent.mockClear();
    track('entry_voided');
    expect(mockNative.nativeLogEvent).not.toHaveBeenCalled();
    await setAnalyticsOptIn(true);
    expect(mockNative.nativeSetCollection).toHaveBeenLastCalledWith(true);
    track('entry_voided');
    expect(mockNative.nativeLogEvent).toHaveBeenCalledWith('entry_voided', {});
  });

  it('a stored opt-out is honoured at start: nothing is ever collected or logged', async () => {
    mockStore[OPT_IN_KEY] = '0';
    startAnalytics();
    await flush();
    expect(getAnalyticsOptIn()).toBe(false);
    expect(mockNative.nativeSetCollection).toHaveBeenCalledWith(false);
    expect(mockNative.nativeLogEvent).not.toHaveBeenCalled();
  });

  it('remote flag features.analytics=false switches collection off, and back on', async () => {
    startAnalytics();
    await flush();
    setRemoteConfig({ ...DEFAULT_CONFIG, features: { ...DEFAULT_CONFIG.features, analytics: false } });
    expect(mockNative.nativeSetCollection).toHaveBeenLastCalledWith(false);
    mockNative.nativeLogEvent.mockClear();
    track('entry_voided');
    expect(mockNative.nativeLogEvent).not.toHaveBeenCalled();
    setRemoteConfig(DEFAULT_CONFIG);
    expect(mockNative.nativeSetCollection).toHaveBeenLastCalledWith(true);
  });

  it('UMP: blocked while a required form is unanswered; ad signals granted only when resolved', async () => {
    patchAds({ consentBlocked: true });
    startAnalytics();
    await flush();
    expect(mockNative.nativeSetCollection).toHaveBeenCalledWith(false);
    expect(mockNative.nativeLogEvent).not.toHaveBeenCalled(); // queue is dropped, not sent
    patchAds({ consentBlocked: false, consentResolved: true });
    expect(mockNative.nativeSetCollection).toHaveBeenLastCalledWith(true);
    expect(mockNative.nativeSetConsent).toHaveBeenLastCalledWith(true, true);
  });

  it('never throws, whatever it is given', () => {
    expect(() => {
      // @ts-expect-error junk on purpose
      track(undefined, null);
      // @ts-expect-error junk on purpose
      track('entry_saved', 'x');
      __testing.apply();
    }).not.toThrow();
  });
});
