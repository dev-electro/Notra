#!/usr/bin/env node
/* Self-check for plugins/withReleaseSigning.js. Run: node scripts/check-signing-plugin.js */
const assert = require('node:assert/strict');
const { transformBuildGradle } = require('../plugins/withReleaseSigning');

// Shape of the Expo-generated android/app/build.gradle (trimmed).
const SAMPLE = `apply plugin: "com.android.application"

def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()

android {
    ndkVersion rootProject.ext.ndkVersion
    namespace "app.notra.diary"
    defaultConfig {
        applicationId "app.notra.diary"
        versionCode 1
        versionName "1.0.0"
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
        }
    }
}
`;

const count = (s, sub) => s.split(sub).length - 1;

const out = transformBuildGradle(SAMPLE);

// helper defined once, before android {
assert.equal(count(out, 'def notraHasUploadKey'), 1);
assert.ok(out.indexOf('def notraHasUploadKey') < out.indexOf('\nandroid {'), 'helper must precede android {');
for (const k of ['NOTRA_UPLOAD_STORE_FILE', 'NOTRA_UPLOAD_STORE_PASSWORD', 'NOTRA_UPLOAD_KEY_ALIAS', 'NOTRA_UPLOAD_KEY_PASSWORD']) {
  assert.ok(out.includes(`"${k}"`), `missing ${k}`);
}

// release signingConfig inside signingConfigs, after debug
const sc = out.slice(out.indexOf('signingConfigs {'), out.indexOf('buildTypes {'));
assert.ok(sc.includes('release {') && sc.includes('debug {'), 'both signing configs present');
assert.ok(sc.includes('storeFile file(notraProp("NOTRA_UPLOAD_STORE_FILE"))'));

// buildTypes.release switched (conditionally); buildTypes.debug untouched
const bt = out.slice(out.indexOf('buildTypes {'));
const debugBlock = bt.slice(bt.indexOf('debug {'), bt.indexOf('release {'));
assert.ok(debugBlock.includes('signingConfig signingConfigs.debug') && !debugBlock.includes('notra'));
const relBlock = bt.slice(bt.indexOf('release {'));
assert.ok(relBlock.includes('signingConfig notraHasUploadKey ? signingConfigs.release : signingConfigs.debug'));
assert.ok(!/signingConfig signingConfigs\.debug\n/.test(relBlock), 'old unconditional debug line removed');
assert.ok(relBlock.includes('shrinkResources enableShrinkResources.toBoolean()'), 'rest of release block kept');

// idempotent
assert.equal(transformBuildGradle(out), out, 'second run must be a no-op');

// versionCode override (+ idempotent)
const v = transformBuildGradle(SAMPLE, { versionCode: '42' });
assert.ok(v.includes('versionCode 42') && !v.includes('versionCode 1\n'));
assert.equal(transformBuildGradle(v, { versionCode: '42' }), v);
assert.throws(() => transformBuildGradle(SAMPLE, { versionCode: 'abc' }), /integer/);

// release block without a signingConfig line gets one
const bare = SAMPLE.replace(/ *\/\/ Caution[^\n]*\n *signingConfig signingConfigs\.debug\n/, '');
assert.ok(!/release \{[^}]*signingConfig/.test(bare.slice(bare.indexOf('release {'))), 'sample prepared');
assert.ok(transformBuildGradle(bare).includes('signingConfig notraHasUploadKey ?'));

// unrecognised layout fails loudly
assert.throws(() => transformBuildGradle('apply plugin: "x"\n'), /android \{/);

console.log('check-signing-plugin: OK');
