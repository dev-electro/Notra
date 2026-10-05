# Modules plan: रिश्ते and इनाम

Both are tabs of the super-app (`src/modules/registry.ts`). Each phase ships behind a flag (`src/features.ts` default, plus the server's `features.<flag>` in remote config, switchable from the admin panel without a release).

## रिश्ते (find a match inside the community)

| Phase | What | State |
| --- | --- | --- |
| 1. Local biodata | Build a biodata on the phone and share it as a picture or PDF. Nothing is uploaded. | Done (`rishtey` flag, on) |
| 2. Community discovery | Opt-in public profile, moderated, search, interests, contact only after both sides agree. | Built, **flag `rishteyDiscovery` OFF** (legal review pending) |
| 3. Verification, photos, DPDP consent, legal | Photo upload with moderation, identity / family verification, formal consent records and notices, legal sign-off, then switch discovery on. | Not started |

### Phase 2 in one page

Flag: `FEATURES.rishteyDiscovery` (app) and `features.rishtey_discovery` (server remote config). Both default false. With the server flag off every `/v1/rishtey/*` call answers 404. The app shows nothing unless the flag is on AND the person is signed in.

Privacy by default (enforced in Postgres, migration `105_rishtey.sql`, not only in code):

- **Own profile only.** `rishtey_profiles` has RLS: a user sees and writes only their own row. Staff have no table policy at all.
- **Public fields only.** Other people reach profiles only through `SECURITY DEFINER` functions that return: first name, age (a number, never a date of birth), gender, height, gotra, education, occupation, district, state, and who published it (self / parent / guardian / sibling). The account id is never returned; profiles are addressed by a separate random id.
- **Contact is private.** `contact` is returned to nobody except its owner, and to the other person only when an interest between them was accepted, both profiles are approved and nobody blocked anybody (`rishtey_contact`).
- **Moderated.** A user can only move a profile to draft, pending or hidden (trigger `rishtey_guard_status`). Approved / rejected are set by `admin_rishtey_review` (support role and up), which records the reviewer and a reason. Editing the public details of an approved profile sends it back to pending.
- **Verified phone to publish.** Publishing needs `users.phone_verified` (phone OTP sign-in) and an explicit consent tick that lists exactly what becomes public.
- **Anti-abuse.** 10 interests per rolling 24 hours per sender (server side). A declined interest is never shown to the sender (it keeps reading "sent"). Block hides both people from each other. Three different reporters hide a profile until staff look. You can search only once your own profile is approved.
- **Search.** Seeking gender, age range, district, state; same gotra excluded unless asked; paginated; blocked people excluded.
- **Delete.** "Hide" is instant; "delete forever" hard-deletes the profile and every interest; deleting the account removes all रिश्ते rows.

Admin: Rishtey moderation page (permission `moderate_rishtey`, support and up) with the pending queue, approve / reject with a reason, and the reports list (dismiss, or hide the profile). Staff see profiles only there, public details only; every queue view and decision is in the audit log.

App: रिश्ते tab, under the biodata, "समाज में दिखाएँ" (prefilled from the local biodata) -> `src/app/rishtey/share.tsx`; search `src/app/rishtey/search.tsx`; profile `src/app/rishtey/[id].tsx`; inbox `src/app/rishtey/interests.tsx`. Initials avatar only, no photos yet.

### Before switching phase 2 on (blockers, owned by legal / product)

1. Legal review of the consent text, the grievance flow and the "published by a parent / guardian" case (the profile may be about someone else).
2. Privacy policy and `docs/SECURITY_PRIVACY.md` updated for community profiles; DPDP notice and data-retention rule for inactive profiles.
3. A named moderation owner and a response time for the queue and reports.
4. Decide minors policy (the app enforces 18+ by age only; phase 3 adds verification).

### Phase 3 outline

- Photo upload (private bucket, moderation before it is shown, blur until interest is accepted).
- Verification: phone (done in phase 2), plus family / identity checks; a "verified" mark.
- DPDP: versioned consent records with timestamps, withdrawal flow, data export, retention and auto-hide of stale profiles.
- Legal sign-off recorded in `docs/DECISIONS.md`, then flip the flag (server first, then the app default).

## इनाम (rewards)

| Phase | What | State |
| --- | --- | --- |
| 1. Local | इनाम tab on the phone: points as a simple achievement score, no money. | Done |
| 2. Check-in and server ledger | Daily check-in; the server keeps the ledger, decides the day and enforces every cap, so the phone cannot invent points. | In progress (migration 104, `/v1/rewards`) |
| 3. Videos and referral | Rewarded videos (daily cap, gated by the ads config) and referral bonuses with abuse limits. | Planned |
| 4. Redemption | Turning points into anything of value (recharge, vouchers, cash-out). **Pending revenue** (it must be funded by real ad / partner income) and **terms** (rules, taxes, eligibility, fraud policy, legal review). Until then points have no cash value and the app says so. | Blocked on revenue and terms |

Rules that hold in every phase: points are never described as money before phase 4; every grant is a server-side ledger row; caps and the day boundary live on the server; the phone only displays.
