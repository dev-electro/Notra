# Roadmap, known limitations and priorities

Status as of 2026-10-05. Decisions behind each item: [DECISIONS.md](DECISIONS.md). Launch gates: [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).

## 1. What is done

| Stage | Delivered |
| --- | --- |
| 1 | Expo scaffold, `src/core` domain logic, encrypted SQLite + migrations, CI |
| 2 | Phase 1 screens: home, families, events, entries, voice entry, read-back, SQL-backed reports, PDF export |
| 3 | Immediate saves (no session buffering), void entries, Google + mobile OTP sign-in, cloud sync, event ledger |
| 5 | Production hardening: account deletion, legal pages, profile sync, account-switch prompt, poison-row handling, ledgers + PINs, backup file, accessibility, crash safety |
| 6 | Cultural design system, four-tile home, simple navigation, Mukta font, SVG icons and motifs |
| 7 | Two separate worlds, उतार/चढ़ाव, `occurred_on`, new occasions + custom अन्य, search, contact picker, eight reports as PDF/image, bottom tabs, calendar |
| 7b | AdMob with policy, remote config (maintenance, force update, announcement), support form, consented support access (app side) |
| 8 | Admin panel on Cloudflare Pages, DB roles, Row Level Security, k-anonymous analytics, audit log, abuse control, monitoring |
| rename | Notra Book / नोतरा बुक, `app.notra.book` |
| analytics | Firebase Analytics with a privacy allow-list (being finalised in parallel) |
| in progress | Auth moved to Better Auth on Neon (`docs/AUTH.md`) |

There is no Stage 4 in the history (numbering skipped).

## 2. What is next

| Item | Notes / dependency |
| --- | --- |
| Web app / PWA on Cloudflare Pages | needs a browser storage story (OPFS/IndexedDB), the same sync protocol, and `features.web_app` |
| iOS build | needs `GoogleService-Info.plist`, a Google iOS client id (`iosUrlScheme` placeholder), App Store account, AdMob iOS app, a replacement for the Android-only contact picker |
| Invitation cards | on-device rendering from occasion templates (yellow rice for शादी, kumkum for others), share as image + link; flag `features.invitation_cards` exists |
| UPI Notra for migrants | give via UPI from Gujarat and auto-log an entry with a WhatsApp receipt; `payment_mode = 'UPI'` already exists but moves no money |
| Respectful reminder templates | the user picks the wording and sends; never automatic; tone rules from the plan |
| Village calendar with clash warning / public feed | panch approval flag exists in the model (no UI); public feed shows events never amounts, opt-in per event |
| Diary photo OCR | vision model through a Worker, human confirm per line, never auto-save; flag `features.ocr`; card says "जल्द आ रहा है" |
| Wagdi voice and labels | local voices recorded; Hindi UI today |
| Loan facilitation (Phase 3) | **gated on signed NBFC agreements and legal review** (RBI Digital Lending Directions 2025, DPDP): consent per NBFC and request, no ledger names or amounts ever shared, borrower never charged, partner list shown in the app |
| Premium cards, sponsored content | optional revenue from the plan, after cards exist |

## 3. Known limitations and technical debt

Found while reading the code for these docs. Items 1-4 break or endanger real flows and belong in the production audit first.

### Contract and reliability defects

1. **Support tickets and consented access do not match between app and server.**
   - `src/support/service.ts` `send()` posts `{client_id, category, subject, message, app_version, created_at}` with categories `complaint | bug | suggestion | delete_account | other` (`src/support/logic.ts`). `server/src/support.ts` `parseTicketInput` requires `category` in `grievance | bug | feedback | deletion | other` and a field named `body`. Result: `400`. `sendResultForStatus(400)` is `'drop'`, so the queued ticket is **silently deleted**, and `submitSupport` then reports "sent" because the queue is empty. The server also has no `client_id` idempotency.
   - `grantAccess` posts `{days: 1|3|7}`; the server expects `{action: 'grant', hours: 1..168}` and answers `invalid_input`. `revokeAccess` sends `DELETE /v1/support/access`, a route that does not exist (404); the server revokes with `POST {action:'revoke'}`. `getAccessGrant` parses `expiresAt`/`expires_at`, which the server does return on grant.
   - `docs/ADS.md` and `docs/ADMIN.md` describe two different contracts for these endpoints.
   - Fix: align one side, add a contract test that runs the app's `send()` and `grantAccess()` bodies against `createApp`.
