# Decision log

Architecture-decision-record style. All entries are dated **2026-10-05**, the day the decisions were consolidated from the build conversation
(the product plan is dated the same day). Newer decisions supersede older ones; superseded text is kept so the reasoning is not lost.
Status values: Accepted, Superseded, Planned, Postponed.

| # | Decision | Status |
| --- | --- | --- |
| 001 | React Native + Expo, TypeScript everywhere | Accepted |
| 002 | Lean, fast, low-resource app for Rs 6,000 phones | Accepted |
| 003 | Offline-first; local SQLite is the source of truth | Accepted |
| 004 | Cloud sync to Postgres via a Cloudflare Worker, vendor neutral | Accepted |
| 005 | Every entry saved immediately | Accepted |
| 006 | Sign-up with Google and mobile OTP; usable offline with "बाद में" | Accepted |
| 007 | No lekhak role or accounts | Accepted |
| 008 | Strict separation: मेरा नोतरा vs दूसरों का नोतरा | Accepted |
| 009 | Occasion list with custom "अन्य" | Accepted |
| 010 | उतार/चढ़ाव accounting; reports are the core; image and PDF export | Accepted |
| 011 | Search, contact picker, old records, calendar, bottom tabs | Accepted |
| 012 | Cultural, polished, simple design for low-literacy users | Accepted |
| 013 | Diary photo import (OCR) postponed | Postponed |
| 014 | Web app on Cloudflare Pages | Planned |
| 015 | AdMob ads without ruining UX | Accepted |
| 016 | Admin panel: private diaries, maximum insights | Accepted (supersedes two earlier directions) |
| 017 | Rename to Notra Book / नोतरा बुक, package `app.notra.book` | Accepted |
| 018 | Firebase Analytics with a privacy allow-list | Accepted |
| 019 | Staged, cost-efficient development; CI builds; test APK as pre-release | Accepted |
| 020 | Money in paise, append-only entries with voids | Accepted |
| 021 | Auth: self-hosted Better Auth in the Worker, on Neon | Accepted (user decision, implemented) |
| 022 | Ledgers (household + personal) with local-only PINs | Accepted |
| 023 | Password-encrypted backup file for people who never sign in | Accepted |
| 024 | Remote config and force update must never trap data | Accepted |

---

## ADR-001: React Native + Expo, TypeScript everywhere
- **Date:** 2026-10-05
- **Decision:** Build the app with React Native and Expo (SDK 57, Hermes, expo-router), TypeScript strict across app, Worker and admin. iOS comes later from the same code.
- **Context:** The product plan proposed native Kotlin + Compose for the smallest APK. The owner chose React Native + Expo for easier management (one language, one codebase, cloud builds without a Mac, iOS later).
- **Consequences:** Slightly larger APK and a JS runtime on low-end phones, mitigated by ADR-002 (Hermes, ABI filtering, minimal deps, lazy native modules). Native Android pieces are needed only for the contact picker (`modules/notra-contact-picker`, Kotlin) and Expo config plugins. Expo Go cannot run SQLCipher, Google Sign-In, AdMob or Firebase, so a development build or the CI APK is needed to test those ([DEVELOPMENT.md](DEVELOPMENT.md)).

## ADR-002: Lean, fast, low-resource app for Rs 6,000 phones
- **Date:** 2026-10-05
- **Decision:** Treat a 2 GB RAM, Android 8+ phone on patchy 2G as the baseline. Minimal dependencies, aggregates computed in SQL (not JS), paged lists, lazy-loaded heavy modules, 512 px photos, only `armeabi-v7a` + `arm64-v8a`, R8 minification and resource shrinking, a 215 KB subset of one font family.
- **Context:** The primary users are Bhil households with low-end phones, often shared. Cold start and scrolling speed decide whether the app is used at the next wedding.
- **Consequences:** Every new dependency needs a reason. Reports and totals use `GROUP BY` and window functions over indexed columns (`src/db/queries.ts`, `reports.ts`), with pure `src/core` twins as test references. Ads, Firebase, print/share, speech and camera load only after first render or on tap. Real-device performance is still unmeasured ([LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)).

