# Production deployment checklist

Step by step, in the order that works. Each item is marked **[owner]** (needs the business owner's identity, payment, legal or console
access) or **[developer]** (code or CLI work). Track completion in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md). Architecture context:
[ARCHITECTURE.md](ARCHITECTURE.md). Workflow details: [CI_CD.md](CI_CD.md).

> **Auth note.** Sign-in is being moved to **Better Auth on Neon** (Google + mobile OTP; user decision, see ADR-021 in
> [DECISIONS.md](DECISIONS.md)). Everything about sign-in secrets, SMS provider variables and OAuth callbacks is owned by `docs/AUTH.md`;
> the items below that mention `JWT_SECRET`, `OTP_PEPPER`, `MSG91_*` describe the **current** Worker and will be replaced by what AUTH.md
> lists. Do the database, Cloudflare, domain, store and monitoring items now; do the auth items last, from AUTH.md.

```mermaid
flowchart TD
  A["1 Database (Neon/Supabase) + roles"] --> B["2 Cloudflare account"]
  B --> C["3 Worker secrets + deploy (migrations first)"]
  C --> D["4 Domains: api., admin., root site"]
  D --> E["5 Google Cloud OAuth clients"]
  E --> F["6 SMS provider / DLT"]
  F --> G["7 AdMob + app-ads.txt + Firebase link"]
  G --> H["8 Play Console"]
  H --> I["9 Bootstrap first owner"]
  I --> J["10 Smoke tests"]
```

## 1. Database: Neon or Supabase

| # | Step | Who |
| - | --- | --- |
| 1.1 | Create the Postgres project. **Chosen: Neon, project `winter-voice-10801980`, branch `production`.** Supabase works the same way (plain SQL through the `postgres` driver, `prepare: false`). Pick a region near India (Singapore or Mumbai if offered). | owner |
| 1.2 | Neon CLI (owner/developer laptop): `npm i -g neon@latest && neon login`, then `neon link --project-id winter-voice-10801980 --branch production -y`, then `neon config init`. | owner |
| 1.3 | Copy two connection strings: the **owner** role (for migrations) and a **pooled** string for the runtime (Neon pooled endpoint; Supabase transaction pooler). | owner |
| 1.4 | Run the migrations as the owner: `cd server && MIGRATION_DATABASE_URL='postgres://owner:...' npm run migrate`. This creates `notra_app`, `notra_system`, tables, RLS, analytics. | developer |
| 1.5 | Create the **restricted runtime LOGIN role** as the owner (SQL editor / `psql`): `CREATE ROLE notra_runtime LOGIN PASSWORD '<long random>' NOBYPASSRLS IN ROLE notra_app;` (Supabase: user shows up as `notra_runtime.<project-ref>` through the pooler). | developer |
| 1.6 | Verify: `SELECT rolbypassrls FROM pg_roles WHERE rolname='notra_runtime';` is `f`; `\dt` shows tables owned by the owner, not by `notra_runtime`. | developer |
| 1.7 | `DATABASE_URL` = the **runtime** role's pooled string (Worker secret). `MIGRATION_DATABASE_URL` = the owner string (GitHub secret only). They must differ; if `DATABASE_URL` were the owner/`postgres`/`neon_owner` role, **RLS would be bypassed**. | developer |
| 1.8 | Turn on point-in-time recovery / backups per the provider plan, and note the backup retention (the privacy text should mention that deleted data can linger in provider backups). | owner |
| 1.9 | Optional: Cloudflare Hyperdrive in front of the DB: uncomment `[[hyperdrive]]` in `server/wrangler.toml`; the Worker then prefers `env.HYPERDRIVE.connectionString`. | developer |

## 2. Cloudflare

