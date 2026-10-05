/**
 * Android half of @react-native-firebase/app's Expo config plugin. app.config.js swaps it in for the full plugin ONLY while the iOS
 * GoogleService-Info.plist does not exist yet, because the full plugin throws during an iOS prebuild without that file.
 * What it does (same as the full plugin on Android): adds the google-services Gradle classpath, applies the `com.google.gms.google-services`
 * plugin in android/app/build.gradle, and copies expo.android.googleServicesFile to android/app/google-services.json.
 * When the plist is added (see README "Firebase"), app.config.js goes back to the full plugin by itself; this file is then unused.
 */
const { withPlugins } = require('@expo/config-plugins');
const path = require('path');
// the package's "exports" map hides plugin/build/android, so load it by file path
const android = require(path.join(path.dirname(require.resolve('@react-native-firebase/app/package.json')), 'plugin/build/android'));

module.exports = (config) =>
  withPlugins(config, [android.withBuildscriptDependency, android.withApplyGoogleServicesPlugin, android.withCopyAndroidGoogleServices]);
