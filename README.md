# Notra Diary (नोतरा डायरी)

An offline-first mobile ledger for the Notra custom: interest-free, document-free reciprocal gifting and
loans among Bhil households in southern Rajasthan, where each return is expected to be a little larger than
what was received. The app records the relationship between two households (Lena-Dena), not just events.

Stage 1 added the domain logic, encrypted local database and CI; Stage 2 the Phase 1 screens; Stage 3 immediate
saves, void entries and optional cloud backup (see **Backend & sync**). The phone's SQLite stays the source of truth.

## Stack

Expo SDK 57, React Native 0.86 (Hermes), expo-router, TypeScript (strict), expo-sqlite with SQLCipher,
expo-secure-store (holds the DB key), Jest (jest-expo).

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
src/sync/                   Cloud backup: engine (push dirty / pull cursor), http client, scheduler, runtime wiring
src/auth/                   Token storage (secure-store), lazy Google sign-in, Hindi error messages
server/                     Cloudflare Worker (Hono) + Postgres backend, its own npm package
src/components, src/hooks   UI pieces
src/theme.ts                Ruled-paper theme: colours, type scale, touch targets
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
pass. Open the run in the Actions tab, scroll to **Artifacts**, and download `notra-diary-apk`, unzip it, and
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

## Phase 1 screens (Stage 2)

Home (मेरा नोतरा / दूसरों का नोतरा), first-launch setup (my household + village increment),
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
phone (SQLite, truth) --HTTPS--> Cloudflare Worker (Hono) --postgres driver--> any Postgres (Neon / Supabase / Hyperdrive)
```

`server/` is its own package (`cd server && npm ci`): `src/` (Hono app, auth, sync), `migrations/*.sql`, `test/`
(vitest on an in-process Postgres, `@electric-sql/pglite`, running the real migrations; one test also drives the real
`postgres` driver over the wire protocol). Scripts: `npm run typecheck`, `npm test`, `npm run migrate`, `npm run deploy`.

**Auth** (no password, no vendor auth SDKs): `POST /v1/auth/google {idToken}` (verified with `jose` against Google's JWKS:
issuer, audience in `GOOGLE_CLIENT_IDS`, expiry, verified email); `POST /v1/auth/otp/start {phone}` and
`/v1/auth/otp/verify {phone, code}` (Indian mobiles, 6-digit code, SHA-256 hashed with `OTP_PEPPER`, 5 min expiry, 5
attempts, single use; SQL-enforced limits: 3 starts per phone per 15 min, 10 per IP per hour, 30 s resend cooldown;
SMS via MSG91 with a DLT template). Both return a 15-minute HS256 access token and a 60-day refresh token (stored
hashed, rotated on every use; reusing a rotated token revokes its whole family). Also `/v1/auth/refresh`,
`/v1/auth/logout`, and authenticated `/v1/auth/link/google` and `/v1/auth/link/phone` so one household can use both
(refused if the identity belongs to another user). **Restore on a new phone**: sign in, and the first sync pulls from
cursor 0. Sync endpoints: `POST /v1/sync/push` (max 500 rows) and `GET /v1/sync/pull?since=&limit=`; every query is
scoped by the token's `user_id`, and primary keys include `user_id`.

**Choose Neon or Supabase.** Create a Postgres database and set `DATABASE_URL` to its connection string; nothing else
changes (plain SQL through the `postgres` driver, `prepare: false` so poolers work). Use the pooled connection string
for Neon / the transaction pooler for Supabase. To use Cloudflare Hyperdrive, uncomment the `[[hyperdrive]]` block in
`server/wrangler.toml`; the Worker then prefers `env.HYPERDRIVE.connectionString`.

**Run migrations and deploy.**

```
cd server
DATABASE_URL=postgres://... npm run migrate     # applies migrations/*.sql once each, tracked in schema_migrations
npx wrangler login && npm run deploy            # or use the "Deploy server" GitHub workflow
```

Then put the Worker's URL in `app.json` `extra.apiUrl`.

**GitHub secrets** (Actions workflow *Deploy server*, manual): `DATABASE_URL`, `CLOUDFLARE_API_TOKEN` (and
`CLOUDFLARE_ACCOUNT_ID` if needed), `JWT_SECRET` (32+ random chars), `OTP_PEPPER` (16+ random chars),
`GOOGLE_CLIENT_IDS` (comma-separated), `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, and optionally `SMS_PROVIDER`
(`msg91` by default; `dev` only logs the code and must never be used in production). The workflow sets them as
Worker secrets; nothing is committed. Add a Cloudflare rate-limiting rule on `/v1/auth/*` as defence in depth.

**Google sign-in setup.** In Google Cloud Console: create an OAuth consent screen, then OAuth client IDs of type
*Web application* (its client ID goes in `app.json` `extra.googleWebClientId` and in `GOOGLE_CLIENT_IDS`), *Android*
(package `app.notra.diary` plus the SHA-1 of the signing keystore; the debug keystore for CI APKs) and *iOS* (bundle ID
`app.notra.diary`; its reversed client ID replaces `iosUrlScheme` in the `@react-native-google-signin/google-signin`
plugin entry). The native module needs a dev/CI build, not Expo Go; it is imported only when the Google button is tapped.

**Privacy.** Data stays on the phone unless the person signs in (backup turns on with sign-in and can be switched off in
Settings). The server stores: user id, Google subject or phone number, display name, hashed OTP codes and refresh
tokens, and the synced ledger rows (names, village, amounts). Photos stay on the phone. Tokens live in the OS keystore.
Signing out keeps local data; wiping it is a separate, confirmed choice. Not yet built: end-to-end encryption of synced
rows (the server can read them), account deletion, photo sync (R2).

**Known limits.** The "my household" and village-increment settings are device-local and are not restored by a pull (a
restored phone still shows first-run setup). Signing in as a different user on a phone that already has data uploads
that data to the new account. A row the server rejects as invalid would retry forever (visible as "भेजना बाकी").
