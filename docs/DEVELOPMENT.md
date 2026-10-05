# Development guide

Start with [INDEX.md](INDEX.md) for the reading order. This page: set up a machine, run things, follow the conventions, and add the
usual kinds of change without breaking the invariants.

## 1. Local setup (Mac M1, 8 GB RAM)

### 1.1 Tools

| Tool | Version | Notes |
| --- | --- | --- |
| Node | **22+** (CI uses 22; tests use the built-in `node:sqlite`) | `brew install nvm` or `brew install node@22` |
| npm | bundled | the repo uses `package-lock.json`; use `npm ci` |
| Git, GitHub CLI | any | `brew install gh` |
| JDK | 17 (Temurin) | only if you build Android locally |
| Android platform-tools (`adb`) | any | `brew install --cask android-platform-tools` |
| Android SDK / emulator | optional | heavy on 8 GB, see 1.5 |
| Maestro | optional | for E2E, see [TESTING.md](TESTING.md) |

```bash
git clone https://github.com/dev-electro/Notra.git && cd Notra
npm ci                      # app (root package)
(cd server && npm ci)       # Worker
(cd admin && npm ci)        # admin panel
```

Three independent packages (root, `server/`, `admin/`), each with its own lock file and `node_modules`.

### 1.2 Run the tests (no phone needed)

```bash
npm run typecheck && npm run lint && npm test         # app: tsc, expo lint, Jest (35 test files)
(cd server && npm run typecheck && npm test)          # Worker: vitest on in-process Postgres (PGlite), real migrations
(cd admin  && npm run typecheck && npm run lint && npm test && npm run build)
```

- App DB tests run the **real migrations and repository SQL** on Node's `node:sqlite` (`src/db/mem-db.testutil.ts`). No Expo needed.
- Server tests boot PGlite once per file, apply every `migrations/*.sql`, and run **every statement as the restricted `notra_app` role**
  (so RLS is actually exercised; `server/test/helpers.ts`). One test (`driver.test.ts`) drives the real `postgres` driver over the wire.
- Admin tests are named `*.vtest.ts(x)` so the root Jest run (which ignores `/server/` but not `/admin/`) does not pick them up.
- First PGlite boot is slow (seconds); a full server run takes about a minute on an M1.

### 1.3 Expo Go vs a development build

| Feature | Expo Go | Dev build / CI APK |
| --- | --- | --- |
| Screens, reports, sync, ledger logic | yes | yes |
| SQLite | yes, **not encrypted** (SQLCipher pragma is a no-op) | encrypted |
| Google sign-in, AdMob, Firebase Analytics | no (native modules; code degrades silently) | yes |
| Contact picker (`modules/notra-contact-picker`) | no | yes |
| Speech recognition (voice entry) | limited | yes |

```bash
npm start                    # Expo dev server; scan the QR with Expo Go
```

A dev build needs a native project: `npx expo prebuild --platform android --no-install` then `npx expo run:android`
(needs the Android SDK and JDK 17), or `npx eas-cli build --profile development --platform android` (needs an Expo account), or simply
**download the CI APK** (the `test-<branch>` pre-release, see [CI_CD.md](CI_CD.md)) and install it on a phone. On an 8 GB Mac the last
option is the least painful.

### 1.4 Testing on a physical Android phone (recommended)

1. Phone: Settings -> About -> tap *Build number* 7 times; Developer options -> *USB debugging* on.
2. Plug in USB, accept the RSA prompt; `adb devices` must show `device`.
3. Wi-Fi alternative (Android 11+): Developer options -> *Wireless debugging* -> *Pair device with pairing code*, then
   `adb pair <ip>:<pair-port>` and `adb connect <ip>:<port>`. Older phones: with USB once, `adb tcpip 5555 && adb connect <phone-ip>:5555`.
4. Local arm64 release build and install:
   ```bash
   npx expo prebuild --platform android --clean --no-install
   (cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a)
   adb install -r android/app/build/outputs/apk/release/app-release.apk
   ```
