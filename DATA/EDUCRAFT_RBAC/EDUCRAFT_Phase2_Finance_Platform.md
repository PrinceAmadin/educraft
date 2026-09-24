# EDUCRAFT HQ — PHASE 2 BUILD PROMPT
## Finance Platform — The CFO's Full System
### Model: Claude Fable 5.1 · Effort: Max · File: EDUCRAFT_Phase2_Finance_Platform.md

---

## CONTEXT — READ THIS ENTIRE DOCUMENT BEFORE WRITING CODE

You are building on top of the EduCraft HQ platform at `https://educraft-hq.vercel.app`.
Phase 1 (RBAC) is complete. The following are confirmed working:

- Four executive roles: `SUPER_ADMIN`, `CO_CEO_CFO`, `HOG`, `COO`
- Role-based sidebar rendering and middleware route protection
- `ExecProfile` table with executive names and titles
- Session tokens include `role` and `name`
- `/admin/finance` route exists and is visible to `SUPER_ADMIN` and `CO_CEO_CFO` only
- `AiUsageLog` model exists in the schema (already built in a previous session)
- `Payment` model exists in the schema
- `Expense` model exists in the schema
- `npm run db:migrate` uses dotenv-cli — always use this, never bare `prisma migrate dev`

Phase 2 builds the Finance Platform — a full financial operating system that lives
inside `/admin/finance`. When Jubilee (Co-CEO/CFO) opens this section, she sees a
complete system for tracking every naira EduCraft earns, allocating it across four
buckets, calculating and processing payouts to every person in the ecosystem, and
producing financial reports. This is not a dashboard — it is a financial SaaS platform.

---

## THE COMMISSION STRUCTURE — SOURCE OF TRUTH

Every calculation in this platform derives from this structure. Do not hardcode
naira amounts — derive them from these percentages. Store the rates in a config
file so Prince can update them without touching component code.

```typescript
// src/lib/finance/commission-config.ts

export const COMMISSION_RATES = {
  // Direct from project revenue
  workers:    0.40,   // 40% — paid to the specialist who wrote the report
  ambassador: 0.15,   // 15% — EduCraft always pays exactly 15% total per referred project
                      // (split between Core and Sub if applicable — see ambassador logic below)
  hog:        0.025,  // 2.5% — Ayomidele, on all ambassador-driven projects
  coo:        0.025,  // 2.5% — Emmanuel, on all delivered projects

  // EduCraft retains 40% (100% - 40% - 15% - 2.5% - 2.5%)
  // When Growth Associate active: retains 38% (2% redirected from retained share)
  growthAssociate: 0.02, // 2% from retained share — Year 2, currently inactive

  // Bucket allocations — expressed as % of EduCraft's RETAINED SHARE (40%)
  // NOT as % of total revenue. This prevents the 105% overflow error.
  buckets: {
    operationsReserve:   0.375,  // 37.5% of retained = 15% of total revenue
    growthFund:          0.175,  // 17.5% of retained = 7% of total revenue
    reinvestmentFund:    0.175,  // 17.5% of retained = 7% of total revenue
    founderDistribution: 0.275,  // 27.5% of retained = 11% of total revenue
  },

  // Founder draw tiers — monthly, 50/50 split between CEO and CFO
  // Applied to the Founder Distribution bucket, not to total revenue
  founderDrawTiers: [
    { minRevenue: 0,          maxRevenue: 499999,    drawEach: 0 },
    { minRevenue: 500000,     maxRevenue: 999999,    drawEach: 25000 },
    { minRevenue: 1000000,    maxRevenue: 2499999,   drawEach: 75000 },
    { minRevenue: 2500000,    maxRevenue: 4999999,   drawEach: 150000 },
    { minRevenue: 5000000,    maxRevenue: 9999999,   drawEach: 300000 },
    { minRevenue: 10000000,   maxRevenue: Infinity,  drawEach: 500000 },
  ],
} as const;

// Verification: does the standard split add to 100%?
// Workers (40%) + Ambassadors (15%) + HOG (2.5%) + COO (2.5%) + EduCraft retained (40%) = 100% ✅
// EduCraft retained (40%) × bucket allocations:
//   37.5% + 17.5% + 17.5% + 27.5% = 100% of retained = 40% of total ✅
```

### Ambassador Commission Split Logic

EduCraft always pays exactly 15% in ambassador commission per referred project.
When a Sub-Ambassador refers the client, that 15% is split between them and their Core:

```typescript
// Ambassador tier rates (based on lifetime conversions = paying clients referred)
export const AMBASSADOR_TIERS = [
  { name: 'Bronze',   minConversions: 0,  maxConversions: 5,  rate: 0.10 },
  { name: 'Silver',   minConversions: 6,  maxConversions: 15, rate: 0.12 },
  { name: 'Gold',     minConversions: 16, maxConversions: 30, rate: 0.15 },
  { name: 'Platinum', minConversions: 31, maxConversions: Infinity, rate: 0.15 },
] as const;

// Core/Sub override split — EduCraft total = always 15%
// Sub at Bronze (10%): Core override = 5%   → Total = 15% ✅
// Sub at Silver (12%): Core override = 3%   → Total = 15% ✅
// Sub at Gold/Plat (15%): Core override = 0% → Total = 15% ✅

export function calculateAmbassadorSplit(subTierRate: number): {
  subRate: number;
  coreOverride: number;
} {
  return {
    subRate: subTierRate,
    coreOverride: 0.15 - subTierRate,  // Always sums to 15%
  };
}

// Platinum quarterly bonus: ₦3,000 per client referred in that quarter
export const PLATINUM_QUARTERLY_BONUS_PER_CLIENT = 3000;
```

