/**
 * Expo config plugin: let the project's Kotlin compiler read libraries built with a newer Kotlin.
 *
 * play-services-ads 25.x (pulled in by react-native-google-mobile-ads) ships Kotlin 2.3 metadata, while the
 * React Native toolchain compiles with Kotlin 2.1, which fails with "Module was compiled with an incompatible
 * version of Kotlin". `-Xskip-metadata-version-check` is the standard workaround; remove this plugin once the
 * React Native Kotlin version catches up.
 */
const { withProjectBuildGradle } = require('expo/config-plugins');

const MARKER = '// notra: kotlin metadata compat';
const BLOCK = `
${MARKER}
subprojects {
  plugins.withId("org.jetbrains.kotlin.android") {
    tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
      compilerOptions.freeCompilerArgs.add("-Xskip-metadata-version-check")
    }
  }
}
`;

module.exports = function withKotlinMetadataCompat(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) cfg.modResults.contents += BLOCK;
    return cfg;
  });
};
