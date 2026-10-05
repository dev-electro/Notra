# Admin panel (Stage 8)

An operations panel for Notra Book: user accounts, support and grievances, remote config, abuse control, monitoring and
anonymous metrics.

**The one rule:** Notra holds who-gave-how-much inside a village. One leak ends the product. So staff can see
*accounts* and *aggregate numbers*, and **nobody, including an owner, can read a user's diary**. This is enforced by the
database (Row Level Security), not just by the API. The only way staff ever see a user's records is if **that user switches on a
7-day, read-only "support access" window from the app** (see below).

```
 admin/ (React, Cloudflare Pages) ──Bearer session token──▶ Worker  /admin/api/*  ──▶ Postgres (Neon)
        sign in: Google or mobile OTP                      (server/src/admin)          RLS + SECURITY DEFINER functions
        = the app's own Better Auth flow (/api/auth/*)      one transaction per request  analytics.* (aggregates, k = 5)
```

## 1. Who can log in, and what role they have

* Staff are **ordinary Notra accounts**. They sign in to the admin panel with the same two methods as the app: Google
  (Google Identity Services ID token to `POST /api/auth/sign-in/social`) or mobile OTP (`/api/auth/phone-number/send-otp` and `/verify`): Better Auth, see docs/AUTH.md.
* The role lives in the database: `profiles.role` (`user` | `viewer` | `support` | `admin` | `owner`, default `user`).
  On every admin request the server resolves the Better Auth session, **reads the role from the database** (`auth_state()`), and
  rejects anyone who is not staff (403 `not_staff`) or is suspended (403). A role is never taken from the token or the request.
* Nobody can promote themselves: the application's database role has no `UPDATE` privilege on `profiles.role`. Roles change only
  through `staff_set_role()` (owner only; it also refuses to demote the last owner).
* Demotion or suspension takes effect on the staff member's very next request.

### First owner

Run once, with the **owner/migration** database role (not the runtime one):

```bash
cd server
MIGRATION_DATABASE_URL='postgres://owner:...@host/db' npm run admin:bootstrap -- 9876543210     # mobile number
MIGRATION_DATABASE_URL='postgres://owner:...@host/db' npm run admin:bootstrap -- you@gmail.com   # Google account that has signed in once (phone-only accounts have a placeholder e-mail, never shown)
```

A phone number that has never signed in gets an empty account created so the first OTP sign-in lands on it. An e-mail must
already belong to an account (sign in to the app or admin panel with Google once). After that, the owner adds everyone else on
**Staff & roles**.

Cloudflare Access is **not** the login mechanism. You may still put an Access policy in front of the Pages site and
`/admin/*` as an optional extra layer (allow-list of e-mails): the client uses same-origin requests, so it keeps working.

## 2. Roles and permissions

| Capability | viewer | support | admin | owner |
| --- | :-: | :-: | :-: | :-: |
| Dashboard, reports, CSV export (aggregates) | yes | yes | yes | yes |
| Users: search, detail with **masked** phone/e-mail, record **counts**, devices | yes | yes | yes | yes |
| Remote config, tickets, abuse stats, blocklist, monitoring: **read** | yes | yes | yes | yes |
| Internal user notes (read/write) | - | yes | yes | yes |
| Tickets: assign, priority, reply/note, resolve, log a ticket | - | yes | yes | yes |
| Suspend / unsuspend, force sign-out | - | yes | yes | yes |
| Block / unblock a phone or IP | - | yes | yes | yes |
| View data a user **chose to share** (consented support access) | - | yes | yes | yes |
| **Unmask** a phone / e-mail (reason required, audited) | - | - | yes | yes |
| **Delete an account** (reason + typed confirmation) | - | - | yes | yes |
| Edit remote config (maintenance, versions, announcement, ads, features) | - | - | yes | yes |
| Recompute daily stats | - | - | yes | yes |
| Audit log | - | - | yes | yes |
| Staff & roles (grant / change / remove) | - | - | - | yes |
| Read **anyone's diary** | - | - | - | - (only via a user's own grant, read-only) |

The matrix is implemented in three places that must agree: the `min` role passed when each route is registered
(`server/src/admin/*.ts`), the SQL functions (`app_require_role()` inside each `SECURITY DEFINER` function), and `admin/src/lib/roles.ts`
(hides what a role cannot do). A test walks every registered route and checks the gate for the role below its minimum.

