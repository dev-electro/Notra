/** The wrapper must be a silent no-op where the native module is missing (Expo Go, jest) and must never throw. */
import { nativeAvailable, nativeLogEvent, nativeReset, nativeSetCollection, nativeSetConsent, resetNativeForTests } from '../native';

describe('native wrapper without the native module', () => {
  beforeEach(() => {
    jest.resetModules();
    resetNativeForTests();
  });
  it('is unavailable and every call returns false without throwing', () => {
    jest.doMock('@react-native-firebase/analytics', () => {
      throw new Error('Native module RNFBAppModule not found');
    });
    expect(nativeAvailable()).toBe(false);
    expect(nativeLogEvent('app_open_ready', {})).toBe(false);
    expect(nativeSetCollection(true)).toBe(false);
    expect(nativeSetConsent(false, true)).toBe(false);
    expect(nativeReset()).toBe(false);
  });
  it('swallows errors thrown by Firebase calls and rejected promises', async () => {
    jest.doMock('@react-native-firebase/analytics', () => ({
      getAnalytics: () => ({}),
      logEvent: () => Promise.reject(new Error('boom')),
      setAnalyticsCollectionEnabled: () => {
        throw new Error('sync boom');
      },
      setConsent: jest.fn(() => Promise.resolve()),
      resetAnalyticsData: jest.fn(() => Promise.resolve()),
    }));
    expect(nativeLogEvent('app_open_ready', {})).toBe(true); // rejection is caught, no unhandled rejection
    expect(nativeSetCollection(false)).toBe(false);
    expect(nativeSetConsent(true, true)).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
  });
});