---

## THE EIGHT SUB-SYSTEMS TO BUILD

The Finance Platform at `/admin/finance` contains eight tabs/sections.
Build them in the order listed. Each depends on the previous being stable.

```
/admin/finance
├── [1] Finance Dashboard    ← Overview — build first
├── [2] Revenue Tracker      ← All money coming IN
├── [3] Payout Engine        ← All money going OUT (auto-calculated)
├── [4] Bucket Manager       ← The four buckets — allocate, track, protect
├── [5] Founder Draws        ← CEO + CFO monthly/semester/annual
├── [6] Expenses             ← Operational costs (update existing)
├── [7] AI Usage             ← Token tracking (already built — link here)
└── [8] Financial Reports    ← Monthly, semester, annual summaries
```

---

## SUB-SYSTEM 1 — FINANCE DASHBOARD

**Route:** `/admin/finance` (the default landing page)
**Access:** `SUPER_ADMIN`, `CO_CEO_CFO`

### What it shows

The CFO opens this every morning. It answers: "How is EduCraft's money right now?"

**Top row — Four stat cards:**
```
[Total Revenue This Month]  [Total Payouts This Month]  [Net Retained]  [Projects This Month]
    ₦2,400,000                  ₦1,560,000               ₦840,000            34 projects
    ↑ 18% vs last month         Confirmed paid            After all payouts    34 completed
```

**Second row — Four bucket health cards:**
```
[Operations Reserve]    [Growth Fund]       [Reinvestment Fund]   [Founder Distribution]
    ₦285,000                ₦133,000            ₦133,000              ₦231,000
    ████████░░  80%         ████░░░░░░  40%     ████░░░░░░  38%       ████████░░  82%
    ✅ Healthy              ⚠️ Monitor          ⚠️ Monitor             ✅ Healthy
```

Health thresholds:
- Green (Healthy): balance ≥ 3 months projected operating cost (use ₦150K as baseline until actual data exists)
- Amber (Monitor): balance between 1–3 months projected costs
- Red (Attention): balance < 1 month projected costs

**Third row — Needs Attention panel:**
```
NEEDS ATTENTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  12 workers have unpaid earnings this month    [Go to Payout Engine]
⚠️  8 ambassador commissions pending              [Go to Payout Engine]
⚠️  3 clients have outstanding balances >7 days   [Go to Revenue Tracker]
ℹ️  Founder draws not yet distributed this month  [Go to Founder Draws]
```

**Bottom row — Revenue trend chart:**
- Recharts `AreaChart` or `BarChart`
- Shows last 6 months of total revenue
- Overlay: monthly payout total
- The gap between revenue and payouts = what EduCraft retained

### API route needed:
```
GET /api/admin/finance/dashboard
Returns: {
  currentMonth: { revenue, payouts, retained, projectCount },
  previousMonth: { revenue, payouts, retained, projectCount },
  bucketBalances: { operationsReserve, growthFund, reinvestmentFund, founderDistribution },
  alerts: { unpaidWorkers, unpaidAmbassadors, overdueBalances, founderDrawPending },
  revenueHistory: [{ month, revenue, payouts }] // last 6 months
}
```

---

## SUB-SYSTEM 2 — REVENUE TRACKER

**Route:** `/admin/finance/revenue`
**Access:** `SUPER_ADMIN`, `CO_CEO_CFO`

### What it does

Every naira that enters EduCraft from any client is logged here. This is the
source of truth for income. When a payment is confirmed (Paystack webhook or
manual verification), it flows into Revenue Tracker and triggers bucket allocation.

### The Revenue Tracker table

Columns:
| Date | Project ID | Client Name | Service | Amount | Type | Method | Status | Verified By | Actions |
|---|---|---|---|---|---|---|---|---|---|
| Sep 14 | EC-00234 | John Okafor | FYP Full | ₦70,000 | Downpayment | Bank Transfer | ✅ Confirmed | Prince | [View] |
| Sep 14 | EC-00234 | John Okafor | FYP Full | ₦38,500 | Balance | Paystack | ✅ Confirmed | System | [View] |
| Sep 12 | EC-00198 | Amara Nwosu | FYP Full | ₦70,000 | Full Payment | Paystack | ⏳ Pending | — | [Verify] [Reject] |

**Payment types:** Downpayment (45% of service price) | Balance (55% remaining) | Full Payment

**Payment methods:** Paystack | Bank Transfer | Cash (rare)

**Status:**
- Confirmed — payment verified and processed into buckets
- Pending — payment received but awaiting admin verification
- Rejected — payment could not be verified

### Filters
- Date range picker
- Payment type (Downpayment / Balance / Full)
- Status (All / Confirmed / Pending / Rejected)
- Service type
- Ambassador who referred (for commission tracking)

### The Outstanding Balances sub-tab

Separate view showing all projects where:
- Downpayment has been confirmed
- Balance has NOT been paid
- Grouped by how overdue: <7 days (normal), 7–14 days (follow up), >14 days (escalate)

The CFO uses this to chase outstanding payments. Each row has a [Send Reminder] button
that generates a WhatsApp-ready message template.

### Automatic bucket allocation on payment confirmation

When a payment is marked "Confirmed":

