# EduCraft Cashflow — Static-to-Dynamic Rebuild

**Master specification for Claude Code**
Version 1.0 · 30 September 2026
Author: Prince Amadin (CEO) with brainstorming assistance

---

## 0. Purpose

The EduCraft HQ cashflow and commission structure is currently **hardcoded** throughout the codebase. Every percentage — worker 40%, ambassador 10–15%, HOG 2.5%, COO 2.5%, the four buckets (Operations Reserve 37.5%, Growth Fund 17.5%, Reinvestment Fund 17.5%, Founder Distribution 27.5%), the tier thresholds (Bronze 0–5, Silver 6–15, Gold 16–30, Platinum 31+), the override splits (Bronze Sub → Core 5%, Silver Sub → Core 3%), the monthly draw tiers, and the performance bonuses — is baked into TypeScript constants.

This build converts every one of those numbers into **dynamic, super-admin-editable settings** stored in the database, and adds a full **payment tracking system** so the CFO can accrue, review, and clear commissions with proper audit trails.

The definitive reference for the commission model is `EduCraft Cashflow & Commission Structure — v2.0` (already in the codebase / project files).

---

## 1. Scope

### 1.1 In scope for this build

1. Editable commission structure across 3 nested levels with sum-to-100% validation
2. Ability to add, rename, and delete commission recipients, buckets, and sub-expenses
3. Payment trigger events (downpayment / full payment) with the X-10% safety rule
4. Payment tracking state machine (PENDING → ACCRUED → PAID)
5. Weekly ambassador payout queue with Excel export + bulk clear + email
6. Monthly worker + executive payouts on the last Friday of each month
7. Refund workflow (4-stage policy) with commission reversal
8. Pot system (Operations Reserve sub-expenses become tracked pots)
9. Weekly financial statement generator
10. Dynamic HQ contact info (WhatsApp number, email, phone, address)
11. Versioning + audit log for every commission structure change
12. Grandfather rule for existing projects (pre-migration)

### 1.2 Out of scope — do not build

- Live bank API integration (payments happen outside the system; admin marks paid manually)
- Currency other than NGN (USD equivalents shown for pots only, using existing exchange rate system — check CLAUDE.md for the existing exchange rate implementation)
- New ambassador bank detail collection UI (already built — reuse existing profile settings)
- CEO/CFO two-person approval flow (CEO has final authority; CFO handles operations)
- Automatic refund detection (CEO/CFO manually initiate refunds)

### 1.3 What to check in CLAUDE.md before starting

- Existing exchange rate implementation (USD/NGN conversion — do NOT rebuild)
- Existing ambassador bank details storage (in user profile/settings — do NOT rebuild)
- Existing email sending system (SendGrid or equivalent — reuse for payment notifications)
- Existing audit log patterns (if any — extend rather than duplicate)
- Existing admin settings tab structure (add a new tab; do NOT create a new settings page)
- Existing user roles (CEO, CFO/Co-CEO, COO, HOG, Worker, Ambassador) — do NOT redefine

---

## 2. Access Control

| Role | Cashflow settings | Payout actions | Pot spend logging | View financial statement | Refund action |
|------|-------------------|----------------|-------------------|--------------------------|---------------|
| **CEO (super admin)** | Full edit | Full | Full | Full | Full |
| **CFO / Co-CEO** | View only | Full (primary duty) | Full (primary duty) | Full (primary duty) | Full |
| **COO** | View only | View only | View only | View only | None |
| **HOG** | View only | View only | View only (Growth Fund pots only) | View only | None |
| **Worker** | Own dashboard only | Own earnings only | None | None | None |
| **Ambassador** | Own dashboard only | Own earnings only | None | None | None |

**CEO-only settings** enforce at API route level (`requireSuperAdmin`) AND at UI level (settings tab hidden for non-CEO). Do not rely on UI hiding alone.

---

## 3. Data Model

Create these Prisma models. Every change is an additive migration (`prisma migrate diff`, then `npm run db:deploy` — never `db:migrate`).

### 3.1 Cashflow structure