| # | Step | Who |
| - | --- | --- |
| 2.1 | Create/sign in to the Cloudflare account; add the domain (or buy it through Cloudflare Registrar). | owner |
| 2.2 | Enable Workers and Pages. Create an **API token** with *Workers Scripts: Edit* and *Cloudflare Pages: Edit* (plus account/zone read as needed) and note the **Account ID**. | owner |
| 2.3 | Add GitHub repository secrets `CLOUDFLARE_API_TOKEN` (+ `CLOUDFLARE_ACCOUNT_ID` if the token sees several accounts). | owner |
| 2.4 | Create the Pages project **`notra-admin`** (first manual deploy, or let `admin.yml` create it with `wrangler pages deploy`). | developer |
| 2.5 | Add a Cloudflare **rate-limiting rule** on `/v1/auth/*` (defence in depth; the code has per-phone/IP limits but nothing in front of it). Consider one on `/v1/sync/*` too. | owner |

## 3. Worker secrets and variables

Set as Worker secrets (the **Deploy server** workflow does this from GitHub secrets, or `npx wrangler secret put NAME`). Today's list:

| Name | Value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | restricted runtime role string (1.7) | **required** |
| `JWT_SECRET` | 32+ random characters | rotating it signs everyone out of access tokens |
| `OTP_PEPPER` | 16+ random characters | changing it invalidates unconsumed OTPs only |
| `GOOGLE_CLIENT_IDS` | comma-separated OAuth **client ids** the Worker accepts as token audience: the **Web** client id used by the app (`extra.googleWebClientId`) and the admin's Web client id | |
| `SMS_PROVIDER` | `msg91` (default) | `dev` only logs the code: **never in production** |
| `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` | from MSG91 | **If these are missing and `SMS_PROVIDER` is not `dev`, every endpoint (even `/v1/health`) answers 500 `server_misconfigured`** |

Plain variables in `server/wrangler.toml` `[vars]`: `ENVIRONMENT=production`, `SMS_COST_PAISE=25` (admin SMS cost estimate). Optional:
`ADMIN_ORIGIN=https://admin.<domain>` (only if the admin site is on a different origin than the API; enables CORS), `SERVER_VERSION`.
Cron: `crons = ["45 0 * * *"]` (06:15 IST) is already in `wrangler.toml`.

All of the above are replaced or extended by `docs/AUTH.md` once Better Auth lands. **[developer]**; secret values come from **[owner]**.

Deploy: GitHub -> Actions -> **Deploy server** -> Run workflow (migrations as owner -> `wrangler deploy` -> secrets). First-time order: set the
GitHub secrets, run the workflow once (the first run may answer 500 until secrets exist), then re-run. **[developer]**

## 4. Custom domains

| Host | Points to | Notes | Who |
| --- | --- | --- | --- |
| `api.<domain>` | the Worker (`notra-book-api`): Workers -> Settings -> Domains & Routes -> Custom domain | put this URL in `app.json` `extra.apiUrl` (**currently the placeholder `https://api.notra-book.example`**) and rebuild the app | developer |
| `admin.<domain>` | Pages project `notra-admin` custom domain | Prefer **one origin**: route `admin.<domain>/admin/api/*` (and `/v1/auth/*`) to the Worker so no CORS is needed; otherwise set `ADMIN_ORIGIN` on the Worker and `ADMIN_API_BASE` repository variable for the build | developer |
| `<domain>` (root) | a static site | must serve **`/app-ads.txt`** (7.6) and may host the public privacy/terms links; **no root site exists in the repo yet**. Play and AdMob read `app-ads.txt` from the developer website domain declared in the Play listing | owner + developer |

Public legal pages are served by the Worker: `https://api.<domain>/privacy`, `/terms`, `/grievance`, `/delete-account`. Use these in Play Console.

Optional Cloudflare Access in front of `admin.<domain>`: not required by the code (see [ADMIN.md](ADMIN.md)). **[owner]**

## 5. Google Cloud OAuth (sign-in)