```typescript
async function allocatePaymentToBuckets(payment: Payment) {
  const projectValue = payment.amount;
  const retained = projectValue * 0.40; // EduCraft's retained share

  // Calculate bucket amounts from retained share
  const allocations = {
    operationsReserve:   retained * COMMISSION_RATES.buckets.operationsReserve,
    growthFund:          retained * COMMISSION_RATES.buckets.growthFund,
    reinvestmentFund:    retained * COMMISSION_RATES.buckets.reinvestmentFund,
    founderDistribution: retained * COMMISSION_RATES.buckets.founderDistribution,
  };

  // Add to existing bucket balances
  await prisma.bucketBalance.upsert({
    where: { month: getCurrentMonth() },
    create: { month: getCurrentMonth(), ...allocations },
    update: {
      operationsReserve:   { increment: allocations.operationsReserve },
      growthFund:          { increment: allocations.growthFund },
      reinvestmentFund:    { increment: allocations.reinvestmentFund },
      founderDistribution: { increment: allocations.founderDistribution },
    },
  });

  // Log the allocation
  await prisma.bucketAllocationLog.create({
    data: { paymentId: payment.id, ...allocations },
  });
}
```

**IMPORTANT:** Bucket allocation only happens on "Confirmed" payments — NOT on Pending.
The buckets should never reflect unverified money.

### New Prisma models needed for Sub-System 2:

```prisma
model BucketBalance {
  id                  String   @id @default(cuid())
  month               String   // "2026-09" format — one record per month
  operationsReserve   Float    @default(0)
  growthFund          Float    @default(0)
  reinvestmentFund    Float    @default(0)
  founderDistribution Float    @default(0)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@unique([month])
}

model BucketAllocationLog {
  id                  String   @id @default(cuid())
  paymentId           String
  payment             Payment  @relation(fields: [paymentId], references: [id])
  operationsReserve   Float
  growthFund          Float
  reinvestmentFund    Float
  founderDistribution Float
  allocatedAt         DateTime @default(now())
}
```

Also update the existing `Payment` model to add:
```prisma
  bucketAllocations   BucketAllocationLog[]
  ambassadorId        String?  // which ambassador referred this client
  ambassador          Ambassador? @relation(fields: [ambassadorId], references: [id])
  isAmbassadorDriven  Boolean  @default(false)  // used to trigger HOG commission
```

### API routes needed:
```
GET    /api/admin/finance/revenue?month=2026-09&status=all&type=all
GET    /api/admin/finance/revenue/outstanding
POST   /api/admin/finance/revenue/:id/confirm     — verify a payment + trigger bucket allocation
POST   /api/admin/finance/revenue/:id/reject       — reject a payment
POST   /api/admin/finance/revenue/manual           — manually add a payment record (for cash/bank transfer)
```

---

## SUB-SYSTEM 3 — PAYOUT ENGINE

**Route:** `/admin/finance/payouts`
**Access:** `SUPER_ADMIN` (full), `CO_CEO_CFO` (full), `COO` (submit only — cannot mark as paid)

This is the most complex sub-system. It calculates, displays, and processes
every payout EduCraft owes — to workers, ambassadors, HOG, COO, and growth associates.

### The automatic calculation engine

When the CFO opens the Payout Engine for the current month, the system automatically
calculates all pending payouts from confirmed project completions. No manual entry.
The CFO reviews the calculated amounts, confirms they are correct, and marks as paid.

**Calculation rules:**

```typescript
async function calculateMonthlyPayouts(month: string) {
  const completedProjects = await getCompletedProjectsThisMonth(month);

  const payouts: Payout[] = [];

  for (const project of completedProjects) {
    const value = project.totalValue; // confirmed project value

    // 1. Worker payout — 40% of project value
    payouts.push({
      recipientType: 'WORKER',
      recipientId: project.workerId,
      projectId: project.id,
      amount: value * COMMISSION_RATES.workers,
      basis: '40% worker rate',
    });

    // 2. Ambassador payout — depends on tier and Core/Sub structure
    if (project.isAmbassadorDriven && project.ambassadorId) {
      const ambassador = await getAmbassador(project.ambassadorId);
      const tierRate = getAmbassadorTierRate(ambassador.lifetimeConversions);

      if (ambassador.coreAmbassadorId) {
        // Sub-Ambassador: they get their tier rate, Core gets the override
        const { subRate, coreOverride } = calculateAmbassadorSplit(tierRate);

        payouts.push({
          recipientType: 'AMBASSADOR',
          recipientId: project.ambassadorId,
          projectId: project.id,
          amount: value * subRate,
          basis: `${(subRate * 100).toFixed(0)}% Sub-Ambassador (${ambassador.tier} tier)`,
        });

        if (coreOverride > 0) {
          payouts.push({
            recipientType: 'AMBASSADOR',
            recipientId: ambassador.coreAmbassadorId,
            projectId: project.id,
            amount: value * coreOverride,
            basis: `${(coreOverride * 100).toFixed(0)}% Core override`,
          });
        }
      } else {
        // Regular ambassador (not a Sub): full tier rate
        payouts.push({
          recipientType: 'AMBASSADOR',
          recipientId: project.ambassadorId,
          projectId: project.id,
          amount: value * tierRate,
          basis: `${(tierRate * 100).toFixed(0)}% ambassador rate (${ambassador.tier} tier)`,
        });
      }
    }

    // 3. HOG payout — 2.5% on ambassador-driven projects only
    if (project.isAmbassadorDriven) {
      payouts.push({
        recipientType: 'EXECUTIVE',
        recipientId: 'HOG', // Ayomidele's user ID — resolve from ExecProfile
        projectId: project.id,
        amount: value * COMMISSION_RATES.hog,
        basis: '2.5% HOG commission on ambassador-driven project',
      });
    }

    // 4. COO payout — 2.5% on all delivered projects
    payouts.push({
      recipientType: 'EXECUTIVE',
      recipientId: 'COO', // Emmanuel's user ID
      projectId: project.id,
      amount: value * COMMISSION_RATES.coo,
      basis: '2.5% COO commission on delivered project',
    });
  }

  return payouts;
}
```

### The Payout Engine UI — Three sections