## 3. Privacy model (what the database enforces)

### Row Level Security

* The Worker connects as a **restricted LOGIN role that is a member of `notra_app`**. It does not own the tables and has no
  `BYPASSRLS`. Migrations run as the table owner (`MIGRATION_DATABASE_URL`).
* Every request runs in **one transaction** that begins with
  `select set_config('app.user_id', <uuid>, true), set_config('app.role', <role>, true)` (`withUserTx` in `server/src/db.ts`).
  `true` = transaction-local, so nothing leaks to the next request on a pooled connection.
* `ENABLE` and `FORCE ROW LEVEL SECURITY` is on every user-data table: `users, households, events, entries, ledgers, profiles,
  user_devices, user_activity_daily, auth_sessions, auth_accounts, auth_verifications, auth_rate_limits, support_tickets, ticket_notes, user_notes, support_access_grants`.
  The four `auth_*` tables belong to Better Auth, which works before a user id is known: its statements run with `app.auth = '1'` (set per statement by `server/src/auth/dialect.ts`), which only those tables' policies (and the identity columns of `users`) admit. Sync, admin and support code never set it.
* **Ledger tables** (`households, events, entries, ledgers`) and the synced profile: a row is visible/writable **only when
  `user_id = app.user_id`**. No policy grants viewer/support/admin/owner access to someone else's ledger rows. The sole exception is
  `SELECT` during an active support-access grant (below).
* Account metadata (`users`, `user_devices`, `user_activity_daily`, tickets) is readable by staff roles so the panel can list
  users; the API masks phone/e-mail. Status changes, force sign-out, deletion and counts go through narrow `SECURITY DEFINER` functions.
* Column privileges stop self-promotion/self-un-suspension: the runtime role cannot write `profiles.role` or `users.status`.
* `admin_audit_log` is append-only for the application (no `UPDATE`/`DELETE` privilege).
* **Adding a user-data table?** Enable + force RLS and add policies in a new `1xx_*.sql` migration. A test fails if any table with a
  `user_id` column is not forced.

### The few functions that run as `notra_system` (all `SECURITY DEFINER`, `search_path` pinned, execute granted only to `notra_app`)

| Function | Why it exists | Reach |
| --- | --- | --- |
| `auth_state(uuid)` | per-request: is the account suspended, what is its role? | one user's status + role |
| `auth_sync_google_sub()` (trigger) | keeps `users.google_sub` in step with the Google row in `auth_accounts` | one user's column |
| `admin_user_counts(uuid)` | record counts for the user page | four integers (viewer+) |
| `admin_active_sessions(uuid)` | live sessions for the user page | one integer (viewer+) |
| `admin_set_user_status`, `admin_force_signout` | suspend / sign-out | support+ |
| `admin_delete_user` | delete on request | admin+ |
| `staff_list`, `staff_set_role` | role management | owner only |
| `admin_migration_version()` | health page | text |
| `analytics.*` | aggregates (below) | aggregates only |

The pre-sign-in tables `otp_events` / `blocklist` are keyed by phone or IP, not by user, so they are not under RLS.
The `notra_system` role is `NOLOGIN` and cannot be reached except through these functions.

### Consented support access ("सहायता को मेरा डेटा 7 दिन दिखाएं")

A user can let support read their data **read-only for at most 7 days**. Only the user can create it:

* App: `POST /v1/support/access` with `{"action":"grant","hours":1..168,"ticketId"?}`, `{"action":"revoke"}`; `GET` shows the active grant.
  (The app UI comes later. The database rejects a grant over 7 days.)
* While a grant is active, the ledger `SELECT` policy lets `support`/`admin`/`owner` read **that user's** rows, nothing else. Writes
  are impossible for them. Viewers never get data.
* Staff open it at **Users > user > "Data the user chose to share"**, which calls `GET /admin/api/support-view/:userId/:table`.
  This is the **only** admin endpoint that can return ledger fields, it refuses without a grant (403 `no_active_grant`), and
  **every call is written to the audit log** as `support_data_view` (table + row count, never the data).
* Revoking ends access immediately; expiry does the same.

