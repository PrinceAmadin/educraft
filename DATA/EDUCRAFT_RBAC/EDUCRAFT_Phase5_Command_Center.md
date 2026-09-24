# EDUCRAFT HQ — PHASE 5 BUILD PROMPT
## Command Center — Super Admin Cross-Domain Intelligence
### Model: Claude Fable 5.1 · Effort: Max · File: EDUCRAFT_Phase5_Command_Center.md

---

## CONTEXT — READ THIS ENTIRE DOCUMENT BEFORE TOUCHING CODE

You are enhancing EduCraft HQ at `https://educraft-hq.vercel.app`.

**Phases 1–4 are complete and stable:**

| Phase | What was built | Key data it produces |
|---|---|---|
| 1 — RBAC | Four executive roles, role-based sidebar, ExecProfile | User.role, session.role |
| 2 — Finance | Revenue Tracker, Payout Engine, Bucket Manager, Founder Draws | Payment, PayoutRecord, BucketBalance, FounderDraw, Expense, AiUsageLog |
| 3 — Ambassador | Tier system, Core/Sub network, Leaderboard, Partnerships | Ambassador, AmbassadorReferral, Partnership, AmbassadorContentLog |
| 4 — Operations | Project Pipeline, Worker Management, QA Queue, Research Approvals | Project, Worker, QaReview, ResearchRequest, ProjectNote, SupervisorCorrection |

**The original `/admin` route** currently shows either a stub ("Pipeline, revenue cards, activity feed and alerts land here") or a basic shell built in the original Days 1–20 session. Phase 5 replaces its content entirely with a live cross-domain intelligence dashboard.

**Access:** SUPER_ADMIN only. No other role should ever reach this route — that is enforced by Phase 1 middleware.

**npm run db:migrate** uses dotenv-cli — always use this, never bare `prisma migrate dev`.

---

## WHAT THE COMMAND CENTER IS — AND IS NOT

Prince opens `/admin` every morning as his first act. He needs to know in 90 seconds: Is EduCraft healthy? What needs my attention today? Is the business growing?

The Command Center is **pure intelligence** — it reads from all four systems and surfaces what matters. It contains **no actions**. Prince cannot create a payment, assign a worker, or manage an ambassador from here. Every metric links through to the relevant platform where the action can be taken. This keeps the Command Center fast to load, fast to scan, and free of the action-mode cognitive load that the HOG and COO carry in their own dashboards.

**Design principle: everything visible in under 3 seconds, everything explorable in under 30 seconds.**

The four screens are:
1. **Today** — What needs attention right now. Live alerts plus today's activity.
2. **Business Health** — The single-screen health check Prince reviews weekly.
3. **Growth Engine** — Ambassador and acquisition intelligence.
4. **Financial Pulse** — Revenue, payouts, bucket health, and cash position.

These are tabs within `/admin`, not separate routes. The tab persists in the URL as `/admin?tab=health` etc. so Prince can bookmark his favourite view.

---

## THE COMMAND CENTER — FOUR TABS

### TAB 1 — TODAY (default tab on load)

**Purpose:** The morning brief. Answers "what do I need to do or know right now?"

**Load priority: highest.** This tab must render with real data within 1.5 seconds. If it takes longer, show skeleton loaders immediately.

#### Section A — Critical Alerts (top of page)

Shown only when there is at least one alert. If all is well, this section is absent — not "No alerts" placeholder text, just absent. Clean silence is a positive signal.

```
CRITICAL — 3 ITEMS NEED ATTENTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 EC-00312  OVERDUE                   Engineering FYP — 1 day past deadline
             Worker: Chidi Okonkwo     [Go to project →]

🔴 Monthly payouts not yet processed   September 2026 — 3 workers, ₦504,000 pending
             CFO has not confirmed     [Go to Finance →]

🟡 6 projects unassigned >24 hours    Payments confirmed, no worker assigned yet
             COO action needed         [Go to Pipeline →]
```

