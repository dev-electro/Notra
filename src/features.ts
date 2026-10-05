/**
 * Feature switches. Flip a flag here (or later read it from remote config) to show a feature that is built but not ready.
 * diaryPhotoImport: "पुरानी डायरी की फ़ोटो से हिसाब" (read an old diary page from a photo). NOT built yet: while false, only a
 * non-interactive "जल्द आ रहा है" card is shown. It needs no camera permission and no network.
 */
export const FEATURES = {
  diaryPhotoImport: false,
} as const;
