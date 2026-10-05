# Data model and domain rules

Two databases hold Notra data:

- **Local SQLite** on the phone (SQLCipher-encrypted, `notra-diary.db`): the source of truth. Schema in `src/db/migrations.ts`
  (versions 1..7, `PRAGMA user_version`).
- **Server Postgres** (Neon or Supabase): an optional copy per signed-in user plus admin/analytics tables. Schema in
  `server/migrations/*.sql` (001..004 for synced data, 100..102 for admin/RLS/analytics).

Glossary of the Hindi terms: [GLOSSARY.md](GLOSSARY.md). Sync mechanics: [SYNC.md](SYNC.md).

## 1. Core domain rules

### 1.1 Money is integer paise

`1 rupee = 100 paise`. Every amount column is an integer (`cash_paise`, `in_kind_value_paise`); there is no floating point
money anywhere (`src/core/money.ts`: `rupeesToPaise` rounds once at the edge). The UI types whole rupees and multiplies by 100.
`formatINR` groups the Indian way (`1,00,001`) and prints paise only when non-zero. Server validation caps a value at
`1e12` paise (`validate.ts` `paise()`), enforced with `CHECK (>= 0)` in both databases.
The value of an entry is `cash_paise + in_kind_value_paise`: goods (अनाज, घी, बकरी, बर्तन, अन्य) count at the person's
**estimated** value ("in-kind is real money").

### 1.2 Entries are append-only: corrections and voids

An entry is never edited or deleted.

| Action | What is written | Effect |
| --- | --- | --- |
| Add | new row | counts |
| Correct ("बदलें") | NEW row with `corrects_entry_id = old.id` (keeps event, direction, date unless changed) | old row is *superseded* and stops counting |
| Void ("वापस" / undo) | NEW row, `is_void = 1`, both amounts 0, `corrects_entry_id = target.id` | target stops counting; the void counts as nothing |

Chains are fine: `A <- B (corrects A) <- C (corrects B)` leaves only C; `A <- B <- V (void of B)` leaves nothing.
`repository.ts` refuses to correct a void or an already-superseded entry (`assertTargetOpen`).

- In JS: `activeEntries()` in `src/core/ledger.ts`.
- In SQL: view `active_entries` (`is_void = 0 AND NOT EXISTS (entry that corrects it)`).
- Enforced by SQLite triggers `entries_no_update` (any change to a business column aborts; only `dirty` / `sync_error`
  may change), `entries_no_delete`, `entries_void_valid`.
- Server: entries are inserted with `ON CONFLICT (user_id, id) DO NOTHING`; there is no UPDATE path.
- `src/db/__tests__/void.test.ts` proves SQL == core for chains and voids.

### 1.3 Strict separation: two worlds, direction derived from the host

Every entry belongs to an **event** (a "program"/कार्यक्रम). The direction of the entry is **derived**, nobody picks it:

| World | Host of the event | Entry direction | Who is `other_household_id` | Screen |
| --- | --- | --- | --- | --- |
| मेरा नोतरा | MY household (`settings.my_household_id`) | `AAYA` (आया/मिला, received) only | the guest who gave | `events/[id]/ledger.tsx`, `entry/new.tsx` |
| दूसरों का नोतरा | ANOTHER household | `GAYA` (गया/दिया, given) only | the host I gave to | `others/new.tsx` then `entry/new.tsx` |

`directionForHost(host, me) = host === me ? 'AAYA' : 'GAYA'` (`src/core/eventRules.ts`). Enforced four times:

1. **Core / repository**: `checkEntryRule` called by `addEntry` (`NO_EVENT`, `UNKNOWN_EVENT`, `WRONG_DIRECTION`).
2. **SQLite triggers** (migration v7): `entries_need_event` (event_id required), `entries_direction_rule`. The direction
   trigger is skipped while "my household" is unknown, for voids, for corrections that keep the target's event+direction, and while
   a sync/backup page is being applied (`settings.sync_applying`, see `src/db/legacy.ts`).
