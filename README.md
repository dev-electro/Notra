# Notra Book (नोतरा बुक)

An offline-first mobile ledger for the Notra custom: interest-free, document-free reciprocal gifting and
loans among Bhil households in southern Rajasthan, where each return is expected to be a little larger than
what was received. The app records the relationship between two households (Lena-Dena), not just events.

Stage 1 added the domain logic, encrypted local database and CI; Stage 2 the Phase 1 screens; Stage 3 immediate
saves, void entries and optional cloud backup (see **Backend & sync**). The phone's SQLite stays the source of truth.

## Stack

Expo SDK 57, React Native 0.86 (Hermes), expo-router, TypeScript (strict), expo-sqlite with SQLCipher,
expo-secure-store (holds the DB key), Firebase Analytics (privacy allow-list, see **Firebase Analytics**), Jest (jest-expo).

## Folder layout

```
app.json, eas.json          Expo + EAS config (permissions, SQLCipher plugin, build properties)
src/core/                   Pure TypeScript domain logic (no React/Expo imports), fully unit-tested
  types.ts                  Household, NotraEvent, Entry, Increment ...  (money = integer paise)
  ledger.ts                 activeEntries (corrections), balances, suggestReturn
  money.ts                  formatINR (Indian grouping), shagun rounding (ends in 1)
  voice.ts                  parseVoiceEntry: Hindi / Hinglish transcript -> name, father, village, amount
  reports.ts                personWise, occasionWise, selfLedger, pendingReturns ("Lautana baaki")
  session.ts                (removed in Stage 3: entries are saved to SQLite immediately)
  readback.ts               Devanagari read-back sentence
src/db/                     expo-sqlite schema, migrations, key handling, typed repositories
src/app/                    expo-router screens
src/ledgers/                Open ledger + unlocked PINs (memory only), PIN flow rules
src/backup/                 Password-encrypted backup file: scrypt + XChaCha20-Poly1305 (@noble), snapshot build/validate/merge
src/ads/                    AdMob: pure policy (tested), lazy service, banner / native card; remote config in src/remote/, support in src/support/ (docs/ADS.md)
src/legal/content.ts        Privacy, terms, grievance, delete-account text: ONE source for the app screens and the Worker pages
src/onboarding/             Picture cards and screen help text, spoken in Hindi (expo-speech)
src/sync/                   Cloud backup: engine (push dirty / pull cursor), http client, scheduler, runtime wiring
src/auth/                   Better Auth client wrapper (Expo client, session in secure-store), lazy Google sign-in, Hindi error messages (docs/AUTH.md)
server/                     Cloudflare Worker (Hono + self-hosted Better Auth) + Neon Postgres backend, its own npm package
src/components, src/hooks   UI pieces
src/theme.ts                Design tokens (the only place for colours, fonts, sizes, spacing) + the contrast pairs the test checks
src/components/icons.tsx    Hand-drawn line icon set (react-native-svg); motifs.tsx: dot border, toran, rice grains, empty-state art
.github/workflows/ci.yml    Checks + debug-signed release APK
```

Design rules baked into the model: entries are immutable (SQLite triggers block UPDATE/DELETE); a correction is
a new entry with `correctsEntryId`, and an undo is a **void** (a correction with `isVoid`, zero amounts, that counts as nothing), and superseded entries (including along chains) are excluded from every
total. There is no death-feast occasion. Pending returns use neutral wording ("Lautana baaki"), never
"defaulter".

## Scripts

| Script | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |
| `npm test` | Jest (core + DB tests) |

The DB tests run the real migrations and repository SQL on Node's built-in `node:sqlite` (Node 22+).

## Try it on a phone

**Expo Go (quickest):** install Expo Go, run `npm install && npm start`, scan the QR code. Expo Go ships plain
SQLite, so the database works but is **not encrypted** there (the `PRAGMA key` is a no-op).

