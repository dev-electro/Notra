/**
 * Dynamic Expo config on top of app.json. It only decides the AdMob ids (docs/ADS.md):
 *  - default: Google's TEST app id and TEST unit ids (what app.json holds), so no build ever shows real ads by accident;
 *  - real ids are used only when all five EXPO_PUBLIC_ADMOB_* variables are set AND NOTRA_ADS_TEST is not "1";
 *  - NOTRA_ADS_TEST=1 forces test ids even if real ones are set (CI, e2e, debug APKs);
 *  - NOTRA_ADS_E2E=1 (test builds only) makes the app behave as if installed 2 days ago, so end-to-end runs see ads.
 * The unit ids end up in expo.extra.ads (they are public identifiers, not secrets).
 */
const PLUGIN = 'react-native-google-mobile-ads';

module.exports = ({ config }) => {
  const env = process.env;
  const real = {
    androidAppId: env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID,
    banner: env.EXPO_PUBLIC_ADMOB_BANNER_ID,
    native: env.EXPO_PUBLIC_ADMOB_NATIVE_ID,
    interstitial: env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID,
    rewarded: env.EXPO_PUBLIC_ADMOB_REWARDED_ID,
  };
  const complete =
    /^ca-app-pub-\d+~\d+$/.test(real.androidAppId || '') &&
    ['banner', 'native', 'interstitial', 'rewarded'].every((k) => /^ca-app-pub-\d+\/\d+$/.test(real[k] || ''));
  const test = env.NOTRA_ADS_TEST === '1' || !complete;

  const plugins = (config.plugins || []).map((p) => {
    if (Array.isArray(p) && p[0] === PLUGIN) {
      return [PLUGIN, { ...p[1], androidAppId: test ? p[1].androidAppId : real.androidAppId }];
    }
    return p;
  });

  return {
    ...config,
    plugins,
    extra: {
      ...config.extra,
      ads: {
        test,
        e2e: test && env.NOTRA_ADS_E2E === '1',
        units: test ? undefined : { banner: real.banner, native: real.native, interstitial: real.interstitial, rewarded: real.rewarded },
      },
    },
  };
};
