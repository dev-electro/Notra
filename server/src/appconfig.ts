import type { Queryable } from './db';

/**
 * Remote config: a fixed set of known keys, each validated, each with a safe default. The app reads the public subset
 * from GET /v1/config (cached 5 minutes). Admins change keys from the admin panel; every change is kept in config_history.
 */

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = Record<string, unknown>;

export class InvalidConfig extends Error {}

export const CONFIG_DEFAULTS = {
  maintenance: { enabled: false, message_hi: 'ऐप का रखरखाव चल रहा है। कृपया थोड़ी देर बाद प्रयास करें।', message_en: 'Notra is under maintenance. Please try again shortly.' },
  min_supported_version: '1.0.0',
  latest_version: '1.0.0',
  force_update_message_hi: 'ऐप का नया संस्करण आ गया है। कृपया अपडेट करें।',
  announcement: { enabled: false, message_hi: '', starts_at: null, ends_at: null, level: 'info' },
  ads: {
    enabled: false, banner: false, native: false, interstitial: false, rewarded: false, inaam_video: false,
    interstitial_min_interval_sec: 300, native_every_n_items: 8, first_day_ads_free: true,
  },
  features: { web_app: false, ocr: false, invitation_cards: false, analytics: true, checkin: true, videos: true, referral: true, rewards: true, rishtey_discovery: false },
} as const;

export type ConfigKey = keyof typeof CONFIG_DEFAULTS;
export const CONFIG_KEYS = Object.keys(CONFIG_DEFAULTS) as ConfigKey[];
/** Keys returned by the public GET /v1/config. Today that is all of them; a future internal-only key just is not listed. */
export const PUBLIC_KEYS: readonly ConfigKey[] = CONFIG_KEYS;
export const isConfigKey = (k: string): k is ConfigKey => (CONFIG_KEYS as string[]).includes(k);

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

function bool(v: unknown, name: string): boolean {
  if (typeof v !== 'boolean') throw new InvalidConfig(`${name} must be true or false`);
  return v;
}
function text(v: unknown, name: string, max: number): string {
  if (typeof v !== 'string') throw new InvalidConfig(`${name} must be text`);
  const s = v.trim();
  if (s.length > max) throw new InvalidConfig(`${name} must be at most ${max} characters`);
  return s;
}
function int(v: unknown, name: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new InvalidConfig(`${name} must be a whole number from ${min} to ${max}`);
  return v;
}
function isoOrNull(v: unknown, name: string): string | null {
  if (v === null || v === '') return null;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw new InvalidConfig(`${name} must be an ISO date-time or empty`);
  return new Date(v).toISOString();
}
function version(v: unknown, name: string): string {
  if (typeof v !== 'string' || !SEMVER.test(v)) throw new InvalidConfig(`${name} must look like 1.2.3`);
  return v;
}
/** Object with exactly the known fields; missing ones fall back to the default, unknown ones are rejected. */
function shape(v: unknown, key: ConfigKey): Obj {
  if (!isObj(v)) throw new InvalidConfig(`${key} must be an object`);
  const def = CONFIG_DEFAULTS[key] as unknown as Obj;
  for (const k of Object.keys(v)) if (!(k in def)) throw new InvalidConfig(`${key}.${k} is not a known field`);
  return { ...def, ...v };
}
export const cmpVersion = (a: string, b: string): number => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

/** Validate and normalise a value for `key`. `current` is the config as it stands (for cross-key checks). Throws InvalidConfig. */
export function validateConfig(key: ConfigKey, value: unknown, current: Record<string, unknown> = {}): Json {
  switch (key) {
    case 'maintenance': {
      const o = shape(value, key);
      const out = { enabled: bool(o.enabled, 'enabled'), message_hi: text(o.message_hi, 'message_hi', 300), message_en: text(o.message_en, 'message_en', 300) };
      if (out.enabled && !out.message_hi) throw new InvalidConfig('message_hi is required while maintenance is on');
      return out;
    }
    case 'min_supported_version': {
      const v = version(value, key);
      const latest = current.latest_version;
      if (typeof latest === 'string' && cmpVersion(v, latest) > 0) throw new InvalidConfig('min_supported_version cannot be newer than latest_version');
      return v;
    }
    case 'latest_version': {
      const v = version(value, key);
      const min = current.min_supported_version;
      if (typeof min === 'string' && cmpVersion(v, min) < 0) throw new InvalidConfig('latest_version cannot be older than min_supported_version');
      return v;
    }
    case 'force_update_message_hi': {
      const s = text(value, key, 300);
      if (!s) throw new InvalidConfig('force_update_message_hi cannot be empty');
      return s;
    }
    case 'announcement': {
      const o = shape(value, key);
      const out = {
        enabled: bool(o.enabled, 'enabled'),
        message_hi: text(o.message_hi, 'message_hi', 300),
        starts_at: isoOrNull(o.starts_at, 'starts_at'),
        ends_at: isoOrNull(o.ends_at, 'ends_at'),
        level: o.level,
      };
      if (out.level !== 'info' && out.level !== 'warning' && out.level !== 'critical') throw new InvalidConfig('level must be info, warning or critical');
      if (out.enabled && !out.message_hi) throw new InvalidConfig('message_hi is required while the announcement is on');
      if (out.starts_at && out.ends_at && Date.parse(out.ends_at) <= Date.parse(out.starts_at)) throw new InvalidConfig('ends_at must be after starts_at');
      return out as Json;
    }
    case 'ads': {
      const o = shape(value, key);
      return {
        enabled: bool(o.enabled, 'enabled'), banner: bool(o.banner, 'banner'), native: bool(o.native, 'native'),
        interstitial: bool(o.interstitial, 'interstitial'), rewarded: bool(o.rewarded, 'rewarded'), inaam_video: bool(o.inaam_video, 'inaam_video'),
        interstitial_min_interval_sec: int(o.interstitial_min_interval_sec, 'interstitial_min_interval_sec', 60, 86400),
        native_every_n_items: int(o.native_every_n_items, 'native_every_n_items', 5, 50),
        first_day_ads_free: bool(o.first_day_ads_free, 'first_day_ads_free'),
      };
    }
    case 'features': {
      const o = shape(value, key);
      return { web_app: bool(o.web_app, 'web_app'), ocr: bool(o.ocr, 'ocr'), invitation_cards: bool(o.invitation_cards, 'invitation_cards'), analytics: bool(o.analytics, 'analytics'),
        checkin: bool(o.checkin, 'checkin'), videos: bool(o.videos, 'videos'), referral: bool(o.referral, 'referral'), rewards: bool(o.rewards, 'rewards'),
        rishtey_discovery: bool(o.rishtey_discovery, 'rishtey_discovery') };
    }
  }
}