| # | Step | Who |
| - | --- | --- |
| 5.1 | Create a Google Cloud project; configure the **OAuth consent screen** (app name Notra Book, support e-mail, privacy policy URL, authorised domain); publish it (production) before launch. | owner |
| 5.2 | **Web application** client: its id goes in `app.json` `extra.googleWebClientId` (**placeholder today**) and in the server's accepted client ids. For the **admin** site add `https://admin.<domain>` under *Authorized JavaScript origins* (this can be the same Web client; set `VITE_GOOGLE_CLIENT_ID` / variable `ADMIN_GOOGLE_CLIENT_ID`). | owner |
| 5.3 | **Android** client(s): package `app.notra.book` + **SHA-1 of each signing key**: (a) the **upload key** (`keytool -list -v -keystore notra-upload.jks`), (b) the **Play app-signing key** (Play Console -> Setup -> App signing, available after the first upload), (c) the **debug key** used by CI/test APKs if testers must sign in with them. Missing the Play app-signing SHA-1 is the classic "works in the test APK, fails from the Store" bug. | owner |
| 5.4 | iOS client only when iOS ships: replace `iosUrlScheme` (`REPLACE_WITH_IOS_CLIENT_ID`) in the google-signin plugin entry. | developer (later) |
| 5.5 | Restrict the Firebase API key (section 7.4). | owner |

## 6. SMS (mobile OTP): MSG91 and DLT

| # | Step | Who |
| - | --- | --- |
| 6.1 | Register the business entity on a telecom **DLT** portal (Jio/Airtel/Vodafone-Idea/BSNL TrueConnect etc.): entity, **header (sender id)**, and an **OTP content template** with a `{#var#}` for the code. Takes days to weeks and needs business documents. | owner |
| 6.2 | Create the MSG91 account, link the DLT template, copy the **auth key** and the **template id**. Fund the account. | owner |
| 6.3 | Set `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `SMS_PROVIDER=msg91` as Worker secrets. Set `SMS_COST_PAISE` to the real per-SMS cost for the admin estimate. | developer |
| 6.4 | Watch SMS volume in the admin panel (Abuse, Reports > OTP) and add the Cloudflare rate-limit rule (2.5). | owner |

The final OTP provider and variables are defined by `docs/AUTH.md`.

## 7. AdMob, app-ads.txt, Firebase

| # | Step | Who |
| - | --- | --- |
| 7.1 | AdMob account (publisher `pub-2707121635941418`), add the **Android app** (package `app.notra.book`, "listed on Google Play" after publishing, or add manually first). | owner |
| 7.2 | Create **4 ad units**: Adaptive banner, Native advanced, Interstitial, Rewarded. Copy the app id and the 4 unit ids. | owner |
| 7.3 | Add GitHub secrets `ADMOB_ANDROID_APP_ID`, `ADMOB_BANNER_ID`, `ADMOB_NATIVE_ID`, `ADMOB_INTERSTITIAL_ID`, `ADMOB_REWARDED_ID`. They are used **only** by a properly signed release build (`NOTRA_ADS_TEST=0` when a keystore exists); every other build uses Google's test ids. | owner |
| 7.4 | Block sensitive categories in AdMob (gambling, dating, get-rich-quick, crypto, personal loans / financial services, alcohol, sexual content, politics). Set up **GDPR/UMP** messages if serving the EEA. | owner |
| 7.5 | **Firebase**: project **`notra-pp`**, Android app `app.notra.book` (the committed `google-services.json` already belongs to it). In Google Cloud Console -> APIs & Services -> Credentials restrict the Android key: application restriction *Android apps* (`app.notra.book` + every signing SHA-1) and API restriction to the Firebase APIs used. Link AdMob to Firebase (AdMob -> App settings -> Link to Firebase) **after** the real AdMob app id is in a release build ([ADS.md](ADS.md)). iOS needs its own `GoogleService-Info.plist` later. | owner |
| 7.6 | **`app-ads.txt`** at the **root of the developer-website domain** (the one in the Play listing): one line `google.com, pub-2707121635941418, DIRECT, f08c47fec0942fa0`. AdMob reports "app-ads.txt not found" until it exists (**currently pending**). | owner + developer |

## 8. Play Console

| # | Step | Who |
| - | --- | --- |
| 8.1 | Create the developer account (one-time fee; identity verification; for new personal accounts a **closed test with 12+ testers for 14 days** may be required before production: check current Play rules). | owner |
| 8.2 | Create the app: package `app.notra.book`, default language Hindi, App, Free. Enrol in **Play App Signing**. | owner |
| 8.3 | **Internal testing** track: upload the first AAB **manually** once (from the `notra-book-aab` artifact), add tester e-mails. Afterwards `release.yml` uploads drafts (needs `PLAY_SERVICE_ACCOUNT_JSON`). | owner |
| 8.4 | Declarations: **Data safety** ([PLAY_STORE.md](PLAY_STORE.md)), **content rating** (IARC; expected Everyone), **target audience** (adults), **ads: yes**, news/government/health/finance: no (record keeping only), permissions (microphone, camera, AD_ID). | owner |
| 8.5 | URLs: privacy policy `https://api.<domain>/privacy`, terms `/terms`, account deletion `/delete-account` (Data safety "Delete account URL"), grievance `/grievance`. Replace the `CONTACT` placeholders in `src/legal/content.ts` first (operator, officer, e-mail, phone, address) and redeploy the Worker. | owner + developer |
| 8.6 | Store listing: Hindi + English descriptions, icon, feature graphic, phone screenshots (the Maestro flow 09 produces screenshots), contact e-mail. | owner |
| 8.7 | App content: "App access" = no login required (sign-in is optional). | owner |
| 8.8 | Add the Play app-signing SHA-1 to the Google OAuth Android client (5.3). | owner |

