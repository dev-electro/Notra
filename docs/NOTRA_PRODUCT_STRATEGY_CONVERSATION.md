# Notra — Product Strategy Conversation Record

> Date: 2026-10-06
> Repository: dev-electro/Notra
> Purpose: Preserve the product/monetization/design decisions from the Notra planning conversation in the repository.

---

## 1. Product direction reset

The existing Notra implementation/design is **not a visual constraint**.

The product can be completely overhauled. The current repository is a technical starting point only.

The old design system, colors, layouts, visual language, component setup, and UX patterns do not need to be preserved.

The product has three verticals:

1. **Notra Ledger — user acquisition + core utility**
   - Users keep track of their Notra incomings and outgoings.
   - The core job is recording who gave what / who received what.
   - This is the initial reason for installing and retaining the app.
   - Recording a transaction should be extremely fast.

2. **Rishte — future matrimony vertical**
   - Users will discover/filter available marriage prospects.
   - This is a future feature and requires substantial planning/execution.
   - The product should eventually support prospect discovery, matching/interest, chat, etc.
   - It should be revenue-oriented without charging users directly.
   - The UX and backend should leave room for this vertical, but it should not delay the initial Notra + Inam validation.

3. **Inam — rewards/monetization vertical**
   - Users earn through daily activity, referrals, offers and other reward mechanisms.
   - The monetization strategy must be designed heavily around this vertical.
   - Users in the target market have limited purchasing power and are highly resistant to paying directly.
   - The app therefore needs meaningful user-side economic benefits rather than relying on subscriptions/IAP.

---

## 2. Target market assumptions

Notra is a custom/tradition associated with communities in southern Rajasthan.

The total relevant population is **3M+**, but the realistic product target is much smaller.

Working assumption:

- Potential population: 3M+
- Maximum realistic Notra downloads initially: approximately **100k**
- Notra should therefore optimize for engagement and revenue per active user rather than assume mass-market scale.
- A highly engaged 10k–50k active-user base can be economically meaningful.
- The 100k-download ceiling is a planning assumption, not a claim that the entire community will adopt the app.

The target audience is strongly Android-oriented and many users already spend significant time consuming short-form video/Reels/Shorts.

This suggests high mobile engagement potential, but short-video consumption should **not** automatically be assumed to equal offerwall conversion. Offerwall completion requires separate validation.

---

## 3. Product psychology

The three verticals have different jobs:

### Notra
**Utility / retention**

> “I need this.”

The ledger should be genuinely useful and become a habitual record-keeping tool.

### Rishte
**Network effect / discovery**

> “People I care about are here.”

Eventually it can become a localized matrimonial/community network.

### Inam
**Engagement + monetization**

> “I can get something valuable here.”

Users return because they can accumulate meaningful rewards.

The product should not feel like an advertising farm.

---

## 4. Core monetization insight

A major correction made during the conversation:

The desired model is **not** merely “rewarded ads”.

The desired model is:

**Offerwall-powered rewards economy.**

The intended user loop is:

    Daily check-in
           +
    Referrals
           +
    Offerwall offers
           +
    Sponsored/promotional activities
           ↓
       NOTRA COINS
           ↓
       ┌───┴────┐
       ↓        ↓
     CASH     STORE
       ↓        ↓
     INR/UPI   Physical products

The distinction is critical:

### Ordinary advertising
Used to monetize normal app surfaces.

### Offerwall
Used as an incentivized earning mechanism.

AdMob rewarded inventory should **not** be used as the direct source for cash-convertible Notra Coins without explicit provider approval; Google's current rewarded-ad policies prohibit direct monetary rewards and require rewarded items to be non-transferable/non-monetary in the applicable model.

The product should therefore investigate dedicated incentivized offerwall providers rather than trying to turn AdMob rewarded ads into cash.

---

## 5. Desired cash/coin model

The user explicitly wants the following economic concept:

    Watch/complete an eligible offer
             ↓
         + Notra Coins
             ↓
       Accumulate coins
             ↓
      Cash redemption OR
        Store redemption

