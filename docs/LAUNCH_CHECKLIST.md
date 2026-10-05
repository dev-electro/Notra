# Production readiness checklist

Honest status as read from the code on 2026-10-05.

| Mark | Meaning |
| --- | --- |
| ✅ | done in code (and tested where noted) |
| ⏳ | needs owner action (account, money, legal, console, content) or a developer deployment step |
| ❌ | not yet built / known broken |

Who does the ⏳ items is in [DEPLOYMENT.md](DEPLOYMENT.md). Known defects behind the ❌ marks are listed in [ROADMAP.md](ROADMAP.md).
Authentication is self-hosted Better Auth in the Worker on Neon (`docs/AUTH.md`). It is implemented and tested against pglite and the real `postgres`
driver; items marked "pending AUTH" below are the live checks (real Neon, Google, MSG91, a device).

## 1. Legal and policy

| Status | Item | Notes |
| --- | --- | --- |
| ✅ | Privacy policy, terms, grievance, delete-account text (Hindi first, English below) | `src/legal/content.ts`, one source for app and Worker pages |
| ✅ | Public pages `/privacy`, `/terms`, `/grievance`, `/delete-account` | `server/src/pages.ts`, tested in `server/test/pages.test.ts` |
| ✅ | Policy discloses staff access, consented support access, ads, Analytics | verified in `content.ts` ("Staff and statistics") |
| ⏳ | Replace `CONTACT` placeholders (operator, grievance officer, e-mail `grievance@notra-book.example`, phone, address) and redeploy | blocks Play review and DPDP |
| ⏳ | Fintech / data-protection lawyer review of policy and terms | required before any loan phase |
| ⏳ | Add a sentence about provider backup retention and that tickets outlive account deletion | PLAY_STORE.md asks for it |
| ⏳ | Policy: sessions and the OTP in flight are now stored in `auth_sessions` / `auth_verifications`; Google tokens are not stored | pending AUTH |
| ✅ | In-app account deletion, idempotent, one transaction | `server/src/account.ts`, `account.test.ts` |
| ✅ | Grievance tickets with 30-day `due_at`, SLA report, overdue highlight | admin Tickets, Reports |
| ⏳ | Appoint and publish a real grievance officer; set up the grievance mailbox | owner |
| ⏳ | Submit the Play **Data safety** form from [PLAY_STORE.md](PLAY_STORE.md) | owner |
| ⏳ | IARC content rating, target audience, ads declaration | owner |
| ❌ | End-to-end encryption of the cloud copy (policy must not claim it) | not built |

## 2. Accounts and keys

| Status | Item | Notes |
| --- | --- | --- |
| ⏳ | Google Play developer account (and any required closed-testing period) | |
| ⏳ | Cloudflare account, domain, API token | |
| ⏳ | Neon project (`winter-voice-10801980`, branch `production`) with owner + runtime roles | |
| ⏳ | Google Cloud OAuth: consent screen, Web client, Android client(s) with upload, **Play app-signing** and debug SHA-1s | |
| ⏳ | SMS provider / DLT registration (MSG91 today; see AUTH.md) | long lead time: start early |
| ⏳ | AdMob app + 4 units; `ADMOB_*` GitHub secrets | |
| ⏳ | `app-ads.txt` on the developer-website root domain | pending; no root site exists yet |
| ⏳ | Link AdMob to Firebase (needs the real app id in a release build) | |
| ⏳ | Restrict the Firebase API key (Android app + SHA-1s, API restriction) | |
| ⏳ | Upload keystore generated, backed up in a password manager, GitHub secrets set | `docs/RELEASE.md` |
| ⏳ | Play service account JSON (optional, enables AAB upload) | |
| ✅ | No secrets in git (`.gitignore` covers `*.jks`, `*.pem`, `.env*.local`) | `google-services.json` is intentionally public |
| ❌ | Real `app.json` `extra.apiUrl` and `extra.googleWebClientId` | still placeholders (`https://api.notra-book.example`, `REPLACE_WITH_WEB_CLIENT_ID...`) |

## 3. Backend

| Status | Item | Notes |
| --- | --- | --- |
| ✅ | Sync API (push/pull, per-row rejections, direction enforcement, LWW, immutable entries) | `server/src/sync.ts`, `sync.test.ts` |
| ✅ | RLS on every user table, restricted role, `SECURITY DEFINER` functions, k-anonymity | `101_rls.sql`, `102_analytics.sql`, `rls.test.ts`, `ops.test.ts` |
| ✅ | Admin API with role gates, audit log, privacy guard, masking | `server/src/admin/*`, `admin.test.ts` |
| ✅ | Remote config + maintenance + force update | `appconfig.ts`; app side `src/remote/` |
| ✅ | Nightly rollup cron and purge | `wrangler.toml`, `rollup.ts` |
| ⏳ | Run migrations 001..102 on Neon as owner; create `notra_runtime`; verify `NOBYPASSRLS` | DEPLOYMENT section 1 |
| ⏳ | Deploy the Worker, set secrets, custom domain `api.` | |
| ⏳ | Deploy the admin site, custom domain `admin.`, Google Web client origin | |
| ⏳ | Bootstrap the first owner | |
| ⏳ | Sign-in on Better Auth: implemented; run the migration, set `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL`, smoke-test Google + OTP on a device | pending AUTH (AUTH.md section 7) |
| ❌ | App <-> server contract for support tickets and support access (field names, categories, methods differ) | ROADMAP limitation 1; support and consented access do not work end to end today |
| ❌ | Remote-config shape differences (`features.analytics` rejected by the admin validator; defaults differ) | ROADMAP limitation 2 |
| ❌ | A missing SMS secret takes the whole API down (`server_misconfigured`) | ROADMAP limitation 3 |
| ❌ | Per-user quotas and rate limits on `/v1/sync/*` | only OTP and tickets are rate limited |
| ⏳ | Cloudflare rate-limit rule on `/api/auth/*` | |
| ❌ | Server-side alerting (errors are only visible in the admin Monitoring page; no pager) | |