5. Logs: `adb logcat | grep -i -E "ReactNativeJS|notra"`. Run Maestro: `maestro test .maestro/`.

Low-RAM tips: close other apps, `./gradlew ... --no-daemon`, put `org.gradle.jvmargs=-Xmx2g` in `~/.gradle/gradle.properties`, build once and re-run
flows without rebuilding. Also test on a genuinely low-end phone (2 GB RAM): see [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).

### 1.5 Emulator notes

An Apple-silicon arm64 image works (`system-images;android-34;google_apis;arm64-v8a`, see TESTING.md) but takes 3-4 GB of RAM; on 8 GB prefer a phone.
CI uses an **x86_64** API 30 image with the build restricted to `x86_64`; the normal CI APK is arm-only and will not install there.

### 1.6 Running the Worker and admin locally

```bash
cd server
npm run dev                       # wrangler dev (needs DATABASE_URL etc. in .dev.vars; SMS_PROVIDER=dev logs OTP codes)
DATABASE_URL=... npm run migrate  # migrations as the OWNER role (MIGRATION_DATABASE_URL preferred)
cd ../admin && cp .env.example .env.local && npm run dev
```

Auth setup for local runs changes with the Better Auth move: follow `docs/AUTH.md`.

## 2. Scripts

| Package | Script | What it does |
| --- | --- | --- |
| root | `start`, `android`, `ios` | `expo start`, `expo run:android`, `expo run:ios` |
| root | `typecheck`, `lint`, `test` | `tsc --noEmit`, `expo lint`, `jest` |
| root | `node scripts/check-signing-plugin.js` | verifies the release-signing Gradle transform |
| root | `bash scripts/e2e-run.sh <apk>` | install APK, run Maestro, dump logcat |
| `server/` | `typecheck`, `test` | `tsc --noEmit`, `vitest run` |
| `server/` | `migrate` | `scripts/migrate.mjs`: applies `migrations/*.sql` once each in order (needs `MIGRATION_DATABASE_URL`, falls back to `DATABASE_URL`) |
| `server/` | `admin:bootstrap -- <phone or email>` | make the first owner (owner DB role) |
| `server/` | `dev`, `deploy` | `wrangler dev`, `wrangler deploy` |
| `admin/` | `dev`, `build`, `preview`, `typecheck`, `lint`, `test` | Vite / tsc / eslint / vitest (`build` runs `tsc --noEmit` first) |

## 3. Repository layout

See [ARCHITECTURE.md](ARCHITECTURE.md) sections 2-5 for the full module tables. Orientation:

- `src/core` pure rules -> `src/db` SQL -> `src/app` screens (never the other way around; `core` imports nothing from React/Expo/`@/`).
- Tests live next to code in `__tests__/` (app) and `server/test/`.
- The app's path alias is `@/` -> `src/` (`tsconfig.json`).

## 4. Coding conventions

### 4.1 Design system (`src/theme.ts`)

- **Theme tokens only.** Colours, spacing, radii, font sizes come from `colors`, `spacing`, `radius`, `type`. No raw hex, no magic numbers,
  no `fontWeight` (weight is the font file: `Mukta-Medium` / `Mukta-Bold`).
- Every text/background pair in use must be in `textPairs` so `src/__tests__/theme.test.ts` checks WCAG AA (4.5:1 text, 3:1 box borders).
  Haldi is a **fill behind dark text**, never text.
- Type scale: nothing below 18; touch targets `MIN_TOUCH = 64`; side gutter `GUTTER = 16`; flat design (hairlines and tints, no shadows).
- `Text` and `TextInput` must come from `@/components/text` (font scale capped at 1.3x); ESLint (`no-restricted-imports`) fails otherwise.
- Meaning never by colour alone: मिला/आया = indigo + down arrow + word; दिया/गया = kumkum + up arrow + word (`components/direction.tsx`).
- Prefer the SVG icons in `components/icons.tsx` over emoji; screens use `Screen` with a big "वापस" top-left and **one** main action as a
  full-width haldi button at the bottom (`Screen action`).