## ADR-003: Offline-first; local SQLite is the source of truth
- **Date:** 2026-10-05
- **Decision:** All reads and writes go to an encrypted local SQLite database (SQLCipher, key in the Keystore). The app is fully usable without internet or an account. The cloud is an optional copy.
- **Context:** Many falas have no signal; trust gap with apps ("no login wall on day one"); Notra events happen away from connectivity.
- **Consequences:** Sync must tolerate being offline for weeks ([SYNC.md](SYNC.md)); rules are implemented in SQL triggers locally and again on the server; the key cannot be recovered if lost, so a backup file and cloud copy exist (ADR-023).

## ADR-004: Cloud sync to Postgres via a Cloudflare Worker, vendor neutral
- **Date:** 2026-10-05
- **Decision:** A Hono app on a Cloudflare Worker speaks plain SQL through the `postgres` driver (`prepare: false`). The database is any Postgres reached through `DATABASE_URL`: Neon or Supabase; Hyperdrive optional.
- **Context:** Postgres handles ledger joins and reports well; Cloudflare is cheap at village scale; the owner did not want lock-in to a BaaS.
- **Consequences:** No vendor SDKs in the app. Neon was later chosen (ADR-021). Row Level Security, roles and functions are portable SQL ([SECURITY_PRIVACY.md](SECURITY_PRIVACY.md)). The Worker opens one short-lived connection per request.

## ADR-005: Every entry saved immediately
- **Date:** 2026-10-05
- **Decision:** An entry is written to SQLite the moment it is saved; there is no in-memory buffering or "session" that commits at the end.
- **Context:** An earlier design buffered an event's entries and committed on finish. A killed app on a cheap phone would lose a whole wedding's records.
- **Consequences:** `core/session.ts` was removed. The event ledger resumes with running totals after a kill. "पूरा करें" only marks the event `HELD` and shows a summary. Undo is a void entry (ADR-020).

## ADR-006: Sign-up with Google and mobile OTP; usable offline with "बाद में"
- **Date:** 2026-10-05
- **Decision:** Offer Google sign-in and mobile-number OTP (SMS via MSG91 with a DLT template). Signing in is optional: the first-run screen has "बाद में", and the app works offline without any account. Signing in is the opt-in for cloud backup.
- **Context:** Households share phones and many have no Google account; phone numbers are universal. A login wall would kill adoption.
- **Consequences:** Account linking (`/v1/auth/link/*`), an account-switching prompt when a phone holds another account's data, and an SMS cost that needs abuse control (blocklist, rate limits, admin cost report). The implementation moved in ADR-021.

## ADR-007: No lekhak role or accounts
- **Date:** 2026-10-05
- **Decision:** There is no separate scribe (लेखक) role. The host creates an event and opens its ledger (खाता) on his own phone, recording each guest in about three taps.
- **Context:** The product plan imagined a "Lekhak mode" with one phone collecting entries for the whole event. In practice the host keeps his own diary; roles and hand-over flows added complexity and a privacy risk.
- **Consequences:** `events.lekhak_name` stayed in the schema as an unused column to avoid a destructive migration; Glossary marks लेखक as removed. Panch/lekhak "allies" remain a go-to-market idea, not a product role.

## ADR-008: Strict separation: मेरा नोतरा vs दूसरों का नोतरा
- **Date:** 2026-10-05
- **Decision:** Two worlds that never mix. *मेरा नोतरा* = programs my household hosts, where I only **receive** (`AAYA`). *दूसरों का नोतरा* = programs of other families, where I only **give** (`GAYA`). Every entry belongs to an event and its direction is **derived from the host**; nobody chooses it.
- **Context:** Mixed direction pickers caused wrong-direction entries and confused balances; the culture has a clear host/guest split.
- **Consequences:** Rule enforced in core, repository, SQLite triggers (`entries_need_event`, `entries_direction_rule`) and on the server (`enforceDirections`). Old entries were attached to automatic "पुराना हिसाब" events with deterministic ids. "My household" must be known and consistent across devices, otherwise server pushes are rejected (`invalid_payload:direction`). See [DATA_MODEL.md](DATA_MODEL.md).

## ADR-009: Occasion list with custom "अन्य"
- **Date:** 2026-10-05
- **Decision:** Occasions are शादी, गृहप्रवेश, मुंडन संस्कार, बीमारी, मकान, अन्य. "अन्य" has an editable name (<= 60 chars) and details (<= 500), shown wherever the occasion name is shown. Example: a school teacher's development gathering goes under अन्य. No death-feast category.
- **Context:** Notra is used for weddings, illness and house construction, and users asked for more kinds; the plan said never to include mrityu bhoj.
- **Consequences:** Enum duplicated in SQLite, Postgres, validator, analytics allow-list; adding one is a coordinated migration ([DEVELOPMENT.md](DEVELOPMENT.md) 5.6). The custom label is user text: it is never sent to analytics.

