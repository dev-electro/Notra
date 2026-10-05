# Glossary

Hindi (and Wagdi/Bhili-area) terms used in the app, code and docs, with the meaning and where each appears. Spelling matters: always
**नोतरा**, never "नाता" (a different custom with negative associations). Copy rules: [DEVELOPMENT.md](DEVELOPMENT.md) 4.2.

## Core custom

| Term | Meaning | Where it appears |
| --- | --- | --- |
| नोतरा (Notra) | Southern-Rajasthan custom of interest-free, document-free reciprocal gifting/lending among families at occasions; each return is expected to be a little more than what was received | product name; `core/types.ts` `NotraEvent`; all screens |
| नोतरा बुक (Notra Book) | the app's name (the family's diary of Notra); package `app.notra.book` | `app.json`, onboarding, lock screen, report header; internal storage names remain `notra-diary` |
| बही (bahi) | the traditional account book or diary; the paper diary this app replaces | product plan; PDF title "नोतरा बही" (`services/export.ts`); diary-paper look in `exportHtml.ts` |
| लेना-देना (lena-dena) | taking and giving; the relationship balance between two households | `households/[id].tsx` ("लेना-देना" PDF), plan, README |
| हिसाब (hisaab) | account / calculation / reckoning; used for reports and the "diary" itself | segment हिसाब (`features/notra/HisabPane.tsx`), "पुराना हिसाब", `components/icons.tsx` `hisaab` |
| खाता (khata) | ledger / account; the page where a host records guests, and also a ledger of the app | "खाता खोलें" (`events/[id]/ledger.tsx`), "घर का खाता" (`DEFAULT_LEDGER_NAME`), `src/app/ledgers.tsx`, "मेरा खाता (क्रम से)" report |
| पुराना हिसाब | previous/old records copied from the paper diary, with past dates | `src/app/old.tsx`; automatic legacy events `core/eventRules.ts` `LEGACY_EVENT_LABEL` |
| कार्यक्रम (karyakram) | a program/event (wedding etc.) at which Notra is given | `events/*`, `events` table, "कार्यक्रम" tile |

## Direction and settlement

| Term | Meaning | Where |
| --- | --- | --- |
| आया / मिला | came / received: money or goods **received** by my household (`direction = 'AAYA'`); indigo colour, down arrow | `core/types.ts` `Direction`, `components/direction.tsx`, "कुल मिला" |
| गया / दिया | went / given: **given** by me at another family's program (`direction = 'GAYA'`); kumkum colour, up arrow | same, "कुल दिया" |
| कौन आया | who came; recording guests at my own program | `entry/new.tsx` title, "+ कौन आया" |
| कौन नहीं आया | who did not come: families I had given to who have no entry at my program (private report) | `reports/notcome.tsx`, `db/reports.ts` `sqlNotCome` |
| उतार (utar) | the part of a gift that **pays off** what was owed to that family (settles the balance) | `core/settlement.ts`, view `entry_settlement`, read-back "इसमें ₹501 उतार" |
| चढ़ाव (chadhav) | the **remainder**: the new amount that the other side will owe back; "the rise" | same |
| शगुन (shagun) | auspicious gift amount; amounts end in **1** (101, 251, 501, 1001, 551) | `core/money.ts` `roundUpToShagun`, `SHAGUN_QUICK_RUPEES`, quick chips |
| लौटाना बाकी | "yet to return": families I have received more from than I gave; deliberately neutral wording (never "defaulter") | `reports/pending.tsx`, `core/reports.ts` `pendingReturns`, `sqlPersonRange` |
| सुझाव (sujhav) | suggestion: the suggested amount to return (last received + increment, rounded up to a shagun number) | chip in `entry/new.tsx`, `core/explain.ts`, `suggestReturn` |
| कितना ज़्यादा (increment) | how much more than received people return in a village: FIXED Rs 51/101 or 10% | `setup.tsx` choices, `village_increment` setting |
| मेरा नोतरा | my own program (I am the host): I only receive | segment `features/notra/MeraPane.tsx` |
| दूसरों का नोतरा | other families' programs: I only give | segment `features/notra/DoosrePane.tsx`, `others/new.tsx` |
| नए नोतरे में गए | "went to a new Notra": record that I attended another family's program | `others/new.tsx` |
| वापस | back (navigation button) and "undo last entry" (appends a void) | `components/screen.tsx`, `events/[id]/ledger.tsx` |
| बदलें | change: correct an entry (new entry that supersedes the old) | `entry/new.tsx` `btn-change` |
| पूरा करें | finish: marks the program `HELD` and shows the summary | event ledger |

## Families and places