## 9. Bootstrap the first owner

After migrations and one real sign-in with the owner's Google account (or after the phone-number account exists):

```bash
cd server
MIGRATION_DATABASE_URL='postgres://owner:...@host/db' npm run admin:bootstrap -- 9876543210      # mobile number
MIGRATION_DATABASE_URL='postgres://owner:...@host/db' npm run admin:bootstrap -- you@gmail.com   # Google account that signed in once
```

Run with the **owner** DB role (the runtime role cannot change roles). A never-seen phone number gets an empty account so the first OTP sign-in lands
on it; an e-mail must already belong to an account. The script also writes an audit row. Then sign in at `https://admin.<domain>` and add staff on
**Staff & roles**. **[developer]** (with owner approval). The bootstrap relies on the `users`/`profiles` layout; re-check it against `docs/AUTH.md` after the auth move.

## 10. Smoke tests after every deploy

Replace `$API` with `https://api.<domain>`.

| # | Check | Expected |
| - | --- | --- |
| 1 | `curl -s $API/v1/health` | `{"ok":true}` (a 500 `server_misconfigured` means missing secrets) |
| 2 | `curl -s $API/v1/config` | JSON with `maintenance`, `ads`, `features`, `fetched_at`; header `cache-control: public, max-age=300` |
| 3 | `curl -sI $API/privacy` (also `/terms`, `/grievance`, `/delete-account`) | 200 `text/html`, CSP header |
| 4 | Admin site loads at `https://admin.<domain>` and shows the login page | |
| 5 | Sign in to the admin panel as the owner; **Monitoring** shows DB latency, `migration_version` = latest file (`102_analytics.sql`), errors 0 | |
| 6 | In the app (release build from Play internal): sign in with Google | session created; first sync restores or uploads |
| 7 | Sign in with a real phone number (OTP SMS arrives within seconds) | |
| 8 | Add an entry offline, go online: Settings "भेजना बाकी" returns to 0; second phone / reinstall + sign-in restores it | |
| 9 | RLS sanity: `SELECT rolbypassrls FROM pg_roles WHERE rolname='notra_runtime'` is `f`; as the runtime role without `set_config`, `SELECT count(*) FROM entries` returns 0 | |
| 10 | Remote config: in Admin set an **announcement**; it appears on the app's home within ~5 min; switch off | |
| 11 | Support: send a test grievance from the app; it appears in Admin Tickets with a due date | **known to fail today**, see [ROADMAP.md](ROADMAP.md) limitation 1 |
| 12 | Ads: in a **release** build with real ids, confirm a banner after day one on घर; never on forms. Use test devices for your own phone to avoid invalid traffic | |
| 13 | Account deletion: delete a throwaway account in-app; the admin deletions report increments and rows are gone | |
| 14 | Cron: next morning, `last_rollup_day` on Monitoring is today/yesterday | |
| 15 | `min_supported_version` rehearsal on a test config only: never raise it before the fixed build is live in Play | |