**Dev build (needed to test encryption):** `useSQLCipher` is enabled through the `expo-sqlite` config plugin, so
the real encrypted DB only exists in a native build. Use the CI APK below, or
`npx eas-cli build --profile development --platform android` (needs an Expo account), then `npm start` and open
the app. `eas.json` has `development`, `preview` (APK) and `production` (AAB) profiles for later.

## Get the APK from GitHub Actions

Every push to `main`, every pull request, or a manual run of the **CI** workflow builds the app after the checks
pass. Open the run in the Actions tab, scroll to **Artifacts**, and download `notra-book-apk`, unzip it, and
install the `.apk` on an Android 8+ phone (allow installs from unknown sources). No Expo account is needed:
CI runs `expo prebuild` and `./gradlew assembleRelease`.

Note: the APK is a **release build signed with the debug keystore**, which is fine for testing but not for the
Play Store. Proguard minification and resource shrinking are enabled. Production builds need a real keystore
(for example via EAS).

## Permissions and privacy

Android: `RECORD_AUDIO` only (voice entry). `READ_CONTACTS`, `READ_SMS`, `READ_CALL_LOG`, storage and media
permissions (and `SYSTEM_ALERT_WINDOW`) are removed via `blockedPermissions`. The app still declares `INTERNET`
(added by default, needed for the dev server and cloud backup). The SQLCipher key is generated once on the
device and stored in the OS keystore via expo-secure-store.

## Firebase Analytics

`@react-native-firebase/app` + `@react-native-firebase/analytics` 26.4.0 (Expo config plugins in `app.json`; Firebase project `notra-pp`, package `app.notra.book`). Native init comes from the committed `google-services.json` (the `com.google.gms.google-services` Gradle plugin is applied during `expo prebuild`; CI/e2e/release builds just need the file in the repo root). `firebase.json` (repo root, read by Gradle) keeps auto-collection, automatic screen reports, ad ID / SSAID collection and the ad-signal consent defaults OFF; JS turns collection on after the first render (`src/analytics/`).

* `src/analytics/events.ts`: closed allow-list of events and params + sanitizer (unknown events/params dropped, strings over 40 chars or with 4+ digits in a row rejected). **Nothing from the diary is ever sent** (no names, villages, phones, amounts, items, labels, notes, text, ids). No user id, no user properties.
* Collection = Settings switch "ऐप सुधार के लिए उपयोग के आँकड़े भेजें" (default on) AND remote `features.analytics` (default true) AND not blocked by Google UMP (`consent.ts`). Missing native module (Expo Go, jest) = silent no-op. Adding an event: add it to `EVENTS`, call `track(...)`, update the Play Data Safety notes and `src/legal/content.ts` if the data kinds change.
* Screen views use route templates from `useSegments()` (`/events/[id]`, never real ids); a test checks the list against `src/app`.
* **iOS** needs its own `GoogleService-Info.plist` (not created yet): put it at the repo root as `GoogleService-Info.plist`; `app.config.js` then sets `ios.googleServicesFile` and uses the full Firebase plugin automatically. Until then only the Android half of the plugin runs (`plugins/withFirebaseAndroid.js`) so iOS prebuild does not fail; Analytics calls on iOS are a no-op until the plist exists.
* Link the AdMob app to this Firebase project: see `docs/ADS.md`.

### Security note: the Firebase API key

The `current_key` in `google-services.json` is **not a secret**; it ships inside every APK. Do restrict it in Google Cloud Console -> APIs & Services -> Credentials (project `notra-pp`): Application restrictions = **Android apps** with package `app.notra.book` plus the SHA-1 fingerprint(s) of every signing key (upload key, Play app-signing key, debug key if you test with it), and API restrictions = only the Firebase APIs in use (Firebase Installations API, Firebase Remote Config API if added later, Google Analytics / Firebase management APIs as the console suggests). Also keep the project's Firestore/Storage rules closed (the app uses neither).

## Phase 1 screens (Stage 2)