**Section A — Worker Payouts:**
```
WORKER PAYOUTS — September 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Worker           Projects   Total Owed    Status      Action
  ─────────────────────────────────────────────────────────────
  Chidi Okonkwo    8 projects  ₦224,000     ⏳ Unpaid   [Mark Paid ✓]
  Amara Eze        6 projects  ₦168,000     ⏳ Unpaid   [Mark Paid ✓]
  Kunle Adewale    4 projects  ₦112,000     ✅ Paid Sep 22  [View Receipt]
  ─────────────────────────────────────────────────────────────
  TOTAL WORKERS:   18 projects  ₦504,000
                                ₦112,000 paid / ₦392,000 unpaid

  [Mark All Unpaid as Paid]   [Export to CSV]
```

Clicking a worker row expands to show each individual project:
```
  ↳ EC-00234 — FYP Full — John Okafor — ₦28,000   Sep 14  [View Project]
  ↳ EC-00241 — FYP Full — Ngozi Ibe   — ₦28,000   Sep 18  [View Project]
  ↳ ...
```

**Section B — Ambassador Commissions:**
```
AMBASSADOR COMMISSIONS — September 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Ambassador       Tier      Referrals   Rate    Earned      Status      Action
  ──────────────────────────────────────────────────────────────────────────────
  Blessing Eze     🥇 Gold   5 clients   15%     ₦52,500     ⏳ Unpaid   [Mark Paid ✓]
  David Obi        🥈 Silver 3 personal  12%     ₦25,200     ⏳ Unpaid   [Mark Paid ✓]
                             8 overrides  3–5%   ₦28,000
                             TOTAL:              ₦53,200
  Faith Adamu      🥉 Bronze 2 clients   10%     ₦14,000     ✅ Paid Sep 20
  ──────────────────────────────────────────────────────────────────────────────
  TOTAL AMBASSADORS:        18 referrals         ₦119,700
```

Note for David Obi: his row shows both his personal referral earnings AND his
Core override earnings from Sub-Ambassadors he manages. These are displayed
separately for transparency but paid together.

**Section C — Executive Commissions:**
```
EXECUTIVE COMMISSIONS — September 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Executive               Rate   Projects   Amount      Status    Action
  ─────────────────────────────────────────────────────────────────────
  HOG (Ayomidele)         2.5%   34 amb.    ₦49,000     ⏳ Unpaid [Mark Paid ✓]
  COO (Emmanuel)          2.5%   34 total   ₦49,000     ⏳ Unpaid [Mark Paid ✓]
  ─────────────────────────────────────────────────────────────────────
  TOTAL EXECUTIVES:                         ₦98,000

  [Mark All as Paid]
```

**Performance Bonuses (separate section):**
The system does NOT automatically calculate bonuses — these require CFO judgment.
The CFO enters bonuses manually after reviewing the monthly metrics:

```
PERFORMANCE BONUSES — Enter manually based on monthly metrics
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  HOG bonus (if activation rate > 30%):    [₦ ___________] [Add Bonus]
  COO bonus (if QA pass rate > 85%):       [₦ ___________] [Add Bonus]
  COO bonus (if on-time rate > 97%):       [₦ ___________] [Add Bonus]
  COO bonus (if zero supervisor rejections): [₦ ___________] [Add Bonus]
  ─────────────────────────────────────────────────────────
  Reference: HOG activation rate this month: 28% | COO QA pass rate: 87%
```

The metrics shown are pulled from the Operations data so the CFO doesn't need
to ask the COO for the numbers — they're already visible.

### COO's limited view of the Payout Engine

When the COO accesses `/admin/finance/payouts`, they see only:

```
SUBMIT MONTHLY PAYOUT LIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This month you completed 34 projects.
Worker payouts calculated: ₦504,000 across 3 workers.

[Review Worker Payout List]  →  Shows the worker breakdown only (not ambassador or executive payouts)
[Submit to CFO for Processing]
```

The COO can review the worker payout list and submit it. They cannot see ambassador
or executive commissions. They cannot mark anything as paid. They can only submit.

### New Prisma models needed:

```prisma
model PayoutRecord {
  id              String   @id @default(cuid())
  month           String   // "2026-09"
  recipientType   String   // WORKER, AMBASSADOR, EXECUTIVE
  recipientId     String   // Worker ID, Ambassador ID, or exec role string
  recipientName   String   // Stored for display even if user record changes
  projectId       String?
  project         Project? @relation(fields: [projectId], references: [id])
  amount          Float
  basis           String   // Human-readable calculation basis
  status          String   @default("PENDING") // PENDING, PAID, CANCELLED
  paidAt          DateTime?
  paidBy          String?  // ExecProfile ID of who marked it paid
  notes           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model PerformanceBonus {
  id            String   @id @default(cuid())
  month         String
  recipientType String   // EXECUTIVE
  recipientId   String
  recipientName String
  amount        Float
  reason        String   // "HOG activation rate > 30%", etc.
  status        String   @default("PENDING")
  paidAt        DateTime?
  createdAt     DateTime @default(now())
}
```

### API routes needed:
```
GET    /api/admin/finance/payouts?month=2026-09     — all payouts for month
POST   /api/admin/finance/payouts/calculate         — trigger auto-calculation for month
PATCH  /api/admin/finance/payouts/:id/mark-paid     — mark single payout as paid
POST   /api/admin/finance/payouts/mark-all-paid     — mark all unpaid of a type as paid
POST   /api/admin/finance/payouts/bonus             — add a performance bonus
GET    /api/admin/finance/payouts/coo-view          — COO's limited payout view
POST   /api/admin/finance/payouts/coo-submit        — COO submits payout list to CFO
```