```prisma
// The versioned commission structure. A new CashflowVersion is created
// on every save of the settings tab. Historical projects reference the
// version that was active at their creation.
model CashflowVersion {
  id              String   @id @default(cuid())
  versionNumber   Int      @unique  // 1, 2, 3, ...
  effectiveFrom   DateTime
  effectiveTo     DateTime? // null = currently active
  createdBy       String   // user id (CEO)
  changeReason    String?
  createdAt       DateTime @default(now())

  rules           CommissionRule[]
  tiers           TierRule[]
  overrides       OverrideRule[]
  bonuses         BonusRule[]
  drawTiers       MonthlyDrawTier[]
  triggerConfig   TriggerConfig?
  systemConfig    SystemConfig?

  @@index([effectiveFrom])
}

// A single row in the commission structure.
// Level 1: workers, ambassador, HOG, COO, growth_associate, educraft_retained
// Level 2: operations_reserve, growth_fund, reinvestment_fund, founder_distribution
// Level 3: claude_api, data_pot, software_pot, emergencies (all children of operations_reserve)
model CommissionRule {
  id              String   @id @default(cuid())
  versionId       String
  version         CashflowVersion @relation(fields: [versionId], references: [id])

  key             String   // machine key: "workers", "hog", "operations_reserve", "claude_api"
  label           String   // "Workers", "HOG (Head of Growth)", "Operations Reserve"
  level           Int      // 1, 2, or 3
  parentKey       String?  // null for level 1; "operations_reserve" for Claude API
  percentage      Float    // 40.0, 15.0, 2.5, 37.5, etc.
  displayOrder    Int

  isAbsorber      Boolean  @default(false) // one per level can be flagged
  isPeopleFacing  Boolean  @default(false) // true for Workers, Ambassador, HOG, COO, Founder — cannot be absorber
  isTrackedAsPot  Boolean  @default(false) // level 3 items that need pot tracking

  assignedUserId  String?  // for people-facing rules, the actual staff member
  triggerEventKey String   // "downpayment" | "full_payment" — which trigger fires this

  createdAt       DateTime @default(now())

  @@unique([versionId, key])
  @@index([versionId, level])
  @@index([parentKey])
}

// Ambassador tiers (Bronze/Silver/Gold/Platinum) with rate + threshold
model TierRule {
  id                String   @id @default(cuid())
  versionId         String
  version           CashflowVersion @relation(fields: [versionId], references: [id])

  tierName          String   // "Bronze", "Silver", "Gold", "Platinum"
  minConversions    Int      // 0, 6, 16, 31
  maxConversions    Int?     // 5, 15, 30, null for Platinum
  ratePercent       Float    // 10.0, 12.0, 15.0
  hasQuarterlyBonus Boolean  @default(false)
  quarterlyBonusNgn Float?   // 3000 for Platinum
  displayOrder      Int

  @@unique([versionId, tierName])
}

// Core/Sub override rules — what the Core earns when a Sub of a given tier refers a client
model OverrideRule {
  id                String   @id @default(cuid())
  versionId         String
  version           CashflowVersion @relation(fields: [versionId], references: [id])

  subTierName       String   // "Bronze", "Silver", "Gold", "Platinum"
  coreOverridePct   Float    // 5.0, 3.0, 0.0, 0.0
  // Rule: subTierRate + coreOverridePct MUST equal the total ambassador allocation (currently 15%)
}

// Performance bonuses (HOG/COO/Platinum quarterly)
model BonusRule {
  id              String   @id @default(cuid())
  versionId       String
  version         CashflowVersion @relation(fields: [versionId], references: [id])

  recipientKey    String   // "hog", "coo", "platinum_ambassador"
  bonusName       String   // "Monthly ambassador activation rate > 30%"
  condition       String   // free-text description of the condition
  amountNgn       Float    // 30000, 50000, 75000
  cadence         String   // "monthly" | "quarterly"
  displayOrder    Int
}

// The 6 revenue-based tiers for founder monthly draws
model MonthlyDrawTier {
  id                    String   @id @default(cuid())
  versionId             String
  version               CashflowVersion @relation(fields: [versionId], references: [id])

  minRevenueNgn         Float
  maxRevenueNgn         Float?   // null for the top tier
  drawPerFounderNgn     Float    // 0, 25000, 75000, 150000, 300000, 500000
  displayOrder          Int
}

// Which rules fire at downpayment vs at full payment
model TriggerConfig {
  id                    String   @id @default(cuid())
  versionId             String   @unique
  version               CashflowVersion @relation(fields: [versionId], references: [id])

  downpaymentPercent    Float    // 45.0 by default — the downpayment threshold
  bufferPercent         Float    // 10.0 — the X-10% safety buffer
  // The list of rule keys that fire at downpayment is stored on CommissionRule.triggerEventKey
}

// Global system settings (HQ contacts, etc.)
model SystemConfig {
  id                    String   @id @default(cuid())
  versionId             String   @unique
  version               CashflowVersion @relation(fields: [versionId], references: [id])

  hqWhatsAppNumber      String   // "+234..." — the dynamic number
  hqEmail               String
  hqPhoneNumber         String?
  hqAddress             String?
  hqTelegramHandle      String?
  currency              String   @default("NGN")
}
```

### 3.2 Payment tracking

