# Play Store listing notes

Answers below describe what the app does TODAY. If you add an SDK, permission or data flow, update this file, the in-app
legal text and the Play Data Safety form together (`src/legal/content.ts` is the single source for the legal text).

## Required public URLs (served by the Worker)

| Play field | URL |
| --- | --- |
| Privacy policy | `https://<worker-host>/privacy` |
| Terms (optional field / store description) | `https://<worker-host>/terms` |
| Account deletion URL (Data Safety > "Delete account URL") | `https://<worker-host>/delete-account` |
| Grievance officer (DPDP) | `https://<worker-host>/grievance` |

Before release replace the placeholders in `src/legal/content.ts` (`CONTACT`: operator, officer name, email, phone, address; email
is `grievance@notra-diary.example` now) and redeploy the Worker. Also check your hosting providers' backup retention and add a
sentence to the privacy text if deleted data lingers in provider backups.

## Data Safety form

Data is **collected** only if the person signs in and keeps cloud backup on. Everything else stays on the phone.

| Question | Answer |
| --- | --- |
| Does the app collect or share user data? | Collects: yes (optional cloud backup). Shares: **no** (service providers acting for us are not "sharing"). |
| Is all data encrypted in transit? | Yes (HTTPS). |
| Can users request data deletion? | Yes: in app (Settings > खाता हटाएं) and by web page/email. |
| Data not collected | Contacts, SMS, call log, location, health, financial/payment info, web history, device or other IDs, audio/voice recordings (not stored), crash logs, diagnostics. |

Data types collected (all **optional**, **not shared**, purpose: **App functionality / Account management**):

| Type | Why | Notes |
| --- | --- | --- |
| Name (Google display name) | account label | only with Google sign-in |
| Phone number | sign-in by OTP | only with mobile sign-in; sent to the SMS provider to deliver the code |
| User IDs (Google subject / internal user id) | account | |
| Personal info typed by the user: names of other families, father's name, jati, atak, village, fala, optional phone | the diary itself (cloud copy) | stored on the server, not end-to-end encrypted |
| Financial info typed by the user: gift amounts, goods, dates | the diary itself | user-entered records; the app moves no money (select "Other financial info" if Play asks) |
| Photos | **not collected** (kept on the phone only) | |
| Audio | **not collected** (speech recognition by the phone's service; app stores nothing) | |

Security practices to tick: data encrypted in transit; users can request deletion. Do **not** claim "data encrypted at rest"
for the server copy unless your database provider's setting is verified. On the phone the database is SQLCipher-encrypted.

Third-party services to disclose in the privacy text (already there): Google Sign-In, an SMS provider (MSG91), Cloudflare Workers,
the Postgres host (Neon/Supabase). No ads, no analytics, no crash SDK.

## Permissions (declared in `app.json`)

`RECORD_AUDIO` (speak to write, only on tap), `CAMERA` (family photo, only on tap). Explicitly **blocked**: contacts, SMS, call log,
external storage, media, system alert window. Declare no sensitive-permission use beyond microphone/camera.

## Content rating (IARC questionnaire)

Utility / reference record-keeping app. No violence, sexual content, profanity, drugs, gambling, user-generated content shared
between users, location sharing or purchases. Mentions money only as the user's own record of gifts. Expected rating: **Everyone**.
Target audience: adults (not designed for children; privacy text says under 18 is not targeted). Not a "Finance" app in the lending
sense: the app lends nothing and moves no money (no loans yet; if loans are ever added, redo the Finance declarations and the policy).

## Other declarations

- Ads: **No**. In-app purchases: **No**.
- App access: no login needed (sign-in is optional); no reviewer credentials required.
- Government app: no. Health/financial features: "My app does not provide financial services" (record keeping only).
- Release signing and AAB: see `docs/RELEASE.md`.
