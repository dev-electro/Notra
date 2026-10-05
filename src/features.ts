import type { RemoteConfig } from '@/remote/config';

/**
 * Feature switches. A flag here is the baked-in default; the server's remote config (features.*) can turn a feature on without
 * a new release.
 * diaryPhotoImport: "पुरानी डायरी की फ़ोटो से हिसाब" (read an old diary page from a photo). NOT built yet: whether the card looks
 * switched off or on, tapping it only says "यह सुविधा जल्द आएगी". It needs no camera permission and no network.
 */
export const FEATURES = {
  diaryPhotoImport: false,
  /** Super-app modules (src/modules/registry.ts). all are live (rewards modules sit on the इनाम tab). */
  notra: true,
  rishtey: true,
  /** रिश्ते phase 2: community discovery (profiles visible to others). OFF until the legal review is done; the server's features.rishtey_discovery can turn it on. */
  rishteyDiscovery: false,
  checkin: true,
  rewards: true,
  referral: true,
  videos: true,
} as const;

/** Default flag OR the server's features.ocr. */
export const diaryPhotoImportOn = (c: Pick<RemoteConfig, 'features'>): boolean => FEATURES.diaryPhotoImport || c.features.ocr;

/** Module switch: the baked-in default OR the server's features.<id> when it sends one (the server may add keys freely). */
export const moduleOn = (id: Exclude<keyof typeof FEATURES, 'diaryPhotoImport' | 'rishteyDiscovery'>, c: Pick<RemoteConfig, 'features'>): boolean =>
  FEATURES[id] || (c.features as unknown as Record<string, unknown>)[id] === true;

/** Community discovery switch: the baked-in default OR the server's features.rishtey_discovery. Screens also need a signed-in account. */
export const rishteyDiscoveryOn = (c: Pick<RemoteConfig, 'features'>): boolean => FEATURES.rishteyDiscovery || c.features.rishtey_discovery;