- Respect `useReduceMotion`; animations use `PressableScale` / native driver.

### 4.2 Hindi copy rules

- UI language is plain Hindi, **no English** in user-visible text (brand name excepted). Short sentences, few choices per screen.
- Words: **मिला / आया** = received, **दिया / गया** = given, **हिसाब** for reports, **बैकअप** (never "sync"), **खाता** for ledger, **कार्यक्रम** for event.
- Tone: neutral. "लौटाना बाकी" (yet to return), **never** "defaulter", "overdue" or red shaming badges. No death-feast occasion.
- Errors say what to do next, not what broke: use `guarded()` (toast "सेव नहीं हो पाया। फिर से कोशिश करें।") and `authErrorMessage`.
- Every interactive element needs `accessibilityLabel` / role / hint; important screens get a speaker button (`speakText`), text is spoken
  with `expo-speech`.
- Admin panel and docs may be English (staff-facing); the app is not.

### 4.3 testIDs for Maestro

Interactive elements carry `testID`s with fixed prefixes: `field-*` (inputs), `btn-*` (buttons), `tab-*` (bottom tabs: `tab-home`,
`tab-mine`, `tab-others`, `tab-hisaab`), `chip-*` (amount/option chips), `key-*` (number pad), `kind-*`, `report-*`, `cal-*`,
`household-row-<name>`, `picker-search`, `ad-banner`. Flows select **by id**, not label (labels render twice: label text and the input's
accessibility label). Hindi text is fine for assertions on static chrome; **typed values must be ASCII** (typing Devanagari through adb is
unreliable).

### 4.4 Data rules (do not break)

1. **Money is integer paise.** Never store or add floats.
2. **Entries are append-only.** No `UPDATE`/`DELETE` of business columns. Corrections and voids are new rows. The triggers will abort you.
3. **Direction is derived from the event host.** Never add a UI control that picks it; never write `direction` from user input.
4. **Every query is scoped to the open ledger** (`useLoad` gives `ledgerId`; repository/query functions take it).
5. **SQL == core.** Anything computed in SQL has a pure counterpart in `src/core` and a test that asserts they agree on the same fixtures
   (pattern: `src/db/__tests__/void.test.ts`, `queries.test.ts`, `stage7.test.ts`). Change both together.
6. **Aggregates in SQL, not JS**: lists are paged (`LIMIT/OFFSET`), totals use `GROUP BY` / window functions over indexed columns. The target is a
   2 GB RAM phone with years of data.
7. **No ledger data to ads or analytics.** Not in params, not in "harmless" labels. See [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md) section 11.
8. **Save immediately**: every entry is written the moment it is saved; no in-memory buffering of unsaved ledger data.
9. **Heavy modules load on tap** (`await import(...)`): print, share, speech, camera, contacts, Google sign-in, Firebase, AdMob.
10. **Server: user-data queries run inside `withUserTx`** (see 7).

### 4.5 General

TypeScript strict; `reactCompiler` is on (do not mutate refs during render; see the one documented disable in `use-load.ts`); small
dependencies only (everything added costs APK size and cold start); photos resized to 512 px; Android builds only `armeabi-v7a` and
`arm64-v8a`. Use `@/nav` helpers (`go`, `replace`, `back`) instead of typed routes.

## 5. How to add things

### 5.1 A screen

1. Create `src/app/<name>.tsx` (or a folder with `[param].tsx`). Default export a component. Routes are file-based (expo-router);
   the root `Stack` has `headerShown: false` and `animation: 'none'`.
2. Wrap in `<Screen title="..." action={{ testID: 'btn-...', label, onPress }}>` (use `scroll={false}` for lists, `tab` for tab screens).
3. Load data with `useLoad((db, ledgerId) => ..., initial)`; write through repository functions inside `guarded()`.
4. Colours/sizes from `theme.ts`; Hindi copy per 4.2; add `testID`s.
5. Navigate with `go('/name')` / `replace`.
6. If the screen is reachable for analytics: add the route template to `SCREENS` in `src/analytics/events.ts` (a test compares the list with
   the files in `src/app`; it fails if you forget).
