/**
 * When may analytics collect? PURE logic (no imports), unit-tested.
 *  - the person's own switch in Settings ("ऐप सुधार के लिए उपयोग के आँकड़े भेजें", on by default);
 *  - the remote flag features.analytics (default true; the server can switch collection off for everyone);
 *  - Google UMP: where a consent form is REQUIRED and not yet answered, nothing is collected.
 * Ad personalisation signals (ad_user_data, ad_personalization, ad_storage) are granted only after UMP has resolved
 * (obtained or not required); until then they stay denied. This app's analytics never carries ad-related data either way.
 */
export interface ConsentInputs {
  /** Settings toggle. Undefined/null = never touched = on. */
  userOptIn: boolean | null | undefined;
  /** getRemote().config.features.analytics */
  remoteEnabled: boolean;
  /** UMP says a form is required and the person has not given consent (yet). */
  consentBlocked: boolean;
  /** UMP resolved: consent obtained or not required. */
  adsConsentResolved: boolean;
}

export interface CollectionPlan {
  collect: boolean;
  adSignals: boolean;
}

export function collectionPlan(i: ConsentInputs): CollectionPlan {
  const collect = i.userOptIn !== false && i.remoteEnabled && !i.consentBlocked;
  return { collect, adSignals: collect && i.adsConsentResolved };
}

/** Stored value of the Settings toggle: only an explicit "0" turns analytics off. */
export const parseOptIn = (raw: string | null | undefined): boolean => raw !== '0';
