# EDUCRAFT HQ — PHASE 3 BUILD PROMPT
## Ambassador Platform — The HOG's Full System
### Model: Claude Fable 5.1 · Effort: Max · File: EDUCRAFT_Phase3_Ambassador_Platform.md

---

## CONTEXT — READ ENTIRELY BEFORE WRITING A LINE OF CODE

You are building on top of EduCraft HQ at `https://educraft-hq.vercel.app`.

**Phase 1 (RBAC) is complete:**
- Four roles: `SUPER_ADMIN`, `CO_CEO_CFO`, `HOG`, `COO`
- Role-based sidebar, middleware protection, `ExecProfile` table, session tokens with `role`

**Phase 2 (Finance Platform) is complete:**
- `COMMISSION_RATES` config in `src/lib/finance/commission-config.ts` — the source of truth
- `PayoutRecord` model exists — Phase 3 reads from this for ambassador earnings history
- `BucketAllocationLog` and `BucketBalance` exist
- `Payment.ambassadorId` and `Payment.isAmbassadorDriven` fields exist

**Phase 3 builds the Ambassador Platform.** This is Ayomidele's (HOG's) domain — the full
system she uses to run EduCraft's client acquisition engine. It lives at `/admin/ambassadors`
and its sub-routes. `SUPER_ADMIN` sees everything. `HOG` sees everything within this domain.
No other role has access.

**npm run db:migrate** uses dotenv-cli — always use this, never bare `prisma migrate dev`.

---

## THE AMBASSADOR ECOSYSTEM — UNDERSTAND THIS BEFORE BUILDING ANYTHING

EduCraft's growth depends entirely on this network. Before writing a single component,
understand how every part connects.

### The Five Participant Types

```
CORE AMBASSADOR
  A registered ambassador operating independently.
  Earns commission on clients they personally refer.
  Can recruit Sub-Ambassadors (if Silver+ tier).
  Max 10 Sub-Ambassadors under them.

SUB-AMBASSADOR
  Recruited by a Core Ambassador.
  Operates under that Core (one level deep — no further nesting).
  Earns their own tier rate on personal referrals.
  The Core earns an override on Sub's referrals (EduCraft always pays 15% total).

GROWTH ASSOCIATE (Year 2 — schema ready, UI flagged)
  Not an ambassador. Recruited by the HOG.
  Acts as a cluster manager — manages sub-groups of ambassadors.
  Earns 2% from EduCraft's retained share on projects from their cluster.
  HOG recruits them. Currently inactive. Build the schema now; surface
  the UI as a "Coming in Year 2" feature with placeholder state.

STUDENT (referred client)
  Not in the ambassador system directly.
  A "conversion" happens when a referred student pays their downpayment
  and a project is created in WorkBase.

GROWTH ASSOCIATE'S CLUSTER AMBASSADOR
  Year 2 concept: ambassadors assigned to a Growth Associate's cluster.
  Schema ready. UI deferred.
```

### The Tier System — Lifetime Conversions

A "conversion" = a referred client pays their downpayment AND a project is created.
The tier is determined by the ambassador's **lifetime total conversions**, not monthly.

```
Bronze:   0–5  conversions   →  10% commission rate
Silver:   6–15 conversions   →  12% commission rate
Gold:     16–30 conversions  →  15% commission rate
Platinum: 31+  conversions   →  15% rate + ₦3,000/client quarterly bonus
```

Platinum quarterly bonus: ₦3,000 × (clients referred in that quarter). Resets each quarter.

### The Core/Sub Commission Logic

EduCraft always pays exactly 15% total per ambassador-driven project.
When a Sub-Ambassador refers a client, the 15% is split:

```
Sub at Bronze (10%)  → Core gets  5% override → Total = 15% ✅
Sub at Silver (12%)  → Core gets  3% override → Total = 15% ✅
Sub at Gold/Plat (15%)→ Core gets 0% override → Total = 15% ✅
```

A Core can have a maximum of 10 Sub-Ambassadors.
A Core must be Silver+ tier (6+ conversions) to activate their sub-team.
Sub-Ambassadors cannot themselves recruit Subs (max depth = 1).

### The Quarterly Challenge

Every quarter, ambassadors can participate in a challenge:
- Target: refer 10 or more clients in the quarter window
- Reward: ₦35,000 bonus paid at quarter end
- HOG can grant a single one-week extension per ambassador per quarter
- Ambassadors who complete the challenge have a distinct leaderboard badge

### The WhatsApp Community Rhythm (HOG manages outside the platform)

The HOG runs three weekly touchpoints in the ambassador community:
- Monday: content drop (flier + description + referral links)
- Wednesday: midweek check-in
- Friday: weekly spotlight (top ambassador featured)

The platform surfaces data that feeds these touchpoints — leaderboard data for the
Friday spotlight, active/inactive flags for the Monday push.

---

## THE AMBASSADOR PLATFORM — EIGHT SECTIONS

The platform lives at `/admin/ambassadors` with horizontal sub-navigation:

```
Ambassador Platform
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Dashboard] [Ambassadors] [Network Map] [Commissions] [Leaderboard]
[Partnerships] [Growth Associates] [Content Hub]
```

---

## SECTION 1 — AMBASSADOR DASHBOARD

**Route:** `/admin/ambassadors` (default landing)
**Access:** `SUPER_ADMIN`, `HOG`

Ayomidele opens this every morning. It answers: "What is the ambassador
network doing right now?"

### Layout

