# End-to-end testing with Maestro

Flows live in `.maestro/` (numbered; they run in order and share app data, only `01` clears state):

| Flow | What it checks |
| --- | --- |
| `01_launch_setup` | clean launch, skip the picture cards (`छोड़ें`) and sign-in (`बाद में`), first-launch setup |
| `02_add_household` | add household (name, father, village) |
| `03_add_aaya_entry` | AAYA Rs 501 via number pad, read-back confirmed (`हाँ`) |
| `04_home_totals` | home card shows Rs 501 |
| `05_event_ledger` | create event, the event ledger (खाता खोलें), 2 givers, finish, summary Rs 752 |
| `06_reports` | all five report tabs |
| `07_persistence` | `stopApp` + `launchApp` without `clearState`, data still there (Rs 1,253) |

Screenshots are written to `./screenshots/`. Test names are ASCII (Ramesh / Mohan / Kherwa) because
typing Devanagari through adb is unreliable; all assertions on UI chrome use the Hindi text.

CI: `.github/workflows/e2e.yml` builds an x86_64 release APK, boots an API 30 emulator and runs
`scripts/e2e-run.sh`. Artifacts: `e2e-screenshots`, `e2e-report` (JUnit), `e2e-logcat`.

## Install Maestro

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash      # needs Java 17+ (brew install --cask temurin@17)
export PATH="$HOME/.maestro/bin:$PATH"
maestro --version
```

## Option A (recommended on a 8 GB M1): physical Android phone, no emulator

1. Phone: Settings -> About -> tap *Build number* 7 times; Developer options -> enable *USB debugging*.
2. Mac: `brew install --cask android-platform-tools`, plug in USB, accept the RSA prompt, then
   `adb devices` should list the phone as `device`.
   - Wi-Fi alternative (Android 11+): Developer options -> *Wireless debugging* -> *Pair device with
     pairing code*; then `adb pair <ip>:<pair-port>` and `adb connect <ip>:<port>`.
     Older phones: with USB plugged once `adb tcpip 5555 && adb connect <phone-ip>:5555`.
3. Build an APK for the phone's ABI (almost all phones are arm64):

   ```bash
   npm ci
   npx expo prebuild --platform android --clean --no-install
   cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a && cd ..
   adb install -r android/app/build/outputs/apk/release/app-release.apk
   ```
4. Run:

   ```bash
   maestro test .maestro/                 # whole suite
   maestro test .maestro/03_add_aaya_entry.yaml   # a single flow (needs 01+02 run before)
   maestro studio                          # inspect the view hierarchy / try commands live
   ```
   With several devices attached add `--device <serial from adb devices>`.
   Keep the phone unlocked and on *Stay awake*. Unsigned/debug-signed release APKs are fine.

Low RAM tips: close other apps, `./gradlew ... --no-daemon`, add `org.gradle.jvmargs=-Xmx2g` to
`~/.gradle/gradle.properties`, and build once then re-run flows without rebuilding.

## Option B: Android emulator on Apple Silicon (arm64 image)

```bash
brew install --cask android-commandlinetools   # or Android Studio
sdkmanager "emulator" "platform-tools" "system-images;android-34;google_apis;arm64-v8a"
avdmanager create avd -n notra -k "system-images;android-34;google_apis;arm64-v8a" -d pixel_6
emulator -avd notra -no-snapshot -gpu host &     # ~3-4 GB RAM; use a phone if memory is tight
adb wait-for-device

cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a && cd ..
scripts/e2e-run.sh android/app/build/outputs/apk/release/app-release.apk
```

`scripts/e2e-run.sh` installs the APK, runs `maestro test .maestro/ --format junit --output report.xml`
and dumps `logcat.txt`.

## Writing / debugging flows

- Text selectors are full-string regexes: `.*नई एंट्री` matches `✍️  नई एंट्री` (buttons prefix an icon).
- Text fields render their label twice (label `Text` + the input's accessibilityLabel), so flows use
  `index: 1` for the input (`.maestro/subflows/type-field.yaml`). Adding `testID`s would make this robust.
- The home totals cards expose `"<title>, <amount>"` as their accessibility label.
- If a flow fails, open the failing screenshot in `~/.maestro/tests/<timestamp>/` or run `maestro studio`.

## Ads in end-to-end runs

CI builds set `NOTRA_ADS_TEST=1` (Google test ids only) and the e2e build also `NOTRA_ADS_E2E=1`, which makes the app behave as if installed 2 days ago, so the घर / हिसाब banner (`testID ad-banner`) and native cards can appear. The banner sits in the layout above the tab bar (it never overlays content) and no ad appears on any other flow screen; full-screen ads are disabled in the e2e build. Without the e2e flag every Maestro run is on "day one", which is ad-free by policy.