## 4. App build

| Status | Item | Notes |
| --- | --- | --- |
| ✅ | Typecheck, lint, Jest, server tests in CI | `ci.yml` |
| ✅ | Signed AAB/APK pipeline and versionCode from run number | `release.yml`, `plugins/withReleaseSigning.js` |
| ✅ | Debug-signed test APK published as a pre-release per branch | `ci.yml` |
| ✅ | R8/Proguard + resource shrinking, arm-only ABIs, Hermes | `app.json` build properties |
| ✅ | Permissions minimal, contacts/SMS/call log/storage blocked | `app.json` |
| ✅ | Error boundary, guarded writes, offline-first | `_layout.tsx`, `guard.ts` |
| ✅ | Force-update overlay that never traps data (backup file reachable) | `components/force-update.tsx` |
| ⏳ | Version bump in `app.json` and first tag `v1.0.0` | |
| ⏳ | Real AdMob ids in the release build (all five secrets) | |
| ❌ | Crash reporting | none by design; field crashes are invisible |
| ❌ | iOS build (no `GoogleService-Info.plist`, no Google iOS client, not tested) | |
| ❌ | Diary photo import (OCR) | "जल्द आ रहा है" card only |
| ❌ | Voice-note recording/storage | column exists, unused |

## 5. QA on real low-end devices

| Status | Item | Notes |
| --- | --- | --- |
| ✅ | Automated: 9 Maestro flows on an API 30 x86_64 emulator | `.maestro/`; only checks the happy path |
| ⏳ | Manual pass on a 2 GB RAM / Android 8 phone: cold start time, scrolling a 5,000-entry diary, report export (PDF and 500-row image), memory | targets in README Performance rules; not measured |
| ⏳ | Install the **Play-delivered** build (not sideloaded) and test Google sign-in | catches missing Play app-signing SHA-1 |
| ⏳ | OTP on Jio, Airtel, Vi, BSNL numbers; DND numbers | DLT template must be approved |
| ⏳ | Offline -> online sync across two phones; restore after reinstall; account switching dialogs | |
| ⏳ | Backup file round trip via WhatsApp share on a real phone | |
| ⏳ | Hindi voice entry on-device (speech recognition availability varies by phone) | |
| ⏳ | Large font setting (system 1.3x cap), TalkBack, "remove animations" | |
| ⏳ | Ad behaviour: first-day ad-free, caps, no ad on forms; UMP in an EEA test | use test devices |
| ⏳ | Pilot in 3 villages with a field associate; collect vocabulary corrections | product plan go-to-market |

## 6. Store listing

| Status | Item | Notes |
| --- | --- | --- |
| ✅ | Listing answers drafted (Data Safety, content rating, permissions, declarations) | [PLAY_STORE.md](PLAY_STORE.md) |
| ⏳ | Descriptions (Hindi + English), icon, feature graphic, screenshots | flow 09 produces screenshots |
| ⏳ | Privacy / terms / delete-account / grievance URLs entered | after `api.` domain is live |
| ⏳ | Internal -> closed -> production promotion | |
| ⏳ | Developer website with `app-ads.txt` | |

## 7. Monitoring

| Status | Item | Notes |
| --- | --- | --- |
| ✅ | Admin Monitoring: DB latency, migration version, scrubbed error log, last rollup day | |
| ✅ | DAU/WAU/MAU, retention, sync failure rate, OTP volume and cost, deletions, app versions | admin Reports |
| ✅ | Firebase Analytics (allow-listed events) | `src/analytics/`; check DebugView once |
| ⏳ | Cloudflare Workers analytics/logs retained; `wrangler tail` access | |
| ⏳ | Neon alerts (storage, compute) | |
| ⏳ | Billing alerts on Cloudflare, Neon, MSG91 | SMS cost is the main variable cost |
| ❌ | Uptime pinger against `/v1/health` | not set up |
| ❌ | Alerting on elevated sync failure rate or error spikes | dashboards only |
| ⏳ | AdMob and Firebase dashboards reviewed weekly | |

## 8. Support

| Status | Item | Notes |
| --- | --- | --- |
| ✅ | In-app form (offline queue), admin ticket workflow, internal notes | `src/app/support.tsx`, admin Tickets |
| ❌ | App -> server ticket and access contract works end to end | see section 3 |
| ✅ | Runbooks: incident, OTP abuse, deletion request, lost phone, leaver | [ADMIN.md](ADMIN.md) section 7 |
| ⏳ | Staff accounts and roles created; training on "never copy ledger data into notes" | |
| ⏳ | Grievance mailbox monitored; 30-day SLA owner named | |
| ⏳ | Rehearse: maintenance mode, force update, account deletion on staging | |
| ⏳ | Decide support language and hours (field associate in Banswara/Dungarpur) | |

## 9. Go / no-go gate

Do not publish to production until: every ❌ in sections 3 and 8 that affects a user-visible path is fixed or consciously accepted, all ⏳ in
sections 1 and 2 are done, the smoke tests in [DEPLOYMENT.md](DEPLOYMENT.md) section 10 pass on the Play-delivered build, and the low-end device pass
(section 5) is signed off.