**Top row — Four stat cards:**
```
[Total Ambassadors]    [Active This Month]    [New Referrals MTD]    [Conversions MTD]
      147                    38 (26%)                 84                    51
   +12 this month        vs 41% last month         vs 72 last month      vs 44 last month
```

"Active This Month" = referred at least 1 client in the last 30 days.
Target activation rate: 25% (growing to 35%). Show red/amber/green against target.

**Second row — Tier breakdown:**
```
[Bronze 89]  [Silver 31]  [Gold 22]  [Platinum 5]
[████████░░] [████░░░░░░] [███░░░░░░] [█░░░░░░░░░]
```

Each card shows count and a mini bar showing what % of total they represent.

**Third row — Needs Attention panel:**
```
NEEDS ATTENTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  23 ambassadors haven't referred anyone in 60+ days         [View Inactive]
⚠️  3 ambassadors approaching tier promotion (within 2 convs)  [View Near-Promotion]
⚡  8 ambassadors eligible for Platinum quarterly bonus payout  [View Platinum]
ℹ️  5 ambassadors ready to activate sub-teams (Silver+ but 0 subs) [View Ready]
```

**Bottom row — Weekly activity chart:**
Recharts `BarChart`. X-axis: last 12 weeks. Y-axis: conversions per week.
Overlay: referrals submitted (not all become conversions). The gap shows drop-off rate.

**HOG's weekly rhythm panel (right sidebar):**
```
THIS WEEK'S RHYTHM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Monday   — Content Drop       [Upload flier]  ✅ Done
Wednesday — Midweek Check-in                  ⏳ Due today
Friday   — Weekly Spotlight   [Pick winner]   🔒 Upcoming
```

The Friday spotlight auto-suggests the top ambassador of the week from
leaderboard data. HOG can override the suggestion.

---

## SECTION 2 — AMBASSADOR DIRECTORY

**Route:** `/admin/ambassadors/list`
**Access:** `SUPER_ADMIN`, `HOG`

### The Ambassador Table

Columns:
| Name | School | Tier | Conversions | Active | Sub-Team | Joined | Last Referral | Actions |
|---|---|---|---|---|---|---|---|---|
| Blessing Eze | UNILAG | 🥇 Gold | 18 | ✅ Active | 3 Subs | Aug '25 | 3 days ago | [View] [Edit] |
| David Obi | UNIBEN | 🥈 Silver | 9 | ✅ Active | Core → Blessing | Jul '25 | 1 week ago | [View] [Edit] |
| Faith Adamu | UNN | 🥉 Bronze | 2 | ⏸ Dormant | — | Sep '25 | 6 weeks ago | [View] [Activate] |

**Status labels:**
- Active: referred ≥1 client in the last 30 days
- Dormant: no referrals in 30–60 days (amber)
- Inactive: no referrals in 60+ days (red)
- New: joined within the last 30 days, 0 conversions (blue)

**Filters:**
- Tier (Bronze / Silver / Gold / Platinum / All)
- School (dropdown of all schools in the system)
- Status (Active / Dormant / Inactive / New / All)
- Core/Sub (Show only Core / Show only Sub / Show both)
- Join date range

**Sort:** by conversions (default desc), by last referral date, by joined date, by name

**"New Ambassador" button** → opens a modal:
```
Add Ambassador
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Full Name          [____________]
WhatsApp Number    [____________]
School / University [____________]
Department / Faculty [____________]
Academic Level     [100L / 200L / 300L / 400L / 500L / Postgrad]
Core Ambassador?   [Yes / No — if No, select their Core:]
  Core Ambassador  [Search by name...]
Bio / Note         [____________] (optional)
[Generate Referral Code]
[Save Ambassador]
```

Referral code auto-generated: first 3 letters of name + 4-digit school code + 3 random digits.
e.g., BLE-LAG-847 for Blessing from UNILAG.

### Ambassador Detail View

Clicking [View] opens a full ambassador profile page:

```
BLESSING EZE  🥇 Gold                              [Edit] [Message] [Suspend]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
University: UNILAG | Department: Engineering | Level: 400L
WhatsApp: +234-XXX-XXXX | Referral Code: BLE-LAG-847
Joined: Aug 15, 2025 | Referred by: [Direct recruitment by HOG]

PERFORMANCE SUMMARY
  Total referrals submitted:   31   │  Total conversions:     18
  Conversion rate:             58%  │  Lifetime earnings:     ₦226,800
  Current tier:                Gold │  Next tier (Platinum): 13 more conversions
  Progress to Platinum:        ████████████░░░░░░░░  60%

THIS QUARTER (Q3 2026)
  Conversions this quarter: 7
  Quarterly challenge: IN PROGRESS — needs 3 more by Sep 30 [Grant extension?]
  Quarterly bonus (if completes): ₦35,000

SUB-AMBASSADOR TEAM (3 Subs)
  David Obi      Silver  9 convs   [View]
  Ngozi Ike      Bronze  3 convs   [View]
  Kunle Adamu    Bronze  1 conv    [View]
  [Add Sub-Ambassador]   (7 slots remaining — max 10)

COMMISSION BREAKDOWN (Current Month)
  Personal referrals:    5 clients × 15% × ₦70,000 = ₦52,500
  Core override — David: 3 clients (Sub Silver) × 3% × ₦70,000 = ₦6,300
  Core override — Ngozi: 1 client (Sub Bronze) × 5% × ₦70,000 = ₦3,500
  Core override — Kunle: 0 clients this month = ₦0
  ─────────────────────────────────────────────────────
  TOTAL THIS MONTH: ₦62,300 (⏳ Pending payout)

REFERRAL HISTORY (last 20)
  Date       Client Name     Project         Status        Commission
  Sep 12     John Okafor     FYP Full        ✅ Converted   ₦10,500
  Sep 8      Amara Nwosu     FYP Full        ✅ Converted   ₦10,500
  Sep 3      Peter Eze       Proposal        ⏳ Pending     —
  Aug 28     Grace Bello     FYP Full        ✅ Converted   ₦10,500
  ...

EARNINGS HISTORY (by month, from PayoutRecord)
  Sep 2026   ₦62,300   ⏳ Pending
  Aug 2026   ₦47,500   ✅ Paid Aug 28
  Jul 2026   ₦42,000   ✅ Paid Jul 31
  ...
```