### Insights without rows: the `analytics` schema and k-anonymity

Staff dashboards read only `analytics.*` functions (`SECURITY DEFINER`, owned by `notra_system`, minimum role viewer) and
`daily_stats`. They return **aggregates only**. **Any group built from fewer than 5 distinct users is suppressed**: the API returns
`"<5"` instead of a number (and the UI shows it as `<5`, with a gap in charts).

| Report | Source | Notes |
| --- | --- | --- |
| North star: events recorded per month | `analytics.events_per_month` | |
| New users (by method), DAU / WAU / MAU | `daily_stats` | WAU = trailing 7 days, MAU = 30 |
| Retention cohorts (weekly signup, weeks 1-8) | `analytics.retention` | cells with < 5 users `<5` |
| Occasion mix | `analytics.events_by_occasion` | counts only |
| Entries per event: avg / median / p90 | `analytics.entries_per_event` | |
| Amount distribution (Rs 0-100, 101-500, 501-1000, 1001-5000, 5000+) | `analytics.amount_buckets` | cash + in-kind value per entry; voided and corrected entries excluded |
| Cash vs UPI, in-kind share, received (aaya) vs given (gaya) | `analytics.entry_mix` | |
| Region distribution | `analytics.region_distribution` | users per village of **their own household**, only groups of 5+; the rest are one `<5` row. District is not derivable, so it is not shown |
| App versions | `analytics.app_versions` | active in last 30 days |
| Sync requests / failures | `daily_stats` | |
| OTP sends and estimated SMS cost | `daily_stats` + `SMS_COST_PAISE` | cost = (sent - failed) x paise |
| Account deletions, grievance SLA | `daily_stats`, tickets | |

`daily_stats` is filled by the Cron Trigger (`45 0 * * *` UTC; recomputes the last 7 days because phones sync late) and on
demand (**Reports > Recompute**, admin+). "Today" is refreshed whenever a report is opened (at most every 5 minutes). Event and entry
dates come from the phone's `created_at`.

**Known limits, so nobody over-promises:** suppression is per group, so subtracting two overlapping totals can still narrow a small
group; do not add finer-grained functions (per village per day) without re-checking. `app.role` is a transaction setting written
by the Worker: a compromised Worker could set it, but even then no policy gives any role other people's ledger rows. The
admin response guard and the privacy test (below) are defence in depth, not the primary control.

### Response guard and tests

* Every `/admin/api` response (except the consent-gated support view) passes a **privacy guard**: if any key such as `head_name,
  father_name, village, fala, atak, jati, cash_paise, in_kind*, occasion_label, occasion_note, direction, payment_mode, phone`
  appears, the request is rolled back and answers 500 `privacy_guard`. Audit metadata is stripped of these keys too.
* `server/test/admin.test.ts` walks **every registered admin route**, scans each JSON/CSV response for those keys and for sentinel
  values seeded into a user's diary. `server/test/rls.test.ts` proves A cannot read B (even with a forged role setting), an
  admin token gets zero ledger rows, support with a grant reads only that user's rows read-only, and every `user_id` table is
  forced. `server/test/ops.test.ts` proves k-anonymity (the switch from `<5` to a number happens at exactly 5 users).
  `cd server && npm test` runs all of it (also in the existing CI `server` job).

## 4. Endpoints (`/admin/api`, `Authorization: Bearer <session token>` or the Better Auth cookie)

Reads: `GET /me, /health, /errors, /overview, /users, /users/:id, /users/:id/notes (support+), /tickets, /tickets/:id, /config,
/config-history, /abuse/otp, /abuse/blocklist, /reports, /reports/:name[?format=csv&from=&to=], /audit (admin+), /staff (owner),
/support-view/:userId/:table (support+, needs grant)`.
Mutations (each writes `admin_audit_log` with who, role, action, target, reason, IP and before/after metadata):
`POST /users/:id/{suspend,unsuspend,signout,delete,unmask,notes}`, `PUT /config/:key`, `POST /tickets`, `PATCH /tickets/:id`,
`POST /tickets/:id/{notes,resolve}`, `POST /abuse/blocklist`, `DELETE /abuse/blocklist/:id`, `POST /reports/recompute`,
`POST /staff`, `PATCH|DELETE /staff/:id`. Error responses commit nothing, including their audit row.

