/**
 * Expo config plugin: skip release lint ("lintVital") in CI test-APK builds, which saves minutes per build.
 * Active only when NOTRA_FAST_TEST=1 at prebuild time (set by ci.yml). The Play release build keeps lint.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// notra: fast test build';

module.exports = function withFastTestBuild(config) {
  if (process.env.NOTRA_FAST_TEST !== '1') return config;
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += `\n${MARKER}\nandroid { lint { checkReleaseBuilds false; abortOnError false } }\n`;
    }
    return cfg;
  });
};