### API routes for Section 2:
```
GET    /api/admin/ambassadors?tier=all&school=all&status=all&sort=conversions
GET    /api/admin/ambassadors/:id              — full ambassador detail
POST   /api/admin/ambassadors                  — create new ambassador
PATCH  /api/admin/ambassadors/:id              — update ambassador details
POST   /api/admin/ambassadors/:id/suspend      — suspend ambassador
POST   /api/admin/ambassadors/:id/activate     — reactivate suspended ambassador
POST   /api/admin/ambassadors/:id/add-sub      — add a sub-ambassador to core
DELETE /api/admin/ambassadors/:id/remove-sub/:subId  — remove a sub from a core
```

---

## SECTION 3 — NETWORK MAP

**Route:** `/admin/ambassadors/network`
**Access:** `SUPER_ADMIN`, `HOG`

A visual representation of the Core/Sub relationship structure.
This is not a complex graph library — build it as a clean card-tree layout.

### Layout

```
AMBASSADOR NETWORK — 147 ambassadors in 38 Core clusters

[Filter by School ▼]  [Filter by Tier ▼]  [Show Only: ○ All  ○ Core with Subs  ○ Solo]

─────────────────────────────────────────────────────────────────────────────
BLESSING EZE 🥇 Gold  ▼ (expanded)          UNILAG  18 convs  Active
  ┌─ David Obi     🥈 Silver   9 convs  Active  UNIBEN
  ├─ Ngozi Ike     🥉 Bronze   3 convs  Dormant UNILAG
  └─ Kunle Adamu  🥉 Bronze   1 conv   Active  UNILAG

FAITH BELLO  🥇 Gold  ▼ (expanded)           UNN    22 convs  Active
  ┌─ Moses Agu    🥈 Silver   7 convs  Active  UNN
  └─ Ruth Okoye   🥉 Bronze   2 convs  New     UNN

PETER JAMES  🥈 Silver  ▶ (collapsed, click to expand)   UI    11 convs  Dormant
  [3 Subs — click to expand]

GRACE DANIEL 🥉 Bronze (no subs — solo ambassador)        EKSU  4 convs   Active
─────────────────────────────────────────────────────────────────────────────
```

Each row: Ambassador name | Tier badge | School | Conversions | Status | Actions.
Core ambassadors have a collapse/expand toggle to show their Sub-team.
Sub-ambassadors are indented under their Core.
Solo ambassadors (no subs) show without the toggle.

**Stats at bottom:** Total Core clusters | Total Sub-Ambassadors | Average Subs per Core | Cores at max capacity (10/10)

This is a React component with expand/collapse state — not a D3 or graph library.
Keep it performant: use virtualization (react-window or similar) if > 200 ambassadors.

---

## SECTION 4 — COMMISSIONS

**Route:** `/admin/ambassadors/commissions`
**Access:** `SUPER_ADMIN`, `HOG`

The HOG's view of all ambassador commission data. This reads from `PayoutRecord`
(built in Phase 2) and the ambassador referral data.

### Layout — Three sub-tabs

**Sub-tab 1: Current Month**

Same as the Payout Engine's ambassador section (Phase 2) — but shown here with more
detail about the ambassador themselves, not just the numbers. The HOG uses this to
prepare the monthly "Ambassador Earnings Update" message to the community.

```
AMBASSADOR COMMISSIONS — September 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Ambassador         Tier      Personal   Override   Total      Status
  ──────────────────────────────────────────────────────────────────────
  Blessing Eze       🥇 Gold   ₦52,500    ₦9,800     ₦62,300    ⏳ Pending
  Faith Bello        🥇 Gold   ₦63,000    ₦4,200     ₦67,200    ⏳ Pending
  Moses Agu          🥈 Silver ₦29,400    —          ₦29,400    ✅ Paid Sep 22
  ...

  TOTAL COMMISSIONS: ₦847,200
    Personal referrals:  ₦718,400
    Core overrides:      ₦128,800

  [Export CSV]   [Generate WhatsApp Update]
```

**"Generate WhatsApp Update" button** → creates a formatted message the HOG can copy
and paste into the ambassador community:

```
🏆 SEPTEMBER EARNINGS UPDATE

Dear Ambassadors,

Your September commissions have been calculated!

Top earners this month:
1. Blessing Eze — ₦62,300
2. Faith Bello — ₦67,200
3. Moses Agu — ₦29,400

All commissions will be processed by [date].
Keep referring! October starts fresh. 🚀

[Copy to clipboard]
```

**Sub-tab 2: Commission History**

A table of all ambassador payouts, all time. Filterable by:
- Ambassador name (search)
- Month/year
- Status (Pending / Paid / All)
- Tier