7. Link it from Settings / hub, and add a Maestro step if it is a main path.
8. Ads: a new screen is ad-free by default (`ALLOWED_SCREENS` in `src/ads/policy.ts`); never add ads to forms or data entry.

### 5.2 A migration (local + server + sync + validation + tests)

A schema change touches **six** places. Checklist:

1. **Local**: append a string to `MIGRATIONS` in `src/db/migrations.ts` (never edit released ones). SQLite cannot alter a CHECK: rebuild the table
   as in v7 (create `_new`, copy, drop, rename, recreate indexes **and views/triggers** that referenced it). If it changes `entries`, drop and
   recreate `entries_no_update` so the new column is protected. Provide a backfill for existing rows.
2. **Repository / queries**: mappers (`toEntry` etc.), `INSERT` column lists, any view that uses `e.*` must be dropped and recreated.
3. **Server**: new `server/migrations/00N_*.sql` (next free number below 100; admin/RLS use 100+). Must be additive for the running app version
   (deploy order: migrate **then** deploy Worker **then** release the app). If it adds a table with `user_id`, enable + force RLS and policies in a
   new `1xx` file and extend the "every user_id table is forced" expectation. Update `analytics.*` functions if the new data matters.
4. **Validation**: `server/src/validate.ts` (row type, validator, `reasonOf` field name), and `server/src/sync.ts` (the `INSERT ... jsonb_to_recordset`
   column list and the pull `SELECT` + camel mapper). Unknown columns would be silently dropped otherwise.
5. **Sync client**: `src/sync/wire.ts` (wire type + `*ToWire`), `src/sync/engine.ts` (`collectDirty` select and `applyPage` insert), `src/backup/snapshot.ts`
   (`buildSnapshot`, `ok*` validators, `mergeSnapshot`). Old servers/backups may omit the field: give it a default on read.
6. **Tests**: a migration test in `src/db/__tests__` (migrate from the previous version with seeded rows), engine round-trip in `src/sync/__tests__`
   with `fake-server.testutil.ts`, `server/test/sync.test.ts` for validation + persistence, backup round-trip in `src/backup/__tests__`.

Also update [DATA_MODEL.md](DATA_MODEL.md) and the Data Safety text if it stores new personal data.

### 5.3 A report

1. SQL in `src/db/reports.ts` (paged; `limit = NO_LIMIT` for exports) taking `(db, ledgerId, range, ...)`; reuse `entry_settlement` for उतार/चढ़ाव.
2. Pure doc builder in `src/core/reportDocs.ts` (`xxxDoc(rows, totals, meta): ReportDoc`): ONE model feeds both the PDF HTML and the on-phone image sheet.
3. Screen `src/app/reports/<id>.tsx` using `RangeFilter`, `ReportParts`, `ReportExport` (PDF via `expo-print`; images via `react-native-view-shot`, 25 rows per
   page, `MAX_IMAGE_ROWS = 500`).
4. Add the card to `REPORTS` in `src/app/(tabs)/hisab.tsx`; add the id to `REPORT_IDS` in `src/analytics/events.ts` and call `useReportViewed(id)`.
5. Tests: SQL vs core on a seeded fixture; doc builder snapshot-style assertions. Add the screen to `.maestro/07_reports.yaml`.

### 5.4 A remote-config key

Keys exist in **two** places that must agree:

1. Server: `CONFIG_DEFAULTS`, `validateConfig` (switch case) in `server/src/appconfig.ts`. Unknown fields inside an object are **rejected**, so a new field
   must be added to the default shape. `PUBLIC_KEYS` decides what `/v1/config` serves.
2. Admin: the `Config` page (`admin/src/pages/Config.tsx`) to edit it; the role gate is `admin`.
3. App: `RemoteConfig`, `DEFAULT_CONFIG`, `parseConfig` in `src/remote/config.ts` (defensive: wrong type -> default). Consume through `useRemoteConfig()`
   / `getRemote()`.