---

## SUB-SYSTEM 4 — BUCKET MANAGER

**Route:** `/admin/finance/buckets`
**Access:** `SUPER_ADMIN`, `CO_CEO_CFO`

### What it shows

The four buckets at a glance, with their current balances, monthly flow, and
allocation history. This is where the CFO monitors EduCraft's financial health
and ensures no bucket drops below its threshold.

**Main view — Bucket health dashboard:**

```
BUCKET MANAGER — September 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────────────────────────────────────────┐
│  OPERATIONS RESERVE                     ₦285,000 / ~₦375,000 │
│  37.5% of retained share | 15% of total revenue             │
│  ████████████████████░░░░░  76%                             │
│  Purpose: Platform costs, Claude API, software, emergencies  │
│  Monthly inflow this month: ₦126,000                        │
│  Monthly outflow this month: ₦48,000 (expenses logged)      │
│  Status: ✅ Healthy (>3 months operating costs)             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  GROWTH FUND                            ₦133,000 / ~₦187,500 │
│  17.5% of retained share | 7% of total revenue              │
│  ████████████░░░░░░░░░░░  71%                               │
│  Purpose: Ambassador bonuses, sponsorships, school entry     │
│  Monthly inflow this month: ₦58,800                         │
│  Monthly outflow this month: ₦22,000 (HOG spending)         │
│  Status: ✅ Healthy                                         │
│  HOG Sponsorship Budget This Quarter: ₦50,000 remaining     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  REINVESTMENT FUND                      ₦133,000 / ~₦187,500 │
│  17.5% of retained share | 7% of total revenue              │
│  ████████████░░░░░░░░░░░  71%                               │
│  Purpose: Platform dev, new services, equipment, legal       │
│  Monthly inflow this month: ₦58,800                         │
│  Monthly outflow this month: ₦0                             │
│  Status: ✅ Healthy                                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  FOUNDER DISTRIBUTION                   ₦231,000 / ~₦281,250 │
│  27.5% of retained share | 11% of total revenue             │
│  ████████████████████░░░  82%                               │
│  Purpose: CEO and Co-CEO/CFO monthly draws and bonuses       │
│  Monthly inflow this month: ₦92,400                         │
│  Monthly draws paid: ₦150,000 (₦75,000 each — ₦1M+ tier)   │
│  Current month balance after draws: ₦231,000 (accumulating) │
│  Status: ✅ Healthy — excess building toward semester bonus  │
└─────────────────────────────────────────────────────────────┘
```

**Semester Surplus Analysis (shown at semester end):**
```
SEMESTER END ANALYSIS — Available for Bonus Distribution
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Required minimum reserve (3 months operating costs): ₦450,000
Current Operations Reserve:                          ₦720,000
Surplus above minimum:                               ₦270,000

Founder Distribution accumulated:                    ₦581,000
Already paid as monthly draws:                       ₦450,000
Available for semester bonus:                        ₦131,000

CFO RECOMMENDATION:
  Operations Reserve surplus: ₦270,000 → Release ₦135,000 as semester bonus
  Founder Distribution surplus: ₦131,000 → Release all as semester bonus
  TOTAL SEMESTER BONUS AVAILABLE: ₦266,000 (₦133,000 each)

[Recommend Semester Bonus]   ← Creates a recommendation for CEO approval
```

### New Prisma models needed:

```prisma
model BucketTransaction {
  id            String   @id @default(cuid())
  bucketType    String   // OPERATIONS_RESERVE, GROWTH_FUND, REINVESTMENT, FOUNDER_DISTRIBUTION
  type          String   // INFLOW (from payment), OUTFLOW (expense paid from bucket)
  amount        Float
  description   String
  paymentId     String?  // If inflow from project payment
  expenseId     String?  // If outflow to expense
  recordedBy    String   // ExecProfile ID
  month         String
  createdAt     DateTime @default(now())
}
```

### API routes needed:
```
GET    /api/admin/finance/buckets?month=2026-09         — all bucket balances and transactions
GET    /api/admin/finance/buckets/surplus-analysis       — semester surplus calculation
POST   /api/admin/finance/buckets/manual-adjustment      — CFO manual correction (rare)
POST   /api/admin/finance/buckets/recommend-bonus        — CFO creates semester bonus recommendation
```

---

## SUB-SYSTEM 5 — FOUNDER DRAWS

**Route:** `/admin/finance/founder-draws`
**Access:** `SUPER_ADMIN`, `CO_CEO_CFO`

### What it shows

The founder draw section manages the three channels through which CEO and Co-CEO
receive income: monthly draws (tiered), semester bonuses, and annual profit share.

**Monthly Draw Panel:**
```
FOUNDER MONTHLY DRAWS — September 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current monthly revenue:     ₦2,400,000
Revenue tier:                ₦1M–₦2.5M tier
Draw amount this month:      ₦75,000 each founder

Founder Distribution bucket this month: ₦264,000
Monthly draws (₦75K × 2):             ₦150,000
Remaining in bucket after draws:       ₦114,000 → accumulates for semester bonus

  RECIPIENT            AMOUNT    STATUS         ACTION
  ─────────────────────────────────────────────────────
  CEO — Prince Amadin  ₦75,000   ⏳ Not paid    [Mark as Distributed]
  CFO — Jubilee Abiodun ₦75,000  ⏳ Not paid    [Mark as Distributed]

  [Distribute Both]
```

**The Draw Tier Table (always visible as reference):**
```
DRAW TIER REFERENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Monthly Revenue          Draw (Each Founder)   Current
  ─────────────────────────────────────────────
  Below ₦500,000           ₦0
  ₦500K – ₦999,999        ₦25,000
  ₦1M – ₦2,499,999        ₦75,000               ← You are here
  ₦2.5M – ₦4,999,999      ₦150,000
  ₦5M – ₦9,999,999        ₦300,000
  ₦10M+                   ₦500,000+
```