The user clarified that daily check-ins, referrals, watching/eligible offers, etc. should contribute to the same coin economy.

However, the implementation must respect the rules of each provider. Do not disguise a prohibited monetary reward as “coins” when the underlying reward is directly convertible to cash.

The final provider contracts/terms must explicitly permit the intended model.

---

## 6. No company-funded user rewards

A hard business constraint:

> **Notra should never pay users from its own money.**

The revenue generated by the user's economic activity must always exceed the associated reward liability.

The core unit-economic invariant is:

**Revenue attributable to a user/cohort > maximum reward liability attributable to that user/cohort**

Illustrative example only:

    Offer revenue             ₹100
    Network/operating costs    ₹20
    Fraud/chargeback reserve   ₹10
    Reward budget              ₹30
    Notra margin               ₹40

Actual percentages must be determined from real provider economics.

---

## 7. Revenue-funded reward engine

Rewards should be controlled by a backend economics engine.

Architecture:

    Revenue event
        ↓
    Monetization ledger
        ↓
    Costs + fraud/chargeback reserve
        ↓
    Reward budget
        ↓
    Coin issuance
        ↓
    User coin ledger
        ↓
    Cash / Store redemption

The frontend must never simply do:

    users.coins += 100

Every issued coin should have a traceable funding source.

---

## 8. Reward ledger

Use an immutable/append-only reward ledger rather than a single balance field.

Suggested structures:

### reward_funding_events

- id
- user_id
- source_type
- source_id
- gross_revenue
- net_revenue
- reward_budget
- coins_issued
- status
- created_at

### coin_ledger

- id
- user_id
- funding_event_id
- transaction_type
- coins
- created_at

Possible transaction types:

- CHECKIN
- REFERRAL
- OFFERWALL
- SPONSORED_CAMPAIGN
- PROMOTIONAL_BONUS
- REVERSAL
- CASHOUT
- STORE_REDEMPTION
- ADMIN_ADJUSTMENT

The system must be able to answer:

> “Why does this user have 14,250 coins?”

with a complete auditable trail.

---

## 9. Reward Coverage Ratio

Introduce a financial safety metric:

**Reward Coverage Ratio = available reward funding / outstanding redeemable reward liability**

Illustrative policy:

    RCR > 4.0
      → CASH_ACTIVE

    RCR 2.5–4.0
      → CASH_LIMITED

    RCR 1.5–2.5
      → HIGH_THRESHOLD

    RCR < 1.5
      → CASH_PAUSED

These thresholds are examples and must be tuned using actual economics.

The system should automatically throttle coin issuance or change reward availability if economics become unhealthy.

---

## 10. Dynamic cash redemption

Cash redemption should be server-controlled and dynamically adjustable.

If economics are strong:

    1,000 coins → ₹10

If economics weaken:

    1,500 coins → ₹10

If economics become temporarily unsustainable:

    Cash redemption → PAUSED

    Store redemption → remains available

The user explicitly agreed that cash payout can be halted and users can be directed to the store when revenue drops.

### Important trust rule

Do not silently devalue already-earned coins.

Redemption policy changes should be explicit, timestamped, and legally reviewed.

The user balance must never disappear.

Example:

> Cash rewards are temporarily unavailable. Your coins are safe. You can continue earning and redeem them in the Notra Store.

---

## 11. Three cash-reward states

### CASH_ACTIVE
Cash + Store available.

### CASH_LIMITED
Cash available with a higher threshold or lower conversion rate; Store remains available.

### CASH_PAUSED
Cashout temporarily unavailable; Store remains available.

The economics engine controls these states.

---

## 12. Store strategy

The store is not merely a fallback. It can be an important margin-control mechanism.

The user wants inexpensive Indian/Chinese-sourced products that feel highly useful and attractive as rewards.

Do **not** falsely represent a cheap product as having an inflated monetary value.

Instead use legitimate advantages:

- bulk procurement
- low-cost sourcing
- supplier negotiations
- manufacturer relationships
- low-cost packaging
- sponsored products
- excess inventory
- bundles
- direct fulfillment
- coupons
- high perceived utility

