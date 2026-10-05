# Ads (Google AdMob) and remote config

Library: `react-native-google-mobile-ads` (Expo config plugin, in `app.json`). Code: `src/ads/`. Remote switches: `GET /v1/config` -> `ads.*` (`src/remote/`).

## Ids: test by default

* `app.json` holds Google's official TEST app id. Source code holds only Google's TEST unit ids (`src/ads/units.ts`).
* `app.config.js` swaps in real ids only when all five variables are set **and** `NOTRA_ADS_TEST` is not `1`:
  `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID`, `EXPO_PUBLIC_ADMOB_BANNER_ID`, `EXPO_PUBLIC_ADMOB_NATIVE_ID`, `EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID`, `EXPO_PUBLIC_ADMOB_REWARDED_ID`.
* Test ids are always used when `__DEV__`, when `NOTRA_ADS_TEST=1` (CI and e2e builds set it), or when any real id is missing.
* `NOTRA_ADS_E2E=1` (test builds only) pretends the install is 2 days old so Maestro sees banners; full-screen ads are off in that build.
* Release workflow: add the five values as GitHub secrets `ADMOB_ANDROID_APP_ID`, `ADMOB_BANNER_ID`, `ADMOB_NATIVE_ID`, `ADMOB_INTERSTITIAL_ID`, `ADMOB_REWARDED_ID`; they are used only for a properly signed build.

## What the user must provide

AdMob app id (Android) + 4 ad unit ids: Adaptive banner, Native advanced, Interstitial, Rewarded.

## Behaviour

* SDK is armed ~3 s after the first render (after interactions) and initialised only when a screen that may show an ad asks. Offline or failed: nothing renders and no space is reserved (a banner is laid out invisible and absolute until it loads).
* Requests: `maxAdContentRating` PG, not child-directed, not under-age; no keywords, no content URL, nothing from the ledger. Non-personalised until consent is resolved. Google UMP (`AdsConsent`) shows a form only where required; Settings shows "विज्ञापन गोपनीयता विकल्प" only if a privacy-options form exists.
* The single decision point is `adDecision` in `src/ads/policy.ts` (pure, tested).

### Placements

| # | Placement | Where | Notes |
| --- | --- | --- | --- |
| 1 | Adaptive anchored banner (`testID ad-banner`) | just above the tab bar on घर and हिसाब hub | rendered by `BottomTabs`; nowhere else |
| 2 | Native card, label "विज्ञापन", haldi tint | मेरा नोतरा, दूसरों का नोतरा, report lists | every N items (default 8), never first, never in lists < 6 items, max 3 per list |
| 3 | Interstitial | only after a report PDF/photo share completes | min interval 300 s, max 3/day, never first 24 h, never within 2 min of a save |
| 4 | Rewarded (opt-in) | image export of 2+ pages | default footer "Notra Book"; one rewarded ad removes it for that export. Offer is a choice; failure just sends with the footer |

Never any ad on: event ledger screens, entry/edit forms, keypad, PIN/lock, onboarding, sign-in/OTP, settings, legal, backup, account deletion, error screens.

### Policy rules (reason names)

`not-ready`, `disabled` (ads.enabled), `placement-off` (ads.banner/native/interstitial/rewarded), `offline`, `screen` (allow-list per placement), `first-day` (first 24 h: banner/native/rewarded when `first_day_ads_free`; interstitial always), `data-entry`, `interval`, `daily-cap`, `too-few-items`, `first-item`.

## AdMob console: block these categories

Gambling & betting, Dating, Get rich quick, Cryptocurrency, Personal loans / financial services, Alcohol, Sexual content, Politics. (Blocking controls -> General categories / Sensitive categories.) Also keep ad content rating at PG or lower in the app (done in code).

## Remote config shape (`GET {apiUrl}/v1/config`)

```
{ maintenance:{enabled,message_hi}, min_supported_version, latest_version, force_update_message_hi,
  announcement:{enabled,message_hi,starts_at,ends_at,level: info|warning|critical},
  ads:{enabled,banner,native,interstitial,rewarded,interstitial_min_interval_sec,native_every_n_items,first_day_ads_free},
  features:{web_app,ocr,invitation_cards} }
```

Validated field by field (`src/remote/config.ts`), unknown fields dropped, defaults baked in, last good copy cached in SQLite settings (`remote_config_v1`), fetched on start and on foreground at most every 5 min. A missing endpoint (404) or no network changes nothing. Every API call carries `X-App-Version`, `X-Platform`, `X-OS-Version`.

* maintenance: Hindi banner on घर and Settings, **sync pauses only**; the diary works.
* below `min_supported_version`: full-screen "अपडेट करें" (Play Store) plus "बैकअप फ़ाइल बनाएं" (the overlay steps aside on `/backup`), so data is never trapped. Below `latest_version`: dismissible banner on घर.
* announcement: dismissible banner on घर inside its window.
* 403 suspended (`error` containing "suspend", or `suspended:true`): server's `message_hi` shown, sync stops for the session, local use continues.
* `features.ocr` only changes the look of the "फ़ोटो से हिसाब" card (it still says "यह सुविधा जल्द आएगी").

## Support endpoints used by the app

`POST /v1/support` (offline queue, idempotent `client_id`), `GET/POST/DELETE /v1/support/access` (`days` 1, 3 or 7; response `expires_at`). A 404 shows "यह सुविधा जल्द आएगी".