**Sub-tab 3: Quarterly Bonus Tracker**

Shows all Platinum ambassadors' quarterly bonus status:

```
QUARTERLY BONUS TRACKER — Q3 2026 (Jul–Sep)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Ambassador      Tier      Q3 Referrals   Bonus Earned   Status
  ──────────────────────────────────────────────────────────────────
  Blessing Eze    Platinum  7 clients      ₦21,000        In progress (needs 10 to unlock ₦35K challenge)
  Faith Bello     Platinum  12 clients     ₦36,000        ✅ Bonus locked in — payable Oct 1
  David Obi       Gold      (not Platinum) —              — (Platinum bonus: 12 more convs)

  [Process Q3 Bonuses]   (appears on Oct 1)
```

The ₦3,000/client quarterly bonus and the ₦35,000 challenge bonus are different:
- Platinum quarterly bonus: ₦3,000 × clients referred in Q. Earned per-client. Paid quarterly.
- Quarterly challenge: ₦35,000 flat bonus if 10+ clients in the challenge window. Any tier can participate.

---

## SECTION 5 — LEADERBOARD

**Route:** `/admin/ambassadors/leaderboard`
**Access:** `SUPER_ADMIN`, `HOG`

### Four leaderboard views (tabs):

**All Time:** Ranked by lifetime conversions
**This Month:** Ranked by conversions this calendar month
**This Quarter:** Ranked by conversions this quarter
**Weekly:** Ranked by conversions this week (resets Monday)

### Leaderboard table:

```
🏆 LEADERBOARD — This Month (September 2026)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Rank  Name            School   Tier        Convs  Earnings    Badge
  ─────────────────────────────────────────────────────────────────────
  🥇 1  Faith Bello     UNN      Platinum    12     ₦100,800    🏆 Challenge Complete
  🥈 2  Blessing Eze    UNILAG   Gold        7      ₦49,000     ⚡ 3 away from Platinum
  🥉 3  Moses Agu       UNN      Silver      6      ₦29,400     ✨ Tier Up! (just hit Silver)
    4   Grace Daniel    EKSU     Bronze      3      ₦14,700
    5   Peter James     UI       Silver      2      ₦9,800
  ...
```

**Badges:**
- 🏆 Challenge Complete — completed the quarterly challenge
- ⚡ [N] away from [Tier] — within 3 conversions of next tier
- ✨ Tier Up! — promoted to new tier this month
- 🔥 On Fire — 3+ conversions in the last 7 days
- 💤 First conversion this month — after being dormant

**"Weekly Spotlight" panel (right sidebar):**
```
FRIDAY SPOTLIGHT SUGGESTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Top ambassador this week:
  Faith Bello — 4 conversions (↑ 2 from last week)
  School: UNN | Tier: Platinum

Suggested message:
  "🌟 This week's spotlight: Faith Bello from UNN! 
   4 new clients this week alone. Faith has now 
   referred 12 clients this month. 
   Show her some love 💚 #EduCraftAmbassador"

  [Copy message]   [Override with different ambassador]
```

The HOG copies this message into WhatsApp every Friday.

---

## SECTION 6 — PARTNERSHIPS

**Route:** `/admin/ambassadors/partnerships`
**Access:** `SUPER_ADMIN`, `HOG`

Student union and faculty association partnerships. These are separate from individual
ambassadors — they are institutional relationships the HOG manages.

### Partnership table:

| Organisation | School | Faculty/Dept | Status | Start Date | ₦ Committed | Projects | Renewal | Actions |
|---|---|---|---|---|---|---|---|---|
| UNILAG Eng. Student Assoc. | UNILAG | Engineering | ✅ Active | Aug 2025 | ₦30,000 | 24 projects | Mar 2026 | [View] |
| UNIBEN SUG | UNIBEN | University-wide | ✅ Active | Sep 2025 | ₦25,000 | 18 projects | Sep 2026 | [View] |
| EKSU Law Faculty | EKSU | Law | ⚠️ Due Renewal | Jul 2025 | ₦17,000 | 8 projects | Oct 2026 | [Renew] |
| UNN Med. Sciences | UNN | Medical | 🔄 In Negotiation | — | — | — | — | [View] |