```prisma
// One row per (recipient, project, ruleKey). Created when a project starts.
model CommissionEntry {
  id                String   @id @default(cuid())
  projectId         String
  project           Project  @relation(fields: [projectId], references: [id])

  recipientUserId   String   // ambassador, worker, HOG, COO, etc.
  recipientRole     String   // "ambassador", "worker", "hog", "coo", "growth_associate"
  ruleKey           String   // matches CommissionRule.key
  cashflowVersionId String   // frozen at project creation for rate stability

  amountNgn         Float    // calculated at creation from the version's rates
  ratePercent       Float    // stored for display
  triggerEventKey   String   // "downpayment" | "full_payment"

  status            CommissionStatus @default(PENDING)
  accruedAt         DateTime?
  paidAt            DateTime?
  paidInBatchId     String?  // links to WeeklyPayoutBatch or MonthlyPayoutBatch
  reversedAt        DateTime?
  reversalReason    String?
  refundId          String?  // links to RefundRecord if reversed by refund

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([recipientUserId, status])
  @@index([projectId])
  @@index([triggerEventKey, status])
}

enum CommissionStatus {
  PENDING   // project exists, trigger not yet fired
  ACCRUED   // trigger fired, money is owed
  PAID      // marked paid by admin, in a monthly earning record
  REVERSED  // rolled back by refund action
}

// One row per person per month showing what they were paid
model EarningRecord {
  id                String   @id @default(cuid())
  recipientUserId   String
  recipientRole     String
  yearMonth         String   // "2026-10"

  totalAmountNgn    Float
  commissionCount   Int
  commissionIds     String[] // the specific CommissionEntry ids

  paidAt            DateTime
  paidByUserId      String   // CEO or CFO
  paymentMethod     String   // "bank_transfer" | "cash" | "crypto" | "other"
  batchReference    String?  // "BATCH-2026W40" or manual reference
  bankConfirmationFileId String? // uploaded screenshot/PDF
  notes             String?

  createdAt         DateTime @default(now())

  @@index([recipientUserId, yearMonth])
}

// The weekly ambassador payout batch (every Saturday)
model WeeklyPayoutBatch {
  id                String   @id @default(cuid())
  weekEnding        DateTime // the Saturday date
  totalAmountNgn    Float
  ambassadorCount   Int

  status            PayoutBatchStatus @default(DRAFT)
  createdAt         DateTime @default(now())
  clearedAt         DateTime?
  clearedByUserId   String?
  paymentMethod     String?
  batchReference    String
  bankConfirmationFileId String?

  emailsScheduledAt DateTime? // when the delayed emails are set to fire
  emailsSentAt      DateTime? // when they actually went out
  undoDeadline      DateTime? // clearedAt + 10 minutes
  undoneAt          DateTime?
  undoneByUserId    String?

  commissionEntries CommissionEntry[]
}

enum PayoutBatchStatus {
  DRAFT      // queue is being built
  READY      // ready for CFO to clear
  CLEARED    // marked paid; within undo window
  FINALIZED  // undo window passed; emails sent
  UNDONE     // rolled back
}

// Same shape for monthly worker/executive payouts (last Friday of each month)
model MonthlyPayoutBatch {
  id                String   @id @default(cuid())
  yearMonth         String   // "2026-10"
  cohort            String   // "workers" | "executives"
  totalAmountNgn    Float
  recipientCount    Int

  status            PayoutBatchStatus @default(DRAFT)
  createdAt         DateTime @default(now())
  clearedAt         DateTime?
  clearedByUserId   String?
  paymentMethod     String?
  batchReference    String
  bankConfirmationFileId String?

  emailsScheduledAt DateTime?
  emailsSentAt      DateTime?
  undoDeadline      DateTime?
  undoneAt          DateTime?
  undoneByUserId    String?
}
```

### 3.3 Pot tracking

```prisma
// A pot is a level-3 (or bucket-level) tracked category.
// Every project's downpayment credits every pot proportionally.
// Every CFO-logged spend debits a chosen pot.
model PotBalance {
  id                String   @id @default(cuid())
  potKey            String   @unique // "claude_api", "data_pot", "software_pot", "emergencies"
  potLabel          String

  currentBalanceNgn Float    @default(0)
  totalAccruedNgn   Float    @default(0) // lifetime accrual
  totalSpentNgn     Float    @default(0) // lifetime spend
  lastUpdatedAt     DateTime @updatedAt
}

model PotSpend {
  id                String   @id @default(cuid())
  potKey            String?  // null = "General expense / no pot"
  amountNgn         Float
  spentAt           DateTime
  loggedByUserId    String   // CFO usually
  vendor            String?  // "Anthropic", "Vercel", "GTBank fees"
  reference         String?
  notes             String?
  receiptFileId     String?

  createdAt         DateTime @default(now())

  @@index([potKey, spentAt])
}

// One row per commission entry that credited a pot (for audit)
model PotAccrual {
  id                  String   @id @default(cuid())
  potKey              String
  projectId           String
  commissionEntryId   String
  amountNgn           Float
  accruedAt           DateTime

  @@index([potKey, accruedAt])
}
```

### 3.4 Refunds + audit

```prisma
model RefundRecord {
  id                String   @id @default(cuid())
  projectId         String
  project           Project  @relation(fields: [projectId], references: [id])

  refundStage       Int      // 1, 2, 3, 4 (from the 4-stage policy)
  refundPercent     Float    // 100, 75, 50, 25, 0 (customizable within stage)
  refundAmountNgn   Float
  reason            String
  initiatedByUserId String   // CEO or CFO
  reversedCommissions String[] // CommissionEntry ids that were reversed

  createdAt         DateTime @default(now())
}

model CashflowAuditLog {
  id              String   @id @default(cuid())
  actorUserId     String
  action          String   // "created_version", "cleared_batch", "reversed_commission", "changed_hq_number", ...
  entityType      String   // "CashflowVersion", "WeeklyPayoutBatch", "SystemConfig", ...
  entityId        String
  beforeJson      Json?
  afterJson       Json?
  reason          String?
  createdAt       DateTime @default(now())

  @@index([actorUserId, createdAt])
  @@index([entityType, entityId])
}
```

---

## 4. Settings UI — The "EduCraft Cashflow" Tab

Add a new tab in `admin/settings` called **"EduCraft Cashflow"**. Only visible to CEO. Structure:

### 4.1 Section A — Revenue Split (Level 1)

Table with columns: `Recipient`, `Type` (Person / Fund), `Assigned to` (dropdown of staff for Person rows), `Trigger` (downpayment / full_payment), `%`, `Actions` (edit / delete).

Below the table:
- **Running total**: `TOTAL: 100.0% ✓` in green, or `TOTAL: 102.0% ✗ Over by 2%` in red
- **Default absorber**: dropdown of Fund-type rows only (never Person rows)
- **Auto-balance** button — subtracts overage from the absorber
- **Add row** button — opens a modal to name a new recipient, pick type, assign staff (if Person), set percentage, pick trigger