**Semester Bonus Panel:**
```
SEMESTER BONUS — Available when CFO recommends
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Last CFO recommendation: ₦133,000 each (pending CEO approval)
  [Approve and Distribute]   [View Calculation]   [Decline — Retain in Bucket]
```

**Annual Profit Share:**
```
ANNUAL PROFIT SHARE — December Review
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Available after December year-end CFO report
  Based on surplus across all buckets beyond Q1 operating reserves
  Last year: N/A (first year)
```

**Draw History (12-month table):**
| Month | Revenue | Tier | Draw (Each) | Total Distributed | Semester Bonus | Status |
|---|---|---|---|---|---|---|
| Sep 2026 | ₦2.4M | ₦1M+ tier | ₦75,000 | ⏳ Pending | — | — |
| Aug 2026 | ₦1.8M | ₦1M+ tier | ₦75,000 | ₦150,000 | — | ✅ Paid |

### New Prisma model:

```prisma
model FounderDraw {
  id            String   @id @default(cuid())
  month         String
  drawType      String   // MONTHLY, SEMESTER_BONUS, ANNUAL_PROFIT_SHARE
  recipient     String   // CEO or CFO
  amount        Float
  monthRevenue  Float    // Revenue that month (for tier verification)
  status        String   @default("PENDING")
  distributedAt DateTime?
  approvedBy    String?  // For semester bonus and profit share
  notes         String?
  createdAt     DateTime @default(now())
}
```

### API routes:
```
GET    /api/admin/finance/founder-draws?year=2026       — draw history
POST   /api/admin/finance/founder-draws/distribute      — mark monthly draws as paid
POST   /api/admin/finance/founder-draws/semester-bonus  — distribute approved semester bonus
GET    /api/admin/finance/founder-draws/current-tier    — current revenue tier and draw amount
```

---

## SUB-SYSTEM 6 — EXPENSES

**Route:** `/admin/finance/expenses`
**Access:** `SUPER_ADMIN`, `CO_CEO_CFO`

The existing Expenses model and basic expense tracking already exists. Upgrade it:

**1. Add bucket source to each expense:**
Every expense must specify which bucket it's paid from:
- Operations Reserve: Claude API costs, Vercel hosting, software subscriptions, Paystack fees
- Growth Fund: Ambassador bonuses, student union sponsorships, content production costs
- Reinvestment Fund: New features, legal fees, equipment

**2. Add expense categories:**
```prisma
// Update existing Expense model:
  bucketSource    String   // OPERATIONS_RESERVE, GROWTH_FUND, REINVESTMENT_FUND
  category        String   // API_COST, HOSTING, SOFTWARE, AMBASSADOR_BONUS, etc.
  approvedBy      String?  // ExecProfile ID — expenses above ₦50K need CEO approval
  approvalStatus  String   @default("AUTO_APPROVED") // AUTO_APPROVED, PENDING_APPROVAL, APPROVED
```

**3. Monthly expense summary by bucket:**
Shows the CFO exactly how much is flowing out of each bucket and what for.

**4. HOG sponsorship budget tracking:**
The HOG has a quarterly budget from the Growth Fund for student union sponsorships.
The Expenses section tracks HOG spending against this budget:

```
GROWTH FUND — HOG SPONSORSHIP BUDGET Q3 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Quarterly budget set by CEO:    ₦150,000
  Spent to date:                  ₦72,000
  Remaining:                      ₦78,000
  
  Recent spending:
  Sep 12  UNILAG Dept. of Engineering  ₦30,000  [View]
  Sep 4   UNIBEN Student Union         ₦25,000  [View]
  Aug 28  EKSU Law Faculty             ₦17,000  [View]
```

HOG can enter sponsorship expenses (up to ₦50K each without CEO approval).
Above ₦50K requires CEO approval before the expense is logged against the budget.

### API routes:
```
GET    /api/admin/finance/expenses?month=2026-09&bucket=all
POST   /api/admin/finance/expenses                    — add expense
PATCH  /api/admin/finance/expenses/:id/approve        — CEO approves large expense
GET    /api/admin/finance/expenses/hog-budget?quarter=Q3-2026
```

---

## SUB-SYSTEM 7 — AI USAGE (EXISTING — LINK HERE)

The AI Usage dashboard was already built at `/admin/finance/ai-usage`.
Do NOT rebuild it. Simply ensure:

1. It appears as a tab in the Finance Platform navigation
2. Its costs flow into the Expenses section automatically:
   - Every AI usage log entry should create a corresponding Expense record
   - Bucket source: `OPERATIONS_RESERVE`
   - Category: `API_COST`
   - This happens automatically — no manual entry needed

Add this integration in the AI usage logging function:

```typescript
// When logging AI usage, also create an expense record:
async function logAiUsage(usage: AiUsageData) {
  const log = await prisma.aiUsageLog.create({ data: usage });

  // Auto-create expense from Operations Reserve
  await prisma.expense.create({
    data: {
      description: `Claude API — ${usage.subsystem} (${usage.model})`,
      amount: usage.costNaira,
      date: new Date(),
      bucketSource: 'OPERATIONS_RESERVE',
      category: 'API_COST',
      approvalStatus: 'AUTO_APPROVED',
      projectId: usage.projectId,
      relatedAiLogId: log.id,
    },
  });
}
```

---

## SUB-SYSTEM 8 — FINANCIAL REPORTS

**Route:** `/admin/finance/reports`
**Access:** `SUPER_ADMIN`, `CO_CEO_CFO`