Potential categories:

- phone accessories
- kitchen utility
- LED products
- organisers
- grooming accessories
- stationery
- home utility
- travel products
- seasonal products

The store should make users feel that spending coins provides strong utility without deceptive pricing.

---

## 13. Referral economics

Do not release large referral rewards immediately.

Recommended flow:

    A invites B
        ↓
    B installs
        ↓
    B creates account
        ↓
    B performs meaningful activation
        ↓
    B returns/qualifies
        ↓
    Referral becomes eligible
        ↓
    Reward released

This reduces fake accounts and referral farming.

Referral reward should be constrained by the estimated economic value of the activated user.

---

## 14. Daily check-in economics

A check-in that creates cash-equivalent liability without revenue can violate the core business rule.

Possible approaches:

- sponsored check-in
- campaign-funded bonus
- monetization-linked activity
- limited promotional budget

Do not create an unlimited permanent reward liability simply because a user opens the app.

---

## 15. Offerwall provider strategy

The product should investigate dedicated incentivized offerwall providers.

Shortlist discussed:

### Digital Turbine / Fyber
Strong candidate.

Its current documentation describes opt-in incentivized offerwalls. Its publisher terms also indicate that real-world rewards or rewards with external monetary value require prior notification/approval.

### AdGem
Strong candidate.

Dedicated offerwall infrastructure, offer APIs, Android support, S2S postbacks and custom offerwall possibilities.

### Tapjoy
Major incentivized-offer platform worth testing, subject to explicit approval of the intended cash/store reward model.

### Offerwall.gg
Interesting publisher model; worth validating for India inventory, payout economics, fraud and exact reward structure.

### Adparagon
Potential additional offerwall/CPA/CPE/survey provider.

The final provider should be selected based on actual:

- India offer availability
- EPC/ECPM
- completion rate
- reversal rate
- fraud
- advertiser quality
- payout terms
- S2S verification
- React Native/Android integration
- support for the intended reward model

Do not select a provider based solely on generic claims about high eCPM.

---

## 16. Provider approval requirement

Before production, send each candidate provider a clear description:

> Notra is a community utility application for users in India. It operates an internal virtual currency called Notra Coins. Users can earn coins through incentivized offers, referrals, promotional campaigns and daily engagement. Subject to eligibility and fraud controls, accumulated coins may be redeemed for INR cash/UPI or physical products in a rewards store. Reward value is funded from publisher revenue generated by completed offers; Notra does not guarantee a fixed monetary reward for individual ad views.

Ask for written confirmation that the provider permits:

1. Offerwall → virtual coins → INR cash redemption
2. Offerwall → virtual coins → physical-product redemption
3. India-based Android users
4. Referral incentives
5. Server-side reward verification
6. Dynamic reward rates
7. Temporary cash-redemption suspension
8. Fraud/reversal handling

Do not attempt to bypass provider restrictions by renaming a cash-equivalent reward.

---

## 17. Advertising stack

Separate two monetization layers.

### Layer A — Inam offerwall

    AdGem / Digital Turbine / Tapjoy / etc.
                ↓
          Offer completion
                ↓
          Provider revenue
                ↓
          Notra economics
                ↓
            Notra Coins
                ↓
          Cash / Store

### Layer B — conventional advertising

Use ordinary ad mediation for normal product surfaces:

- Home
- Notra
- Rishte
- other non-earning contexts

Potential demand sources:

- Google AdMob
- Meta
- AppLovin
- Pangle
- Unity/Liftoff/etc.

Keep Google-served ads separate from the cash-reward/offerwall earning mechanism.

---

## 18. Monetization architecture

Recommended high-level architecture:

    NOTRA
      │
      ├── Product Ads
      │      ↓
      │   Ad Mediation
      │
      └── INAM
             ↓
        Offerwall Layer
             ↓
      Offer Providers
             ↓
        Offer Revenue
             ↓
      Economics Engine
             ↓
        Reward Budget
             ↓
         Coin Ledger
             ↓
       ┌─────┴─────┐
       ↓           ↓
     Cash        Store