Public/app endpoints added in this stage: `GET /v1/config` (no auth, `Cache-Control: max-age=300`), `POST /v1/support`
(authenticated, 5 per hour), `POST|GET /v1/support/access`.

## 5. Remote config: how to use it

Open **Remote config**. Phones read `GET /v1/config` (cached 5 minutes, so allow about 5 minutes). Every save is validated,
stored with before/after in `config_history`, and written to the audit log. The panel previews the Hindi banner exactly as the
app will show it.

| Key | Use |
| --- | --- |
| `maintenance` `{enabled, message_hi, message_en}` | **On**: `/api/auth/*` and `/v1/sync/*` answer **503** `{error:"maintenance", message_hi, message_en}` with `Retry-After`. `/v1/health`, `/v1/config`, the pages and the admin API stay up. The app keeps working offline. Needs a Hindi message; confirm dialog + reason. |
| `min_supported_version`, `latest_version`, `force_update_message_hi` | **Force update**: the app compares its version with `min_supported_version` and blocks behind the message. `latest_version` only suggests an update. Rule: min must not be newer than latest. Publish the build to the Play Store **before** raising the minimum. Confirm dialog + reason. |
| `announcement` `{enabled, message_hi, starts_at, ends_at, level}` | A home-screen banner (`info`, `warning`, `critical`) shown between the two times. |
| `ads` `{enabled, banner, native, interstitial, rewarded, interstitial_min_interval_sec (30-86400), native_every_n_items (2-50), first_day_ads_free}` | Master switch plus formats and frequency. Defaults are all off. |
| `features` `{web_app, ocr, invitation_cards}` | Flags. |

Suspended users get **403** `{error:"account_suspended", message_hi:"आपका खाता अस्थायी रूप से रोका गया है। सहायता से संपर्क करें।"}`
on sign-in (Better Auth refuses to create the session) and on every sync request.

## 6. Support and grievances (DPDP)

* The app submits with `POST /v1/support` `{category: grievance|bug|feedback|deletion|other, subject, body}` (rate limited).
  Staff can also log tickets that arrive by e-mail, phone or web form (Tickets > Log a ticket).
* A **grievance gets `due_at` = created + 30 days**. Overdue open grievances are highlighted red in the list, counted on the
  dashboard, and in **Reports > Grievance SLA**.
* Workflow: open > in progress (assign, set priority, add internal notes or replies) > resolved/closed with a resolution text.
* **Do not ask users to put diary details in a ticket**, and never copy ledger data into notes. Ticket text is what the user typed;
  if they need help with their data, ask them to switch on support access from the app.
* Tickets stay after an account is deleted (the link to the account is cleared) as the grievance record.

## 7. Runbooks

**Incident (errors up, sync failing).** Monitoring: check DB latency and error list (path + scrubbed message; counts repeat
errors). If sign-in/sync is harmful or the database is in trouble, turn **maintenance on** with a Hindi message (reason required);
turn it off when fixed. If a bad app build is the cause, raise `min_supported_version` only after a fixed build is live.

**OTP abuse (SMS cost spike).** Abuse & blocklist: look at sends per day and the top IPs / phones (masked). Block the IP or phone
(reason; optional expiry). Blocks answer 403 on OTP start and verify. Lift them from the blocklist. Tune rate limits in
`server/src/auth/otp.ts` if the pattern is distributed.

**Account deletion request.** Confirm the requester (they can sign in, or you verify by phone: unmask is audited). User page >
**Delete account**: reason + type `delete <first 8 characters of the user id>`. It erases the account, ledgers, households, events,
entries, profile, sessions, linked sign-ins and OTP records in one transaction and is counted in the deletions report. Reply on the ticket and
resolve it within 30 days.

**Lost phone / compromised account.** User page > Force sign-out (deletes every session, so the phone is signed out on its next request) or Suspend (immediate, shows the Hindi message, and blocks signing in again). Add an internal note.

**Someone left the team.** Staff & roles > Remove from staff (their account stays, role goes back to `user`). If it was a
Google/phone you do not trust, also suspend the account.

## 8. Deploying

### Database roles (once)

Migrations create `notra_app` (NOLOGIN group) and `notra_system` (NOLOGIN). Create the **runtime LOGIN role** yourself and make it
a member (Neon or Supabase SQL editor, as the owner):