Home (toran, greeting, मिला/दिया summary, four tiles: नोतरा लिखें / कार्यक्रम / परिवार / हिसाब), first-launch setup (my household + village increment),
household directory with photos, household detail with Lena–Dena balance and suggested return,
add entry (number pad, shagun buttons, in-kind, voice entry, spoken read-back), Notra events,
Event ledger (खाता: the host opens an event and records each giver, saved instantly, undo = void), reports (person-wise, occasion-wise, self ledger, लौटाना बाकी, yearly calendar),
and PDF export shared via the share sheet (WhatsApp).

## Performance rules

Totals and reports are computed in SQLite (`src/db/queries.ts`) with indexes; lists are
virtualised and paginated; print/share/speech/camera modules load only when used;
photos are resized to 512 px; Android builds only `armeabi-v7a` and `arm64-v8a`.

## Event ledger and saving

There is no separate "scribe" role: the person hosting a Notra creates an event (नोतरा कार्यक्रम), taps **खाता खोलें**
and records each giver (family -> amount -> save, 3 taps). Every entry is written to SQLite the moment it is saved,
so an app kill loses nothing; reopening the ledger resumes with the running total. "वापस" undoes the last entry by
appending a **void** entry; "पूरा करें" only marks the event HELD and shows the summary. Add-entry saves immediately
too, and "बदलें" chains a correction. Voids and correction chains are handled identically by `src/core` and by the SQL
view/queries (`active_entries`), and `src/db/__tests__/void.test.ts` proves SQL == core.

## Backend & sync

**Architecture.** Optional, off by default. The app works 100% offline without ever signing in. When the person signs in
(Google or mobile OTP) and backup is on, `src/sync` pushes rows marked `dirty` in batches of 500 and pulls everything
with `server_seq` greater than its cursor, applying each page in one transaction. Entries are immutable (insert or
ignore), households and events are last-write-wins by `updated_at`. Triggers: app start, app returns to foreground, and
~10 s after a local write; failures are silent and retried with backoff. Photos and voice notes are not synced yet.

```
phone (SQLite, truth) --HTTPS--> Cloudflare Worker (Hono + Better Auth) --postgres driver--> Neon Postgres (RLS)
```

`server/` is its own package (`cd server && npm ci`): `src/` (Hono app, auth, sync), `migrations/*.sql`, `test/`
(vitest on an in-process Postgres, `@electric-sql/pglite`, running the real migrations; one test also drives the real
`postgres` driver over the wire protocol). Scripts: `npm run typecheck`, `npm test`, `npm run migrate`, `npm run deploy`.

**Auth** (no password; self-hosted [Better Auth](https://better-auth.com) inside the Worker, on the same Neon database; full design,
flows and the Neon steps are in `docs/AUTH.md`): Better Auth's handler is mounted at `/api/auth/*`. Google: the native Google
Sign-In SDK's ID token goes to `POST /api/auth/sign-in/social {provider:"google", idToken:{token}}` (verified against Google's JWKS:
issuer, audience in `GOOGLE_CLIENT_IDS`, expiry, verified email). Phone: `POST /api/auth/phone-number/send-otp {phoneNumber}` and
`/api/auth/phone-number/verify {phoneNumber, code}` (Indian mobiles, 6-digit code, 5 min expiry, 5 attempts, single use; limits:
3 starts per phone per 15 min, 10 per IP per hour, 30 s resend cooldown; SMS via MSG91 with a DLT template). Sessions last 60 days
(sliding), are stored server-side, and are sent as the Better Auth cookie (`Cookie` header from the app, browser cookie) or
`Authorization: Bearer <session token>`; `/api/auth/sign-out` revokes one. One household can use both methods: a signed-in user adds a
phone (`/api/auth/phone-number/verify` with `updatePhoneNumber`) or Google (`/api/auth/link-social`); refused if the identity belongs to
another user. `GET /v1/me` returns the signed-in user. **Restore on a new phone**: sign in, and the first sync pulls from
cursor 0. Sync endpoints: `POST /v1/sync/push` (max 500 rows) and `GET /v1/sync/pull?since=&limit=`; every query is
scoped by the session's `user_id`, and primary keys include `user_id`.

