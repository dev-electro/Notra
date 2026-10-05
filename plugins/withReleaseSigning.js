/**
 * Expo config plugin: Play Store upload-key signing for the Android release build.
 *
 * During `expo prebuild` it patches android/app/build.gradle so that:
 *  - a `release` signingConfig reads its values from Gradle properties OR environment variables:
 *      NOTRA_UPLOAD_STORE_FILE, NOTRA_UPLOAD_STORE_PASSWORD,
 *      NOTRA_UPLOAD_KEY_ALIAS,  NOTRA_UPLOAD_KEY_PASSWORD
 *  - buildTypes.release uses it ONLY when all four are present; otherwise it keeps the debug
 *    signing config, so CI without secrets still produces an installable APK.
 *  - (optional) if NOTRA_VERSION_CODE is set in the environment of the `expo prebuild` process,
 *    `versionCode` in build.gradle is replaced by it (release.yml sets it from github.run_number).
 *
 * The transform is idempotent (guarded by marker comments / by checking its own output).
 * Register in app.json: "plugins": [ ..., "./plugins/withReleaseSigning" ]
 */

const BEGIN = '// @notra-release-signing:begin';
const END = '// @notra-release-signing:end';
const SIGN_MARK = '// @notra-release-signing:config';
const BUILD_MARK = '// @notra-release-signing:buildtype';

const HELPER = `${BEGIN}
def notraProp = { String n -> project.findProperty(n) ?: System.getenv(n) }
def notraHasUploadKey = [
    "NOTRA_UPLOAD_STORE_FILE", "NOTRA_UPLOAD_STORE_PASSWORD",
    "NOTRA_UPLOAD_KEY_ALIAS", "NOTRA_UPLOAD_KEY_PASSWORD"
].every { notraProp(it) }
${END}
`;

const SIGNING_CONFIG = `
        release { ${SIGN_MARK}
            if (notraHasUploadKey) {
                storeFile file(notraProp("NOTRA_UPLOAD_STORE_FILE"))
                storePassword notraProp("NOTRA_UPLOAD_STORE_PASSWORD")
                keyAlias notraProp("NOTRA_UPLOAD_KEY_ALIAS")
                keyPassword notraProp("NOTRA_UPLOAD_KEY_PASSWORD")
            }
        }`;

const RELEASE_SIGNING_LINE = `signingConfig notraHasUploadKey ? signingConfigs.release : signingConfigs.debug ${BUILD_MARK}`;

/** Index just after the `{` that opens the first block matching `re` at/after `from`, or -1. */
function openBraceEnd(src, re, from = 0) {
  const m = re.exec(src.slice(from));
  return m ? from + m.index + m[0].length : -1;
}

/** Index of the `}` closing the block whose body starts at `bodyStart`, or -1. */
function closeBrace(src, bodyStart) {
  let depth = 1;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

/**
 * Pure string transform of android/app/build.gradle. Throws if the layout is not recognised, so a
 * template change in a future Expo SDK fails loudly in CI instead of silently shipping debug-signed.
 * @param {string} src
 * @param {{ versionCode?: string }} [opts]
 */
function transformBuildGradle(src, opts = {}) {
  let out = src;

  if (!out.includes(BEGIN)) {
    const m = /^android\s*\{/m.exec(out);
    if (!m) throw new Error('withReleaseSigning: top-level `android {` block not found in build.gradle');
    out = out.slice(0, m.index) + HELPER + '\n' + out.slice(m.index);
  }

  if (!out.includes(SIGN_MARK)) {
    const sc = openBraceEnd(out, /signingConfigs\s*\{/);
    if (sc < 0) throw new Error('withReleaseSigning: `signingConfigs {` block not found in build.gradle');
    out = out.slice(0, sc) + SIGNING_CONFIG + out.slice(sc);
  }

  if (!out.includes(BUILD_MARK)) {
    const bt = openBraceEnd(out, /buildTypes\s*\{/);
    if (bt < 0) throw new Error('withReleaseSigning: `buildTypes {` block not found in build.gradle');
    const rel = openBraceEnd(out, /\brelease\s*\{/, bt);
    if (rel < 0) throw new Error('withReleaseSigning: `release {` build type not found in build.gradle');
    const end = closeBrace(out, rel);
    const body = out.slice(rel, end);
    const line = /signingConfig\s+signingConfigs\.\w+[^\n]*/;
    const newBody = line.test(body)
      ? body.replace(line, RELEASE_SIGNING_LINE)
      : `\n            ${RELEASE_SIGNING_LINE}` + body;
    out = out.slice(0, rel) + newBody + out.slice(end);
  }

  const vc = opts.versionCode;
  if (vc !== undefined && vc !== '') {
    if (!/^\d+$/.test(String(vc))) throw new Error(`withReleaseSigning: NOTRA_VERSION_CODE must be an integer, got "${vc}"`);
    out = out.replace(/versionCode\s+\d+/, `versionCode ${vc}`);
  }
  return out;
}

function withReleaseSigning(config) {
  // Lazy require so scripts/check-signing-plugin.js can run the transform without installed deps.
  const { withAppBuildGradle } = require('@expo/config-plugins');
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = transformBuildGradle(cfg.modResults.contents, {
      versionCode: process.env.NOTRA_VERSION_CODE,
    });
    return cfg;
  });
}

module.exports = withReleaseSigning;
module.exports.transformBuildGradle = transformBuildGradle;
