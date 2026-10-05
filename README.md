# Notra Diary (नोतरा डायरी)

An offline-first mobile ledger for the Notra custom: interest-free, document-free reciprocal gifting and
loans among Bhil households in southern Rajasthan, where each return is expected to be a little larger than
what was received. The app records the relationship between two households (Lena-Dena), not just events.

Stage 1 (this repo state): domain logic, encrypted local database, a minimal Hindi home screen, CI.
No backend yet; the data layer is sync-ready (UUID ids, `createdAt`/`updatedAt`, append-only entries).

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
src/app/                    expo-router screens (Stage 1: home only)
src/components, src/hooks   UI pieces
src/theme.ts                Ruled-paper theme: colours, type scale, touch targets
.github/workflows/ci.yml    Checks + debug-signed release APK
```

Design rules baked into the model: entries are immutable (SQLite triggers block UPDATE/DELETE); a correction is
a new entry with `correctsEntryId`, and superseded entries (including along chains) are excluded from every
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
(added by default, needed for the dev server and the future sync). The SQLCipher key is generated once on the
device and stored in the OS keystore via expo-secure-store.

## Phase 1 screens (Stage 2)

Home (मेरा नोतरा / दूसरों का नोतरा), first-launch setup (my household + village increment),
household directory with photos, household detail with Lena–Dena balance and suggested return,
add entry (number pad, shagun buttons, in-kind, voice entry, spoken read-back), Notra events,
Lekhak mode, reports (person-wise, occasion-wise, self ledger, लौटाना बाकी, yearly calendar),
and PDF export shared via the share sheet (WhatsApp).

## Performance rules

Totals and reports are computed in SQLite (`src/db/queries.ts`) with indexes; lists are
virtualised and paginated; print/share/speech/camera modules load only when used;
photos are resized to 512 px; Android builds only `armeabi-v7a` and `arm64-v8a`.