Alert logic — surface any of these as CRITICAL (🔴):
- Project past its `internalDeadline` — every overdue project gets its own row
- Monthly payouts not processed by 5th of the following month
- Worker with 3+ Tier 2 reference flags in 30 days (systemic quality risk)
- Ambassador platform: any Platinum quarterly bonus unpaid >7 days after quarter end
- Finance: Operations Reserve bucket below ₦200,000 (cash risk)

Alert logic — surface these as ATTENTION (🟡):
- Projects unassigned for >24 hours after payment confirmation
- QA queue items sitting >24 hours without a reviewer assigned
- Any project on round 3 of supervisor corrections
- Ambassador activation rate below 20% (well under the 25% target)
- Worker with 0 projects completed this month (active worker, but dormant)

Each alert has a destination link. Clicking takes Prince to the exact page where the problem lives — not the section's home page, but the filtered view showing the issue.

#### Section B — Today's Activity Feed

A reverse-chronological stream of everything that happened since midnight. This is not a notification list — it is a live record of system events.

```
TODAY — SEPTEMBER 24, 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4:23 PM  💰 Payment confirmed: John Okafor (EC-00312) ₦31,500 downpayment
4:18 PM  ✅ Project approved: Grace Daniel (EC-00298) — ready for delivery
3:45 PM  🏆 Ambassador tier up: David Obi → Silver (6 conversions reached)
3:12 PM  📝 Project submitted: EC-00301 — Chapter review requested
2:58 PM  ✅ QA approved: EC-00289 (Chidi Okonkwo) — all 16 checks passed
2:34 PM  👤 New ambassador: Faith Adamu joined (EKSU) — Bronze tier
2:10 PM  💰 Payment confirmed: Amara Nwosu (EC-00318) ₦31,500 downpayment
11:43 AM 🔴 Project overdue: EC-00312 — internal deadline passed
10:52 AM ⚠️  Reference check failed: EC-00307 Ch.2 — TANGENTIAL 18% (threshold: 15%)
 9:30 AM 📋 Research approved: EC-00318 — OpenAlex pipeline running
 8:15 AM 💸 Payout recorded: Amara Eze — ₦84,000 (Aug 2026)
```

Event types with icons:
- 💰 Payment confirmed / balance received
- ✅ Project approved / QA passed / delivered
- 🔴 Overdue / failed quality check / system error
- ⚠️ Warning / soft fail / approaching limit
- 📝 Chapter submitted / project status change
- 👤 New ambassador / worker joined / executive update
- 🏆 Ambassador tier change / challenge completed
- 💸 Payout processed
- 📋 Research request approved / pipeline completed
- 📊 Report generated / monthly summary created

Clicking any feed item opens the relevant detail page (project detail, ambassador profile, payout record, etc.)

**Load this from a new API endpoint that aggregates status change events across all four systems** — it queries `ProjectStatusLog`, `AmbassadorReferral` (conversions today), `PayoutRecord` (paid today), `QaReview` (completed today), `AmbassadorContentLog` (posted today), ordered by `createdAt DESC`, limit 50.

#### Section C — Today's Numbers (right sidebar)

Three quick-read stats that reset each day:

```
TODAY'S NUMBERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Projects completed:   2    [+1 from yesterday]
Payments received:   ₦63,000  [2 downpayments]
New referrals:        4    [from 3 ambassadors]
New conversions:      2    [clients paid + project created]
```

---

### TAB 2 — BUSINESS HEALTH

**Purpose:** The weekly CEO health check. Prince reviews this on Monday mornings. It should be printable and presentable in a 15-minute executive meeting.

**Load priority: medium.** This tab can take up to 3 seconds to fully load — it aggregates more data. Skeleton loaders for each section while loading.

#### Section A — The Four Headline KPIs

```
EduCraft Business Health — September 2026 (Month 14 of operations)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Monthly Revenue]     [Active Projects]    [Gross Margin]      [Goal Progress]
  ₦2,400,000            34 in pipeline      58.2%               24%
  ↑23% vs Aug           +6 vs last month    ↑2.1pp vs Aug       to ₦1B target
  ██████████░░░░░░                                              [view trajectory]
```