2. **Remote-config shape and defaults differ.** Server `server/src/appconfig.ts`: `features` has no `analytics` key and `shape()` **rejects unknown fields**, so staff cannot set `features.analytics` and the "switch analytics off for everyone" lever in `src/remote/config.ts` / ADS.md cannot be used; server default `ads.enabled = false`, app default `true`; `invitation_cards` default true (server) vs false (app); `interstitial_min_interval_sec` min 30 (server) vs 60 (app clamp); `native_every_n_items` min 2 vs 5; `min/latest_version` default `1.0.0` vs `0.0.0`. After the first successful fetch the server defaults win, so ads are **off** until staff turn them on, and analytics can never be remotely disabled.
3. **A missing SMS secret takes the whole API down.** `server/src/worker.ts` builds `smsFromEnv(env)` inside `createApp(...)`; `server/src/config.ts` throws when `MSG91_AUTH_KEY`/`MSG91_TEMPLATE_ID` are absent (and `SMS_PROVIDER` is not `dev`), so **every** route, including `/v1/health`, `/v1/config` and the legal pages, answers `500 server_misconfigured`. Make the SMS provider lazy (fail only on OTP start). Will change with Better Auth.
4. **Maintenance mode locks staff out.** `app.use('/v1/auth/*', maintenance)` in `server/src/app.ts` answers 503 for sign-in **and refresh**, and the admin panel signs in and refreshes through those routes. With maintenance on, an owner whose 15-minute access token expires cannot get back in to turn it off (docs claim the admin API "stays up"). Exempt staff, or exempt `/v1/auth/refresh` and `/v1/auth/*` for admin origins. Check again after the Better Auth switch.

### Data and sync

5. **Legacy event host fallback.** Migration v7 (`src/db/migrations.ts`) creates the "mine" legacy event with `COALESCE(my_household_id, MIN(other_household_id))` as host; if "my household" was never set, that event is hosted by another family. `ensureLegacyEvent` (`src/db/legacy.ts`) has the same fallback. Harmless for totals, wrong for host-based reports.
6. **Backup merge can store dangling `event_id`s.** `mergeSnapshot` (`src/backup/snapshot.ts`) skips events whose ledger or host is unknown but still inserts their entries (foreign keys are off and `entries_need_event` only checks non-null). Id validation is `^[A-Za-z0-9_-]{1,64}$`, looser than the server's UUID check, so a restored row can later be rejected on push.
7. **No de-duplication of families** after merging two accounts or restoring on top of data (`src/sync/account.ts` merge). Only voice entry fuzzy-matches (`src/core/match.ts`).
8. **No quotas or rate limits on `/v1/sync/*`**, no maximum rows per user (`server/src/app.ts`, `sync.ts`). Only OTP and tickets are limited.
9. **Entries cannot be edited, so a rejected entry can only be retried or corrected by a new row** (`src/sync/rejected.ts`); there is no "fix this entry" action from `/sync-errors`.
10. **Dead or unused columns/flags:** `events.lekhak_name`, `entries.voice_note_uri` (never written or synced), `events.panch_approved` (no UI sets it), `FEATURES.diaryPhotoImport`. The event ledger always writes `payment_mode = 'CASH'` (`src/app/events/[id]/ledger.tsx`).
11. **`core/ledger.ts` `balances()`** stamps `lastGivenAt`/`lastReceivedAt` from `createdAt` although ordering uses `occurred_on`; the SQL twin (`sqlBalances`) and tests agree on values but not on this display timestamp.
12. **`sqlNotComeTotal`** (`src/db/reports.ts`) loads every row to count in JS; fine for a village, not for huge diaries.

