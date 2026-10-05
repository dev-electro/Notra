/**
 * Remote config (GET /v1/config): the pure part. Defaults are baked in, so the app behaves the same with no server at all.
 * Validation is defensive: unknown fields are dropped, a field of the wrong type falls back to its default, and a bad
 * config never throws. No React or Expo imports.
 */
export type AnnouncementLevel = 'info' | 'warning' | 'critical';

export interface RemoteConfig {
  maintenance: { enabled: boolean; message_hi: string };
  min_supported_version: string;
  latest_version: string;
  force_update_message_hi: string;
  announcement: { enabled: boolean; message_hi: string; starts_at: string | null; ends_at: string | null; level: AnnouncementLevel };
  ads: {
    enabled: boolean;
    banner: boolean;
    native: boolean;
    interstitial: boolean;
    rewarded: boolean;
    interstitial_min_interval_sec: number;
    native_every_n_items: number;
    first_day_ads_free: boolean;
  };
  features: { web_app: boolean; ocr: boolean; invitation_cards: boolean; /** usage statistics (Google Analytics for Firebase); the server can switch it off for everyone */ analytics: boolean };
}

export const DEFAULT_CONFIG: RemoteConfig = {
  maintenance: { enabled: false, message_hi: 'अभी रखरखाव चल रहा है। आपका हिसाब फ़ोन में सुरक्षित है और ऐप चलता रहेगा। बैकअप थोड़ी देर में होगा।' },
  min_supported_version: '0.0.0',
  latest_version: '0.0.0',
  force_update_message_hi: 'इस ऐप का नया संस्करण आ गया है। जारी रखने के लिए कृपया अपडेट करें। आपका हिसाब फ़ोन में सुरक्षित है।',
  announcement: { enabled: false, message_hi: '', starts_at: null, ends_at: null, level: 'info' },
  ads: {
    enabled: false,
    banner: false,
    native: false,
    interstitial: false,
    rewarded: false,
    interstitial_min_interval_sec: 300,
    native_every_n_items: 8,
    first_day_ads_free: true,
  },
  features: { web_app: false, ocr: false, invitation_cards: false, analytics: true },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const str = (v: unknown, d: string, max = 600) => (typeof v === 'string' ? v.slice(0, max) : d);
const int = (v: unknown, d: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d;
const version = (v: unknown, d: string) => (typeof v === 'string' && /^\d+(\.\d+){0,3}$/.test(v.trim()) ? v.trim() : d);
const isoOrNull = (v: unknown): string | null => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);

/** Anything in, a complete valid config out. `base` is what missing fields fall back to (defaults, or the last good config). */
export function parseConfig(raw: unknown, base: RemoteConfig = DEFAULT_CONFIG): RemoteConfig {
  if (!isObj(raw)) return base;
  const m = isObj(raw.maintenance) ? raw.maintenance : {};
  const a = isObj(raw.announcement) ? raw.announcement : {};
  const ad = isObj(raw.ads) ? raw.ads : {};
  const f = isObj(raw.features) ? raw.features : {};
  const level = a.level === 'warning' || a.level === 'critical' || a.level === 'info' ? a.level : base.announcement.level;
  return {
    maintenance: { enabled: bool(m.enabled, base.maintenance.enabled), message_hi: str(m.message_hi, base.maintenance.message_hi) || base.maintenance.message_hi },
    min_supported_version: version(raw.min_supported_version, base.min_supported_version),
    latest_version: version(raw.latest_version, base.latest_version),
    force_update_message_hi: str(raw.force_update_message_hi, base.force_update_message_hi) || base.force_update_message_hi,
    announcement: {
      enabled: bool(a.enabled, base.announcement.enabled),
      message_hi: str(a.message_hi, base.announcement.message_hi),
      starts_at: 'starts_at' in a ? isoOrNull(a.starts_at) : base.announcement.starts_at,
      ends_at: 'ends_at' in a ? isoOrNull(a.ends_at) : base.announcement.ends_at,
      level,
    },
    ads: {
      enabled: bool(ad.enabled, base.ads.enabled),
      banner: bool(ad.banner, base.ads.banner),
      native: bool(ad.native, base.ads.native),
      interstitial: bool(ad.interstitial, base.ads.interstitial),
      rewarded: bool(ad.rewarded, base.ads.rewarded),
      interstitial_min_interval_sec: int(ad.interstitial_min_interval_sec, base.ads.interstitial_min_interval_sec, 60, 86_400),
      native_every_n_items: int(ad.native_every_n_items, base.ads.native_every_n_items, 5, 50),
      first_day_ads_free: bool(ad.first_day_ads_free, base.ads.first_day_ads_free),
    },
    features: { web_app: bool(f.web_app, base.features.web_app), ocr: bool(f.ocr, base.features.ocr), invitation_cards: bool(f.invitation_cards, base.features.invitation_cards), analytics: bool(f.analytics, base.features.analytics) },
  };
}

/** Numeric dotted-version compare: -1, 0, 1. Missing parts count as 0 ("1.2" = "1.2.0"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export type UpdateState = 'ok' | 'soft' | 'forced';
/** forced: installed version below min_supported_version (blocking screen). soft: a newer version exists (dismissible banner). */
export function updateState(current: string, c: Pick<RemoteConfig, 'min_supported_version' | 'latest_version'>): UpdateState {
  if (compareVersions(current, c.min_supported_version) < 0) return 'forced';
  if (compareVersions(current, c.latest_version) < 0) return 'soft';
  return 'ok';
}

/** Is the announcement to be shown now? Enabled, has text, and inside its optional start/end window. */
export function announcementActive(a: RemoteConfig['announcement'], now: Date): boolean {
  if (!a.enabled || !a.message_hi.trim()) return false;
  const t = now.getTime();
  if (a.starts_at && t < Date.parse(a.starts_at)) return false;
  if (a.ends_at && t > Date.parse(a.ends_at)) return false;
  return true;
}

/** Stable id of an announcement, so "dismissed" is remembered per message and a new message shows again. */
export const announcementKey = (a: RemoteConfig['announcement']) => `${a.starts_at ?? ''}|${a.message_hi}`;

export const CONFIG_MIN_GAP_MS = 5 * 60_000;
/** Throttle: fetch at most once per 5 minutes (start and foreground). */
export const shouldFetchConfig = (lastAttemptMs: number | null, nowMs: number) => lastAttemptMs === null || nowMs - lastAttemptMs >= CONFIG_MIN_GAP_MS;