Monthly Revenue: sum of all `Payment` records confirmed this calendar month.
Active Projects: projects in any status except COMPLETED or CANCELLED.
Gross Margin: `(total revenue - worker payouts - ambassador commissions) / total revenue × 100`.
Goal Progress: `(current monthly revenue annualized) / ₦1,000,000,000 × 100`.

Each card has a sparkline (Recharts `LineChart`, tiny, showing last 6 months) embedded directly in the card. Not a separate chart — a 6-point sparkline in the corner of each KPI card.

#### Section B — Cross-Domain Scorecard

A single table that shows every major operational metric with its current value, its target, and a RAG status:

```
OPERATIONAL SCORECARD — This Month
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DOMAIN        METRIC                         ACTUAL   TARGET   STATUS
  ─────────────────────────────────────────────────────────────────────
  OPERATIONS    On-time delivery rate           91%      ≥95%     🟡
  OPERATIONS    QA first-pass rate              88%      ≥80%     ✅
  OPERATIONS    Supervisor acceptance rate      97%      ≥95%     ✅
  OPERATIONS    Worker capacity utilisation     78%      60–85%   ✅
  ─────────────────────────────────────────────────────────────────────
  GROWTH        Ambassador activation rate      24%      ≥25%     🟡
  GROWTH        New conversions this month      51       growing  ✅
  GROWTH        Schools with active ambassadors 10       growing  ✅
  GROWTH        Content consistency (3×/week)   91%      100%     🟡
  ─────────────────────────────────────────────────────────────────────
  FINANCE       Operations Reserve balance      ₦285K    ≥₦150K   ✅
  FINANCE       Outstanding balances            ₦94.5K   →zero    🟡
  FINANCE       Payout timeliness               ✅ Done  by 5th   ✅
  FINANCE       Month-over-month revenue growth +23%     positive ✅
  ─────────────────────────────────────────────────────────────────────
  QUALITY       Reference Tier 2 pass rate      87%      ≥85%     ✅
  QUALITY       Worker flag count (30d)         1 flagged ≤2       ✅
  QUALITY       Projects in corrections         1/34    <5%       ✅
```

Status logic:
- ✅ Green: meets or exceeds target
- 🟡 Amber: within 10% of target (or within 5pp for percentages)
- 🔴 Red: significantly below target (>10% miss)

Clicking any metric row opens the relevant platform at a filtered view for that metric.

#### Section C — 6-Month Revenue Trend