4. Tests: `src/remote/__tests__/config.test.ts`, `server/test/ops.test.ts`. Docs: [ADS.md](ADS.md) / [ADMIN.md](ADMIN.md).

Keep **defaults aligned** between server and app; today they are not (see ROADMAP known limitations).

### 5.5 An analytics event

1. Add it to `EVENTS` in `src/analytics/events.ts` with closed value lists (enums, `'boolean'`, or buckets). Never free text, ids or numbers
   that could be amounts.
2. Call `track('name', { ... })` where it happens (never inside a render).
3. Extend `events.test.ts` expectations; update the Data Safety notes in [PLAY_STORE.md](PLAY_STORE.md) and `src/legal/content.ts` if the category of data changes.

### 5.6 An occasion type

Occasions are an enum stored in both databases, so a new one is a migration:

1. `src/core/types.ts` (`Occasion` and `OCCASIONS`), `src/core/labels.ts` (`OCCASION_LABEL`, `OCCASION_ICON`); the occasion picker/badge components if icons are SVG.
2. Local migration vN: rebuild `events` with the widened `CHECK` (copy v7). Backup validation uses `OCCASIONS` from core, so it follows.
3. Server migration: drop and re-add `events_occasion_check`; `OCCASIONS` in `server/src/validate.ts`; `analytics.events_by_occasion` needs no change.
4. `src/analytics/events.ts` `OCCASION_VALUES`; reports that list occasions; tests; Hindi name in [GLOSSARY.md](GLOSSARY.md).
5. Never add a death-feast category.
6. Ship order: server migration first, then the app, because an old server rejects the new value per row (`invalid_payload:occasion`).

## 6. Common pitfalls

| Pitfall | What happens | Fix |
| --- | --- | --- |
| `npx expo install` cannot reach the Expo API in some networks/sandboxes | install fails or picks nothing | edit `package.json` with the SDK 57 ranges already used (`~57.x`), run `npm install`, then `npx expo-doctor` |
| Server query without `withUserTx` | works as superuser in a psql session, returns **zero rows** (or `42501`) under the real role | wrap in `withUserTx(db, userId, role, fn)`; run tests (they use `notra_app`) |
| Role taken from the request/token | privilege escalation | read it from `auth_state`; never trust input |
| Direction chosen by UI/typed | `entries_direction_rule` aborts; server rejects `invalid_payload:direction` | derive via `directionForHost` |
| Editing a released migration | existing installs diverge | append a new migration |
| New `entries` column not in `entries_no_update` | column becomes mutable | recreate the trigger in the migration |
| View with `e.*` after `ALTER TABLE` | stale column list | drop and recreate the view |
| Forgetting a column in `collectDirty`/`applyPage`/`jsonb_to_recordset` | silently not synced | follow the 5.2 checklist |
| Jest picks up `admin/` tests | duplicate/failing runs | name them `*.vtest.ts(x)` |
| Using `Text` from `react-native` | lint error | import from `@/components/text` |
| Real AdMob ids in a debug build | policy violation risk | `NOTRA_ADS_TEST=1` is set by CI; real ids only with all five `EXPO_PUBLIC_ADMOB_*` and a signed release |
| Signing fallback | release without the 4 `NOTRA_UPLOAD_*` values is debug-signed, not uploadable | check "Verify signature" step |
| Deploying the Worker without MSG91 secrets and without `SMS_PROVIDER=dev` | `smsFromEnv` throws, **every** route answers `500 server_misconfigured` (see ROADMAP) | set the secrets first (changes with Better Auth) |
| Testing encryption in Expo Go | DB is plain | use a native build |
| Typing Devanagari with `adb input` | garbled text | ASCII test data in Maestro |
| Changing `src/legal/content.ts` only | store/Data Safety out of sync | change policy text, [PLAY_STORE.md](PLAY_STORE.md) and the Play form together |