```sql
CREATE ROLE notra_runtime LOGIN PASSWORD '<long random>' NOBYPASSRLS IN ROLE notra_app;
```

* `DATABASE_URL` (Worker secret) = connection string for `notra_runtime` (Neon: a role in the project; Supabase: user
  `notra_runtime.<project-ref>` through the pooler). It must **not** be the owner / `postgres` / `neon_owner` role.
* `MIGRATION_DATABASE_URL` (GitHub secret used by **Deploy server**, and for `npm run migrate` / `admin:bootstrap`) = the owner role.
* Verify: `SELECT rolbypassrls FROM pg_roles WHERE rolname='notra_runtime';` is `f`, and `\dt` shows tables owned by the owner, not by it.

### Worker

* Migrations `100_admin.sql`, `101_rls.sql`, `102_analytics.sql`, `103_better_auth.sql` (numbered 100+ so they never collide with app migrations 004+).
* `server/wrangler.toml`: Cron `45 0 * * *`, vars `ENVIRONMENT`, `SMS_COST_PAISE` (default 25), optional `ADMIN_ORIGIN`.
* Secrets: see docs/AUTH.md (`BETTER_AUTH_SECRET`, `DATABASE_URL`, `GOOGLE_CLIENT_IDS`, MSG91) plus the two URLs above. Optional vars: `SERVER_VERSION` (shown on Monitoring).
* Serve the admin app and API from **one origin** if you can (route `admin.example.com/admin/api/*` to the Worker, everything else
  to Pages): no CORS needed. If they differ, set `ADMIN_ORIGIN=https://admin.example.com` on the Worker (the panel sends the Better Auth session token as a Bearer header; the Worker also allows credentialed CORS for that
  exact origin so the cookie works when both are on one site) and `VITE_API_BASE=https://api.example.com` at build time.
* Google sign-in on the web: create/reuse a **Web OAuth client**, add the admin origin to *Authorized JavaScript origins*, add the
  client id to the Worker's `GOOGLE_CLIENT_IDS` **and** set `VITE_GOOGLE_CLIENT_ID` for the admin build. Without it only mobile OTP is offered.

### Admin web app (`admin/`)

`npm run dev | typecheck | lint | test | build`. Tests are named `*.vtest.ts(x)` so the app's root Jest run (which ignores only `/server/`) does not pick them up. The workflow `.github/workflows/admin.yml` runs the checks on pushes touching
`admin/**` and, from **Run workflow**, deploys with `npx wrangler@4 pages deploy admin/dist --project-name notra-admin`
(secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; optional repo variables `ADMIN_API_BASE`, `ADMIN_GOOGLE_CLIENT_ID`).
The session token (from the `set-auth-token` header after sign-in) is kept in `sessionStorage` (cleared when the tab closes); the role is never stored client-side.

### Optional extra layer: Cloudflare Access

Zero Trust > Access > Applications > Self-hosted: add the Pages domain and the Worker path `/admin/*`, policy = allowed e-mails.
Nothing in the code depends on it. If you use it with a cross-origin API, bypass `OPTIONS` requests in the policy.

## 9. What the app must do (not done in this stage)

* Send `X-App-Version` (e.g. `1.4.2`), `X-Platform` (`android`|`ios`|`web`) and optionally `X-OS-Version` on sync and sign-in
  requests. Without them the app shows as "unknown version" (still works).
* Read `GET /v1/config` on launch and about every 5 minutes: honour `maintenance`, `min_supported_version` (force-update screen with
  `force_update_message_hi`), `announcement`, `ads`, `features`. Handle 503 `maintenance` and 403 `account_suspended` (show `message_hi`).
* "Contact support / grievance" screen: `POST /v1/support`; and the toggle "सहायता को मेरा डेटा 7 दिन दिखाएं" calling
  `POST /v1/support/access`.
* **Privacy policy text must change** (`src/legal`, owned by the app work): disclose that authorised staff can see account details
  (phone/e-mail, sign-in method, app version, last active, counts of records) and anonymous aggregate statistics, **cannot read
  diary entries**, and can read a user's data only during a window the user switches on themselves (max 7 days, read-only, logged).