Create a provider abstraction such as:

    OfferwallService

so the app does not directly depend on one provider.

Possible implementation modules:

    features/
      monetization/
        offerwallService
        adManager
        rewardManager
        economicsEngine
        rewardLedger
        redemptionPolicy
        frequencyCap
        fraudSignals
        revenueAttribution
        providerAdapters

This allows providers to be added/replaced without redesigning the UI.

---

## 19. Fraud prevention

The rewards system is a financial subsystem and must be designed for abuse from day one.

Signals to consider:

- account/device relationship
- advertising ID where appropriate
- device fingerprinting within privacy limits
- S2S verification
- duplicate callbacks
- impossible completion frequency
- emulator/farm patterns
- suspicious referral graphs
- VPN/proxy anomalies where appropriate
- offer reversal/chargeback
- repeated cashout patterns
- multiple accounts
- velocity limits

Never trust client-side reward completion.

Use provider S2S/server verification wherever supported.

Every provider transaction should be idempotent.

---

## 20. Inam UX direction

Inam should feel like a **daily rewards center**, not an ad list.

Example structure:

    INAM

    Balance
    1,840 Coins
    ≈ current redemption value

    🔥 7-day streak

    Earn more
    ─────────────────────
    Daily check-in        +10
    Refer a friend       +500
    Complete offers       +100–5,000
    Special campaigns    Variable

    [ EARN MORE COINS ]

    Redeem
    ─────────────────────
    Cash
    Store

The Offerwall should have real provider-supplied offers.

Do not fabricate offers or earning amounts.

---

## 21. Notra UX direction

The visual design can be completely new.

Do not preserve the old Notra design system.

Desired direction:

- modern Indian consumer app
- polished native Android feel
- strong typography
- high usability
- warm but contemporary identity
- subtle cultural DNA
- no generic fintech clone
- no generic matrimony clone
- no casino-like rewards UI
- no excessive cards
- no excessive gradients
- no decorative folk motifs everywhere

### Notra
Utility-first, extremely fast.

Core screens:

- Home
- Ledger
- Add Notra
- Event/transaction detail
- Search/filter
- Hisab/analytics

### Rishte
Visual discovery:

- prospect feed
- filters
- profile
- shortlist
- interest/match
- future chat

### Inam
High-engagement rewards experience:

- balance
- earning opportunities
- offerwall
- streak
- referrals
- reward history
- cash redemption
- store
- redemption status

---

## 22. Ads must not destroy utility

Do not interrupt critical ledger actions.

Avoid:

    Open Add Notra → ad
    Save Notra → ad
    Search → ad

Potential conventional ad placements:

- Home native ad
- occasional ledger-list native ad
- Rishte sponsored cards
- controlled interstitials at natural task boundaries
- limited app-open ads

The Offerwall is the place for incentivized activity.

---

## 23. Rishte strategy

Rishte is a future vertical and should not delay validation of Notra + Inam.

Potential future loop:

    Discover
      ↓
    Filter
      ↓
    Profile
      ↓
    Shortlist
      ↓
    Express interest
      ↓
    Match
      ↓
    Chat

Revenue possibilities:

- contextual/sponsored advertising
- wedding ecosystem businesses
- legitimate sponsored discovery
- local merchant campaigns
- other carefully designed commercial partnerships

Do not sell sensitive matrimonial information to advertising systems.

Keep Rishte data and advertising data logically separated.

---

## 24. Community moat

Notra should not initially pretend to be a generic “Indian app.”

The core positioning is:

> A digital utility made for the community's existing Notra tradition.

That can create a strong moat through:

- language
- local events
- family relationships
- Notra terminology
- Rishte network
- local businesses
- community-specific reward campaigns
- referrals
- seasonal campaigns

The Notra ledger is the wedge.

---

## 25. Initial MVP recommendation

Do not build the complete Rishte ecosystem immediately.

### Phase 1

**Notra Ledger + Inam**