Default rows on migration:
| Recipient | Type | Trigger | % |
|-----------|------|---------|---|
| Workers | Person (Worker role, multiple) | full_payment | 40.0 |
| Ambassador | Person (Ambassador role, dynamic) | downpayment | 15.0 (Gold default) |
| HOG | Person (assigned) | full_payment | 2.5 |
| COO | Person (assigned) | full_payment | 2.5 |
| Growth Associate | Person (Year 2, inactive default) | full_payment | 0.0 |
| EduCraft retains | Fund (absorber) | — | 40.0 |

### 4.2 Section B — Bucket Allocation (Level 2)

Same table shape. Parent is always "EduCraft retains." Percentages sum to 100% of the retained share (not of total revenue).

Default rows:
| Bucket | % of retained | Holds | Trigger |
|--------|--------------|-------|---------|
| Operations Reserve | 37.5 | CFO | full_payment |
| Growth Fund | 17.5 | HOG spends, CFO tracks | downpayment |
| Reinvestment Fund | 17.5 | CEO directs, CFO holds | full_payment |
| Founder Distribution | 27.5 | CEO + CFO 50/50 | full_payment |

### 4.3 Section C — Sub-Expense Pots (Level 3)

Table under Operations Reserve. Each row is a pot.

Default rows:
| Pot | % of Ops Reserve | Description |
|-----|------------------|-------------|
| Claude API | 40 | Read into API usage tab |
| Data pot | 20 | Hosting, database |
| Software pot | 15 | Vercel, domains, SendGrid |
| Emergencies (absorber) | 25 | Buffer |

Can also add level-3 pots under Growth Fund, Reinvestment Fund if the CEO wants. When adding, ask which parent bucket it belongs to.

### 4.4 Section D — Ambassador Tiers

Editable table:
| Tier | Min conversions | Max | Rate % | Quarterly bonus (₦) |
|------|----------------|-----|--------|----------------------|
| Bronze | 0 | 5 | 10.0 | — |
| Silver | 6 | 15 | 12.0 | — |
| Gold | 16 | 30 | 15.0 | — |
| Platinum | 31 | — | 15.0 | 3,000 |