### Security and operations

13. **Cloud copy is not end-to-end encrypted.** Staff are blocked by RLS and policy, not cryptography; a DB owner or provider can read it. The app text must keep saying so (`docs/PLAY_STORE.md`).
14. **Backup file password minimum is 6 characters** (`MIN_PASSWORD_LENGTH`, `src/backup/crypto.ts`); no strength meter. App/ledger PINs are 4 digits by design.
15. **Admin sign-ins count as users and activity.** Staff sign in through the user endpoints, so `touchActivity` (`server/src/telemetry.ts`) records platform `web`, version `admin` and DAU/new-user counts for them. Small, but skews low-volume metrics. Also: no `_headers` file with CSP/HSTS for the admin Pages site (`admin/public/`).
16. **`src/legal` is imported by the Worker across package boundaries** (`server/src/pages.ts` imports `../../src/legal/content`); the server cannot be built from `server/` alone.
17. **No crash reporting and no uptime/alert pipeline** (by design for privacy, but field crashes are invisible). Server errors are visible only in the admin Monitoring page.
18. **Metrics trust the phone's clock** (`created_at` of events/entries feeds `daily_stats` and the north-star metric).
19. **OTP per-IP limit uses `cf-connecting-ip`** and falls back to the literal `unknown` (`server/src/app.ts` `clientIp`), which would share one bucket if the header were ever missing (local dev).
20. **Forgotten app-lock PIN wipes local data** (`src/components/lock-screen.tsx`); the cloud copy survives only if backup was on. Documented in the UI, but users without backup lose everything.

### Documentation drift

21. `docs/TESTING.md` lists 7 older Maestro flows and the old file names; the real set is 9 flows (`.maestro/config.yaml`).
22. `docs/ADMIN.md` section 9 "What the app must do (not done in this stage)" is out of date: the app now sends the headers, reads `/v1/config`, has the support screen and the access toggle (but see item 1).
23. README "Known limits" under *Backend & sync* still says profile is not synced and account switching is not handled; Stage 5 fixed both. README stage 6 mentions `08_screenshots.yaml` (now `09_`).
24. `docs/ADS.md` says `features.ocr` etc. and a `features.analytics` default that the server cannot store (item 2).
25. `eas.json` is not used by any workflow (`appVersionSource: remote`, but builds come from `app.json` version and `run_number`).
26. Placeholders still in code: `app.json` `extra.apiUrl`, `extra.googleWebClientId`, `iosUrlScheme`; `CONTACT` in `src/legal/content.ts`.

## 4. Suggested priorities

| Priority | Work | Why |
| --- | --- | --- |
| P0 | Finish the auth move (Better Auth on Neon) and re-run `server/test` | everything else depends on sign-in |
| P0 | Fix limitations 1-4 (support/access contract, config shape/defaults, lazy SMS provider, maintenance lockout) with contract tests | user-visible breakage and an operational foot-gun |
| P0 | Fill `CONTACT`, real `apiUrl`/client ids, deploy DB roles, run the smoke tests | cannot launch without them ([DEPLOYMENT.md](DEPLOYMENT.md)) |
| P1 | Real low-end device pass (2 GB phone), measure start time, 5,000-entry diary, 500-row report image | the target user |
| P1 | Add alerting/uptime for the Worker and DB; Cloudflare rate-limit rules | the only run-time safety net |
| P1 | `app-ads.txt` and the developer website; AdMob/Firebase links | revenue and measurement |
| P2 | Sync quotas, family de-duplication, "fix rejected entry" action, backup-merge integrity checks (5-9) | robustness at scale |
| P2 | Refresh stale docs (21-25) | onboarding quality |
| P3 | Web/PWA, iOS, invitation cards, UPI Notra | growth, after the pilot proves daily use |
| Gated | Loan facilitation | only after NBFC agreements and a fintech lawyer |

Success metrics from the plan: **north star** = Notra events recorded per month; **health** = share of households opening the app outside a Notra event
(personal-ledger use). Both are visible through the admin Reports.
