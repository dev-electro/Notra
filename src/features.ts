import type { RemoteConfig } from '@/remote/config';

/**
 * Feature switches. A flag here is the baked-in default; the server's remote config (features.*) can turn a feature on without
 * a new release.
 * diaryPhotoImport: "पुरानी डायरी की फ़ोटो से हिसाब" (read an old diary page from a photo). NOT built yet: whether the card looks
 * switched off or on, tapping it only says "यह सुविधा जल्द आएगी". It needs no camera permission and no network.
 */
export const FEATURES = {
  diaryPhotoImport: false,
} as const;

/** Default flag OR the server's features.ocr. */
export const diaryPhotoImportOn = (c: Pick<RemoteConfig, 'features'>): boolean => FEATURES.diaryPhotoImport || c.features.ocr;
