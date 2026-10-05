import { announcementActive, announcementKey, compareVersions, DEFAULT_CONFIG, parseConfig, shouldFetchConfig, updateState } from '../config';
import { getRemote, resetRemoteForTests, setRemoteConfig, setSuspended, syncPaused } from '../state';

describe('parseConfig', () => {
  it('returns defaults for garbage', () => {
    for (const g of [null, undefined, 5, 'x', [], {}]) expect(parseConfig(g)).toEqual(DEFAULT_CONFIG);
  });
  it('accepts the full documented shape', () => {
    const c = parseConfig({
      maintenance: { enabled: true, message_hi: 'रखरखाव' }, min_supported_version: '1.2.0', latest_version: '1.3.0', force_update_message_hi: 'अपडेट',
      announcement: { enabled: true, message_hi: 'सूचना', starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-10-09T00:00:00Z', level: 'warning' },
      ads: { enabled: false, banner: false, native: true, interstitial: false, rewarded: true, interstitial_min_interval_sec: 600, native_every_n_items: 10, first_day_ads_free: false },
      features: { web_app: true, ocr: true, invitation_cards: true, analytics: false },
    });
    expect(c.maintenance).toEqual({ enabled: true, message_hi: 'रखरखाव' });
    expect(c.min_supported_version).toBe('1.2.0');
    expect(c.ads).toEqual({ enabled: false, banner: false, native: true, interstitial: false, rewarded: true, interstitial_min_interval_sec: 600, native_every_n_items: 10, first_day_ads_free: false });
    expect(c.features).toEqual({ web_app: true, ocr: true, invitation_cards: true, analytics: false });
    expect(c.announcement.level).toBe('warning');
  });
  it('ignores unknown fields and invalid values, field by field', () => {
    const c = parseConfig({ surprise: 1, maintenance: { enabled: 'yes' }, min_supported_version: 'abc', ads: { banner: 'no', native_every_n_items: 'x', interstitial_min_interval_sec: 5 }, announcement: { level: 'loud', starts_at: 'not a date' }, features: { ocr: 1 } });
    expect(c).toEqual({ ...DEFAULT_CONFIG, ads: { ...DEFAULT_CONFIG.ads, interstitial_min_interval_sec: 60 } });
    expect(c).not.toHaveProperty('surprise');
  });
  it('ads are off by default and clamp like the server (60..86400 s, every 5..50 items)', () => {
    expect(DEFAULT_CONFIG.ads).toMatchObject({ enabled: false, banner: false, native: false, interstitial: false, rewarded: false });
    expect(parseConfig({ ads: { interstitial_min_interval_sec: 999_999, native_every_n_items: 999 } }).ads).toMatchObject({ interstitial_min_interval_sec: 86_400, native_every_n_items: 50 });
  });

  it('features.analytics defaults to true and only an explicit boolean changes it', () => {
    expect(DEFAULT_CONFIG.features.analytics).toBe(true);
    expect(parseConfig({ features: { analytics: false } }).features.analytics).toBe(false);
    for (const bad of ['no', 0, null, {}, []]) expect(parseConfig({ features: { analytics: bad } }).features.analytics).toBe(true);
    expect(parseConfig({ features: { ocr: true } }).features.analytics).toBe(true);
  });
  it('clamps ad frequency so a bad config cannot flood the user', () => {
    const c = parseConfig({ ads: { native_every_n_items: 1, interstitial_min_interval_sec: 0 } });
    expect(c.ads.native_every_n_items).toBe(5);
    expect(c.ads.interstitial_min_interval_sec).toBe(60);
  });
  it('missing fields fall back to the base (last good config)', () => {
    const last = parseConfig({ latest_version: '2.0.0' });
    expect(parseConfig({ ads: { banner: false } }, last).latest_version).toBe('2.0.0');
  });
});

describe('versions and updates', () => {
  it('compares dotted versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('0.9.9', '1.0.0')).toBe(-1);
  });
  it('below min = forced, below latest = soft, else ok', () => {
    const c = { min_supported_version: '1.2.0', latest_version: '1.4.0' };
    expect(updateState('1.1.9', c)).toBe('forced');
    expect(updateState('1.2.0', c)).toBe('soft');
    expect(updateState('1.4.0', c)).toBe('ok');
    expect(updateState('1.0.0', DEFAULT_CONFIG)).toBe('ok');
  });
});

describe('announcement window', () => {
  const a = { enabled: true, message_hi: 'सूचना', starts_at: '2026-10-05T00:00:00Z', ends_at: '2026-10-07T00:00:00Z', level: 'info' as const };
  it('shows only inside its window and when enabled with text', () => {
    expect(announcementActive(a, new Date('2026-10-06T00:00:00Z'))).toBe(true);
    expect(announcementActive(a, new Date('2026-10-04T00:00:00Z'))).toBe(false);
    expect(announcementActive(a, new Date('2026-10-08T00:00:00Z'))).toBe(false);
    expect(announcementActive({ ...a, enabled: false }, new Date('2026-10-06T00:00:00Z'))).toBe(false);
    expect(announcementActive({ ...a, message_hi: ' ' }, new Date('2026-10-06T00:00:00Z'))).toBe(false);
    expect(announcementActive({ ...a, starts_at: null, ends_at: null }, new Date('2030-01-01'))).toBe(true);
  });
  it('a new message has a new key (so a dismissed one does not hide it)', () => {
    expect(announcementKey(a)).not.toBe(announcementKey({ ...a, message_hi: 'नई' }));
  });
});

describe('throttle and pause', () => {
  it('fetches at most once per 5 minutes', () => {
    expect(shouldFetchConfig(null, 1000)).toBe(true);
    expect(shouldFetchConfig(1000, 1000 + 299_999)).toBe(false);
    expect(shouldFetchConfig(1000, 1000 + 300_000)).toBe(true);
  });
  it('maintenance or a suspended account pauses sync only', () => {
    resetRemoteForTests();
    expect(syncPaused()).toBe(false);
    setRemoteConfig(parseConfig({ maintenance: { enabled: true, message_hi: 'x' } }));
    expect(syncPaused()).toBe(true);
    resetRemoteForTests();
    setSuspended('रोका गया');
    expect(syncPaused()).toBe(true);
    expect(getRemote().suspended).toBe('रोका गया');
    resetRemoteForTests();
  });
});
