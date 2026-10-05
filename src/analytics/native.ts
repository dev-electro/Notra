/**
 * The ONLY file that touches @react-native-firebase. Everything is loaded lazily (require inside a function), after the first
 * render, and every call is wrapped so a missing native module (Expo Go, jest, a build without google-services) or any Firebase
 * error is silently ignored. Analytics must never throw, wait for the network or slow startup.
 */
type Mod = typeof import('@react-native-firebase/analytics');
type Handle = { m: Mod; a: ReturnType<Mod['getAnalytics']> };

let handle: Handle | null | undefined; // undefined = not tried yet, null = unavailable

function get(): Handle | null {
  if (handle !== undefined) return handle;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('@react-native-firebase/analytics') as Mod;
    handle = { m, a: m.getAnalytics() };
  } catch {
    handle = null;
  }
  return handle;
}

/** Fire-and-forget. Returns false when the native module is not there (no-op). */
function run(f: (h: Handle) => unknown): boolean {
  const h = get();
  if (!h) return false;
  try {
    const r = f(h);
    if (r && typeof (r as Promise<unknown>).catch === 'function') (r as Promise<unknown>).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

export const nativeAvailable = (): boolean => get() !== null;
export const nativeLogEvent = (name: string, params: Record<string, string | number>) => run((h) => h.m.logEvent(h.a, name, params));
export const nativeSetCollection = (enabled: boolean) => run((h) => h.m.setAnalyticsCollectionEnabled(h.a, enabled));
export const nativeSetConsent = (adSignals: boolean, analytics: boolean) =>
  run((h) =>
    h.m.setConsent(h.a, {
      analytics_storage: analytics,
      ad_storage: adSignals,
      ad_user_data: adSignals,
      ad_personalization: adSignals,
    }),
  );
export const nativeReset = () => run((h) => h.m.resetAnalyticsData(h.a));
/** Tests only. */
export const resetNativeForTests = () => {
  handle = undefined;
};