**Database: Neon.** Create a Postgres database and set `DATABASE_URL` to the restricted runtime role's **pooled** connection string
and `MIGRATION_DATABASE_URL` to the owner role's (plain SQL through the `postgres` driver, `prepare: false` so poolers work; Better
Auth uses the same connection through a small Kysely dialect). Do **not** enable Neon Auth (`auth: true`): Better Auth here is the one
user system (docs/AUTH.md). To use Cloudflare Hyperdrive, uncomment the `[[hyperdrive]]` block in
`server/wrangler.toml`; the Worker then prefers `env.HYPERDRIVE.connectionString`.

**Run migrations and deploy.**

```
cd server
DATABASE_URL=postgres://... npm run migrate     # applies migrations/*.sql once each, tracked in schema_migrations
npx wrangler login && npm run deploy            # or use the "Deploy server" GitHub workflow
```

Then put the Worker's URL in `app.json` `extra.apiUrl`.

**GitHub secrets** (Actions workflow *Deploy server*, manual): `DATABASE_URL`, `CLOUDFLARE_API_TOKEN` (and
`CLOUDFLARE_ACCOUNT_ID` if needed), `MIGRATION_DATABASE_URL`, `BETTER_AUTH_SECRET` (32+ random chars),
`GOOGLE_CLIENT_IDS` (comma-separated: the web, Android and iOS client ids, plus the admin panel's web client id),
`MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, and optionally `SMS_PROVIDER`
(`msg91` by default; `dev` only logs the code and must never be used in production). The workflow sets them as
Worker secrets; nothing is committed. `BETTER_AUTH_URL` (the Worker's public origin) is a plain var in `server/wrangler.toml`: set it to the real URL. Better Auth rate-limits `/api/auth/*` itself (database-backed); add a Cloudflare rate-limiting rule on `/api/auth/*` as defence in depth.

**Google sign-in setup.** In Google Cloud Console: create an OAuth consent screen, then OAuth client IDs of type
*Web application* (its client ID goes in `app.json` `extra.googleWebClientId` and in `GOOGLE_CLIENT_IDS`; the ID token's audience is this web client id, so it must be in the list), *Android*
(package `app.notra.book` plus the SHA-1 of the signing keystore; the debug keystore for CI APKs) and *iOS* (bundle ID
`app.notra.book`; its reversed client ID replaces `iosUrlScheme` in the `@react-native-google-signin/google-signin`
plugin entry). The native module needs a dev/CI build, not Expo Go; it is imported only when the Google button is tapped.

**Privacy.** Data stays on the phone unless the person signs in (backup turns on with sign-in and can be switched off in
Settings). The server stores: user id, Google subject or phone number, display name, Better Auth sessions and the OTP in flight (5 min), and the synced ledger rows (names, village, amounts). Photos stay on the phone. The session lives in the OS keystore.
Signing out keeps local data; wiping it is a separate, confirmed choice. Not yet built: end-to-end encryption of synced
rows (the server can read them), account deletion, photo sync (R2).

**Known limits.** The "my household" and village-increment settings are device-local and are not restored by a pull (a
restored phone still shows first-run setup). Signing in as a different user on a phone that already has data uploads
that data to the new account. A row the server rejects as invalid would retry forever (visible as "भेजना बाकी").

## Stage 5: production hardening

- **Account deletion.** Settings > खाता हटाएं (warning, type `हटाएं`, then a separate question about wiping this phone) calls
  `DELETE /v1/account`, which deletes households, events, entries, ledgers, profile, sessions, linked sign-ins, the phone's OTP rows and the
  user in one transaction. The Worker also serves public pages for the Play listing: `GET /privacy`, `/terms`, `/grievance`,
  `/delete-account` (Hindi first, English below; text from `src/legal/content.ts`; placeholders in `CONTACT`: replace them).
- **Profile sync.** "My household" and the village increment sync as one last-write-wins row, so a restored phone skips setup.
- **Account switching.** `sync_state.user_id` is the owner of the data on the phone. A different account, or data never synced
  anywhere, asks "इस फ़ोन का डेटा इस खाते में जोड़ें?" (जोड़ें / पहले फ़ोन साफ़ करें / रद्द करें); nothing uploads before the answer.
- **Poison rows.** Push returns per-row `rejected` (table, id, index, reason); the app sets `sync_error`, stops retrying, and
  Settings shows "N एंट्री नहीं भेजी जा सकीं" with a retry button. Whole-request problems are still 400.
- **Ledgers and PINs.** The household ledger (fixed id) plus personal ledgers per family member, optional 4-digit PIN (salted
  PBKDF2-SHA256, back-off after 3 wrong tries, stored only on the phone, never synced or exported). `ledger_id` is on entries and
  events and every query is scoped to the open ledger. Optional app lock (off by default): PIN on open and after 2 minutes away.
- **Backup file** (for families who never sign in): Settings > बैकअप फ़ाइल बनाएं / से वापस लाएं. See `src/backup/crypto.ts`.
- **Accessibility.** Text and TextInput come from `components/text.tsx` (font scale capped at 1.3x, enforced by ESLint); every
  button, row and input has a label/role/hint; a speaker button on Home, entry and event-ledger screens reads the screen's purpose.
- **Crash safety.** The root layout exports an expo-router `ErrorBoundary` (Hindi, with retry); DB writes in screens go through
  `guarded()` which shows a toast instead of crashing. No crash SDK.
- **Server tests:** `cd server && npm test` (migration `003_profile_ledgers_account.sql` must be applied before deploying the new app).
- Store listing answers: `docs/PLAY_STORE.md`.


## Stage 6: look, feel and navigation

For a first-time smartphone user who may not read well: picture-first, plain Hindi, very few choices per screen.

- **Navigation.** Home has exactly four big tiles (नोतरा लिखें, कार्यक्रम, परिवार, हिसाब) and a small gear (settings). Every primary task is at most 2 taps from
  Home (write an entry: tile, then pick family; open an event ledger: कार्यक्रम, then the card's "खाता खोलें"). Every other screen has a big "वापस"
  button top-left, a clear title, and its one main action as a full-width haldi button at the bottom (`Screen action`).
- **Words.** मिला (आया) = received, दिया (गया) = given; "हिसाब" for reports; "बैकअप" never "sync"; no English in the UI. Direction is always arrow + word + colour.
- **Tokens** (`src/theme.ts`): paper `#FBF6EC`, card `#FFFDF8`, indigo `#1F3A93` (मिला), kumkum `#9E2A2B` (दिया), haldi `#E8A317` (primary button, dark text),
  mehendi `#4B7F52` (success), muted `#5A5148`, hairline `#E7DCC8`. Every text/background pair in use is listed in `textPairs` and asserted >= WCAG AA by
  `src/__tests__/theme.test.ts`. Type scale: amounts 40-56, titles 26, body 20, nothing under 18; 8-pt spacing; radius 16; touch targets 64. Flat: hairlines and tints, no shadows.
- **Font.** Mukta Medium + Bold only (`assets/fonts`, OFL), subset with fonttools to Devanagari + Latin + digits + rupee sign (215 KB each; the full files are 415 KB each).
  Weight is the file, so no screen sets `fontWeight`. The root layout holds the splash until both load (bundled, milliseconds).
- **Icons and motifs.** `react-native-svg` instead of emoji so every phone draws the same pictures; the Pithora-style dot border, toran and rice-grain pattern are each
  a few paths, built once per width and memoized.
- **Feel.** `PressableScale` (150 ms scale/fade, native driver), `expo-haptics` light tick on save and number-pad taps, an animated check on save; all animations are skipped
  when the phone's "remove animations" setting is on (`useReduceMotion`). `core/words.ts` writes the typed amount in Hindi words ("पाँच सौ एक रुपये").
- **E2E.** `.maestro/08_screenshots.yaml` visits every main screen and saves `screenshots/<name>.png`; flows 01-07 use the new strings.

## Stage 7: two separate worlds, उतार/चढ़ाव, reports

- **Two worlds, never mixed.** *मेरा नोतरा* = programs my household hosts: here I only RECEIVE (open one, "+ कौन आया"). *दूसरों का नोतरा* = programs of other
  families: here I only GIVE ("नए नोतरे में गए": family, occasion, date, amount). **Every entry belongs to an event and its direction is derived from the host**
  (host = my household: AAYA, otherwise GAYA); nobody chooses it. Enforced in `core/eventRules.ts`, the repository, **SQLite triggers** (`entries_need_event`,
  `entries_direction_rule`, migration v7) and on the **server** (`enforceDirections` in sync push: `invalid_payload:direction` / `eventId`). Voids and corrections that
  keep the target's event + direction are exempt. Old entries without an event are attached by the migration to an automatic "पुराना हिसाब" event (mine per ledger,
  one per family for given); ids are deterministic (`a1a1a1a1-…` / `b2b2b2b2-…`), so a restore from an old cloud copy or backup file maps the same way.
- **Navigation.** Bottom tabs (4, 84 dp): घर (summary, calendar of all programs with occasion dots, परिवार, पुराना हिसाब जोड़ें, gear for settings) · मेरा नोतरा ·
  दूसरों का नोतरा · हिसाब. The calendar sits on घर because a fifth tab would crowd the bar.
- **Occasions.** शादी, गृहप्रवेश, मुंडन संस्कार, बीमारी, मकान, अन्य (never a death feast). "अन्य" has an editable name (`occasion_label`, 60 chars) and details
  (`occasion_note`, 500), shown everywhere the occasion name is shown (`occasionName()`), editable later on the event screen, with quick chips of recent names.
- **Diary date.** `entries.occurred_on` (YYYY-MM-DD, default: date of created_at). Balances, उतार/चढ़ाव and reports order by `occurred_on, created_at, rowid`. Past dates
  are allowed everywhere (calendar picker). "पुराना हिसाब जोड़ें" = the same two flows with past dates.
- **उतार / चढ़ाव** (`core/settlement.ts`, SQL view `entry_settlement` + a correlated query for pages): against the running balance with the same family, a gift that repays
  what was owed is उतार, the rest is चढ़ाव (they gave 501, I give 701: ₹501 उतार, ₹200 चढ़ाव). Shown in the read-back, family history, event rows and reports.
- **Search.** One box (families and pickers): name, father, village, fala, phone (digits, +91 / leading 0 / spaces ignored), words ANDed, names that start with the word first.
- **Contact picker without READ_CONTACTS.** `modules/notra-contact-picker` (a ~80-line local Expo module): `ACTION_PICK` on `Phone.CONTENT_URI`; the system picker hands
  back the ONE tapped row with a temporary read grant. READ_CONTACTS stays in `blockedPermissions`; the number is normalised to +91 E.164 (`core/phone.ts`).
- **Reports** (हिसाब tab; each filterable by year or date range; each sent as PDF or as photos): किसको, किस दिन, कितना दिया · मेरे प्रोग्राम में कौन आया · साल भर का हिसाब ·
  मेरे नोतरे में कौन नहीं आया (private) · किसका कितना · अवसर के हिसाब से · लौटाना बाकी · मेरा खाता. SQL in `src/db/reports.ts` (paged lists), docs built by pure
  functions in `core/reportDocs.ts` (one model feeds both the PDF HTML and the image sheet). Photos: `react-native-view-shot` draws a print-style sheet off screen,
  25 rows per page, 1080 px wide; the pages are listed to send one at a time. PDF: expo-print as before.
- **Server.** Migration `004_stage7.sql` (occasion CHECK, label/note, `occurred_on`). Apply it before deploying this app version.
- **E2E ids.** Interactive elements carry `testID`s (`field-*`, `btn-*`, `tab-*`, `key-*`, `chip-*`, `household-row-<name>`); the Maestro flows select by id.
- **Not built yet.** Diary-photo import: only a "जल्द आ रहा है" card behind `FEATURES.diaryPhotoImport` (`src/features.ts`).
