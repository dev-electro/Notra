# Documentation index

Notra Book (नोतरा बुक, `app.notra.book`): an offline-first Android ledger for the Notra custom, with an optional cloud copy, a staff admin panel and
a Cloudflare Worker backend. Repository root: [README.md](../README.md).

## Start here (new developer path)

1. [README.md](../README.md): what the product is, stack, folder layout, stage-by-stage notes.
2. [ARCHITECTURE.md](ARCHITECTURE.md): the system on one page (diagram), module maps, runtime flows.
3. [DATA_MODEL.md](DATA_MODEL.md): tables and the domain rules you must not break (paise, append-only, direction from host, उतार/चढ़ाव).
4. [GLOSSARY.md](GLOSSARY.md): the Hindi vocabulary, so the code and screens make sense.
5. [DEVELOPMENT.md](DEVELOPMENT.md): set up the machine, run the tests, conventions, "how to add X" recipes.
6. [SYNC.md](SYNC.md) and [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md): read before touching sync, the Worker or anything with user data.
7. [CI_CD.md](CI_CD.md): how builds, tests, releases and deploys run.
8. [DECISIONS.md](DECISIONS.md): why things are the way they are (read before proposing to change one).
9. When you are about to ship: [DEPLOYMENT.md](DEPLOYMENT.md), [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md), [RELEASE.md](RELEASE.md), [PLAY_STORE.md](PLAY_STORE.md).
10. [ROADMAP.md](ROADMAP.md): what is done, what is next, and the known defects to fix first.

Suggested first day: run `npm ci && npm test` (root) and `cd server && npm ci && npm test`; read items 2-4; install the latest `test-<branch>` APK
from GitHub Releases on a phone; add a household and an entry in both worlds.

## All documents

### Guides and reference (written for developers)

| Document | What it covers |
| --- | --- |
| [INDEX.md](INDEX.md) | this map |
| [ARCHITECTURE.md](ARCHITECTURE.md) | system diagram, `src/`, `server/src`, `admin/src` modules, startup / entry / sync / sign-in / config / ads flows |
| [DATA_MODEL.md](DATA_MODEL.md) | every local and server table, index, trigger, view; migration history; domain rules and worked examples |
| [SYNC.md](SYNC.md) | dirty flags, push/pull, per-row rejections, cursors, LWW, restore, account switching, debugging |
| [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md) | threat model, encryption, backup crypto, RLS, support access, k-anonymity, permissions, DPDP/Play, secrets |
| [DEVELOPMENT.md](DEVELOPMENT.md) | local setup (Mac M1 8 GB), phones and emulators, scripts, conventions, add-a-screen/migration/report/config/event/occasion, pitfalls |
| [CI_CD.md](CI_CD.md) | the five workflows, caches, artifacts, secrets, debugging, cutting a release |
| [DEPLOYMENT.md](DEPLOYMENT.md) | production setup in order: Neon/Supabase, Cloudflare, Worker secrets, domains, Google, SMS, AdMob, Firebase, Play, bootstrap, smoke tests (owner vs developer) |
| [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) | readiness grouped by area with honest status marks |
| [DECISIONS.md](DECISIONS.md) | ADR-style decision log |
| [ROADMAP.md](ROADMAP.md) | done / next / known limitations with file paths / priorities |
| [GLOSSARY.md](GLOSSARY.md) | Hindi and Wagdi terms: meaning and where used |

### Pre-existing documents

| Document | What it covers |
| --- | --- |
| [ADMIN.md](ADMIN.md) | staff panel: roles and permission matrix, RLS model, consented access, analytics, endpoints, remote-config keys, tickets and DPDP SLA, runbooks (section 9 is stale, see ROADMAP) |
| [ADS.md](ADS.md) | AdMob: id handling (test by default), placements, policy rules, UMP, Firebase link, remote config shape, support endpoints (the support contract text conflicts with the code) |
| [PLAY_STORE.md](PLAY_STORE.md) | Play listing answers: public URLs, Data Safety tables, permissions, content rating, declarations |
| [RELEASE.md](RELEASE.md) | upload keystore, GitHub secrets, Play Console setup, tag-based release, versionCode, troubleshooting |
| [TESTING.md](TESTING.md) | Maestro E2E: installing, phone vs emulator, writing flows (flow list is outdated; `.maestro/config.yaml` is the truth) |

### Written by other work in progress

| Document | Status |
| --- | --- |
| `docs/AUTH.md` | authentication: self-hosted Better Auth in the Worker on Neon (research and decision, identity mapping, RLS, flows with diagrams, endpoints, configuration, the Neon / Google / MSG91 steps) |

## Where things live (quick lookup)

| I need to... | Go to |
| --- | --- |
| understand a money rule | `src/core/*.ts` then [DATA_MODEL.md](DATA_MODEL.md) section 1 |
| change the schema | [DEVELOPMENT.md](DEVELOPMENT.md) 5.2 |
| see what the server accepts | `server/src/validate.ts`, [SYNC.md](SYNC.md) |
| change who can see what | `server/migrations/101_rls.sql`, [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md) |
| add an ad placement | `src/ads/policy.ts`, [ADS.md](ADS.md) |
| add an analytics event | `src/analytics/events.ts`, [DEVELOPMENT.md](DEVELOPMENT.md) 5.5 |
| ship a build | [CI_CD.md](CI_CD.md) section 5 |
| run the product for real | [DEPLOYMENT.md](DEPLOYMENT.md) |
| triage a production issue | [ADMIN.md](ADMIN.md) section 7, [SYNC.md](SYNC.md) section 9 |
