/** Tiny external store: is the SDK armed (3 s after first render) and ready (consent + init done)? Components subscribe. */
export interface AdsState {
  /** ~3 s after the first render and after interactions settled: ads may start to initialise. */
  armed: boolean;
  /** SDK initialised and consent lets us request ads. */
  ready: boolean;
  /** Consent resolved (obtained or not required): personalised ads allowed. Until then requests are non-personalised. */
  consentResolved: boolean;
  /** UMP says a consent form is required and has not been answered with consent: analytics collects nothing meanwhile. */
  consentBlocked: boolean;
  /** A UMP privacy-options form exists for this person (EEA etc.). */
  privacyOptions: boolean;
  /** Install time in ms once known. */
  installAt: number | null;
}

let s: AdsState = { armed: false, ready: false, consentResolved: false, consentBlocked: false, privacyOptions: false, installAt: null };
const ls = new Set<() => void>();

export const getAdsState = () => s;
export const subscribeAds = (l: () => void) => {
  ls.add(l);
  return () => void ls.delete(l);
};
export function patchAds(p: Partial<AdsState>) {
  s = { ...s, ...p };
  ls.forEach((l) => l());
}
