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
| Does the app collect or share user data? | Collects: yes (optional cloud backup, diagnostics, advertising ID). Shares: **yes, only** the advertising ID / device info with Google AdMob for advertising. Nothing the user typed is shared. |
| Is all data encrypted in transit? | Yes (HTTPS). |
| Can users request data deletion? | Yes: in app (Settings > खाता हटाएं) and by web page/email. |
| Data not collected | Contacts (the app has no contacts permission; a single number the user picks or types is stored locally and synced only as part of the user's own diary data), SMS, call log, location, health, payment info, web history, audio/voice recordings (not stored), crash logs. |

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

Additional types for the ads and the admin tools (all **not** linked to the diary content):

| Type | Collected / shared | Purpose |
| --- | --- | --- |
| Device or other IDs (advertising ID) | collected and **shared with Google AdMob** | Advertising or marketing (also Analytics by Google if asked). Optional: users can reset or delete the ad ID in system settings; EEA consent through Google UMP |
| App activity / App info and performance (app version, platform, OS version, last backup time, in-app activity counts) | collected, **not shared**, only when signed in (headers X-App-Version, X-Platform, X-OS-Version also go to our own server on every call) | Analytics, App functionality. Staff see per-account basics and only combined statistics (groups under 5 users hidden); diary content readable by support only for 1/3/7 days after the user turns on "सहायता को मेरा डेटा दिखाएं", every access logged |
| Support messages (text the user writes in शिकायत / सुझाव) | collected, not shared | Customer support |

Security practices to tick: data encrypted in transit; users can request deletion. Do **not** claim "data encrypted at rest"
for the server copy unless your database provider's setting is verified. On the phone the database is SQLCipher-encrypted.

Third-party services to disclose in the privacy text (already there): Google Sign-In, an SMS provider (MSG91), Cloudflare Workers,
the Postgres host (Neon/Supabase), Google AdMob (ads). No third-party analytics SDK, no crash SDK.

## Permissions (declared in `app.json`)

`RECORD_AUDIO` (speak to write, only on tap), `CAMERA` (family photo, only on tap). `com.google.android.gms.permission.AD_ID` is added by the AdMob SDK (declare "advertising ID" use in Play Console, purpose: advertising). Explicitly **blocked**: contacts, SMS, call log,
external storage, media, system alert window. Declare no sensitive-permission use beyond microphone/camera.

## Content rating (IARC questionnaire)

Utility / reference record-keeping app with ads (PG content; sensitive ad categories blocked in AdMob). No violence, sexual content, profanity, drugs, gambling, user-generated content shared
between users, location sharing or purchases. Mentions money only as the user's own record of gifts. Expected rating: **Everyone**.
Target audience: adults (not designed for children; privacy text says under 18 is not targeted). Not a "Finance" app in the lending
sense: the app lends nothing and moves no money (no loans yet; if loans are ever added, redo the Finance declarations and the policy).

## Other declarations

- Ads: **Yes** (Google AdMob; see docs/ADS.md). In-app purchases: **No**. Target audience: not children (ads are rated PG, not child-directed).
- App access: no login needed (sign-in is optional); no reviewer credentials required.
- Government app: no. Health/financial features: "My app does not provide financial services" (record keeping only).
- Release signing and AAB: see `docs/RELEASE.md`.
