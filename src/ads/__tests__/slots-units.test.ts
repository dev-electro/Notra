import { isAdSlot, MAX_NATIVE_PER_LIST, withAdSlots } from '../slots';
import { e2eInstallAt, resolveUnits, TEST_UNITS } from '../units';

const items = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const real = { banner: 'ca-app-pub-2707121635941418/1', native: 'ca-app-pub-2707121635941418/2', interstitial: 'ca-app-pub-2707121635941418/3', rewarded: 'ca-app-pub-2707121635941418/4' };

describe('withAdSlots', () => {
  it('returns the list unchanged when off or shorter than 6', () => {
    expect(withAdSlots(items(20), 8, false)).toEqual(items(20));
    expect(withAdSlots(items(5), 8, true)).toEqual(items(5));
  });
  it('inserts before every 8th item, never first, never trailing', () => {
    const out = withAdSlots(items(17), 8, true);
    expect(isAdSlot(out[0])).toBe(false);
    expect(out.map((x) => (isAdSlot(x) ? 'ad' : x)).join(',')).toBe('1,2,3,4,5,6,7,8,ad,9,10,11,12,13,14,15,16,ad,17');
    expect(isAdSlot(out[out.length - 1])).toBe(false);
    expect(withAdSlots(items(8), 8, true).some(isAdSlot)).toBe(false);
  });
  it('caps the number of ads per list', () => {
    expect(withAdSlots(items(200), 5, true).filter(isAdSlot)).toHaveLength(MAX_NATIVE_PER_LIST);
  });
});

describe('resolveUnits', () => {
  it('uses test ids by default, in dev, and when flagged', () => {
    expect(resolveUnits({ dev: false, platform: 'android' })).toEqual({ test: true, units: TEST_UNITS.android });
    expect(resolveUnits({ dev: true, platform: 'android', extra: { units: real } }).test).toBe(true);
    expect(resolveUnits({ dev: false, platform: 'android', extra: { test: true, units: real } }).units).toEqual(TEST_UNITS.android);
  });
  it('uses real ids only in a non-dev, non-test Android build with all four set', () => {
    expect(resolveUnits({ dev: false, platform: 'android', extra: { units: real } })).toEqual({ test: false, units: real });
    expect(resolveUnits({ dev: false, platform: 'android', extra: { units: { banner: real.banner } } }).test).toBe(true);
  });
  it('the install-date override works only in test builds', () => {
    expect(e2eInstallAt({ e2e: true }, true, 1e12)).toBe(1e12 - 2 * 86_400_000);
    expect(e2eInstallAt({ e2e: true }, false, 1e12)).toBeNull();
    expect(e2eInstallAt({}, true, 1e12)).toBeNull();
  });
});
