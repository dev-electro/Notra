# Releasing Notra Book to Google Play

Pipeline: `git tag vX.Y.Z && git push --tags` -> `.github/workflows/release.yml` builds a signed
AAB + APKs (armeabi-v7a, arm64-v8a), attaches the APKs to a GitHub Release and uploads the AAB to the
Play **internal testing** track as a draft.

## 1. Create the upload keystore (once)

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore notra-upload.jks -alias notra-upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

Keep `notra-upload.jks` and its passwords in a password manager (not in git; `*.jks` is git-ignored).
Enrol the app in **Play App Signing** (default for new apps): Google holds the real app-signing key,
this is only the *upload* key, and can be reset via Play support if lost.

## 2. GitHub secrets

Base64 the keystore (single line) and store it:

```bash
base64 -w0 notra-upload.jks   # Linux
base64 -i notra-upload.jks | tr -d '\n'   # macOS
# or with gh:
base64 -i notra-upload.jks | tr -d '\n' | gh secret set ANDROID_KEYSTORE_BASE64
```

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | base64 of `notra-upload.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore (store) password |
| `ANDROID_KEY_ALIAS` | `notra-upload` (the `-alias` used above) |
| `ANDROID_KEY_PASSWORD` | key password (same as store password for PKCS12) |
| `PLAY_SERVICE_ACCOUNT_JSON` | full JSON of the Play service account (step 3). Optional: when empty the Play upload step is skipped |

The workflow maps these to `NOTRA_UPLOAD_STORE_FILE` (decoded to `$RUNNER_TEMP/upload.jks`),
`NOTRA_UPLOAD_STORE_PASSWORD`, `NOTRA_UPLOAD_KEY_ALIAS`, `NOTRA_UPLOAD_KEY_PASSWORD`, which
`plugins/withReleaseSigning.js` reads (Gradle properties or environment). Without all four the build
silently falls back to debug signing, which is fine for CI but **not uploadable to Play**.

To build a signed release locally:

```bash
export NOTRA_UPLOAD_STORE_FILE=$PWD/notra-upload.jks NOTRA_UPLOAD_STORE_PASSWORD=... \
       NOTRA_UPLOAD_KEY_ALIAS=notra-upload NOTRA_UPLOAD_KEY_PASSWORD=...
npx expo prebuild --platform android --clean --no-install
cd android && ./gradlew bundleRelease assembleRelease
```

## 3. Play Console setup (once)

1. Create the app in Play Console: package name **`app.notra.book`**, default language Hindi,
   app (not game), free.
2. Complete the mandatory declarations (Data safety, content rating, target audience, privacy policy URL).
   The app asks for microphone (voice entry), camera (family photo) and speech recognition; data is
   stored on-device in encrypted SQLite.
3. **Testing -> Internal testing -> Create track/release**; add testers (an email list). The very first
   AAB must be uploaded **manually once** in the Console (Play requires this before the API can publish
   to a new app). Download the AAB from the workflow artifacts `notra-book-aab`.
4. **Service account for CI**: Google Cloud Console -> IAM -> Service accounts -> create one, create a
   JSON key. In Play Console -> *Users and permissions* (or *Setup -> API access*) invite the service
   account email and grant *Release to testing tracks* (and *Release apps to production* later if wanted)
   for this app. Paste the JSON into the `PLAY_SERVICE_ACCOUNT_JSON` secret.

## 4. Cut a release

```bash
# bump "version" in app.json first if the user-facing version changes
git tag v1.0.0
git push --tags
```

The workflow then:

1. runs typecheck, lint, tests;
2. decodes the keystore, runs `expo prebuild`, `./gradlew bundleRelease assembleRelease`;
3. verifies the APK signature and uploads artifacts `notra-book-aab` and `notra-book-apks`;
4. creates a GitHub Release for the tag with the APKs attached (handy for sideloading to family phones);
5. uploads the AAB to the internal track as **draft** (promote it in Play Console).

`workflow_dispatch` runs the same pipeline from any branch (no GitHub Release is created because there
is no tag).

### versionCode

Play needs a strictly increasing `versionCode`. The workflow exports `NOTRA_VERSION_CODE=${{ github.run_number }}`;
`plugins/withReleaseSigning.js` applies it to `android/app/build.gradle` during prebuild when the env var is
set (no `app.json` edit needed; locally without the var the `app.json`/default value is used).
If Play already holds a higher code, change the expression in `release.yml` (e.g. `github.run_number + 100`).
`version` (`versionName`) still comes from `app.json`.

## 5. Register the plugin

`app.json` -> `expo.plugins` must contain `"./plugins/withReleaseSigning"`. Verify the transform with
`node scripts/check-signing-plugin.js`.

## Troubleshooting

- *"You uploaded an APK/AAB signed in debug mode"*: one of the four `NOTRA_UPLOAD_*` values was empty;
  check the secret names and the "Verify signature" step output.
- *versionCode already used*: bump the offset in `release.yml`.
- *Play step skipped*: `PLAY_SERVICE_ACCOUNT_JSON` or `ANDROID_KEYSTORE_BASE64` is empty.