| Term | Meaning | Where |
| --- | --- | --- |
| परिवार (parivar) | household/family; the unit of the ledger (account is a household, not a person) | `households` table, `households/*` |
| मुखिया / नाम | head of the household / name | `head_name` |
| पिता का नाम | father's name; disambiguates same-name people | `father_name`, search, report columns |
| जाति (jati) | caste/community group | `households.jati`, setup form |
| अटक (atak) | clan / sub-clan surname (gotra-like) used to tell families apart | `households.atak`, setup form |
| गाँव (gaon) | village | `households.village`, search, reports |
| फला (fala) | hamlet or cluster of houses within a village (Bhil settlement unit) | `households.fala`, search |
| पंच (panch) | village council elder who fixes the date of a Notra so two do not clash | `events.panch_approved` ("panch approved" flag; no UI yet), plan: village calendar |
| लेखक (lekhak) | **removed.** A scribe who records amounts for the whole event. The product plan proposed a "Lekhak mode"; the host now records his own guests (ADR-007) | `events.lekhak_name` (unused column), history in README, `docs/DECISIONS.md` |
| भील (Bhil) | the Scheduled Tribe community of southern Rajasthan; primary users along with Meena, Damor, Garasia | product plan, test data |
| वागड़ी (Wagdi/Vagri) | the local language of the Banswara/Dungarpur belt; UI is Hindi today, Wagdi voice/labels planned | ROADMAP |

## Occasions and invitations

| Term | Meaning | Code |
| --- | --- | --- |
| शादी | wedding | `SHAADI` |
| गृहप्रवेश | house-warming | `GRIHAPRAVESH` |
| मुंडन संस्कार | child's first head-shaving ceremony | `MUNDAN` |
| बीमारी | illness (help towards treatment costs) | `BIMARI` |
| मकान | house construction | `MAKAAN` |
| अन्य | other: the person gives it a custom name and details (e.g. "नामकरण"); the label is `occasion_label`, details `occasion_note` | `OTHER` |
| मृत्यु भोज | death feast: deliberately **not** an occasion | none |
| पीले चावल | yellow rice, the traditional wedding invitation | `YELLOW_RICE` |
| कुमकुम | kumkum (red powder), invitation for other needs | `KUMKUM` |
| कार्ड | printed card | `CARD` |
| तय हुआ / हो गया / हिसाब पूरा | status: planned / held / settled | `PLANNED` / `HELD` / `SETTLED` (`STATUS_LABEL`) |

## Goods and payment

| Term | Meaning | Code |
| --- | --- | --- |
| सामान (saaman) | goods (in-kind gift) counted at an **estimated value** | `in_kind_item`, `in_kind_value_paise` |
| अनाज, घी, बकरी, बर्तन | grain, ghee, goat, utensils (quick kinds) | `IN_KIND_KINDS` |
| नकद / यूपीआई | cash / UPI | `payment_mode` `CASH` / `UPI` |
| पैसे (paise) | 1/100 rupee; the stored money unit | `*_paise` |

## App UI terms

| Term | Meaning | Where |
| --- | --- | --- |
| घर | home tab | `(tabs)/index.tsx` |
| बाद में | "later": skip sign-in (the app works offline) | `signin.tsx`, Maestro subflow `skip-signin.yaml` |
| छोड़ें | skip (onboarding cards) | `onboarding.tsx` |
| बैकअप | backup; the word used instead of "sync" | Settings, `backup.tsx` |
| बैकअप फ़ाइल | password-locked file created without an account | `backup.tsx` |
| भेजना बाकी | "waiting to be sent" count of dirty rows | Settings (`pendingCount`) |
| खाता हटाएं | delete account (type `हटाएं` to confirm) | `account-delete.tsx`, `core/accountDelete.ts` |
| पिन / ऐप का ताला | PIN / app lock | `app-lock.tsx`, `ledgers.tsx`, `core/pin.ts` |
| निजी खाता | personal ledger of a family member | `ledgers.tsx` |
| सहायता को मेरा डेटा दिखाएं | let support see my data read-only for a few days | `support-access.tsx` |
| शिकायत / सुझाव | complaint / suggestion (support form) | `support.tsx` |
| शिकायत अधिकारी | grievance officer (DPDP) | `legal/[id].tsx`, `/grievance` |
| विज्ञापन | advertisement; label on native ad cards | `ads/NativeAdCard.tsx` |
| कुल मिला / कुल दिया | total received / total given | home summary, हिसाब tab |
| तोरण (toran) | decorative door garland motif at the top of home | `components/motifs.tsx` |
| पिथोरा (Pithora) | Bhil wall-painting style that inspires the dot border and motifs | design (ADR-012) |
| हल्दी / मेहंदी | turmeric yellow (primary button) / henna green (success) colour names | `theme.ts` `haldi`, `success` |

## Technical terms

| Term | Meaning |
| --- | --- |
| Void | an entry that cancels another (zero amounts); undo |
| Superseded | an entry replaced by a correction; excluded from every total |
| Dirty | local row not yet accepted by the server (`dirty = 1`) |
| Poison row | a row the server rejects every time; kept with `sync_error` instead of retrying forever |
| `server_seq` | global increasing number the server stamps on every insert/update; the pull cursor |
| Ledger (खाता) | household or personal bucket of events/entries on a phone; not a "bahi" document |
| Legacy event | automatic "पुराना हिसाब" event for entries that had no event |
| RLS | Postgres Row Level Security |
| k-anonymity | aggregates over fewer than 5 users are hidden (`<5`) |
| DPDP | India's Digital Personal Data Protection Act 2023 |
| DLT | India's telecom registry for commercial SMS templates (needed for OTP SMS) |
| NBFC / LSP | non-bank lender / lending service provider (Phase 3 loan facilitation, gated) |
| UMP | Google's User Messaging Platform (ad consent form) |