## ADR-010: उतार/चढ़ाव accounting; reports are the core; image and PDF export
- **Date:** 2026-10-05
- **Decision:** Account both sides per family: for each gift, the part that repays what was owed is **उतार**, the rest is **चढ़ाव** (they gave 501, I give 701: 501 उतार, 200 चढ़ाव). Reports are the most important feature, each filterable by year or date range and exportable as PDF **and** as images (for WhatsApp). Reports specifically requested by users: किसको, किस दिन, कितना दिया (and which program); मेरे प्रोग्राम में कौन आया; साल भर का हिसाब; मेरे नोतरे में कौन नहीं आया (private).
- **Context:** The paper diary shows reciprocity, not totals; users asked for exactly these views.
- **Consequences:** `core/settlement.ts` + SQL view `entry_settlement` must stay in step; one report model feeds both PDF HTML and the image sheet (`reportDocs.ts`); images are drawn off screen with view-shot (25 rows/page, 1080 px, max 500 rows) and the "not come" report is private. Values are derived, never stored.

## ADR-011: Search, contact picker, old records, calendar, bottom tabs
- **Date:** 2026-10-05
- **Decision:** One search box over गाँव, नाम, पिता, फला and mobile (words ANDed). Fill a phone number from the contact app through the system picker **without READ_CONTACTS**. "पुराना हिसाब जोड़ें" adds previous data with past dates. A better calendar on घर. Four bottom tabs (घर, मेरा नोतरा, दूसरों का नोतरा, हिसाब).
- **Context:** Same-name people are common; typing numbers is slow; users have years of paper diaries; a fifth tab would crowd the bar.
- **Consequences:** `modules/notra-contact-picker` (Kotlin, `ACTION_PICK`) keeps `READ_CONTACTS` blocked; the picker exists only in Android builds. `entries.occurred_on` separates diary date from entry time ([DATA_MODEL.md](DATA_MODEL.md) 1.4).

## ADR-012: Cultural, polished, simple design for low-literacy users (Stage 6)
- **Date:** 2026-10-05
- **Decision:** A design system built from village life: paper, indigo ink, kumkum, haldi, mehendi; Mukta font; hand-drawn SVG icons and Pithora-style motifs; huge touch targets (64), nothing under 18 sp, one main action per screen, spoken Hindi read-back and help, `Text` scale capped at 1.3x. Meaning is never by colour alone. Tokens live only in `src/theme.ts`; WCAG AA is asserted by a test.
- **Context:** The user may not read well; the app should feel like the family diary, not a bank; "no shame features".
- **Consequences:** Strict conventions ([DEVELOPMENT.md](DEVELOPMENT.md) 4.1-4.2); Maestro selects by `testID`; copy is Hindi-only with neutral words ("लौटाना बाकी").

## ADR-013: Diary photo import (OCR) postponed
- **Date:** 2026-10-05
- **Decision:** Reading old diary pages from photos is not built. The "पुरानी डायरी की फ़ोटो से हिसाब" card shows "जल्द आ रहा है" behind `FEATURES.diaryPhotoImport` / remote `features.ocr`.
- **Context:** Handwritten Hindi OCR needs a vision model, a Worker endpoint and a line-by-line confirmation UI; it should never auto-save.
- **Consequences:** No camera permission is needed for it today; users type old records through "पुराना हिसाब". Listed in [ROADMAP.md](ROADMAP.md).

## ADR-014: Web app on Cloudflare Pages (planned)
- **Date:** 2026-10-05
- **Decision:** A web/PWA version of the diary is planned on Cloudflare Pages. Not yet built; only the staff admin panel is on Pages. A `features.web_app` flag exists.
- **Context:** The product plan lists Pages for web; migrants and literate relatives may want a larger screen.
- **Consequences:** Local-first storage on the web (OPFS/IndexedDB) and sync reuse need design; the admin SPA is separate and unrelated to the user web app.

