import { DEFAULT_CONFIG } from '@/remote/config';
import { adDecision, ALLOWED_SCREENS, countToday, dayKey, DAY_MS, EMPTY_LOG, ENTRY_COOLDOWN_MS, parseLog, recordInterstitial, type AdScreen, type PolicyInput } from '../policy';

/** Ads are off by default (as on the server); the policy tests need every placement on. */
const ADS_ON = { ...DEFAULT_CONFIG.ads, enabled: true, banner: true, native: true, interstitial: true, rewarded: true };

const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const base = (o: Partial<PolicyInput> = {}): PolicyInput => ({
  placement: 'banner', screen: 'home', ads: ADS_ON, now: NOW, installAt: NOW - 5 * DAY_MS, lastInterstitialAt: null,
  interstitialsToday: 0, online: true, sdkReady: true, ...o,
});
const reason = (o: Partial<PolicyInput>) => {
  const d = adDecision(base(o));
  return d.show ? 'show' : d.reason;
};

describe('ads policy', () => {
  it('shows a banner on home and hisab when everything is fine', () => {
    expect(reason({})).toBe('show');
    expect(reason({ screen: 'hisab' })).toBe('show');
  });
  it('needs the SDK ready', () => expect(reason({ sdkReady: false })).toBe('not-ready'));
  it('master switch and each placement switch', () => {
    expect(reason({ ads: { ...ADS_ON, enabled: false } })).toBe('disabled');
    for (const p of ['banner', 'native', 'interstitial', 'rewarded'] as const) {
      expect(reason({ placement: p, screen: ALLOWED_SCREENS[p][0]!, itemCount: 10, index: 3, ads: { ...ADS_ON, [p]: false } })).toBe('placement-off');
    }
  });
  it('offline shows nothing', () => expect(reason({ online: false })).toBe('offline'));

  it('banner only on home and hisab', () => {
    const never: AdScreen[] = ['mera', 'doosre', 'report_list', 'report_export', 'event_ledger', 'entry_form', 'keypad', 'lock', 'onboarding', 'signin', 'settings', 'legal', 'backup', 'account_delete', 'error', 'other'];
    for (const s of never) expect(reason({ screen: s })).toBe('screen');
  });
  it('no placement ever shows on ledger, forms, keypad, lock, onboarding, sign-in, settings, legal, backup, deletion, error', () => {
    const blocked: AdScreen[] = ['event_ledger', 'entry_form', 'keypad', 'lock', 'onboarding', 'signin', 'settings', 'legal', 'backup', 'account_delete', 'error', 'other'];
    for (const p of ['banner', 'native', 'interstitial', 'rewarded'] as const) {
      for (const s of blocked) {
        expect(reason({ placement: p, screen: s, itemCount: 20, index: 5, installAt: NOW - 9 * DAY_MS })).toBe('screen');
      }
    }
  });

  describe('first day', () => {
    const first = NOW - 3_600_000;
    it('blocks banner, native and rewarded when first_day_ads_free (default)', () => {
      expect(reason({ installAt: first })).toBe('first-day');
      expect(reason({ placement: 'native', screen: 'mera', itemCount: 9, index: 4, installAt: first })).toBe('first-day');
      expect(reason({ placement: 'rewarded', screen: 'report_export', installAt: first })).toBe('first-day');
    });
    it('config can allow banners on day one, but an interstitial is NEVER shown on day one', () => {
      const ads = { ...ADS_ON, first_day_ads_free: false };
      expect(reason({ ads, installAt: first })).toBe('show');
      expect(reason({ ads, placement: 'interstitial', screen: 'report_export', installAt: first })).toBe('first-day');
    });
    it('unknown install time counts as the first day', () => expect(reason({ installAt: null })).toBe('first-day'));
    it('after 24 h ads are allowed', () => {
      expect(reason({ installAt: NOW - DAY_MS })).toBe('show');
      expect(reason({ installAt: NOW - DAY_MS + 1 })).toBe('first-day');
    });
  });

  describe('native', () => {
    const n = (o: Partial<PolicyInput>) => reason({ placement: 'native', screen: 'mera', itemCount: 10, index: 4, ...o });
    it('lists with fewer than 6 items get none', () => {
      expect(n({ itemCount: 5 })).toBe('too-few-items');
      expect(n({ itemCount: 6 })).toBe('show');
      expect(n({ itemCount: undefined })).toBe('too-few-items');
    });
    it('never as the first item', () => {
      expect(n({ index: 0 })).toBe('first-item');
      expect(n({ index: 1 })).toBe('show');
    });
    it('allowed on mera, doosre and report lists', () => {
      for (const s of ['mera', 'doosre', 'report_list'] as const) expect(n({ screen: s })).toBe('show');
      expect(n({ screen: 'home' })).toBe('screen');
    });
  });

  describe('interstitial', () => {
    const i = (o: Partial<PolicyInput> = {}) => reason({ placement: 'interstitial', screen: 'report_export', ...o });
    it('only after a report export', () => {
      expect(i()).toBe('show');
      expect(i({ screen: 'home' })).toBe('screen');
      expect(i({ screen: 'hisab' })).toBe('screen');
    });
    it('respects the minimum interval from remote config', () => {
      expect(i({ lastInterstitialAt: NOW - 299_000 })).toBe('interval');
      expect(i({ lastInterstitialAt: NOW - 300_000 })).toBe('show');
      const ads = { ...ADS_ON, interstitial_min_interval_sec: 900 };
      expect(i({ ads, lastInterstitialAt: NOW - 600_000 })).toBe('interval');
    });
    it('at most 3 a day', () => {
      expect(i({ interstitialsToday: 2 })).toBe('show');
      expect(i({ interstitialsToday: 3 })).toBe('daily-cap');
    });
    it('never right after data entry', () => {
      expect(i({ lastEntryAt: NOW - ENTRY_COOLDOWN_MS + 1 })).toBe('data-entry');
      expect(i({ lastEntryAt: NOW - ENTRY_COOLDOWN_MS })).toBe('show');
    });
  });

  it('rewarded is allowed on the export screen only', () => {
    expect(reason({ placement: 'rewarded', screen: 'report_export' })).toBe('show');
    expect(reason({ placement: 'rewarded', screen: 'hisab' })).toBe('screen');
  });
});