3. **Server**: `enforceDirections` in `server/src/sync.ts` rejects `invalid_payload:direction` per row (accepts when the event or
   profile is unknown, exempts voids and corrections). `validateEntry` requires `eventId`.
4. **Backup merge / sync apply**: rows are trusted (checked where they were written) and the trigger stands aside.

There is no lekhak/scribe role: the host creates the event and records its guests himself ("खाता खोलें").

### 1.4 `occurred_on` vs `created_at`

| Column | Meaning | Set by |
| --- | --- | --- |
| `created_at` | when the row was typed in (ISO UTC) | the app |
| `occurred_on` | the diary date of the gift, `YYYY-MM-DD` | the person (calendar picker); default = event date, never in the future (`entryDateFor`) |

Order everywhere: `occurred_on, created_at, rowid`. Balances, उतार/चढ़ाव and all reports use that one order, so an old paper
diary can be added later ("पुराना हिसाब जोड़ें") and still lands at the right place. Past dates are allowed on every flow.
`events.date` is the program date; a program created for a past date starts as `HELD` (`findOrCreateEvent`).

### 1.5 उतार / चढ़ाव settlement algorithm

Both-sided accounting per family (`src/core/settlement.ts`; SQL view `entry_settlement`; correlated `NET_BEFORE` in
`src/db/queries.ts`). For each **active** entry, with the same `other_household_id` in the same ledger, in diary order:

```
net_before = sum(received) - sum(given) over earlier active entries with that family
net > 0 : I still owe them a return.      net < 0 : they still owe me.

I GIVE (GAYA) v :   utar    = min(v, max(net_before, 0))
I RECEIVE (AAYA) v: utar    = min(v, max(-net_before, 0))
                    chadhav = v - utar
net_after = net_before + (AAYA ? +v : -v)
```

**उतार** = the part that pays off what was owed. **चढ़ाव** = the rest, a new amount the other side will owe back.