## ADR-015: AdMob ads for revenue without ruining UX
- **Date:** 2026-10-05
- **Decision:** Use Google AdMob (publisher `pub-2707121635941418`) with a strict placement policy: adaptive banner above the tab bar on घर and हिसाब only; native cards every N items in the long lists and report lists (never first, never in short lists, max 3); one interstitial only after a report export completes (>= 300 s apart, <= 3/day, never in the first 24 h or within 2 minutes of a save); an opt-in rewarded ad to remove the "Notra Book" footer from one image export. Never on forms, ledgers, PIN, onboarding, sign-in, settings, legal, backup, deletion or error screens. Block gambling, dating, get-rich-quick, crypto, loans, alcohol, sexual content and politics. PG rating, not child-directed, UMP consent, no ledger data to the SDK.
- **Context:** Revenue without a loan or paid-feature dependency, while respecting trust.
- **Consequences:** One pure decision function (`adDecision`) with reason names, remote kill switches, test ids by default everywhere except a signed release with all five ids. `app-ads.txt` on the developer domain is still pending. Real ad behaviour is untested on devices. See [ADS.md](ADS.md).

## ADR-016: Admin panel: private diaries, maximum insights
- **Date:** 2026-10-05
- **Decision (final):** Keep diaries private yet extract maximum insight. Staff roles live in the database (`profiles.role`); staff sign in with the app's own authentication; Postgres **Row Level Security** keeps every ledger row visible only to its owner; staff read **aggregates** through k-anonymous (k = 5) SQL functions; support can read a user's data **read-only for at most 7 days only if that user turns it on**, and every such read is audited.
- **Superseded directions, kept for the record:** (1) first "counts only" (no insight into behaviour at all); (2) then "admins see all data" (maximum insight, unacceptable breach risk in a village-scale trust product); (3) the final design above, which the owner confirmed.
- **Context:** One leak of who-gave-how-much ends the product; the owner still needs usage, retention, SMS cost, support and abuse control.
- **Consequences:** Roles `viewer < support < admin < owner`; masked identifiers with audited unmask; a response privacy guard; the restricted runtime database role (`NOBYPASSRLS`) is mandatory in production. Residual risk: a compromised Worker could set `app.user_id`. See [ADMIN.md](ADMIN.md), [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md).

## ADR-017: Rename to Notra Book / नोतरा बुक, package `app.notra.book`
- **Date:** 2026-10-05
- **Decision:** The product is "Notra Book" (नोतरा बुक), Android package and iOS bundle `app.notra.book`, Expo slug `notra-book`. Internal storage names stay `notra-diary` (DB file, secure-store keys, backup marker, root npm name).
- **Context:** The plan flagged confusion between Notra (नोतरा) and Natra (नाता); "Notra Diary" was the working name; a unique package id was needed before Play.
- **Consequences:** Renaming internals would orphan existing data, so the old names were kept deliberately. Always spell नोतरा, never नाता.

## ADR-018: Firebase Analytics with a privacy allow-list
- **Date:** 2026-10-05
- **Decision:** Add Google Analytics for Firebase (project `notra-pp`). Only a closed allow-list of event names and enumerated param values can leave the phone (`src/analytics/events.ts`); strings over 40 chars or with 4+ digits in a row are refused; no user id, no user properties; screen names are route templates. Collection needs the Settings switch (default on) **and** remote `features.analytics` **and** no blocking UMP state; `firebase.json` sets all auto-collection and ad signals off until runtime consent.
- **Context:** The owner wanted product analytics (retention, feature use, ad revenue by segment) without compromising the diary.
- **Consequences:** Play Data Safety, privacy text and `events.ts` must change together ([PLAY_STORE.md](PLAY_STORE.md)). The integration is being finished by a parallel change; iOS needs its own plist. The server-side `features` validator does not yet know `analytics` ([ROADMAP.md](ROADMAP.md)).

## ADR-019: Staged, cost-efficient development; CI builds; test APK as pre-release
- **Date:** 2026-10-05
- **Decision:** Build in numbered stages using staged subagents to keep cost down (Stage 1 scaffold + core + CI; 2 screens; 3 saves, voids, backup/sync; 5 hardening; 6 design; 7 two worlds + reports; 7b ads/config/support; 8 admin/RLS/analytics; rename; analytics). Use GitHub Actions for all builds (no local Android toolchain required) and publish each branch's debug-signed APK as a GitHub **pre-release** `test-<branch>` (`notra-book-test.apk`) for direct phone download.
- **Context:** The developer machine is a Mac M1 with 8 GB; the owner tests on a real phone by opening a link.
- **Consequences:** CI is the build system of record ([CI_CD.md](CI_CD.md)); ccache/Gradle caching is tuned; the pre-release is replaced on every push. Stage numbering appears in README and commit history (there is no Stage 4 in the history).