**Partnership detail modal:**
- Organisation name, contact person, WhatsApp number
- Terms of the partnership (what EduCraft committed to in exchange for access)
- Sponsorship amount paid (from Growth Fund budget)
- Projects generated from this partnership (counted by tracking which ambassadors came in through this channel)
- Renewal date and reminder (auto-alert 30 days before renewal)
- Notes (HOG's informal notes about the relationship)

**"Add Partnership" button:**
```
New Partnership
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Organisation Name     [________________________]
School / University   [________________________]
Faculty / Department  [________________________]
Contact Person        [________________________]
Contact WhatsApp      [________________________]
Commitment Amount     [₦ _________] (from Growth Fund)
What we receive       [Access to announce in group / Physical access / Both]
Start Date            [date picker]
Renewal Date          [date picker]
Notes                 [________________________]
[Save Partnership]
```

**Quarterly Budget Panel:**
```
GROWTH FUND — HOG PARTNERSHIP BUDGET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Q3 2026 budget (set by CEO):    ₦150,000
Committed this quarter:         ₦72,000
Remaining:                      ₦78,000
Up to ₦50,000: HOG approves independently
Above ₦50,000: CEO approval required
```

This budget panel reads from the Growth Fund bucket (Phase 2 data).

---

## SECTION 7 — GROWTH ASSOCIATES

**Route:** `/admin/ambassadors/growth-associates`
**Access:** `SUPER_ADMIN`, `HOG`

**Year 2 feature — not yet active. Build the schema now. Show as a Coming Soon page with full description.**

### The concept (for the HOG to understand when they open this page):

```
GROWTH ASSOCIATES — Coming in Year 2

What is a Growth Associate?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Growth Associates are a new level above Core Ambassadors, recruited 
directly by the Head of Growth. They manage clusters of ambassadors 
and earn from their cluster's performance.

How it works:
  1. HOG recruits a Growth Associate from a top-performing ambassador
  2. Growth Associate is assigned a cluster of ambassadors to manage
  3. Growth Associate earns 2% from EduCraft's retained share (not from
     the ambassador's commission — EduCraft's retained 40% drops to 38%)
  4. Growth Associate motivates, supports, and grows their cluster

This is how EduCraft scales to 500+ ambassadors without the HOG
managing every individual ambassador directly.

When Year 2 launches, this page will show:
  - Growth Associate profiles and their clusters
  - Cluster performance metrics
  - Growth Associate commission tracking

Expected activation: January 2027

[Notify me when this launches] (saves HOG preference)
```

### Schema to build now (even though UI is deferred):

```prisma
model GrowthAssociate {
  id              String   @id @default(cuid())
  userId          String?  // Optional — may not have a WorkBase login
  name            String
  whatsapp        String
  school          String
  recruitedBy     String   // HOG's ExecProfile ID
  status          String   @default("INACTIVE") // INACTIVE, ACTIVE
  clusterName     String?  // e.g., "UNN Cluster", "South-East Cluster"
  lifetimeEarnings Float   @default(0)
  isActive        Boolean  @default(false)
  activatedAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  clusterAmbassadors Ambassador[] @relation("GrowthAssociateCluster")
}
```

Also add to `Ambassador` model:
```prisma
  growthAssociateId String?
  growthAssociate   GrowthAssociate? @relation("GrowthAssociateCluster", fields: [growthAssociateId], references: [id])
```

---

## SECTION 8 — CONTENT HUB

**Route:** `/admin/ambassadors/content`
**Access:** `SUPER_ADMIN`, `HOG`

The HOG's content planning and tracking tool. This is not a content creation tool —
it is a calendar and history tracker for the content the HOG produces and distributes
to ambassadors.

### Monthly content calendar:

```
CONTENT CALENDAR — September 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Week 1 (Sep 1–7)    Monday flier: ✅ Posted | Weds check-in: ✅ | Friday spotlight: ✅
  Week 2 (Sep 8–14)   Monday flier: ✅ Posted | Weds check-in: ✅ | Friday spotlight: ✅
  Week 3 (Sep 15–21)  Monday flier: ⏳ Due    | Weds check-in: 🔒 | Friday spotlight: 🔒
  Week 4 (Sep 22–28)  Monday flier: 🔒        | Weds check-in: 🔒 | Friday spotlight: 🔒
```

**"Log content posted" button** → opens a quick modal:
```
Log Posted Content
━━━━━━━━━━━━━━━━━━━
Type:   [Monday Flier / Midweek Check-in / Friday Spotlight / Other]
Date:   [today]
Note:   [optional — what was the hook/message?]
[Save]
```

### Content analytics:

```
CONTENT CONSISTENCY — Last 12 Weeks
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Monday posts:    10/12 weeks  (83%) ⚠️ — 100% target
Weds check-ins: 9/12 weeks   (75%) ⚠️
Friday spots:   11/12 weeks  (92%) ✅

Correlation with referral volume:
  Weeks with all 3 posts:        avg 7.2 conversions/week
  Weeks missing ≥1 post:         avg 4.8 conversions/week
  Impact of consistency:         +50% conversions when all 3 posted
```

The correlation is calculated from conversion data and content log timestamps.
Show it as a simple comparison — not a statistical analysis, just a visible pattern.

### Pre-season campaign tracker:

```
PRE-SEASON CAMPAIGN — Semester 2 2026/2027
8 weeks before semester start: Jan 6, 2027

Campaign starts:   Nov 11, 2026 (10 weeks away)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Week -10  [Nov 11]  Ambassador briefing  🔒 Planned
Week -8   [Nov 25]  Early-bird launch    🔒 Planned
Week -6   [Dec 9]   Urgency push         🔒 Planned
Week -4   [Dec 23]  Final call           🔒 Planned
Week 0    [Jan 6]   Semester begins      —
```

---

## DATABASE MODELS — FULL SCHEMA

Run all additions in one migration after confirming the schema.

### New models:

```prisma
model Ambassador {
  id                  String   @id @default(cuid())
  name                String
  whatsapp            String
  school              String
  department          String?
  academicLevel       String?  // "100L", "200L", etc.
  referralCode        String   @unique
  status              String   @default("ACTIVE") // ACTIVE, DORMANT, INACTIVE, SUSPENDED
  tier                String   @default("BRONZE")  // BRONZE, SILVER, GOLD, PLATINUM

  // Core/Sub relationship
  isSub               Boolean  @default(false)
  coreAmbassadorId    String?
  coreAmbassador      Ambassador?  @relation("CoreSubRelationship", fields: [coreAmbassadorId], references: [id])
  subAmbassadors      Ambassador[] @relation("CoreSubRelationship")

  // Growth Associate relationship (Year 2)
  growthAssociateId   String?
  growthAssociate     GrowthAssociate? @relation("GrowthAssociateCluster", fields: [growthAssociateId], references: [id])

  // Statistics (computed and cached)
  lifetimeReferrals   Int      @default(0)  // total referrals submitted (not all convert)
  lifetimeConversions Int      @default(0)  // conversions = paid + project created
  lifetimeEarnings    Float    @default(0)

  // Recruitment
  recruitedBy         String?  // HOG ExecProfile ID, or ambassador ID if peer-recruited
  recruitedByType     String?  // "HOG", "AMBASSADOR"

  // Quarterly challenge
  quarterlyChallenge  AmbassadorQuarterlyChallenge[]

  // Relations
  referrals           AmbassadorReferral[]
  payouts             PayoutRecord[] @relation("AmbassadorPayouts")  // existing PayoutRecord model

  notes               String?
  joinedAt            DateTime @default(now())
  lastReferralAt      DateTime?
  suspendedAt         DateTime?
  suspendedBy         String?

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

model AmbassadorReferral {
  id              String   @id @default(cuid())
  ambassadorId    String
  ambassador      Ambassador @relation(fields: [ambassadorId], references: [id])
  clientName      String
  clientWhatsapp  String?
  school          String?
  projectId       String?  // linked once project is created in WorkBase
  status          String   @default("PENDING")
  // PENDING → CONVERTED (paid + project created), LOST (didn't proceed), CANCELLED
  submittedAt     DateTime @default(now())
  convertedAt     DateTime?
  projectValue    Float?   // project value at time of conversion
  notes           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model AmbassadorQuarterlyChallenge {
  id            String   @id @default(cuid())
  ambassadorId  String
  ambassador    Ambassador @relation(fields: [ambassadorId], references: [id])
  quarter       String   // "Q3-2026"
  startDate     DateTime
  endDate       DateTime  // may be extended
  extensionGranted Boolean @default(false)
  extensionEndDate DateTime?
  targetCount   Int      @default(10)
  actualCount   Int      @default(0)  // conversions within the window
  completed     Boolean  @default(false)
  bonusPaid     Boolean  @default(false)
  bonusAmount   Float    @default(35000)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([ambassadorId, quarter])
}

model Partnership {
  id              String   @id @default(cuid())
  organisationName String
  school          String
  faculty         String?
  contactPerson   String?
  contactWhatsapp String?
  status          String   @default("ACTIVE") // ACTIVE, INACTIVE, IN_NEGOTIATION
  commitmentAmount Float    @default(0)
  whatWeReceive   String?  // "Group access", "Physical presence", etc.
  startDate       DateTime?
  renewalDate     DateTime?
  notes           String?
  createdBy       String   // ExecProfile ID
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model AmbassadorContentLog {
  id          String   @id @default(cuid())
  contentType String   // MONDAY_FLIER, WEDS_CHECKIN, FRIDAY_SPOTLIGHT, OTHER
  postedAt    DateTime @default(now())
  week        String   // "2026-W38" (ISO week)
  note        String?
  loggedBy    String   // ExecProfile ID
  createdAt   DateTime @default(now())
}

model GrowthAssociate {
  id              String   @id @default(cuid())
  name            String
  whatsapp        String
  school          String
  recruitedBy     String
  status          String   @default("INACTIVE")
  clusterName     String?
  lifetimeEarnings Float   @default(0)
  isActive        Boolean  @default(false)
  activatedAt     DateTime?
  clusterAmbassadors Ambassador[] @relation("GrowthAssociateCluster")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

### Updates to existing models:

```prisma
// Payment model (add if not already in Phase 2):
  ambassadorId        String?
  ambassador          Ambassador? @relation(fields: [ambassadorId], references: [id])
  isAmbassadorDriven  Boolean @default(false)
  referralId          String?   // link to AmbassadorReferral record
  referral            AmbassadorReferral? @relation(fields: [referralId], references: [id])
```

---

## TIER AUTOMATION

The tier field is updated automatically based on `lifetimeConversions`.
Never set the tier manually — derive it from the count. Build a utility function:

```typescript
// src/lib/ambassadors/tier-utils.ts

export function calculateTier(lifetimeConversions: number): AmbassadorTier {
  if (lifetimeConversions >= 31) return 'PLATINUM';
  if (lifetimeConversions >= 16) return 'GOLD';
  if (lifetimeConversions >= 6)  return 'SILVER';
  return 'BRONZE';
}

export function conversionsTillNextTier(lifetimeConversions: number): number | null {
  if (lifetimeConversions >= 31) return null;       // Platinum — no next tier
  if (lifetimeConversions >= 16) return 31 - lifetimeConversions; // → Platinum
  if (lifetimeConversions >= 6)  return 16 - lifetimeConversions; // → Gold
  return 6 - lifetimeConversions;                    // → Silver
}

export function isEligibleForSubTeam(tier: AmbassadorTier): boolean {
  return tier === 'SILVER' || tier === 'GOLD' || tier === 'PLATINUM';
}
```

**When a referral is marked CONVERTED**, run this logic:
```typescript
async function onConversionRecorded(ambassadorId: string) {
  const ambassador = await prisma.ambassador.findUnique({ where: { id: ambassadorId } });
  const newConversions = ambassador.lifetimeConversions + 1;
  const newTier = calculateTier(newConversions);
  const tierChanged = newTier !== ambassador.tier;

  await prisma.ambassador.update({
    where: { id: ambassadorId },
    data: {
      lifetimeConversions: newConversions,
      tier: newTier,
      lifetimeReferrals: { increment: 1 },
      lastReferralAt: new Date(),
    },
  });

  if (tierChanged) {
    // Log the tier promotion — will appear as badge on leaderboard
    await logTierPromotion(ambassadorId, ambassador.tier, newTier);
  }

  // Update status to ACTIVE if was DORMANT/INACTIVE
  if (ambassador.status !== 'ACTIVE') {
    await prisma.ambassador.update({
      where: { id: ambassadorId },
      data: { status: 'ACTIVE' },
    });
  }
}
```

**Daily job — update ambassador statuses:**
```typescript
async function updateAmbassadorStatuses() {
  const now = new Date();
  const thirtyDaysAgo = subDays(now, 30);
  const sixtyDaysAgo = subDays(now, 60);

  // Active → Dormant
  await prisma.ambassador.updateMany({
    where: {
      status: 'ACTIVE',
      lastReferralAt: { lt: thirtyDaysAgo },
    },
    data: { status: 'DORMANT' },
  });

  // Dormant → Inactive
  await prisma.ambassador.updateMany({
    where: {
      status: 'DORMANT',
      lastReferralAt: { lt: sixtyDaysAgo },
    },
    data: { status: 'INACTIVE' },
  });
}
```

Run this as a cron job or trigger it on the `/api/admin/ambassadors` GET request
(check and update statuses before returning data).

---

## BUILD SEQUENCE

Follow this order. Each step must be working before proceeding.

```
STEP 1: Schema migration
  — Add all new models (Ambassador, AmbassadorReferral, AmbassadorQuarterlyChallenge,
    Partnership, AmbassadorContentLog, GrowthAssociate)
  — Update Payment model with referralId
  — Run: npm run db:migrate
  — Verify all tables in Supabase

STEP 2: Tier utility functions
  — Create src/lib/ambassadors/tier-utils.ts
  — Write and test calculateTier(), conversionsTillNextTier(), isEligibleForSubTeam()
  — These are pure functions — test them without the database

STEP 3: Ambassador Directory (Section 2 — core data model)
  — Build /api/admin/ambassadors GET, POST, PATCH, DELETE
  — Build the ambassador table with filters and sorting
  — Build the "New Ambassador" modal with referral code generation
  — Build the ambassador detail page
  — Test: create 3 ambassadors (one Core with Subs, one solo)
  — Verify: tier calculates correctly, Core/Sub relationship shows

STEP 4: Referral tracking
  — Build AmbassadorReferral creation flow (HOG submits a referral on behalf of ambassador)
  — Build the conversion trigger (when Payment is confirmed + isAmbassadorDriven):
    automatically create/update AmbassadorReferral, increment lifetimeConversions,
    re-calculate tier, update status
  — Test: confirm a payment for an ambassador-driven project, verify lifetimeConversions
    increments and tier updates if threshold crossed

STEP 5: Ambassador Dashboard (Section 1)
  — Build /api/admin/finance/dashboard (if not already exists from Phase 2 read-side)
  — Build the four stat cards
  — Build the tier breakdown cards
  — Build the Needs Attention panel
  — Build the weekly activity chart (Recharts BarChart)
  — Build the weekly rhythm panel
  — Test: confirm stats match the ambassador records

STEP 6: Commission Section (Section 4)
  — Build the current month commission table (reads from PayoutRecord + ambassador data)
  — Build the "Generate WhatsApp Update" message generator
  — Build the commission history table
  — Build the Quarterly Bonus Tracker (Platinum ambassadors + quarterly challenge)
  — Test: verify commission amounts match the Phase 2 Payout Engine calculations

STEP 7: Leaderboard (Section 5)
  — Build the four leaderboard views (All Time, Monthly, Quarterly, Weekly)
  — Build badge logic (Tier Up, On Fire, Challenge Complete, Near-Promotion)
  — Build the Friday Spotlight suggestion panel
  — Build the copy-to-clipboard message generator
  — Test: confirm rankings match lifetimeConversions and monthly conversion data

STEP 8: Network Map (Section 3)
  — Build the expand/collapse card-tree layout
  — Build the Core/Sub visual grouping
  — Build filters (school, tier, core-only/sub-only)
  — Test: with 10+ ambassadors including Core/Sub relationships

STEP 9: Partnerships (Section 6)
  — Build the partnership table
  — Build the partnership detail modal
  — Build the "Add Partnership" form
  — Build the quarterly budget panel (reads Growth Fund balance from Phase 2)
  — Build renewal alerts (30 days before renewal date → appears in Needs Attention panel)

STEP 10: Content Hub (Section 8)
  — Build the monthly calendar display
  — Build the "Log content posted" modal
  — Build the content analytics (consistency rate per type)
  — Build the pre-season campaign tracker
  — Test: log content for each type, verify calendar updates

STEP 11: Growth Associates (Section 7 — Coming Soon)
  — Build the Coming Soon page with full description
  — Build the schema (already done in Step 1)
  — Do NOT build full UI yet

STEP 12: Ambassador Platform sub-navigation
  — Build the horizontal sub-nav for /admin/ambassadors/*
  — Ensure all 8 sections appear as tabs in correct order

STEP 13: Integration — connect to Phase 2 Finance
  — When payment is confirmed as ambassador-driven in Phase 2 Revenue Tracker:
    automatically create a PayoutRecord for the ambassador
    update the ambassador's lifetimeConversions
    update the ambassador's tier if threshold crossed
  — This is the bridge between Finance Platform and Ambassador Platform

STEP 14: Final verification
  — Full flow: add ambassador → log referral → confirm payment → verify payout calculated
  → verify tier updates → verify leaderboard reflects → verify dashboard stats update
  — Commission calculation test: Bronze Sub referring ₦70K project:
    Sub gets 10% = ₦7,000 | Core gets 5% = ₦3,500 | EduCraft pays 15% total = ✅
  — Run: npm run build — zero TypeScript errors
  — Deploy to Vercel
```

---

## TESTING CHECKLIST

Before declaring Phase 3 done, every item must pass.

### Data model
- [ ] Ambassador created with correct referral code format (3-letter name + school code + 3 digits)
- [ ] Sub-Ambassador linked to Core with `coreAmbassadorId`
- [ ] Core ambassador cannot have more than 10 Subs (API validation)
- [ ] Bronze-tier ambassador cannot activate a sub-team (API blocks it)
- [ ] Tier calculates correctly from `lifetimeConversions`:
  - 0–5 → BRONZE, 6–15 → SILVER, 16–30 → GOLD, 31+ → PLATINUM
- [ ] `lifetimeConversions` increments exactly once per confirmed payment conversion
- [ ] Tier promotion logged when conversion crosses a tier threshold
- [ ] Ambassador status auto-updates: Active → Dormant (30 days), Dormant → Inactive (60 days)

### Commission calculations
- [ ] Gold-tier Core ambassador personal referral: 15% of project value
- [ ] Silver-tier Core ambassador personal referral: 12% of project value
- [ ] Bronze Sub referring ₦70K project: Sub ₦7,000 (10%), Core ₦3,500 (5%), total ₦10,500 (15%) ✅
- [ ] Gold Sub referring ₦70K project: Sub ₦10,500 (15%), Core ₦0 (0%), total ₦10,500 (15%) ✅
- [ ] Platinum quarterly bonus: ₦3,000 × clients referred in quarter (not all-time)
- [ ] Quarterly challenge: completed if 10+ conversions within challenge window

### Dashboard and stats
- [ ] Total Ambassadors count matches database count
- [ ] "Active This Month" = those with a conversion in last 30 days (not just a referral)
- [ ] Needs Attention panel: 60-day inactive threshold is correct
- [ ] Leaderboard rankings match conversion data for selected time period
- [ ] Weekly chart shows correct weekly buckets (Mon–Sun)

### UI/UX
- [ ] Tier badges use correct colors: Bronze 🥉 orange, Silver 🥈 grey, Gold 🥇 gold, Platinum 💎 purple
- [ ] Ambassador detail page shows correct sub-team with link to each Sub's profile
- [ ] Network Map: Cores expand/collapse to show Subs
- [ ] "Generate WhatsApp Update" produces correctly formatted message
- [ ] Friday Spotlight suggestion shows the top converter of the week with copyable message
- [ ] Quarterly challenge status shows correctly: in-progress, completed, expired

### Access control
- [ ] HOG can access all 8 sections of /admin/ambassadors/*
- [ ] COO cannot access any /admin/ambassadors/* route (redirected to /admin/projects)
- [ ] CO_CEO_CFO cannot access any /admin/ambassadors/* route (redirected to /admin/finance)
- [ ] SUPER_ADMIN can access everything

### Build
- [ ] `npm run build` passes with zero TypeScript errors
- [ ] Deployed to Vercel

---

## IMPORTANT CONSTRAINTS

**The tier is always derived from `lifetimeConversions`, never set manually.**
If a HOG wants to manually adjust a tier (for promotional reasons), the only
correct way is to update the conversion count — not the tier field directly.
The tier field is computed and updated automatically on every conversion event.

**A "conversion" is strictly defined:** a referred client's downpayment is confirmed
AND a project is created in WorkBase. A referral that hasn't converted yet does not
count toward the tier. Do not increment `lifetimeConversions` on referral submission —
only on confirmed payment.

**The 15% total rule is inviolable.** EduCraft always pays exactly 15% of project
value in ambassador commission regardless of the Core/Sub split. If the math doesn't
add to 15%, the calculation is wrong.

**Commission amounts come from `COMMISSION_RATES` in Phase 2's config file.**
Never hardcode percentage values in Phase 3 components. Import them from
`src/lib/finance/commission-config.ts`.

**Growth Associates are schema-ready but UI-deferred.**
Do not build a functional Growth Associate management UI. Build the schema, build
the Coming Soon page with a description. When Year 2 activates it, Phase 4 will
build the full GA system.

**Do not break Phase 1 or Phase 2.**
The Finance Platform's Payout Engine calculates ambassador payouts using ambassador
tier data. The connection works like this: Phase 2 reads `Ambassador.tier` and
`Ambassador.coreAmbassadorId` to calculate commission splits. Phase 3 writes to these
fields. Test that changing tier data in Phase 3 correctly flows into Phase 2 payout
calculations.

---

## WHAT PHASE 4 WILL BUILD

Phase 4 is the Operations Platform (COO's system):
- Project pipeline with visual kanban view
- Worker management (recruitment, profiles, performance, assignment)
- QA Review queue
- Research Approval workflow
- Delivery tracking
- Enhanced Payout submission (COO's limited finance view)
- Operations Reports

Phase 4 will read `Ambassador.id` and `Ambassador.referralCode` to display ambassador
information on project cards (which ambassador referred this client). Build the
ambassador data structures cleanly so Phase 4 can consume them.
