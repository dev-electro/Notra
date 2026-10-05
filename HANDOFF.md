# Notra Book — Handoff

Status as of **2026-10-06**, branch **`ccr-c41967d5-5ii4w6`**. Start here, then read [`docs/INDEX.md`](docs/INDEX.md).

Notra Book (नोतरा बुक, Android package `app.notra.book`) is an offline-first Hindi app for recording नोतरा: what a
family receives at its own occasions and what it gives at other families' occasions, with reports. The data is
encrypted on the phone, with an optional cloud backup.

## 1. What is in the repo

| Area | Where | State |
|---|---|---|
| Mobile app (Expo SDK 57, React Native, TypeScript) | `src/`, `app.json`, `app.config.js` | Feature-complete Phase 1; tests are green; not yet run on a real phone |
| Domain logic: balances, उतार/चढ़ाव, reports, voice parser | `src/core/` | Unit tested; SQL results tested against core |
| Local encrypted DB (SQLCipher, migrations v1–v7) | `src/db/` | Tested |
| Cloud sync (push/pull, restore, account switch) | `src/sync/`, `server/src/sync.ts` | Tested |
| Login: **self-hosted Better Auth** (Google + mobile OTP via MSG91) | `server/src/auth/`, `src/auth/`, [`docs/AUTH.md`](docs/AUTH.md) | Tested; not yet deployed |
| Server: Hono on Cloudflare Workers + Neon Postgres with Row Level Security | `server/` (migrations `001–004`, `100–103`) | tests green |
| Admin panel (React + Vite; DB roles, aggregate-only insights) | `admin/`, [`docs/ADMIN.md`](docs/ADMIN.md) | 18 tests; builds |
| Ads (AdMob) and remote config | `src/ads/`, `src/remote/`, [`docs/ADS.md`](docs/ADS.md) | Uses test ad IDs until real IDs are set |
| Firebase Analytics (privacy allow-list) | `src/analytics/`, `google-services.json`, `firebase.json` | Integrated (see open decision §4) |
| CI/CD: checks, APK, emulator E2E, signed release, deploys | `.github/workflows/`, `.maestro/`, [`docs/CI_CD.md`](docs/CI_CD.md) | See §3 |
| Docs | `docs/` | See [`docs/INDEX.md`](docs/INDEX.md) |

Product decisions and the reasons for them are in [`docs/DECISIONS.md`](docs/DECISIONS.md). In short:
- **Two separate sides.** मेरा नोतरा (my own occasions) records receiving only. दूसरों का नोतरा (other families' occasions) records giving only.
- **No lekhak (scribe) role.**
- **Entries are append-only.** A mistake is fixed by a correction or void entry, never by editing or deleting.
- **Reports are the main feature.** They export as image (PNG) or PDF.
- **Admins cannot read anyone's diary.** The only exception is read-only access the user grants, for at most 7 days.

**Deployed (2026-10-06).**
- API: `https://notra-book-api.gauravapproved.workers.dev`.
- Admin panel: `https://notra-admin.gauravapproved.workers.dev`. It deploys as a Worker with static assets: run `wrangler deploy` in `admin/` (no Cloudflare Pages).
- Neon migrations are applied; the Worker connects as the runtime role `notra_runtime`.
- Owner (first admin): `gauravapproved@gmail.com`.
- App navigation has 4 tabs: घर / नोतरा / रिश्ते / इनाम.

## 2. Run it on your Mac

```bash
git clone https://github.com/dev-electro/Notra && cd Notra && git checkout ccr-c41967d5-5ii4w6
npm ci && npm run typecheck && npm run lint && npm test        # app: 419 tests
cd server && npm ci && npm test && cd ..                         # server: 122 tests
cd admin && npm ci && npm test && npm run build && cd ..          # admin: 18 tests
```

The app uses native modules (SQLCipher, ads, Firebase, the contact picker, Google sign-in), so **Expo Go is not
enough**. Use the CI APK or build a dev client. A physical Android phone over USB/Wi-Fi `adb` is the lightest
option on an 8 GB M1. Details: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md), [`docs/TESTING.md`](docs/TESTING.md).