Worked example (Ramesh's household, my increment 51):

| # | Date | Event | Entry | net_before | उतार | चढ़ाव | net_after |
| - | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2024-02-10 | my son's wedding (host: me) | Ramesh gives ₹501 (AAYA) | 0 | 0 | 501 | +501 |
| 2 | 2026-11-21 | Ramesh's daughter's wedding (host: Ramesh) | I give ₹701 (GAYA) | +501 | **501** | **200** | -200 |
| 3 | 2028-05-01 | my house-warming (host: me) | Ramesh gives ₹151 (AAYA) | -200 | 151 | 0 | -49 |

Row 2 reads in the app: "इसमें ₹501 उतार और ₹200 चढ़ाव" (`utarChadhavText`). After row 3 Ramesh still owes me ₹49 (`net = -49`).
In-kind value counts. Voided and superseded entries are ignored, so voiding row 1 would change rows 2 and 3 on the next read
(these values are derived, never stored). Reports compute a running balance over **all** history then apply the date filter,
so a "year" report never loses what happened before it.

### 1.6 Suggested return (shagun rounding)

`suggestReturn(lastReceivedPaise, increment)` in `src/core/ledger.ts`:

- `FIXED rupees`: `target = last + rupees*100` (default `DEFAULT_INCREMENT` = FIXED 51);
- `PERCENT pct`: `target = ceil(last * (100 + pct) / 100)`;
- then `roundUpToShagun(rupees)`: the smallest whole rupee `>= x` that ends in **1** (`r + ((11 - r % 10) % 10)`).

| Last received | Increment | Target | Suggestion |
| --- | --- | --- | --- |
| ₹500 | +₹51 | 551 | **₹551** (already ends in 1) |
| ₹501 | +₹51 | 552 | **₹561** |
| ₹600 | +₹1 | 601 | **₹601** |
| ₹501 | 10% | 551.1 -> 552 | **₹561** |

"Last received" is the most recent AAYA by `occurred_on, created_at`. `null` if they never gave. Quick-amount chips are
`SHAGUN_QUICK_RUPEES = 101, 251, 501, 1001`. The increment is a village setting synced in the profile row.

### 1.7 Ledgers and PINs

The phone may be shared. Besides the **household ledger** (fixed id `00000000-0000-4000-8000-000000000001`, "घर का खाता",
identical on every phone so a restore never duplicates it) a family member can add **personal ledgers** (`kind = PERSONAL`).
`ledger_id` is on `events` and `entries` and **every query is scoped to the open ledger** (`useLoad` passes it).

- A personal ledger may have a 4-digit PIN: `pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>` (10,000 iterations, 16-byte salt),
  stored in `ledgers.pin_hash`, **never synced or exported**; a persistent back-off (30 s, 60 s, 5 min, 15 min, 1 h after the 3rd
  wrong try) lives in `settings.pin_attempts:<ledgerId>`.
- Unlocked ledgers and the open ledger are memory-only (`src/ledgers/session.ts`); after a restart or 2 minutes in the background
  everything relocks and the household ledger opens.
- Optional **app lock** (`settings.app_lock_hash`, key `pin_attempts:app`), off by default.
- Backup files include only ledgers that have no PIN or whose PIN was entered this session (`splitForBackup`).
- Households (the family directory) are **shared** across ledgers; events/entries are per ledger.

### 1.8 Occasions

`SHAADI` शादी, `GRIHAPRAVESH` गृहप्रवेश, `MUNDAN` मुंडन संस्कार, `BIMARI` बीमारी, `MAKAAN` मकान, `OTHER` अन्य. There is **no
death-feast occasion** by design. For `OTHER` the person names the occasion (`occasion_label`, <= 60 chars) and may add details
(`occasion_note`, <= 500), e.g. a school teacher's development fee under अन्य. `occasionName(occasion, label)` returns the label when
set, else the standard Hindi name. `cleanOccasionText` clears label/note for any other occasion (the server does the same in
`validateEvent`). Recent labels appear as quick chips (`recentOccasionLabels`). Invitation types: `YELLOW_RICE` पीले चावल, `KUMKUM`
कुमकुम, `CARD` कार्ड. Event status: `PLANNED` तय हुआ, `HELD` हो गया, `SETTLED` हिसाब पूरा.

### 1.9 Legacy "पुराना हिसाब" events

Entries written before every entry needed an event are attached to an automatic event with a **deterministic id**:
mine (AAYA): `a1a1a1a1-` + `ledger_id` from char 10 (one per ledger, host = me); given (GAYA):
`b2b2b2b2-<household id chars 10-13>-<15-18>-<20-23>-<ledger id last 12>` (one per family and ledger, host = that family). The v7
migration SQL and `legacyEventId()` build the identical text, so a restore from an old cloud copy or backup maps the same way
(`ensureLegacyEvent`). They are `occasion = OTHER`, `status = SETTLED`, shown as "पुराना हिसाब" (`isLegacyEventId`).

## 2. Local SQLite schema (state after migration v7)

### 2.1 Tables

**`households`**: the family directory.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID minted on the phone |
| `head_name`, `father_name`, `jati`, `atak`, `village`, `fala` | TEXT NOT NULL | name; father's name; caste (जाति); clan (अटक); village; hamlet (फला) |
| `phone` | TEXT | optional, +91 E.164 when picked |
| `photo_uri` | TEXT | **local file only, never synced**, 512 px |
| `created_at`, `updated_at` | TEXT | ISO; `updated_at` drives last-write-wins |
| `dirty` | INTEGER default 1 | 1 = not yet pushed (v4) |
| `sync_error` | TEXT | set when the server rejected the row (v5) |

**`events`**: programs (rebuilt in v7 to widen the occasion CHECK).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | |
| `host_household_id` | TEXT FK -> households | host; decides direction |
| `occasion` | TEXT CHECK in the six values | |
| `date` | TEXT | `YYYY-MM-DD` |
| `panch_approved` | INTEGER 0/1 | flag exists in the model; no UI sets it today |
| `invitation_type` | TEXT CHECK | default chosen `YELLOW_RICE` in `events/new.tsx`, `CARD` for auto events |
| `lekhak_name` | TEXT | **unused** since Stage 3, kept to avoid a destructive migration; never synced |
| `status` | TEXT CHECK `PLANNED/HELD/SETTLED` | |
| `created_at`, `updated_at`, `dirty`, `sync_error` | | as above |
| `ledger_id` | TEXT default household ledger | v6 |
| `occasion_label`, `occasion_note` | TEXT | v7, only for `OTHER` |

**`entries`**: immutable ledger lines.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | |
| `event_id` | TEXT FK -> events | nullable in the column, **required by trigger** since v7 |
| `other_household_id` | TEXT FK -> households NOT NULL | the family on the other side |
| `direction` | TEXT CHECK `AAYA/GAYA` | derived from the host |
| `cash_paise` | INTEGER CHECK >= 0 | |
| `in_kind_item` | TEXT | e.g. "अनाज 10 किलो" |
| `in_kind_value_paise` | INTEGER default 0 CHECK >= 0 | estimated |
| `payment_mode` | TEXT CHECK `CASH/UPI` | UI offers नकद / यूपीआई; the event ledger always writes `CASH` |
| `recorded_by` | TEXT NOT NULL | my household id (or `self`) |
| `voice_note_uri` | TEXT | column exists, **unused**, never synced |
| `created_at` | TEXT | |
| `corrects_entry_id` | TEXT FK -> entries | correction/void target |
| `is_void` | INTEGER CHECK 0/1 | v3 |
| `dirty`, `sync_error` | | v4, v5 |
| `ledger_id` | TEXT default household ledger | v6 |
| `occurred_on` | TEXT NOT NULL | v7, `YYYY-MM-DD` |

Entries have **no `updated_at`** (immutable).

**`ledgers`** (v6): `id` PK, `name`, `kind` CHECK `HOUSEHOLD/PERSONAL`, `pin_hash` (local only), `created_at`, `updated_at`, `dirty`,
`sync_error`. The default row (`1970-01-01` timestamps, `dirty = 0`) is inserted by the migration and by `clearAllLocalData`.

**`settings`**: key/value (`key` PK, `value`, `updated_at`). Keys in use:

| Key | Holds |
| --- | --- |
| `my_household_id`, `village_increment` | the synced "profile" (JSON for the increment) |
| `onboarding_seen`, `signin_prompted` | first-run routing |
| `app_lock_hash`, `pin_attempts:<ledgerId>`, `pin_attempts:app` | PIN data (local only) |
| `remote_config_v1` | last good remote config (JSON) |
| `ads_interstitial_log_v1` | interstitial caps (JSON) |
| `support_queue_v1`, `support_access_v1` | offline tickets, last known grant |
| `dismissed_announcement`, `dismissed_update` | banners |
| `analytics_opt_in` | Settings switch ("0" = off) |
| `sync_applying` | transient flag while a pull page or backup is applied |

**`sync_state`** (v4, single row `id = 1`): `cursor` (last applied `server_seq`), `user_id` (the cloud account that owns this
phone's data; `NULL` = never synced), `enabled` (backup on), `last_sync_at`, `profile_dirty` (v5).

### 2.2 Views

- **`active_entries`**: `SELECT e.rowid AS rid, e.* FROM entries e WHERE is_void = 0 AND NOT EXISTS (corrector)`. Rebuilt in v3 and v6
  (so `e.*` picks up new columns) and v7.
- **`entry_settlement`** (v7): for each active entry, `val`, `net_before` (window `SUM ... OVER (PARTITION BY ledger_id,
  other_household_id ORDER BY occurred_on, created_at, rid ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)`), `utar`, `chadhav`.

### 2.3 Indexes

| Table | Indexes |
| --- | --- |
| households | `idx_households_name(head_name)`, `_village`, `_father`, `_fala`, `_phone`, partial `_dirty WHERE dirty = 1` |
| events | `idx_events_date`, `_ledger(ledger_id, date)`, `_host(host_household_id, date)`, partial `_dirty` |
| entries | `_other`, `_event`, `_created`, `_corrects`, `_other_dir(other_household_id, direction, created_at)`, `_ledger(ledger_id, created_at)`, `_ledger_occ(ledger_id, occurred_on, created_at)`, `_other_occ(other_household_id, occurred_on, created_at)`, `_event_h(event_id, other_household_id)`, partial `_dirty` |
| ledgers | partial `idx_ledgers_dirty` |

### 2.4 Triggers

| Trigger | When | Rule |
| --- | --- | --- |
| `entries_no_update` | BEFORE UPDATE | abort if any business column changes (id, event, family, direction, amounts, item, mode, recorded_by, voice uri, created_at, corrects, is_void, ledger_id, occurred_on) |
| `entries_no_delete` | BEFORE DELETE | abort (dropped and re-created only by `clearAllLocalData`) |
| `entries_void_valid` | BEFORE INSERT | a void needs a target and zero amounts |
| `entries_occurred_valid` | BEFORE INSERT | `occurred_on` must be `YYYY-MM-DD` |
| `entries_need_event` | BEFORE INSERT | `event_id` required |
| `entries_direction_rule` | BEFORE INSERT | direction must follow the host (see 1.3 for exemptions) |

### 2.5 Migration history (local)

| Ver | What changed |
| --- | --- |
| v1 | `households`, `events` (occasions SHAADI/BIMARI/MAKAAN/OTHER, `lekhak_name`), `entries`, `settings`; immutability triggers; first indexes |
| v2 | query indexes (`idx_entries_corrects`, `_other_dir`, `idx_households_village`); `active_entries` view |
| v3 | `entries.is_void` + `entries_void_valid`; `active_entries` excludes voids |
| v4 | sync bookkeeping: `dirty` on three tables (existing rows start dirty so the first sync uploads them), partial dirty indexes, `sync_state`; immutability trigger relaxed for `dirty` |
| v5 | `sync_error` on three tables; `sync_state.profile_dirty` |
| v6 | `ledgers` table + default household ledger; `ledger_id` on `entries` and `events`; indexes; trigger and view rebuilt |
| v7 | `events` rebuilt (GRIHAPRAVESH, MUNDAN; `occasion_label`, `occasion_note`); `entries.occurred_on` (backfilled from `created_at`); auto "पुराना हिसाब" events for entries without an event; triggers `entries_occurred_valid`, `entries_need_event`, `entries_direction_rule`; search indexes; view `entry_settlement` |

`migrate()` runs each version in its own transaction with `foreign_keys` OFF (v7 rebuilds a table), then back ON. **Never edit a
released migration; append a new one** (`MIGRATIONS` array, `LATEST_VERSION = length`).

## 3. Server Postgres schema

Server rows carry `user_id` first in every primary key (`PRIMARY KEY (user_id, id)`), so one user can never collide with, overwrite
or probe another's ids. Timestamps in synced tables are `text` (ISO UTC with milliseconds) so last-write-wins is a text comparison.

### 3.1 Synced tables (001-004)

| Table | Columns (beyond `user_id`, `id`) | Constraints / indexes |
| --- | --- | --- |
| `households` | `head_name, father_name, jati, atak, village, fala, phone, created_at, updated_at, server_seq` | PK `(user_id, id)`; `households_seq_idx(user_id, server_seq)` |
| `events` | `host_household_id, occasion, date, panch_approved, invitation_type, status, created_at, updated_at, server_seq` + `ledger_id` (003) + `occasion_label (<=60), occasion_note (<=500)` (004) | CHECKs on occasion (six values after 004), invitation type, status; `events_seq_idx` |
| `entries` | `event_id (nullable), other_household_id, direction, cash_paise, in_kind_item, in_kind_value_paise, payment_mode, recorded_by, created_at, corrects_entry_id, is_void, server_seq` + `ledger_id` (003) + `occurred_on` (004, regex CHECK) | CHECKs: direction, `>= 0` amounts, payment mode; `entries_seq_idx`, `entries_occurred_idx(user_id, ledger_id, occurred_on)` |
| `ledgers` (003) | `name, kind, created_at, updated_at, server_seq` | CHECK kind; `ledgers_seq_idx` |
| `profiles` | PK `user_id`: `my_household_id, increment (jsonb), updated_at, server_seq` + staff `role user_role default 'user'`, `display_name`, `created_at` (100) | one row per user; **role-only rows have `server_seq = 0`** so the app never pulls them |
| sequence `sync_seq` | global; `nextval` re-assigned on every insert/update | the pull cursor |

Not stored on the server: `photo_uri`, `voice_note_uri`, `lekhak_name`, PINs, `pin_hash`, `dirty`, `sync_error`.

### 3.2 Identity tables (001, 100)

`users` (`id`, `google_sub` unique, `phone_e164` unique, `display_name`, `created_at`; 100 adds `email`, `signup_method`, `status`
active/suspended, `suspended_at`, `suspended_reason`), `refresh_tokens`, `otp_requests`. **Sign-in is moving to Better Auth on Neon**
(see [DECISIONS.md](DECISIONS.md) ADR-021 and `docs/AUTH.md`); these three tables belong to the custom implementation being replaced, so
their internals are intentionally not documented here. Whatever replaces them, the `users` id remains the `user_id` of every synced row,
and `users.status` / `profiles.role` remain the database authority for suspension and staff roles.

### 3.3 Admin, support, config, monitoring tables (100)

| Table | Purpose | Notes |
| --- | --- | --- |
| `user_devices` | platform, app/OS version, `first_seen`, `last_seen`, `last_sync_at` | PK `(user_id, platform)`; from `X-App-Version`/`X-Platform`/`X-OS-Version` |
| `user_activity_daily` | one row per user per UTC day: `sync_requests`, `sync_errors` | source for DAU/WAU/MAU and retention |
| `admin_audit_log` | every admin mutation, unmask, consented read: `admin_user_id` (no FK), `admin_label`, `admin_role`, `action`, target, `reason`, `ip`, `before_meta`, `after_meta` | append-only for the app role |
| `user_notes` | internal notes per user | staff only |
| `app_config`, `config_history` | remote config values and before/after history | keys in `server/src/appconfig.ts` |
| `support_tickets`, `ticket_notes` | tickets (channel app/email/phone/web/other; category grievance/bug/feedback/deletion/other; status; priority; `due_at` = created + 30 days for grievances), notes/replies | `user_id` ON DELETE SET NULL (tickets outlive the account) |
| `blocklist` | phone/IP blocks, optional expiry | unique `(kind, value)` |
| `otp_events` | durable OTP activity (send, send_fail, verify_ok, verify_fail, blocked) | purged after 90 days |
| `error_log` | one row per (fingerprint, minute): method, normalised path, status, error class/code, scrubbed message, `occurrences` | purged after 30 days; no bodies, no user ids |
| `daily_stats` | long format `(day, metric, dim, value, users)`; `users < 5` suppressed when shown | filled only by `analytics.rollup_internal` |
| `support_access_grants` | user-created read-only windows; `CHECK expires_at <= granted_at + 7 days` | revocable |
| `account_deletions` | counter (`source` self/admin), no user id | |
| type `user_role` | enum `user, viewer, support, admin, owner` | |
| `schema_migrations` | applied file names | created by `scripts/migrate.mjs`; revoked from the runtime role |

### 3.4 RLS, roles, functions (101, 102)

Summarised here; full model in [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md).

- Roles `notra_app` (NOLOGIN group the runtime LOGIN role belongs to) and `notra_system` (NOLOGIN, owns the `SECURITY DEFINER` functions).
- `ENABLE` + `FORCE ROW LEVEL SECURITY` on `users, households, events, entries, ledgers, profiles, user_devices, user_activity_daily,
  refresh_tokens, support_tickets, ticket_notes, user_notes, support_access_grants`.
- Helper functions `app_user()`, `app_role()`, `app_role_rank()`, `app_require_role()`, `app_sees_meta()`, `app_is_staff()`,
  `app_has_grant()`; sign-in/staff functions `auth_state`, `auth_find_or_create_user`, `auth_identity_owner`, `auth_refresh_lookup`,
  `auth_revoke_family`, `admin_user_counts`, `admin_set_user_status`, `admin_force_signout`, `admin_delete_user`, `staff_list`,
  `staff_set_role`, `admin_migration_version`.
- Schema `analytics` (102): `k()` = 5, view `effective_entries` (not voided, not superseded), functions `events_per_month`,
  `events_by_occasion`, `entries_per_event`, `amount_buckets`, `entry_mix`, `region_distribution`, `retention`, `app_versions`,
  `rollup_internal`, `rollup_day`, `refresh_today`, `purge_old`.

### 3.5 Server migration history

| File | What changed |
| --- | --- |
| `001_auth.sql` | `users`, `otp_requests`, `refresh_tokens` (identity) |
| `002_sync.sql` | `sync_seq`, `households`, `events`, `entries` with CHECKs and per-user seq indexes |
| `003_profile_ledgers_account.sql` | `ledger_id` on events/entries (default = household ledger id), `ledgers`, `profiles` |
| `004_stage7.sql` | six-value occasion CHECK, `occasion_label/note`, `entries.occurred_on` (backfilled from `created_at`, NOT NULL, regex CHECK) |
| `100_admin.sql` | user metadata + status, `user_devices`, `user_activity_daily`, role enum + `profiles.role`, audit log, notes, remote config, tickets, blocklist, `otp_events`, `error_log`, `daily_stats`, support grants, `account_deletions` |
| `101_rls.sql` | roles, privileges, column-level grants, RLS policies on all user-data tables, `SECURITY DEFINER` functions |
| `102_analytics.sql` | `analytics` schema: k-anonymous aggregate functions, rollup, purge |
| `103_better_auth.sql` | **in progress (uncommitted at time of writing)**: Better Auth tables on Neon; documented in `docs/AUTH.md`, not here |

Numbers 100+ never collide with synced-data migrations 004+. `scripts/migrate.mjs` applies files in name order, each once, in a
transaction, and records them in `schema_migrations`.

## 4. Local to server column map

| Local (snake_case) | Wire (camelCase) | Server |
| --- | --- | --- |
| `households.*` minus `photo_uri`, `dirty`, `sync_error` | `headName, fatherName, jati, atak, village, fala, phone, createdAt, updatedAt` | same names |
| `events.*` minus `lekhak_name`, flags | `hostHouseholdId, occasion, date, panchApproved, invitationType, status, ledgerId, occasionLabel, occasionNote` | same |
| `entries.*` minus `voice_note_uri`, flags | `eventId, otherHouseholdId, direction, cashPaise, inKindItem, inKindValuePaise, paymentMode, recordedBy, createdAt, occurredOn, correctsEntryId, isVoid, ledgerId` | same |
| `settings.my_household_id` + `village_increment` | `profile {myHouseholdId, increment, updatedAt}` | `profiles` |
| `ledgers` minus `pin_hash` | `id, name, kind, createdAt, updatedAt` | `ledgers` |

Pull returns `cash_paise` as `float8` and the client `Number()`s it; integers below 2^53 are exact (cap is 1e12).