## ADR-020: Money in paise, append-only entries with voids
- **Date:** 2026-10-05
- **Decision:** Store all money as integer paise. Entries are immutable; a correction is a new entry that points at the old one, an undo is a void entry (zero amounts). Superseded entries never count.
- **Context:** The relationship ledger must be trustworthy and mergeable across devices; immutable rows make sync conflict-free (`INSERT OR IGNORE`).
- **Consequences:** SQLite triggers block updates/deletes; `active_entries` view and `activeEntries()` implement the same rule; balances and उतार/चढ़ाव are derived, never stored. See [DATA_MODEL.md](DATA_MODEL.md).

## ADR-021: Auth moved to self-hosted Better Auth (in the Worker, on Neon)
- **Date:** 2026-10-05
- **Decision:** Auth moved to **Better Auth, self-hosted inside the Cloudflare Worker, against the same Neon database** (user decision, for robustness), replacing the custom Worker implementation (Google ID-token verification, MSG91 OTP tables, own JWT + rotating refresh tokens). **Managed Neon Auth (`auth: true`) is deliberately not used** (it would be a second user system). Neon project **`winter-voice-10801980`, branch `production`**. Sign-in methods stay Google (native ID token) and mobile OTP (MSG91). Details, research and sources live in `docs/AUTH.md`.
- **Context:** Hand-rolled authentication is the riskiest code to own and maintain; a maintained library on the same Neon database reduces that risk.
- **Consequences:** Better Auth's `user` model is our `users` table (same ids), so RLS, foreign keys, suspension and staff roles are unchanged; its own tables are `auth_*` under RLS that admits only the auth context (`app.auth`). Endpoints moved to `/api/auth/*`; sign-in secrets are `BETTER_AUTH_SECRET` (+ `BETTER_AUTH_URL` var), `JWT_SECRET` and `OTP_PEPPER` are gone; sessions are server-side (revocable at once) instead of 15-minute JWTs + rotating refresh tokens; everyone signs in once more after the migration. The OTP is stored in clear for its 5 minutes (library behaviour). Owner steps are in [AUTH.md](AUTH.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

## ADR-022: Ledgers (household + personal) with local-only PINs
- **Date:** 2026-10-05
- **Decision:** A phone has one household ledger (fixed id) plus optional personal ledgers per family member, each with an optional 4-digit PIN (PBKDF2, back-off). PINs are never synced or exported. An optional app lock asks the PIN on open and after 2 minutes away.
- **Context:** Shared family phones; women should be able to keep their own ledger; plan principle "family, not individual".
- **Consequences:** `ledger_id` on events and entries; every query is ledger-scoped; the family directory is shared across ledgers; PIN-locked ledgers are excluded from backup files unless unlocked. A 4-digit PIN is not strong, which is documented honestly ([SECURITY_PRIVACY.md](SECURITY_PRIVACY.md)).

## ADR-023: Password-encrypted backup file for people who never sign in
- **Date:** 2026-10-05
- **Decision:** Offer a backup file locked with a password (scrypt + XChaCha20-Poly1305 via `@noble`), shareable over WhatsApp, restorable by merge.
- **Context:** Many families will never sign in, yet losing a phone must not lose the diary; the SQLCipher key cannot be exported.
- **Consequences:** No recovery for a forgotten password; merge semantics mirror sync; the force-update screen keeps `/backup` reachable.

## ADR-024: Remote config and force update must never trap data
- **Date:** 2026-10-05
- **Decision:** Server-driven switches (maintenance, minimum version, announcements, ads, features) are read with defaults baked in and a cached copy. Maintenance pauses **sync only**; a forced update offers "बैकअप फ़ाइल बनाएं" before updating; a suspended account stops sync but the diary keeps working.
- **Context:** Operations need a kill switch without a release, but users in villages must never lose access to their own records.
- **Consequences:** The parser is defensive and silent on failure. The server and app defaults currently differ ([ROADMAP.md](ROADMAP.md) limitation 2).