describe('interstitial log', () => {
  it('counts per local calendar day and resets on a new day', () => {
    let log = recordInterstitial(EMPTY_LOG, NOW);
    log = recordInterstitial(log, NOW + 1000);
    expect(countToday(log, NOW + 2000)).toBe(2);
    expect(log.lastAt).toBe(NOW + 1000);
    expect(countToday(log, NOW + 2 * DAY_MS)).toBe(0);
    expect(recordInterstitial(log, NOW + 2 * DAY_MS).count).toBe(1);
    expect(dayKey(NOW)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('parses stored JSON defensively', () => {
    expect(parseLog(null)).toEqual(EMPTY_LOG);
    expect(parseLog('nonsense')).toEqual(EMPTY_LOG);
    expect(parseLog('{"lastAt":5,"day":"2026-01-01","count":2}')).toEqual({ lastAt: 5, day: '2026-01-01', count: 2 });
  });

  describe('inaam_video (rewarded video on the इनाम tab)', () => {
    const on = { ...ADS_ON, inaam_video: true };
    it('shows only on the inaam screen, when its own switch is on', () => {
      expect(reason({ placement: 'inaam_video', screen: 'inaam', ads: on })).toBe('show');
      expect(reason({ placement: 'inaam_video', screen: 'inaam' })).toBe('placement-off'); // default: off
      expect(reason({ placement: 'inaam_video', screen: 'home', ads: on })).toBe('screen');
      expect(reason({ placement: 'rewarded', screen: 'inaam' })).toBe('screen');
    });
    it('is capped at 3 a day', () => {
      expect(reason({ placement: 'inaam_video', screen: 'inaam', ads: on, inaamVideosToday: 2 })).toBe('show');
      expect(reason({ placement: 'inaam_video', screen: 'inaam', ads: on, inaamVideosToday: 3 })).toBe('daily-cap');
    });
    it('respects the master switch and the first-day rule', () => {
      expect(reason({ placement: 'inaam_video', screen: 'inaam', ads: { ...on, enabled: false } })).toBe('disabled');
      expect(reason({ placement: 'inaam_video', screen: 'inaam', ads: on, installAt: NOW - 1000 })).toBe('first-day');
    });
  });
});