Core loop:

    Install
      ↓
    Create family
      ↓
    Record Notra
      ↓
    Return
      ↓
    Inam
      ↓
    Check-in
      ↓
    Offerwall
      ↓
    Earn coins
      ↓
    Refer
      ↓
    Redeem
      ↓
    Return

Rishte can initially be represented as a future/early-access area while the first two engines are validated.

### Phase 2

Build Rishte discovery and filtering.

### Phase 3

Add matching/chat and the wider commercial ecosystem only after the network shows sufficient density.

---

## 26. Metrics

Do not optimize only for downloads.

Track:

- DAU
- WAU
- MAU
- DAU/MAU
- Notra records/user/month
- offerwall opens/user
- offer starts/user
- offer completion rate
- offer reversal rate
- coins earned/user
- coins redeemed/user
- cashout rate
- store redemption rate
- revenue/user
- reward liability/user
- Reward Coverage Ratio
- referral activation rate
- referral fraud
- D1/D7/D30 retention
- ARPDAU
- revenue per retained user

Critical north-star business question:

> Can a highly engaged Notra user generate enough attributable revenue that their reward liability remains profitable without Notra funding them from its own capital?

---

## 27. Reward economics admin dashboard

Build an internal dashboard such as:

    INAM ECONOMICS

    Revenue today                 ₹18,420
    Reward liability               ₹4,230
    Available reward budget        ₹6,810
    Coverage ratio                  4.36×

    Coins issued today             482,000
    Coins redeemed today            61,000

    Offerwall revenue              ₹11,200
    Referral-attributed revenue     ₹2,100
    Sponsored revenue               ₹3,800
    Ad revenue                      ₹1,320

    Status: SAFE

Potential alerts:

- offer becoming unprofitable
- referral campaign exceeding CAC target
- reward liability rising too quickly
- provider reversal spike
- fraud spike
- cashout volume spike

---

## 28. Dynamic reward campaigns

Use server-controlled campaigns.

Examples:

    2× coins today
    Diwali campaign
    New-user campaign
    Weekend bonus
    Sponsor-funded bonus

The economics engine controls whether a campaign is active.

Do not promise a permanent earning rate that the business cannot support.

---

## 29. Financial safety architecture

Use:

    Revenue
      ↓
    Operating costs
      ↓
    Fraud/chargeback reserve
      ↓
    Reward reserve
      ↓
    Notra margin

Do not use current-day revenue directly as the sole source of payout decisions.

Maintain a reserve for:

- advertiser reversals
- offer chargebacks
- fraud
- sudden payout spikes
- ad-rate volatility
- campaign termination

---

## 30. Strategic conclusion

Notra should be treated as:

### Notra
**Utility / retention**

### Rishte
**Network / discovery**

### Inam
**Engagement / rewards**

### Offerwall + advertising + commerce
**Revenue**

The desired flywheel:

    Community
       ↓
    Notra utility
       ↓
    Retention
       ↓
    Inam engagement
       ↓
    Offerwall activity
       ↓
    Revenue
       ↓
    Funded rewards
       ↓
    More retention
       ↓
    Referrals
       ↓
    Larger network
       ↓
    Rishte
       ↓
    More commercial value

The product should be built for approximately 100k realistic downloads initially, while the backend should be capable of scaling beyond that without a fundamental rewrite.

The most important principle is:

> **Do not build a points system first and search for revenue later. Build the revenue attribution and reward economics engine first, then let it determine what the user can earn.**

---

## 31. Immediate next steps

1. Contact 3–5 offerwall providers in parallel.
2. Get written approval for the exact India + coins + cash/store model.
3. Obtain actual India offer inventory and payout data.
4. Build a unit-economics simulator.
5. Define the reward ledger and economics engine.
6. Define cash-active / cash-limited / cash-paused states.
7. Build the new greenfield UI system.
8. Build Notra Ledger MVP.
9. Build Inam MVP around real provider inventory.
10. Instrument all monetization/retention metrics.
11. Run a small controlled community launch.
12. Validate revenue/user before expanding Rishte.