Three report types:

**Monthly Report:**
Auto-generated on the last Friday of each month (or manually triggered).
Contains:
- Total revenue
- Total payouts (workers, ambassadors, executives)
- Net retained
- Bucket balances and movements
- Expenses by category
- Founder draws distributed
- Outstanding balances not yet collected
- Month-over-month comparison

**Semester Report:**
Generated at semester end. Contains:
- All monthly data for the semester
- Cumulative revenue and payouts
- Bucket surplus analysis
- Semester bonus recommendation
- Year-to-date founder draws

**Annual Report:**
Generated in December. Contains:
- Full year financial summary
- Annual profit share calculation
- Tax-relevant data (total revenue, total expenses, net profit)

### Report format
Reports are displayed in-app AND can be exported as a `.docx` file using the existing
docx generation infrastructure. The CFO sends the monthly report to the executive team
via WhatsApp — the docx export makes this easy.

**Report generation API:**
```
GET    /api/admin/finance/reports?type=monthly&period=2026-09
GET    /api/admin/finance/reports?type=semester&period=2026-S2
GET    /api/admin/finance/reports?type=annual&period=2026
POST   /api/admin/finance/reports/export?type=monthly&period=2026-09  — generates .docx
```

---

## SCHEMA ADDITIONS — COMPLETE LIST

Run these all in one migration after confirming the schemas above. Summary:

```prisma
// New models:
model BucketBalance { ... }          // Monthly bucket totals
model BucketAllocationLog { ... }    // Per-payment bucket allocation record
model BucketTransaction { ... }      // Individual bucket debits/credits
model PayoutRecord { ... }           // Every payout owed and its status
model PerformanceBonus { ... }       // CFO-entered bonus payments
model FounderDraw { ... }            // Founder monthly/bonus/profit draws

// Updates to existing models:
Payment {
  + ambassadorId          String?
  + isAmbassadorDriven    Boolean @default(false)
  + bucketAllocations     BucketAllocationLog[]
}

Expense {
  + bucketSource          String?
  + category              String?
  + approvedBy            String?
  + approvalStatus        String @default("AUTO_APPROVED")
  + relatedAiLogId        String?
}
```

After adding the schema, run:
```bash
npm run db:migrate
```

---

## FINANCE PLATFORM NAVIGATION

The `/admin/finance` section has a horizontal sub-navigation:

```
Finance Platform
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Dashboard] [Revenue] [Payouts] [Buckets] [Founder Draws] [Expenses] [AI Usage] [Reports]
```

This sub-navigation is visible only within `/admin/finance/*` routes.
It renders inside the existing admin shell — below the topbar, above the page content.

For the COO accessing `/admin/finance/payouts`:
- They see ONLY the Payouts tab in the sub-navigation
- No other finance tabs are visible or accessible

---

## BUILD SEQUENCE

Follow this exact order. Each step must be working before moving to the next.

```
STEP 1: Schema migration
  — Add all new models and update existing models
  — Run: npm run db:migrate
  — Verify in Supabase that all new tables exist

STEP 2: Commission config file
  — Create src/lib/finance/commission-config.ts
  — All rates and tiers defined as constants
  — Export calculation helper functions

STEP 3: Revenue Tracker
  — Build the Payment table display with filters
  — Build the confirm/reject payment flow
  — Build the automatic bucket allocation on confirm
  — Test: confirm a payment, verify bucket balances update

STEP 4: Bucket Manager
  — Build the four bucket display cards
  — Build the transaction log
  — Build the surplus analysis
  — Test: check that bucket balances reflect confirmed payments

STEP 5: Payout Engine — calculation engine
  — Build the auto-calculation logic (calculate all payouts from completed projects)
  — Test with real project data: verify worker amounts are correct (40%)
  — Test ambassador split: Bronze sub → 10% sub, 5% core
  — Test HOG: 2.5% only on ambassador-driven projects
  — Test COO: 2.5% on all delivered projects

STEP 6: Payout Engine — UI
  — Build all three payout sections (workers, ambassadors, executives)
  — Build the "mark as paid" flow with confirmation dialog
  — Build the performance bonus entry form
  — Build the COO limited view at /admin/finance/payouts
  — Test: COO can see worker payouts, cannot see ambassador or exec payouts

STEP 7: Founder Draws
  — Build the monthly draw calculation from current revenue tier
  — Build the draw distribution flow (marks both founder draws as paid)
  — Build the semester bonus recommendation and approval flow
  — Build the draw history table

STEP 8: Expenses (upgrade existing)
  — Add bucketSource and category fields to existing Expense model
  — Add AI usage auto-expense integration
  — Add HOG sponsorship budget tracking
  — Build the expense approval flow for amounts > ₦50K

STEP 9: Finance Dashboard
  — Build using data from all sub-systems now that they exist
  — Four stat cards (calculated from revenue and payout data)
  — Four bucket health cards (from BucketBalance)
  — Needs Attention panel (unpaid payouts, outstanding balances, pending draws)
  — Revenue trend chart (Recharts AreaChart, 6 months of data)

STEP 10: Financial Reports
  — Build monthly report aggregation
  — Build semester report
  — Build report display page
  — Build docx export (use existing docx infrastructure)

STEP 11: AI Usage integration
  — Confirm AI Usage tab appears in Finance sub-navigation
  — Add the auto-expense creation when AI usage is logged
  — Verify AI costs appear in Expenses under OPERATIONS_RESERVE / API_COST

STEP 12: Finance Platform sub-navigation
  — Build the horizontal sub-nav for /admin/finance/*
  — COO sees only Payouts tab in sub-nav when accessing /admin/finance/payouts

STEP 13: Final verification
  — Full flow test: confirm a payment → verify bucket allocation → check dashboard
  — Payout flow test: complete a project → calculate payouts → mark as paid
  — Founder draw test: set month revenue → verify correct tier → distribute draw
  — COO access test: confirm COO sees only payouts and cannot access other finance tabs
  — Run: npm run build — zero TypeScript errors
  — Deploy to Vercel
```