A full-width Recharts `ComposedChart` (bar + line overlay):
- Bars: monthly revenue (₦ values on left Y-axis)
- Line: monthly gross margin % (% values on right Y-axis)
- X-axis: last 6 months (abbreviated month names)
- Colour: teal bars (#0D9488), amber line (#D97706)

Data comes from `/api/admin/command-center/revenue-trend?months=6`.

#### Section D — Throughput Summary

Three side-by-side mini-cards showing cumulative numbers:

```
ALL TIME             THIS YEAR            THIS MONTH
Projects: 234        Projects: 89         Projects: 34
Workers:  14         Revenue: ₦6.2M       Revenue: ₦2.4M
Schools:  10         Clients: 89          Clients: 34
```

---

### TAB 3 — GROWTH ENGINE

**Purpose:** Ambassador and acquisition intelligence. Prince uses this to monitor Ayomidele's domain — not to manage it (that's Ayomidele's job), but to see the trend and spot inflection points.

**Load priority: medium.**

#### Section A — Acquisition Funnel

```
ACQUISITION FUNNEL — This Month
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Referrals submitted: 84          → Conversions: 51     Conversion rate: 60.7%
Conversions:         51          → Projects created:    51     (100% — all paid)

CHANNEL BREAKDOWN
  Ambassador-driven:    46 (90%)  Direct (no ambassador): 5 (10%)
  
AMBASSADOR ACTIVITY
  Total ambassadors:    147       Active this month: 38 (26%)
  New this month:       12        Ambassador activation: 26% (target: ≥25%) ✅
  Tier promotions:       3        (David Obi → Silver, Faith → Gold, Moses → Platinum)

SCHOOL PENETRATION
  Schools with ≥1 conversion:  10
  Top school:                   UNIBEN — 14 conversions
  Newest school entered:        EKSU — 3 conversions (Sep 10)
```

All numbers from Phase 3's ambassador data.

#### Section B — Ambassador Tier Distribution (chart)

A `BarChart` (Recharts) showing ambassador count by tier across the last 6 months:
- 4 bars per month: Bronze, Silver, Gold, Platinum
- Shows tier progression over time — a healthy EduCraft will see the distribution shift right as ambassadors gain conversions

Colours: Bronze #CD7F32, Silver #A8A9AD, Gold #FFD700, Platinum #9b59b6.

#### Section C — Top Ambassadors This Month

A compact leaderboard: top 5 by conversions this month.

```
TOP 5 THIS MONTH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  #1  Faith Bello       Platinum   UNN         12 convs  ₦100,800 earned
  #2  Blessing Eze      Gold       UNILAG       7 convs  ₦49,000 earned
  #3  Moses Agu         Silver     UNN          6 convs  ₦29,400 earned
  #4  Grace Daniel      Gold       EKSU         5 convs  ₦35,000 earned
  #5  David Obi         Silver     UNIBEN       4 convs  ₦14,700 earned

[View Full Leaderboard →]           [View Ambassador Platform →]
```

Clicking [View Full Leaderboard →] goes to `/admin/ambassadors/leaderboard`.

#### Section D — Conversion Trend (chart)

A `AreaChart` (Recharts): weekly conversions over the last 12 weeks.
- Shows the seasonality pattern (typically higher mid-semester, lower at semester transitions)
- Overlay: weekly new ambassador registrations (a leading indicator)

---

### TAB 4 — FINANCIAL PULSE

**Purpose:** The CFO's data, surfaced for the CEO. Prince sees the same financial picture as Jubilee but in summary form — enough to spot problems and ask informed questions, not enough to replace Jubilee's analysis.

**Load priority: medium.**

#### Section A — Revenue Position

```
FINANCIAL POSITION — September 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CONFIRMED REVENUE THIS MONTH:  ₦2,400,000
  Less: Worker payouts           ₦840,000   (35% of revenue)
  Less: Ambassador commissions   ₦252,000   (10.5% — avg. 45 amb-driven of 51 total)
  Less: HOG commission           ₦21,000    (2.5% on 30 amb-driven projects)
  Less: COO commission           ₦21,000    (2.5% on 34 delivered projects)
  ─────────────────────────────────────────────────────────────────
  RETAINED:                      ₦1,266,000 (52.75% gross margin this month)

  Outstanding balances (not yet collected):  ₦94,500 (3 clients)
  Projects nearing balance due:              2 projects approved, balance pending
```

Note: gross margin varies month to month based on the ambassador-driven percentage of revenue. Show the actual percentage alongside the ₦ values.

#### Section B — Bucket Health (four cards)

Same four bucket cards as the Finance Dashboard (Phase 2), pulled from the same data. The difference here is context: each bucket shows its balance AND its trend (is it growing or shrinking month-over-month?)

```
BUCKET HEALTH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌─────────────────────────────┐  ┌─────────────────────────────┐
│ OPERATIONS RESERVE  ₦285K   │  │ GROWTH FUND         ₦133K   │
│ ████████░░ Healthy          │  │ ████░░░░░░ Monitor          │
│ ↑ ₦42K vs last month        │  │ → Flat vs last month        │
└─────────────────────────────┘  └─────────────────────────────┘
┌─────────────────────────────┐  ┌─────────────────────────────┐
│ REINVESTMENT FUND  ₦133K   │  │ FOUNDER DISTRIBUTION ₦231K  │
│ ████░░░░░░ Monitor          │  │ ████████░░ Healthy          │
│ ↑ ₦58K vs last month        │  │ ↑ ₦92K vs last month        │
│                              │  │ (draws not yet taken Sep)   │
└─────────────────────────────┘  └─────────────────────────────┘
```

Clicking any bucket card goes to `/admin/finance/buckets`.

#### Section C — Payout Status

```
PAYOUT STATUS — September 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Workers (3):         ₦504,000   ⏳ Pending CFO processing
  Ambassadors (5):     ₦119,700   ⏳ Pending
  HOG (Ayomidele):     ₦49,000    ⏳ Pending
  COO (Emmanuel):      ₦49,000    ⏳ Pending
  ─────────────────────────────────────────────────
  TOTAL OUTSTANDING:   ₦721,700

  Founder draws (Sep): ₦150,000 (₦75K each at ₦1M+ tier)
                                  ⏳ Not yet distributed

[Go to Finance Platform →]
```

#### Section D — AI Cost Tracker

A compact view of this month's Claude API spend — visible to the CEO to monitor the platform's cost basis.

```
AI USAGE — September 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total tokens this month:   4.2M
  Total cost:                ₦33,600
  Avg cost per project:      ₦988 (within ₦520–₦1,200 target range) ✅
  
  Account balance remaining: [live from Anthropic API]
  ████████████░░░░░░░░  62% remaining   [Top up if below 20%]

[View AI Usage Dashboard →]
```

The account balance reads from the same `/api/admin/ai-usage/anthropic-balance` endpoint built in Phase 2 (the 5-minute cached Anthropic API proxy). If it fails or returns stale data, show "Balance: check Anthropic dashboard" rather than erroring.

---

## COMMAND CENTER DESIGN PRINCIPLES

### The topbar indicator

When Prince is on any page in the admin UI, he sees the lightning bolt balance indicator in the topbar. This already exists from Phase 2. Confirm it still works after Phase 5 changes.

### No spinners — skeleton loaders only

Every section must show a skeleton (grey animated placeholder) while its data loads. Never a spinner. Never "loading..." text. The skeleton teaches Prince what data is coming before it arrives.

### Amber/red thresholds are configurable

The RAG thresholds in the Scorecard (Section B of Business Health) should be stored in the `Setting` model (which exists from the original Days 1–20 build), not hardcoded in components. This lets Prince change the amber threshold for, say, ambassador activation rate from 20% to 25% without a code deploy.

Create these settings keys on first load if they don't exist:

```typescript
const defaultThresholds = {
  'cc.ops.delivery_rate.target': '0.95',
  'cc.ops.delivery_rate.amber': '0.85',
  'cc.ops.qa_first_pass.target': '0.80',
  'cc.ops.qa_first_pass.amber': '0.72',
  'cc.ops.supervisor_accept.target': '0.95',
  'cc.ops.supervisor_accept.amber': '0.87',
  'cc.growth.activation_rate.target': '0.25',
  'cc.growth.activation_rate.amber': '0.20',
  'cc.growth.content_consistency.target': '1.00',
  'cc.growth.content_consistency.amber': '0.85',
  'cc.finance.ops_reserve_min': '150000',     // ₦150K minimum
  'cc.finance.ops_reserve_critical': '80000', // ₦80K critical
  'cc.quality.tier2_pass.target': '0.85',
  'cc.quality.tier2_pass.amber': '0.78',
};
```

Prince can edit these in `/admin/settings` (a future Settings enhancement — for now, seed them and let Claude Code build a simple read path).

### Mobile layout

On mobile (< 640px), the four tabs collapse into a segmented control at the top. Each tab's sections stack vertically. Charts remain but scale to full width. The scorecard table becomes a card list on mobile — each row becomes a card.

---

## API ARCHITECTURE

All Command Center data comes from dedicated aggregation endpoints. Do **not** have the frontend call four separate domain APIs and stitch them together in React state. Each tab has one aggregation endpoint that does all the DB queries server-side and returns a single JSON payload.

```
GET /api/admin/command-center/today
  Returns: {
    alerts: { critical: Alert[], attention: Alert[] },
    feed: ActivityEvent[],
    todayNumbers: { projectsCompleted, paymentsReceived, newReferrals, newConversions }
  }
  Cache: no cache — always live
  Target response time: < 800ms

GET /api/admin/command-center/health
  Returns: {
    kpis: { revenue, activeProjects, grossMargin, goalProgress },
    kpiSparklines: { revenue: number[], margin: number[], ... },  // last 6 months
    scorecard: ScorecardRow[],
    revenueTrend: { month, revenue, margin }[],   // last 6 months
    throughput: { allTime, thisYear, thisMonth }
  }
  Cache: 5 minutes (stale is acceptable for the weekly health view)
  Target response time: < 2s

GET /api/admin/command-center/growth
  Returns: {
    funnel: { referrals, conversions, conversionRate, channelBreakdown },
    ambassadorStats: { total, active, activationRate, newThisMonth, tierPromotions },
    schoolPenetration: { count, topSchool, newest },
    tierDistribution: { month, bronze, silver, gold, platinum }[],   // last 6 months
    topAmbassadors: AmbassadorSummary[],
    conversionTrend: { week, conversions, newAmbassadors }[]  // last 12 weeks
  }
  Cache: 10 minutes
  Target response time: < 2s

GET /api/admin/command-center/finance
  Returns: {
    revenuePosition: { confirmed, workerPayouts, ambassadorComm, hogComm, cooComm, retained, grossMargin, outstandingBalances },
    buckets: { operationsReserve, growthFund, reinvestmentFund, founderDistribution, trends },
    payoutStatus: { workers, ambassadors, hog, coo, founderDraws, total },
    aiUsage: { totalTokens, totalCost, avgCostPerProject, accountBalance, accountBalancePct }
  }
  Cache: 5 minutes
  Target response time: < 2s

GET /api/admin/command-center/settings
  Returns: { thresholds: Record<string, string> }
  Cache: 1 hour (settings rarely change)

PATCH /api/admin/command-center/settings
  Body: { key: string, value: string }
  Updates a single threshold setting
  Access: SUPER_ADMIN only
```

All endpoints are SUPER_ADMIN gated. Any other role calling them returns 403.

### The Today feed aggregation query

```typescript
// Combine events from multiple tables, ordered by time
async function getTodayFeed(limit = 50) {
  const today = startOfDay(new Date());

  // ProjectStatusLog events
  const statusChanges = await prisma.projectStatusLog.findMany({
    where: { createdAt: { gte: today } },
    include: { project: { include: { client: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // Payment confirmations
  const payments = await prisma.payment.findMany({
    where: { confirmedAt: { gte: today }, status: 'CONFIRMED' },
    include: { project: { include: { client: true } } },
    orderBy: { confirmedAt: 'desc' },
    take: 10,
  });

  // Ambassador conversions
  const conversions = await prisma.ambassadorReferral.findMany({
    where: { convertedAt: { gte: today } },
    include: { ambassador: true },
    orderBy: { convertedAt: 'desc' },
    take: 10,
  });

  // Ambassador tier changes (from Ambassador model where tier changed today)
  const tierChanges = await prisma.ambassador.findMany({
    where: { updatedAt: { gte: today } },
    // Filter in app logic to only those where tier actually changed
  });

  // QA Review completions
  const qaCompletions = await prisma.qaReview.findMany({
    where: { completedAt: { gte: today } },
    include: { project: { include: { client: true } } },
    orderBy: { completedAt: 'desc' },
    take: 10,
  });

  // PayoutRecord entries marked paid today
  const payouts = await prisma.payoutRecord.findMany({
    where: { paidAt: { gte: today }, status: 'PAID' },
    orderBy: { paidAt: 'desc' },
    take: 10,
  });

  // Merge, normalise, sort by timestamp, return top {limit}
  return mergeFeedEvents([statusChanges, payments, conversions, tierChanges, qaCompletions, payouts])
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
}
```

---

## BUILD SEQUENCE

```
STEP 1: Verify phases 1–4 APIs are working
  — Call each domain's main summary API route
  — Confirm they return data (not empty arrays if test data exists)
  — Fix any broken API routes from previous phases before building Phase 5
  — This step is a prerequisite — do not proceed if any phase APIs are broken

STEP 2: Create Setting seeds for thresholds
  — Seed the 14 threshold keys from defaultThresholds object
  — Use prisma upsert so re-seeding doesn't duplicate
  — Run: npm run db:seed (or add to existing seed script)

STEP 3: Build the aggregation API routes
  — /api/admin/command-center/today (no cache)
  — /api/admin/command-center/health (5-min cache)
  — /api/admin/command-center/growth (10-min cache)
  — /api/admin/command-center/finance (5-min cache)
  — /api/admin/command-center/settings (GET + PATCH)
  — Use Next.js Route Segment Config for caching where appropriate
  — Gate all routes: SUPER_ADMIN only → 403 for others
  — Test each route individually: curl or Postman, verify response shape

STEP 4: Build the Command Center shell
  — Replace the existing /admin page content entirely
  — Build the four-tab layout (Today / Health / Growth / Finance)
  — Tab selection persists in URL query: /admin?tab=today (default)
  — Mobile: segmented control at top
  — Desktop: horizontal tabs below the topbar
  — Skeleton loaders for all sections — implement these BEFORE fetching data

STEP 5: Build Tab 1 — Today
  — Critical Alerts section (conditional — only render if alerts exist)
  — Activity Feed (reverse-chronological, with event icons)
  — Today's Numbers sidebar
  — Test: confirm alerts disappear when no issues, feed shows real events

STEP 6: Build Tab 2 — Business Health
  — Four KPI cards with sparklines (tiny 6-point LineChart per card)
  — Operational Scorecard table with RAG status computed from settings thresholds
  — 6-month Revenue Trend chart (ComposedChart: bars + line)
  — Throughput Summary (all time / this year / this month)
  — Test: verify gross margin calculation matches Phase 2 Finance data

STEP 7: Build Tab 3 — Growth Engine
  — Acquisition Funnel section
  — Tier Distribution chart (last 6 months, stacked bar)
  — Top 5 Ambassadors leaderboard
  — Conversion Trend area chart (last 12 weeks)
  — Test: verify conversion rate = conversions / referrals × 100

STEP 8: Build Tab 4 — Financial Pulse
  — Revenue Position breakdown (gross margin calculation)
  — Four Bucket Health cards with trend arrows
  — Payout Status summary
  — AI Cost Tracker with live Anthropic balance
  — Test: bucket balances match Phase 2 Bucket Manager data

STEP 9: Deep links
  — Every metric, alert, and leaderboard row links to the correct detail page
  — Test each link: confirm destination is the right page with the right filter

STEP 10: Performance
  — Verify Tab 1 loads in < 1.5 seconds on a cold request
  — Verify Tabs 2–4 show skeleton loaders within 200ms of tab click
  — Verify caching is working: second load of Tab 2 is noticeably faster
  — If any tab is slow, profile and fix the slow DB query first

STEP 11: Mobile
  — Test all four tabs on a 375px viewport
  — Scorecard table converts to card list
  — Charts scale to full width
  — Tab navigation is usable with thumb

STEP 12: Final verification
  — Log in as CO_CEO_CFO: /admin should redirect to /admin/finance (Phase 1)
  — Log in as HOG: /admin should redirect to /admin/ambassadors (Phase 1)
  — Log in as COO: /admin should redirect to /admin/projects (Phase 1)
  — Log in as SUPER_ADMIN: /admin shows Command Center with all four tabs
  — Call /api/admin/command-center/today as CO_CEO_CFO: returns 403
  — Topbar lightning bolt balance indicator still works
  — Run: npm run build — zero TypeScript errors
  — Deploy to Vercel
```

---

## TESTING CHECKLIST

Before declaring Phase 5 done:

### Data accuracy
- [ ] Monthly revenue on Financial Pulse matches Phase 2 Revenue Tracker total
- [ ] Gross margin calculation: (revenue - workers - ambassadors - HOG - COO) / revenue
- [ ] Bucket balances match Phase 2 Bucket Manager page exactly
- [ ] Ambassador activation rate matches Phase 3 Ambassador Dashboard
- [ ] Worker on-time delivery rate matches Phase 4 Operations Reports
- [ ] Today's Numbers are accurate (reset at midnight, not rolling 24h)

### Alert logic
- [ ] Overdue project creates a CRITICAL alert (one row per overdue project)
- [ ] No overdue projects → no Critical Alerts section rendered at all
- [ ] Projects unassigned >24h after payment confirmation create ATTENTION alerts
- [ ] Operations Reserve below ₦200K creates CRITICAL alert
- [ ] When all metrics are healthy, Today tab shows no alerts section (clean state)

### Feed accuracy
- [ ] Payment confirmed at 3pm appears in Today feed
- [ ] Ambassador tier change appears in Today feed on the day it happens
- [ ] QA approval appears in feed immediately after approval
- [ ] Feed is ordered newest first, no duplicates
- [ ] Each feed item links to the correct detail page

### Scorecard
- [ ] All 12 scorecard metrics pull from the correct Phase 1–4 API sources
- [ ] Green/Amber/Red status is computed from the Setting seeds (not hardcoded)
- [ ] Clicking a scorecard row navigates to the correct platform page

### Access control
- [ ] SUPER_ADMIN: all four tabs accessible
- [ ] CO_CEO_CFO: /admin redirects to /admin/finance (Phase 1 middleware)
- [ ] HOG: /admin redirects to /admin/ambassadors
- [ ] COO: /admin redirects to /admin/projects
- [ ] /api/admin/command-center/* returns 403 for non-SUPER_ADMIN

### Performance
- [ ] Tab 1 (Today) first meaningful paint < 1.5 seconds
- [ ] Skeleton loaders appear before data loads (not blank white space)
- [ ] Tab switching feels instant (cached tabs don't refetch)
- [ ] No N+1 queries in the aggregation endpoints

### Build
- [ ] `npm run build` zero TypeScript errors
- [ ] No `any` types
- [ ] Deployed to Vercel

---

## WHAT THIS PHASE COMPLETES

After Phase 5, EduCraft HQ has all five platforms operational:

| Platform | Route | Owner | Status |
|---|---|---|---|
| Command Center | `/admin` | SUPER_ADMIN (Prince) | ✅ Phase 5 |
| Finance Platform | `/admin/finance` | CO_CEO_CFO (Jubilee) | ✅ Phase 2 |
| Ambassador Platform | `/admin/ambassadors` | HOG (Ayomidele) | ✅ Phase 3 |
| Operations Platform | `/admin/projects` | COO (Emmanuel) | ✅ Phase 4 |
| Settings & RBAC | `/admin/settings` | SUPER_ADMIN only | ✅ Phase 1 |

The EduCraft HQ build roadmap Phases A–E is complete. All four executives can log in, see their domain, act within it, and report to Prince. Prince can see across all four domains from a single dashboard without having to navigate five separate pages every morning.

---

## IMPORTANT CONSTRAINTS

**Phase 5 never writes to the database.** It is read-only. Every action — approving a payment, assigning a worker, updating an ambassador — happens in the relevant platform, not here. Any button that appears in the Command Center that navigates somewhere else is correct. Any button that modifies data is wrong and must be moved to the relevant platform.

**The feed is today only.** It shows events since midnight. It is not a notification inbox, not a task list, not a full audit log. Those all exist in their respective platforms. The Today feed is a pulse — it tells Prince what happened today, not what needs to be done.

**Sparklines in KPI cards are decoration, not clickable.** They give a sense of trend. If a user clicks the KPI card, it goes to the relevant platform. The sparkline itself is not interactive.

**The Anthropic balance is best-effort.** If the API call to Anthropic fails, the AI Cost Tracker section shows the token cost from internal logs (which is accurate) and says "balance unavailable — check Anthropic dashboard" for the balance line. It does not error, does not hide, and does not retry aggressively. The feature is nice-to-have, not essential.

**Caching must not serve stale critical alerts.** Tab 1 (Today) is never cached. If Prince opens the Command Center and a project just went overdue 30 seconds ago, he must see it immediately. Tabs 2–4 can serve data up to 10 minutes stale — that is acceptable for weekly trend information.

**Do not change routing for other roles.** Phase 1 established that CO_CEO_CFO lands on `/admin/finance`, HOG on `/admin/ambassadors`, COO on `/admin/projects`. Phase 5 does not touch these redirects. The Command Center is only the landing destination for SUPER_ADMIN.