The test APK is published by CI as a pre-release:
`https://github.com/dev-electro/Notra/releases/download/test-ccr-c41967d5-5ii4w6/notra-book-test.apk`

## 3. CI status (checked 2026-10-05 15:10 UTC, commit `71f3f50`)

- **checks / server / admin:** green.
- **android-apk:** the **PR run is green**
  ([run 37324024776](https://github.com/dev-electro/Notra/actions/runs/37324024776)), so the Kotlin-metadata fix
  (`plugins/withKotlinMetadataCompat.js`) works. The *push* run of the same commit failed in `android-apk`; its log
  was unavailable and the same build passed in the PR run, so this looks like an infrastructure failure. The push run
  is the one that publishes the test APK pre-release, so **re-run it from the Actions tab** (this session was not
  allowed to: 403) or push any commit. That will update
  `https://github.com/dev-electro/Notra/releases/download/test-ccr-c41967d5-5ii4w6/notra-book-test.apk`.
  Until then, the APK from the PR run is under that run's **Artifacts → notra-book-apk**.
- **E2E (Maestro): all 9 flows fail at the same point.** Flow 01 gets through the onboarding cards, the "बाद में" sign-in
  skip and the setup form, taps **शुरू करें** (`btn-save`), and then Home (`btn-families`) never appears within 30 s.
  Flows 02–09 fail because setup never completed.
  - **Next step:** open [run 37322753192](https://github.com/dev-electro/Notra/actions/runs/37322753192) → Artifacts →
    `e2e-screenshots` (look at `01-setup-filled` and the final screenshot) and `e2e-logcat`.
  - **Likely causes, introduced by the AdMob, remote-config and Better Auth stages:** a dialog shown after setup (the UMP consent form, the
    account-switch prompt, or the force-update/maintenance overlay when `/v1/config` is unreachable) covering Home, or
    the setup save failing. Before those stages, flow 01 passed on the emulator.
- **ccache:** about 41–44% hits. A warm APK build takes about 15–35 minutes depending on cache state.

## 4. Open decisions (owner)

1. **Firebase Analytics: keep or remove.** It adds about 2 MB, but it is the only way to see usage from users who never sign in. To remove it, revert commit `35e5268`.
2. **`app-ads.txt`** (`google.com, pub-2707121635941418, DIRECT, f08c47fec0942fa0`) and the publisher-ID guard were
   blocked by the session's permission system and are **not** applied. Add them yourself (`web/public/app-ads.txt` on
   the site set in your Play listing).
3. **Neon Auth must stay off** (`auth: false` in `neon.ts`), because Better Auth is self-hosted. Running both would create two user systems.

## 5. Known bugs to fix first (found while documenting)

Details and file paths are in [`docs/ROADMAP.md`](docs/ROADMAP.md) §3.
1. **The support form loses tickets.** The app sends `message` and `complaint|suggestion|delete_account`; the server expects `body` and
   `grievance|feedback|deletion`. The server answers 400, the app drops the ticket, and the UI still says "sent".
2. **Support access does not work.** The app posts `{days}` and uses `DELETE`; the server expects `POST {action:'grant'|'revoke', hours}`.
3. **Remote config does not match between app and server.** The server's `features` has no `analytics` key, the server default is `ads.enabled=false` while the app default is `true`, and the clamp ranges differ.
4. **A missing SMS secret breaks every route.** It makes `createApp` throw, so all routes, `/v1/health` included, return 500. Make the SMS provider lazy.
5. **Maintenance mode can lock staff out.** It blocks `/api/auth/*`, which the admin panel also needs to sign in. Allow staff sign-in during maintenance.
6. **FIXED.** The v7 legacy-event fallback no longer hosts "my" old entries on another household when `my_household_id` was never set: the migration, `ensureLegacyEvent`, sync pull and backup merge leave them without a program (or skip them) instead of guessing.
7. **FIXED.** Backup merge skips (and counts) entries that name an unknown event, and backup id validation is now the server's UUID check.
8. **FIXED.** The OTP is stored as an HMAC-SHA256 hash (keyed with `BETTER_AUTH_SECRET`) in `auth_verifications` and checked by a custom `verifyOTP` (`server/src/auth/otp-store.ts`). Better Auth 1.7.7 has no `storeOTP` option, so a `verification.create.before` hook does the hashing. No migration needed.
9. **Dead code:** `server/src/auth/otp.ts` and `server/src/auth/tokens.ts` are unused since the Better Auth move. The session
   was not allowed to delete them, so run `git rm` on them. The unused columns `lekhak_name` and `voice_note_uri` are left in place: they sit in the immutability triggers and the v7 table rebuild, so removing them needs a careful new local migration.
10. **FIXED.** README "Known limits", `docs/TESTING.md` (9 flows) and `docs/ADMIN.md` §9 are updated.

## 6. Go-live checklist (owner actions)

Full step-by-step: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) and [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md).

1. **Neon** (project `winter-voice-10801980`, branch `production`): `npm i -g neon@latest && neon login`, then
   `neon link --project-id winter-voice-10801980 --branch production -y`. Create the restricted runtime role
   (`NOBYPASSRLS`, member of `notra_app`). Its pooled connection string is the `DATABASE_URL` secret; the owner
   connection string is `MIGRATION_DATABASE_URL`.
2. **Cloudflare:** create an account and API token, then run **Deploy server** (migrations, then the Worker). Worker secrets:
   - `BETTER_AUTH_SECRET`
   - `BETTER_AUTH_URL`: the real Worker URL. Also put it in `app.json` → `extra.apiUrl`.
   - `GOOGLE_CLIENT_IDS`: Android, iOS, web and admin client ids.
   - `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID`
   - `SMS_PROVIDER` and `SMS_COST_PAISE`
   - `ADMIN_ORIGIN`
3. **Google Cloud OAuth:** an Android client (`app.notra.book`, with the upload and Play app-signing SHA-1s) and a Web client
   (app + admin origin). Fill `extra.googleWebClientId`.
4. **MSG91:** complete DLT registration (sender ID and OTP template). This takes weeks, so start early.
5. **AdMob:** create the app on `app.notra.book` and 4 ad units (banner, native, interstitial, rewarded). Add them as `ADMOB_*` secrets.
   Host `app-ads.txt`, link Firebase project `notra-pp`, and block the sensitive ad categories (listed in `docs/ADS.md`).
6. **Firebase:** restrict the API key in `google-services.json` to Android, package `app.notra.book`, and your SHA-1s.
7. **Play Console:** create the app, then complete Data Safety (`docs/PLAY_STORE.md`) and the content rating, and enter the privacy/terms/delete-account URLs
   served by the Worker. Upload the first AAB manually (`docs/RELEASE.md`); later releases run via the `v*` tag workflow.
8. **Bootstrap the first admin owner:** `cd server && npm run admin:bootstrap -- <your phone or email>`.
9. **Replace placeholders:** grievance officer name/email/phone in `src/legal/content.ts`.

## 7. Next development (suggested order)

1. Get CI green (APK + E2E), then install the app on a ₹6,000-class phone and measure cold start, memory and APK size.
2. Fix §5 items 1–5.
3. Deploy the backend to Neon + Cloudflare and test sign-in, sync and restore end to end on 2 phones.
4. Internal testing on Play with 2–3 families before wedding season.
5. Roadmap: web app/PWA on Cloudflare Pages, iOS build, invitation cards, UPI नोतरा for migrants, diary photo import
   (currently a "जल्द आ रहा है" card), and Wagdi voice. The loan module (Phase 3) waits until NBFC agreements and a legal review are done.