---

## TESTING CHECKLIST

Before declaring Phase 2 done, every item must pass.

### Mathematical accuracy (most important)
- [ ] Worker payout = exactly 40% of project value — verify for 3 test projects
- [ ] Ambassador payout (no Core/Sub): correct tier rate × project value
- [ ] Ambassador payout (Bronze Sub + Core): Sub gets 10%, Core gets 5%, total = 15%
- [ ] Ambassador payout (Gold Sub + Core): Sub gets 15%, Core gets 0%, total = 15%
- [ ] HOG payout: 2.5% × project value, only on ambassador-driven projects
- [ ] HOG payout: NOT triggered on direct projects (no ambassador referral)
- [ ] COO payout: 2.5% × project value, on ALL delivered projects
- [ ] Bucket allocation from confirmed payment:
  - Operations Reserve = 37.5% × (project value × 40%)
  - Growth Fund = 17.5% × (project value × 40%)
  - Reinvestment = 17.5% × (project value × 40%)
  - Founder Distribution = 27.5% × (project value × 40%)
  - Total of all four buckets = exactly 40% of project value ✅
- [ ] Bucket allocation does NOT happen on Pending payments — only Confirmed
- [ ] Founder draw tier: ₦1M–₦2.5M revenue → ₦75,000 each founder
- [ ] Founder draw tier: ₦500K revenue → ₦25,000 each founder
- [ ] Founder Distribution bucket balance = cumulative allocation − draws paid

### Functional tests
- [ ] Confirming a payment triggers bucket allocation automatically
- [ ] Rejecting a payment does NOT trigger bucket allocation
- [ ] Payout Engine auto-calculates all payouts for completed projects
- [ ] "Mark as Paid" updates PayoutRecord status and records timestamp + who paid
- [ ] COO view: shows worker payouts only, cannot see ambassador/exec commissions
- [ ] COO cannot access /admin/finance/revenue, /admin/finance/buckets, /admin/finance/founder-draws
- [ ] Expense with bucket source correctly reduces that bucket's available balance
- [ ] AI usage costs auto-create expense records in Operations Reserve
- [ ] HOG sponsorship budget tracks correctly against Growth Fund

### UI quality
- [ ] Finance Dashboard loads under 2 seconds (skeleton loaders while fetching)
- [ ] Payout Engine shows correct totals in section headers
- [ ] Bucket health bars show correct percentage and colour (green/amber/red)
- [ ] Revenue Tracker table is sortable and filterable
- [ ] Outstanding Balances tab shows correct aging (7 days / 7–14 days / >14 days)
- [ ] All currency values formatted as ₦X,XXX,XXX (Nigerian naira format)
- [ ] Finance Platform sub-navigation renders correctly on mobile

### Access control
- [ ] All finance routes return 403 for HOG and COO (except /payouts for COO)
- [ ] COO at /admin/finance/payouts: sees worker payouts section only
- [ ] CO_CEO_CFO has full access to all finance sub-routes
- [ ] SUPER_ADMIN has full access to all finance sub-routes

### Build quality
- [ ] `npm run build` passes with zero TypeScript errors
- [ ] No `any` types
- [ ] All currency calculations use `toFixed(2)` or proper decimal handling
  - Use integers (kobo) internally if float precision is a concern
- [ ] Deployed to Vercel successfully

---

## IMPORTANT CONSTRAINTS

**Float precision in financial calculations:**
JavaScript floats can produce rounding errors in financial math. Use this pattern:

```typescript
// Instead of: projectValue * 0.375 * 0.40
// Do: Math.round(projectValue * 0.40 * 0.375 * 100) / 100
// Or better: work in kobo (₦1 = 100 kobo) and store as integers

// Recommended: helper function for all financial calculations
function nairaPercent(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}
```

**Commission config is the only source of truth:**
No rate should appear hardcoded in any component or API route. Every commission
calculation must reference `COMMISSION_RATES` from `src/lib/finance/commission-config.ts`.
This ensures Prince can change a rate in one file and all calculations update.

**The CFO does not enter payout amounts:**
The system calculates everything automatically from project data.
The CFO's job is to review the calculations and mark them as paid — not to do math.
If a payout amount is wrong, the fix is in the project record or the commission config,
not in the payout record itself.

**Pending vs Confirmed payments:**
Never allocate to buckets until a payment is Confirmed.
Never count Pending payments in revenue reports.
Pending payments should appear as "awaiting verification" in the dashboard.

**Do not break Phase 1:**
RBAC, role-based sidebar, and middleware route protection from Phase 1 must
continue to work exactly as built. Phase 2 adds the Finance Platform content —
it does not touch the auth, role, or routing systems.

---

## WHAT PHASE 3 WILL BUILD

For context — Phase 3 is the Ambassador Platform (HOG's system):
- Ambassador profiles with tier tracking and conversion history
- Core/Sub relationship map (who manages whom)
- Commission calculator per ambassador (shows exactly what they earned and why)
- Leaderboard
- Recruitment pipeline
- Student union partnerships tracking
- Growth Associate programme (Year 2, schema ready, UI deferred)

Phase 3 will consume the `PayoutRecord` data from Phase 2 to show ambassadors
their earnings history. Build the PayoutRecord model correctly in Phase 2 and
Phase 3 will be able to use it directly.