Validation: tier min/max must not overlap. Rates need not sum to anything (they're independent).

### 4.5 Section E — Core/Sub Override Rules

| Sub's tier | Sub earns | Core override | Total EduCraft pays |
|------------|-----------|---------------|---------------------|
| Bronze | 10% | 5% | 15% |
| Silver | 12% | 3% | 15% |
| Gold | 15% | 0% | 15% |
| Platinum | 15% | 0% | 15% |

Validation: `subRate + coreOverride === ambassador allocation from Level 1` for every row. If Level 1 ambassador changes from 15% to 16%, this table shows red warnings and the CEO must reconcile.

### 4.6 Section F — Bonuses

Three sub-tables:
- **HOG bonuses** (Monthly ambassador activation, new school, quarterly challenge, monthly new client target)
- **COO bonuses** (QA first-pass, on-time delivery, zero rejections, satisfaction score)
- **Platinum quarterly** (per-client bonus amount)

Each row: condition (text), amount (₦), cadence (monthly/quarterly). Add / edit / delete supported.

### 4.7 Section G — Founder Monthly Draw Tiers

| Revenue min | Revenue max | Draw per founder |
|-------------|-------------|-------------------|
| ₦0 | ₦499,999 | ₦0 |
| ₦500,000 | ₦999,999 | ₦25,000 |
| ₦1,000,000 | ₦2,499,999 | ₦75,000 |
| ₦2,500,000 | ₦4,999,999 | ₦150,000 |
| ₦5,000,000 | ₦9,999,999 | ₦300,000 |
| ₦10,000,000 | — | ₦500,000 |

Validation: tiers must not have gaps or overlaps. The CEO can add or remove tiers.

### 4.8 Section H — Trigger Configuration

Two fields:
- **Downpayment %**: 45.0 (editable)
- **Safety buffer %**: 10.0 (editable, informational — governs the X-10% rule)

**The X-10% Rule** (display as a warning card):
> The sum of all commissions with trigger = `downpayment` must be ≤ (Downpayment % − Safety buffer %). With current settings, that's ≤ 35.0%. Any change to Level 1 or Level 2 that pushes downpayment-triggered commissions over 35% will be rejected.

### 4.9 Section I — HQ Contact Info

Editable fields:
- HQ WhatsApp number (required, format: +234...)
- HQ email (required)
- HQ phone (optional)
- HQ Telegram handle (optional)
- HQ address (optional)

**Save flow with preview step**:
1. CEO edits values
2. Clicks Save
3. Preview modal shows: "The following will change: WhatsApp +234 111 → +234 222. This will update every ambassador link, HOG dashboard, worker contact, and client email footer immediately. Confirm?"
4. CEO confirms → change applies

Every screen that currently uses a hardcoded number/email must be refactored to read from `SystemConfig` at runtime.

### 4.10 Save flow for the whole tab

Clicking **Save** at the bottom:
1. Runs all validations client-side (100% sums, X-10% rule, tier overlap, override reconciliation)
2. If any error → shows a red banner listing every violation; Save is disabled
3. If clean → shows a summary modal: "You are about to publish Cashflow Version 3. This replaces Version 2 (active since 4 September 2026). Changes: [list of diffs]. Effective from [datetime]. Continue?"
4. On confirm:
   - Creates a new `CashflowVersion` with `versionNumber = previous + 1`
   - Marks previous version's `effectiveTo = now()`
   - Copies all rules/tiers/overrides/bonuses/draws/config into the new version
   - New projects from this moment onward reference this version
   - Existing projects keep referencing their original version (grandfather)
   - Writes an entry in `CashflowAuditLog`

---

## 5. Payment Tracking State Machine

Every `CommissionEntry` transitions:

```
PENDING → ACCRUED → PAID
                 ↓
              REVERSED
```

### 5.1 PENDING

Created when a project is created. One row per (rule, project) pair for every applicable rule in the project's `CashflowVersion`. Not yet visible on the recipient's dashboard.

### 5.2 PENDING → ACCRUED

Triggered by payment events on the project:

- **Client pays ≥ downpayment %** (currently 45%) → all entries with `triggerEventKey = "downpayment"` on this project transition to ACCRUED
- **Client pays 100%** → all entries with `triggerEventKey = "full_payment"` on this project transition to ACCRUED
- Set `accruedAt = now()`

On ACCRUED, credit the corresponding pot balances (if the rule `isTrackedAsPot`) via `PotAccrual` rows. Update `PotBalance.currentBalanceNgn` and `totalAccruedNgn`.

### 5.3 ACCRUED → PAID

Only via a payout batch (weekly or monthly). Never per-entry directly. When a batch is cleared:
- All entries in the batch → PAID
- Set `paidAt = clearedAt` and `paidInBatchId = batch.id`
- Create/update `EarningRecord` rows per recipient per month

### 5.4 ACCRUED → REVERSED

Only via a `RefundRecord` action initiated by CEO or CFO. Requires a reason. Emits an audit log entry and updates the recipient's dashboard to show the reversal with the reason ("Client refunded — cancelled before work started").

### 5.5 Dashboards

**Ambassador dashboard:**
- **Current balance** section — sum of ACCRUED for this ambassador. Do NOT show PENDING.
- **Earning records** section — list of past months with `EarningRecord` totals; expandable to show per-project breakdown
- **Notice banner**: "Payments run every Saturday. Your earnings are transferred to your registered bank account."

**Worker dashboard:**
- Same structure
- Banner: "Payments run on the last Friday of each month. Earnings are transferred to your registered bank account."

**Executive dashboard (HOG/COO):**
- Same structure
- Banner: "Commission payouts on the last Friday of each month. Bonuses are included in the same payout."

**Founder dashboard (CEO/CFO):**
- Additional section showing the tiered draw calculation for the current month
- "Founder distribution bucket: ₦X currently accumulated"
- Notice: "Founder draws are paid on the 1st of each month."

---

## 6. The X-10% Safety Rule

### 6.1 Purpose

The buffer between the downpayment received and the commissions triggered at downpayment. Protects against refunds (Stage 1 refunds may need to release money the ambassador already got), bank transfer fees, and admin overhead.

### 6.2 Calculation

`Sum(rules where triggerEventKey = "downpayment") ≤ (downpaymentPercent − bufferPercent)`

With defaults: `≤ (45 − 10) = 35%` of project revenue.

### 6.3 Enforcement

- **UI level**: as CEO edits, if the constraint is violated, show a red warning: "Downpayment-triggered commissions (37%) exceed the safety limit (35%). Move some to full_payment or reduce percentages."
- **API level**: `POST /api/admin/cashflow/publish` rejects with 400 if violated
- **Auto-balance**: if the absorber is a downpayment-triggered rule and the auto-balance would push it over the limit, refuse the auto-balance with an explanation

---

## 7. Payout Operations

### 7.1 Weekly ambassador payout (every Saturday)

**Schedule**: `WeeklyPayoutBatch` auto-generated every Saturday at 00:01 Africa/Lagos.

**Content**: all ACCRUED commissions where `recipientRole = "ambassador"` and not already in a batch.

**Queue view** (CFO dashboard, "Ambassador payouts" section):

```
Week ending Sat 4 Oct 2026 — 27 ambassadors — ₦1,847,500

[ Download as Excel ] [ Preview email ] [ Mark all as paid ]

Ambassador     Tier     Bank         Account       Account name      Amount    Actions
─────────────────────────────────────────────────────────────────────────────────────────
Sarah Adeoye   Gold     GTBank       0123456789   Sarah Adeoye      ₦52,500   [Details]
David Okon     Silver   First Bank   3210987654   David Okon        ₦33,600   [Details]
...

Missing bank details (2 ambassadors) — cannot pay:
─────────────────────────────────────────
Alex Aina      Bronze   —            —            —                 ₦21,000   [Remind]
```

**Excel export columns**: Ambassador ID · Full name · Tier · Bank name · Account number · Account name · Amount (₦) · Conversions this week · Project IDs · Week ending date · Notes

**Missing bank details**: ambassadors without registered bank info do NOT appear in the payable section. They appear in a separate list, stay ACCRUED (not cleared), and receive an automated reminder email.

### 7.2 Monthly worker payout (last Friday of each month)

**Schedule**: `MonthlyPayoutBatch` with `cohort = "workers"` auto-generated at 00:01 on the last Friday of the month.

**Content**: all ACCRUED commissions where `recipientRole = "worker"` and not already in a batch.

Same queue structure as weekly ambassador queue. Same Excel export. Same bulk clear flow.

### 7.3 Monthly executive payout (last Friday of each month)

Same as workers, but `cohort = "executives"` — includes HOG, COO, and any other Level 1 people-facing roles the CEO has added. Includes their performance bonuses if the conditions were met that month (bonus logic per Section 4.6).

### 7.4 Founder monthly draw (1st of each month)

Auto-triggered on the 1st of each month:
1. Read the previous month's total revenue
2. Match to the correct `MonthlyDrawTier`
3. Create ACCRUED `CommissionEntry` for CEO and CFO with `amountNgn = drawPerFounderNgn`
4. Any surplus in the Founder Distribution bucket stays in the bucket (semester bonus accumulation)
5. Auto-create a `MonthlyPayoutBatch` with `cohort = "founders"` — CFO clears it manually with reference

---

## 8. Bulk Clear + Email Flow

### 8.1 Clear action (any payout batch)

1. User clicks **"Mark all as paid"** on the queue view
2. Confirmation modal:
   ```
   Confirm payout — Sat 4 Oct 2026
   27 ambassadors · Total ₦1,847,500

   Payment method:  [Bank transfer ▼]
   Batch reference: [BATCH-2026W40         ]  (editable)
   Bank confirmation (required): [Upload file]
   Notes (optional): [                    ]

   ☑ Send email confirmation to each ambassador after the 10-minute undo window

   [Cancel]  [Confirm and mark all paid]
   ```
3. On confirm:
   - All entries in the batch → PAID with `paidAt = now()`, `paidInBatchId = batch.id`
   - `EarningRecord` rows created/updated per recipient
   - `WeeklyPayoutBatch.status = CLEARED`, `clearedAt = now()`, `undoDeadline = clearedAt + 10 minutes`
   - `emailsScheduledAt = clearedAt + 10 minutes`
   - Recipient dashboards immediately reflect: current balance drops to 0, October record shows the amount
   - Audit log entry created
   - Undo banner appears on CFO dashboard: **"27 ambassadors marked paid at 6:47 AM. Undo available until 6:57 AM. [Undo]"**

### 8.2 Undo (within 10 minutes)

1. CFO clicks Undo before the deadline
2. Confirmation: "Roll back the payout of 27 ambassadors totalling ₦1,847,500? Emails have NOT been sent yet."
3. On confirm:
   - All entries → back to ACCRUED, `paidAt = null`, `paidInBatchId = null`
   - `EarningRecord` rows deleted for the affected month
   - `WeeklyPayoutBatch.status = UNDONE`, `undoneAt = now()`, `undoneByUserId = actor`
   - Scheduled emails cancelled
   - Recipient dashboards revert
   - Audit log entry

### 8.3 Email sending (after 10-minute window)

At `emailsScheduledAt`:
1. Job wakes up
2. Verifies batch is still CLEARED (not UNDONE)
3. Sends email to each recipient
4. On success per recipient: log delivery timestamp
5. On failure per recipient: log failure; show red warning on CFO dashboard for that recipient
6. Sets `WeeklyPayoutBatch.status = FINALIZED`, `emailsSentAt = now()`

### 8.4 Email template (ambassador)

Subject: **`EduCraft — Your weekly payment has been sent (₦{amount})`**

```
Hi {ambassadorFirstName},

Your weekly ambassador commission has been sent to your registered
bank account.

PAYMENT SUMMARY
──────────────
Amount:         ₦{amount}
Payment method: {method}
Reference:      {batchReference}
Sent to:        {bankName} ••••{last4} ({accountName})
Sent on:        {dateFormatted}

BREAKDOWN ({conversionCount} conversion(s) this week)
──────────────
{foreach commission}
• {projectId} · {clientName} · ₦{amount}
{endforeach}

If you have not received this payment within 24 hours or the amount
does not match, please reply to this email or contact EduCraft
support at {hqEmail}.

— EduCraft Finance
```

**Rules**:
- Amount in email MUST equal amount in system MUST equal amount in Excel MUST equal amount CFO transferred. Enforce via a single source of truth (the `CommissionEntry.amountNgn` sums).
- Bank details in the email show last 4 digits only.
- `{hqEmail}` reads from `SystemConfig`.

### 8.5 Worker + executive email templates

Same shape, different wording. Cadence line adjusted: "monthly payment" instead of "weekly payment." Breakdown lists per-project or per-bonus lines.

---

## 9. Refund Workflow

### 9.1 The 4-stage policy

| Stage | Timing | Refund % | Ambassador commission | Ops Reserve / Growth Fund pots |
|-------|--------|----------|----------------------|--------------------------------|
| 1 | Within 48 hours of downpayment, no work started | 100% | Reversed | Reversed |
| 2 | Work started, Chapter 1 not delivered | 75% | Kept | Kept |
| 3 | Chapter 1 or 2 delivered, client abandons | 50% | Kept | Kept |
| 4 | Full report delivered | 0% (revision offered instead) | Kept | Kept |

### 9.2 UI

On the admin project page (CEO/CFO only), a **"Process refund"** button opens a modal:

```
Refund — EC-01234

Detected stage: Stage 2 (Chapter 1 not yet delivered)  [override ▼]
Refund percent: 75%  (editable — must be within stage bounds)
Refund amount:  ₦23,625 (auto-calculated from downpayment)

Reason (required):
[                                          ]

Commission actions:
☐ Reverse Ambassador Sarah Adeoye's ₦10,500 commission
  Reversal reason: [Client refunded before Chapter 1]

Bank transfer confirmation (required): [Upload file]

[Cancel]  [Process refund]
```

### 9.3 On process

1. Create `RefundRecord`
2. For each checked commission → set to REVERSED with the reason
3. Debit corresponding pots for any bucket allocations that get reversed
4. Update project status to `REFUNDED`
5. Audit log entry
6. Send email to client confirming the refund + reason
7. If ambassador commission was reversed AND already PAID (unlikely but possible), the reversal creates a negative earning record — CFO manages the recovery

### 9.4 Stage 1 automation

For Stage 1 refunds (within 48 hours), the system defaults to reversing ambassador commission and pot allocations. CEO can uncheck if they want to protect the ambassador (goodwill gesture — buffer covers the loss).

---

## 10. Pot System

### 10.1 What accrues

Every level-3 rule with `isTrackedAsPot = true` gets a `PotBalance` row. When a project's downpayment or full_payment triggers, the pot balance is credited via a `PotAccrual` row.

Example: project ₦70,000, downpayment paid, Ops Reserve → 15% of revenue = ₦10,500 credited to Ops Reserve. Then split by pot ratios:
- Claude API (40% of Ops Reserve) → ₦4,200 credited to `claude_api` pot
- Data (20%) → ₦2,100
- Software (15%) → ₦1,575
- Emergencies (25%) → ₦2,625

### 10.2 CFO expense logging UI

CFO dashboard has a **"Log spend"** button:

```
Log spend

Amount:         ₦[     ]
Date:           [pick date]
Allocated to:   [Claude API pot         ▼]
                  ├── Claude API pot     (balance ₦145,200)
                  ├── Data pot           (balance ₦72,400)
                  ├── Software pot       (balance ₦58,100)
                  ├── Ambassador bonuses (balance ₦210,000)
                  ├── Emergencies pot    (balance ₦89,300)
                  └── No pot / general expense
Vendor:         [Anthropic         ]
Reference:      [                  ]
Notes:          [                  ]
Receipt:        [Upload file]

[Cancel]  [Log spend]
```

On save:
1. Create `PotSpend` row
2. If `potKey` is set → decrement `PotBalance.currentBalanceNgn`, increment `totalSpentNgn`
3. If `potKey` is null (no pot) → row lives in `PotSpend` with `potKey = null`, shows on the CFO's monthly review as "unallocated spends"

### 10.3 API usage tab

Reads `PotBalance` for `claude_api`. Shows:
- Current balance (₦)
- USD equivalent (using existing exchange rate — check CLAUDE.md)
- "You can top up ~$X worth of Claude credits based on your current pot balance"
- Log spend button pre-fills `potKey = "claude_api"`

### 10.4 Other pot tabs

Every pot with `isTrackedAsPot = true` gets a similar tile on the CFO dashboard showing current balance, lifetime accrual, lifetime spend, and USD equivalent. HOG sees only Growth Fund pots.

---

## 11. Weekly Financial Statement

### 11.1 Trigger

Manual button on the CFO dashboard: **"Generate weekly financial statement"**.

### 11.2 Content

Statement covers Monday–Sunday of the selected week (default: the most recently completed week).

Sections:
1. **Header**: EduCraft Weekly Financial Statement — Week of DD MMM to DD MMM YYYY. Generated by [CFO name] at [timestamp].
2. **Revenue**: total revenue received this week, breakdown by project (count and value), downpayments received, full payments received.
3. **Commissions accrued this week**: total ACCRUED created this week, broken down by recipient role.
4. **Payouts this week**: WeeklyPayoutBatch cleared (if any), MonthlyPayoutBatch if applicable, founder draws if applicable, total ₦ transferred out.
5. **Pot movements**: for each pot, opening balance / accruals / spends / closing balance.
6. **Refunds**: any refunds processed with amounts and reasons.
7. **Bucket health**: current balance in each of the four buckets (Operations Reserve, Growth Fund, Reinvestment Fund, Founder Distribution).
8. **Outstanding balances**: total ACCRUED not yet PAID across all recipients (a liability).
9. **Cashflow position**: revenue in − commissions accrued − pot spends = net position for the week.
10. **Notes** (free-text section for CFO to add commentary).

### 11.3 Output

- On-screen view with all sections
- **Download as PDF** button
- **Download as Excel** button (data-heavy sections as sheets)
- Optionally auto-email to CEO every Sunday at a chosen time (setting in CFO preferences)

### 11.4 Storage

Every generated statement is saved as a `FinancialStatement` record with the week range, generated timestamp, and file references (PDF + Excel). Historical statements listed on the CFO dashboard.

---

## 12. Grandfather Rule

Existing projects (EC-00001, EC-00002, and any others created before this build ships) do NOT retroactively get the new commission structure applied.

### 12.1 Migration behaviour

1. On first deploy: seed `CashflowVersion` v1 with all the current hardcoded values (from the manual v2.0)
2. Existing projects get their `CommissionEntry` rows created against v1 rates, based on their existing state (any commissions already paid stay PAID)
3. Any existing "commission owed" tracking in the old system is converted to ACCRUED status
4. Any new project created after deploy uses whichever version is active at creation

### 12.2 CEO's first-time edit

The first time the CEO opens the Cashflow settings tab post-deploy, it shows v1 populated with the manual's numbers. Editing and saving creates v2. From that point forward, v2 rates apply to new projects.

---

## 13. Validation Rules Summary

Every rule enforced client-side (live UI feedback) AND server-side (on save/publish):

1. **Sum-to-100% at each level** — cannot save if any level ≠ 100%
2. **X-10% rule** — downpayment-triggered sum ≤ (downpayment% − buffer%)
3. **Absorber restriction** — absorber must be a Fund/Reserve rule, never a Person rule
4. **Tier ranges** — Bronze/Silver/Gold/Platinum thresholds must not overlap or leave gaps
5. **Override reconciliation** — every override row must satisfy `subRate + coreOverride === Level 1 ambassador rate`
6. **Draw tier ranges** — no overlaps or gaps in revenue brackets
7. **Percentages** — every value ≥ 0, ≤ 100
8. **Required person assignments** — every Person-type Level 1 rule must have `assignedUserId` set (or be marked as multi-recipient like Workers/Ambassadors)
9. **HQ contact** — WhatsApp number in international format (+234...), email is valid
10. **Bank confirmation upload** — required on any bulk clear or refund

---

## 14. Build Order

Ship in phases. Each phase is a separate branch, tested and deployed before the next begins. Do NOT ship everything in one big branch — this is a financial system and each phase must be verified live.

### Phase 1 — Foundation (data model + settings UI, no payment tracking yet)
- Prisma migration for all Cashflow structure tables (CashflowVersion, CommissionRule, TierRule, OverrideRule, BonusRule, MonthlyDrawTier, TriggerConfig, SystemConfig, CashflowAuditLog)
- Seed v1 with manual v2.0 values
- Build the settings tab UI (all 9 sections)
- Live UI validation
- Publish flow with version creation
- Read-side migration: replace every hardcoded percentage in the codebase with a lookup on the active `CashflowVersion`
- Check script: `npm run check:cashflow-static` fails if any hardcoded percentage remains

### Phase 2 — HQ contact dynamic
- SystemConfig read integration everywhere
- Preview + confirm flow

### Phase 3 — Payment tracking state machine
- CommissionEntry, EarningRecord tables
- Auto-create PENDING entries on project creation
- Trigger event detection on payment received
- ACCRUED transition + pot accrual
- Dashboard updates (ambassador, worker, executive, founder)

### Phase 4 — Pot system
- PotBalance, PotSpend, PotAccrual tables
- CFO expense logging UI
- Pot tiles on CFO dashboard
- API usage tab integration

### Phase 5 — Payout batches + bulk clear + email delay
- WeeklyPayoutBatch, MonthlyPayoutBatch tables
- Auto-generation cron (Saturday for ambassadors; last Friday for workers/executives; 1st for founders)
- Queue view UI with Excel export
- Bulk clear flow with 10-minute delayed email
- Undo action
- Email templates for each recipient type
- Missing bank details handling

### Phase 6 — Refund workflow
- RefundRecord table
- Process refund UI
- Commission reversal action with reason
- Client refund confirmation email

### Phase 7 — Weekly financial statement
- FinancialStatement table
- Generation logic
- PDF + Excel export
- Historical statement list

### Phase 8 — Polish and safety
- Full audit log coverage check
- Rate limiting on payout actions (prevent double-click)
- Backup/restore of CashflowVersion (in case of accidental publish)
- Load test with a full month of simulated projects

---

## 15. Verification

Per phase, before merging to main:

1. `npx tsc --noEmit` — clean
2. `npm run build` — clean
3. Phase-specific check scripts:
   - `npm run check:cashflow-static` (Phase 1)
   - `npm run check:hq-config` (Phase 2)
   - `npm run check:payment-tracking` (Phase 3)
   - `npm run check:pot-system` (Phase 4)
   - `npm run check:payouts` (Phase 5)
   - `npm run check:refunds` (Phase 6)
   - `npm run check:financial-statement` (Phase 7)
4. Route checks: 401 without session, 403 for non-CEO on settings edit, 403 for non-CFO/CEO on payout actions, 400 for invalid saves, 200 for happy paths
5. Numbered screenshots per phase at 375 and 1440 width, light and dark modes
6. Live QA against `EC-QA-CF-*` fixture projects covering:
   - Publishing a new version with a change
   - Refund at each stage
   - Weekly ambassador clear with 10-minute undo (tested both undo path and let-it-finalize path)
   - Monthly worker clear
   - Missing bank details ambassador
   - Pot spend with pot / pot spend without pot
   - Weekly financial statement generation

---

## 16. Notes for the founder

- **Currency is NGN only** for this build. All calculations, all payouts, all recorded amounts. USD equivalents shown only on pot balances (informational). The existing exchange rate implementation in CLAUDE.md handles the display.
- **Payment methods available in dropdown**: Bank transfer · Cash · Crypto · Other. `Other` allows free-text detail.
- **Payment cadence notices** shown to each role on their dashboard header banner (see Section 5.5).
- **Bank details** are user-managed via existing profile/settings — do not build a new collection UI. If details are missing, the ambassador appears in a "Missing bank details" section on the payout queue and receives a reminder email.
- **CFO is the operations owner** for payouts, refunds, and pot spends. CEO has full access as super admin but should not be doing daily operations.
- **Reversals and refunds always show the reason** on the affected recipient's dashboard. No silent commission reversals — the ambassador or worker sees "Your ₦10,500 commission for EC-01234 was reversed on 4 Oct 2026: Client refunded before Chapter 1."
- **The 10-minute delay on emails is critical** — emails do not go out immediately on clear. This is by design, so a CFO misclick can be caught without embarrassment.
- **Every hardcoded number in the current codebase needs to move** to the CashflowVersion lookup. Missing one will silently break the migration. The `check:cashflow-static` script must fail if any hardcoded percentage remains.
- **Cross-check with the existing Cashflow Manual v2.0** for the seed values in v1. Do NOT invent numbers — read them from the manual.
- **Historical projects use their original rates forever.** New projects use the currently active version at their creation time. This is non-negotiable — it protects everyone from retroactive earnings changes.

---

**End of specification.**