export interface ConfigEntry {
  key: ConfigKey;
  value: Json;
  is_default: boolean;
  updated_by: string | null;
  updated_at: string | null;
}

/** jsonb is always read as text and parsed here, so the result does not depend on the driver's type parsers (fetch_types is off in the Worker). */
const asJson = (v: unknown): Json => JSON.parse(String(v)) as Json;

/** All known keys with their stored value, or the default when never set. Unknown stored keys are ignored. */
export async function loadConfig(q: Queryable): Promise<ConfigEntry[]> {
  const rows = await q.query<{ key: string; value: unknown; updated_by: string | null; updated_at: string | Date }>(
    'SELECT key, value::text AS value, updated_by, updated_at FROM app_config',
  );
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return CONFIG_KEYS.map((key) => {
    const r = byKey.get(key);
    return {
      key,
      value: r ? asJson(r.value) : (CONFIG_DEFAULTS[key] as unknown as Json),
      is_default: !r,
      updated_by: r?.updated_by ?? null,
      updated_at: r ? new Date(r.updated_at).toISOString() : null,
    };
  });
}

export async function loadConfigMap(q: Queryable): Promise<Record<ConfigKey, Json>> {
  return Object.fromEntries((await loadConfig(q)).map((e) => [e.key, e.value])) as Record<ConfigKey, Json>;
}

/** The subset served to the app, without auth. */
export async function publicConfig(q: Queryable, now: Date): Promise<Record<string, Json>> {
  const map = await loadConfigMap(q);
  const out: Record<string, Json> = {};
  for (const k of PUBLIC_KEYS) out[k] = map[k];
  out.fetched_at = now.toISOString();
  return out;
}

export interface Maintenance { enabled: boolean; message_hi: string; message_en: string }

/** Fail-open: if the config table cannot be read, the API stays up (maintenance is a convenience, not a security control). */
export async function getMaintenance(q: Queryable): Promise<Maintenance> {
  try {
    const [r] = await q.query<{ value: unknown }>(`SELECT value::text AS value FROM app_config WHERE key = 'maintenance'`);
    if (!r) return { ...CONFIG_DEFAULTS.maintenance };
    return { ...CONFIG_DEFAULTS.maintenance, ...(asJson(r.value) as Partial<Maintenance>) };
  } catch (e) {
    console.error('maintenance lookup failed', e instanceof Error ? e.message : e);
    return { ...CONFIG_DEFAULTS.maintenance };
  }
}

/** Validate and store a config key, appending the old and new values to config_history. Call inside the request's transaction. */
export async function setConfig(
  q: Queryable, key: ConfigKey, value: unknown, by: string, reason: string | null,
): Promise<{ before: Json | null; after: Json }> {
  const current = await loadConfigMap(q);
  const after = validateConfig(key, value, current);
  const [prev] = await q.query<{ value: unknown }>('SELECT value::text AS value FROM app_config WHERE key = $1 FOR UPDATE', [key]);
  const before = prev ? asJson(prev.value) : null;
  await q.query(
    `INSERT INTO app_config (key, value, updated_by, updated_at) VALUES ($1, $2::text::jsonb, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, JSON.stringify(after), by],
  );
  await q.query(
    'INSERT INTO config_history (key, before_value, after_value, changed_by, reason) VALUES ($1, $2::text::jsonb, $3::text::jsonb, $4, $5)',
    [key, before === null ? null : JSON.stringify(before), JSON.stringify(after), by, reason],
  );
  return { before, after };
}

/** One boolean in the `features` config (false when never set or unreadable). Used to keep a feature's endpoints dark until it is switched on. */
export async function featureOn(q: Queryable, name: keyof typeof CONFIG_DEFAULTS.features): Promise<boolean> {
  try {
    const [r] = await q.query<{ value: unknown }>(`SELECT value::text AS value FROM app_config WHERE key = 'features'`);
    const v = r ? (asJson(r.value) as Record<string, unknown>)[name] : undefined;
    return typeof v === 'boolean' ? v : (CONFIG_DEFAULTS.features[name] as boolean);
  } catch {
    return false;
  }
}
