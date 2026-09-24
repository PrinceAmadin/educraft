# EDUCRAFT HQ — PHASE 4 BUILD PROMPT
## Operations Platform — The COO's Full System
### Model: Claude Fable 5.1 · Effort: Max · File: EDUCRAFT_Phase4_Operations_Platform.md

---

## CONTEXT — READ ENTIRELY BEFORE WRITING A LINE OF CODE

You are building on top of EduCraft HQ at `https://educraft-hq.vercel.app`.

**Phases 1–3 are complete:**
- Phase 1 (RBAC): Four roles, role-based sidebar, middleware, `ExecProfile` table
- Phase 2 (Finance): Revenue Tracker, Payout Engine, Bucket Manager, Founder Draws, `PayoutRecord` model
- Phase 3 (Ambassador): `Ambassador` model, tier automation, Core/Sub network, leaderboard, `AmbassadorReferral` model

**What already exists from the original Days 1–20 build:**
- `/admin/projects` — a basic project pipeline page exists (Cards/list view, status filters)
- `/admin/workers` — a basic worker listing page exists
- `/admin/qa` — a QA review queue page exists (basic)
- `/admin/research-requests` — a research approval page exists (basic)
- The `Project` model exists with `status`, `workerId`, `clientId`, `deadline`, `serviceType` fields
- The `Worker` model exists with `tier2FlagCount`, basic profile fields
- The `Client` model exists
- `npm run db:migrate` uses dotenv-cli — always use this, never bare `prisma migrate dev`

**Phase 4 does NOT rebuild these pages from scratch.** It enhances them with the COO's specific operational tools. Every enhancement must preserve what already works for `SUPER_ADMIN`. The COO gets new capabilities layered on top of the existing infrastructure.

**The COO is Emmanuel Mebawondu.** When he logs in, he lands at `/admin/projects`. He owns everything between client payment confirmation and project completion. He does not touch Finance, Ambassadors, or Settings.

---

## THE COO'S MANDATE — UNDERSTAND BEFORE BUILDING

Emmanuel's job is the gap between "client paid" and "client received perfect work." Every project that enters WorkBase must be verified, assigned to the right worker, monitored through production, quality-checked, delivered, and followed up on. The COO's dashboard is his command centre for all of this.

From the Executive Charter, the COO's single accountability metric is:
**What percentage of projects are delivered on time, at EduCraft quality standard, with no supervisor rejections?**

Every tool in this platform exists to help Emmanuel move that number toward 100%.

---

## THE OPERATIONS PLATFORM — SEVEN SECTIONS

The platform lives across existing routes, each enhanced with COO-specific panels.
The sub-navigation within `/admin/projects` adds tabs for different pipeline views:

```
/admin/projects          ← Project Pipeline (enhanced)
/admin/projects/:id      ← Project Detail (enhanced)
/admin/workers           ← Worker Management (enhanced)
/admin/workers/:id       ← Worker Profile (enhanced)
/admin/qa                ← QA Review Queue (enhanced)
/admin/research-requests ← Research Approvals (enhanced)
/admin/finance/payouts   ← Payout Submission (COO limited view — already built in Phase 2)
/admin/reports/operations ← Operations Reports (new)
```

---

## SECTION 1 — PROJECT PIPELINE (ENHANCED)

**Route:** `/admin/projects`
**Access:** `SUPER_ADMIN` (full), `COO` (full)

### The Existing State

A basic project list with status filters exists. It needs:
- A visual pipeline view (kanban-style column layout showing counts and movement)
- A richer "Action Required" panel at the top
- Deadline urgency colouring
- Worker assignment directly from the list
- Ambassador data displayed per project
- Supervisor correction tracking

### Pipeline Overview Bar

At the top of the page, above any filters or table, show this horizontal status bar:

```
NEW REQUIREMENTS   CONFIRMED   ASSIGNED   IN PROGRESS   QA REVIEW   APPROVED   DELIVERED   CORRECTIONS
      3                 5           12          18            7           4            9             2
   [urgent: 1]      [urgent: 0]  [at risk: 2]  [overdue: 1]  [>24h: 2]
```

Each number is clickable — clicking filters the table below to show only projects in that status.
Colour coding:
- Green: normal
- Amber: warning (approaching deadline, sitting too long in status)
- Red: overdue or critical

### Action Required Panel

Immediately below the pipeline bar, a "needs attention" panel:

```
ACTION REQUIRED — 11 items
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 EC-00312  FYP Full      John Okafor      OVERDUE — deadline was yesterday     [View]
🟡 EC-00298  FYP Full      Amara Nwosu      UNASSIGNED — payment confirmed 2d    [Assign]
🟡 EC-00307  Proposal      Grace Daniel     IN QA >24 hours — reviewer idle      [Review Now]
🟡 EC-00289  FYP Full      Moses Agu        APPROACHING DEADLINE — 2 days left   [View]
🟡 EC-00302  FYP Full      Ruth Okoye       SUPERVISOR CORRECTIONS — 3rd round   [View]
ℹ️  EC-00315  FYP Full      Peter James      NEW REQUIREMENTS — client just paid  [Confirm]
...
```

Sorted by urgency. This is Emmanuel's first stop every morning.

### Project Table (Enhanced)

Columns:
| ID | Client | Service | Department | Worker | Deadline | Status | Ambassador | Days In Status | Actions |
|---|---|---|---|---|---|---|---|---|---|
| EC-00312 | John Okafor | FYP Full | Engineering | Chidi O. | ❌ Overdue | IN_PROGRESS | Blessing Eze | 14d | [View] |
| EC-00298 | Amara Nwosu | FYP Full | Medical Sci | Unassigned | Sep 28 | CONFIRMED | Direct | 2d | [Assign] |

**"Days In Status"** — how long the project has been in its current status. If it exceeds the expected time for that status (e.g., ASSIGNED usually takes 1–2 days before the worker starts), it goes amber. Past double the expected time → red.

**Expected time per status (configurable in Settings):**

```
NEW_REQUIREMENTS → CONFIRMED:     48 hours (admin verifies payment)
CONFIRMED → ASSIGNED:             24 hours (COO assigns worker)
ASSIGNED → IN_PROGRESS:           48 hours (worker accepts and starts)
IN_PROGRESS → SUBMITTED:          depends on deadline (no fixed warning)
SUBMITTED → QA_REVIEW:            24 hours (auto-passes quality gates)
QA_REVIEW → APPROVED:             24 hours (human QA review)
APPROVED → DELIVERED:             24 hours (balance payment + file handoff)
```

**Quick [Assign] button** on unassigned projects — opens an inline assignment panel:

```
ASSIGN WORKER — EC-00298 (Medical Science FYP)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Recommended workers (Medical Science):
  Amara Eze        [Active]   Current load: 3 projects    Avg rating: 4.8   [Assign ✓]
  Chidi Okonkwo    [Active]   Current load: 5 projects    Avg rating: 4.6   [Assign ✓]
  Grace Bello      [Active]   Current load: 2 projects    Avg rating: 4.9   [Assign ✓]
  Kunle Adewale    [Busy]     Current load: 7 projects    Avg rating: 4.3   (over threshold)

[Search all workers...]
[Assign and notify worker]
```

Workers at >6 projects show as "Busy" — not blocked but flagged.
Workers are sorted by: department match first, then current load (ascending), then rating.

### Project Status Flow

The full status sequence (update if current schema differs):

```
NEW_REQUIREMENTS
    ↓ (COO or admin confirms payment and requirements)
REQUIREMENTS_CONFIRMED
    ↓ (COO assigns to worker)
ASSIGNED
    ↓ (worker accepts and begins work)
IN_PROGRESS
    ↓ (worker submits completed work)
SUBMITTED
    ↓ (automated quality gates: formatting → structure → references → voice)
    ↓ (if all pass)
IN_QA_REVIEW
    ↓ (human QA reviewer approves)
APPROVED
    ↓ (balance payment received + file delivered to client)
DELIVERED
    ↓ (7 days, no corrections)
COMPLETED
    
    ↗ (client reports supervisor requested corrections)
SUPERVISOR_CORRECTIONS
    ↓ (worker makes corrections, resubmits)
    → back to IN_QA_REVIEW (abbreviated pipeline — Layer 3 + Layer 4 only)
```

Also: `CANCELLED` (project cancelled at any point), `ON_HOLD` (awaiting client action).

---

## SECTION 2 — PROJECT DETAIL PAGE (ENHANCED)

**Route:** `/admin/projects/:id`
**Access:** `SUPER_ADMIN` (full), `COO` (full), `CO_CEO_CFO` (read-only view of payment fields)

The existing project detail page needs significant enhancement. The COO needs everything about a project on one screen.

### Layout — Three-column

**Left column (40%) — Project Info:**
```
EC-00312 — FYP Full
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Client:        John Okafor
University:    UNIBEN
Department:    Engineering
Topic:         Design of a Solar-Powered Repeater
Supervisor:    Dr. Adebayo James
Service:       Final Year Project — Full (5 Chapters)
Pricing:       ₦70,000
Downpayment:   ₦31,500 ✅ Confirmed Sep 12
Balance:       ₦38,500 ⏳ Pending delivery
Client WhatsApp: +234-XXX-XXXX  [Open WhatsApp]
Special instructions: Include BEME table with local suppliers

Ambassador:    Blessing Eze (Gold) — Referral code BLE-LAG-847
               HOG commission: ₦1,750 (2.5%)
               Ambassador commission: ₦10,500 (15%)

Parent project: None
Child projects: None

Created:       Sep 10, 2026
Internal deadline: Sep 25 ❌ OVERDUE (was yesterday)
```

**Middle column (35%) — Pipeline Status:**
```
PIPELINE STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ NEW_REQUIREMENTS          Sep 10
✅ REQUIREMENTS_CONFIRMED    Sep 12  (by Prince)
✅ ASSIGNED                  Sep 12  → Chidi Okonkwo
✅ IN_PROGRESS               Sep 14  (Chidi accepted)
🔴 IN_PROGRESS               Sep 25  ← OVERDUE (14 days)
⬜ SUBMITTED
⬜ IN_QA_REVIEW
⬜ APPROVED
⬜ DELIVERED

ASSIGNED WORKER
  Chidi Okonkwo
  Current load: 3 projects
  This project: 14 days (overdue)
  [Message Chidi]  [Reassign]  [Flag Worker]

QUALITY GATE HISTORY
  (empty — not yet submitted)

QA REVIEWER
  Not yet assigned

SUPERVISOR CORRECTIONS
  None yet
```

**Right column (25%) — COO Actions:**
```
COO ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Change Status ▼]
[Reassign Worker]
[Set Internal Deadline]
[Add Note]
[Flag as At Risk]
[Request Client Update]
[Mark for Senior Review]

NOTES & TIMELINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sep 24 (You): Messaged Chidi — no
              response. Will follow up
              tomorrow.
Sep 22 (System): Project became overdue.
Sep 12 (Prince): Payment verified.
              Assigned to Chidi.
Sep 10 (System): Project created.
```

### Supervisor Corrections Panel

When `status = SUPERVISOR_CORRECTIONS`, a dedicated panel appears:

```
SUPERVISOR CORRECTIONS — Round 2 of 3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Client note: "Supervisor asked us to expand the
              methodology section and clarify the
              BEME calculations."
Received: Sep 20, 2026

Round 1: Submitted Sep 15 → corrections Sep 20  ⚠️
Round 2: In progress — deadline Sep 27
Round 3: (if needed — final round allowed)

IMPORTANT: After 3 rounds, corrections become out-of-scope
           and require a new service order.

[Send reminder to Chidi]  [Mark corrections complete]
[Escalate — out of scope]
```

### Schema additions needed:

```prisma
model ProjectNote {
  id          String   @id @default(cuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id])
  content     String
  authorId    String   // ExecProfile ID or Worker ID
  authorType  String   // EXEC, WORKER, SYSTEM
  createdAt   DateTime @default(now())
}

model SupervisorCorrection {
  id            String   @id @default(cuid())
  projectId     String
  project       Project  @relation(fields: [projectId], references: [id])
  roundNumber   Int      // 1, 2, or 3
  clientNote    String?
  receivedAt    DateTime
  deadline      DateTime?
  completedAt   DateTime?
  status        String   @default("IN_PROGRESS") // IN_PROGRESS, COMPLETED, ESCALATED
  createdAt     DateTime @default(now())
}
```

Also update `Project` model:

```prisma
// Add to existing Project model:
  internalDeadline    DateTime?
  atRisk              Boolean  @default(false)
  revisionCount       Int      @default(0)
  supervisorHighRisk  Boolean  @default(false)  // flags Tier 3 reference check
  parentProjectId     String?
  parentProject       Project?    @relation("ProjectLineage", fields: [parentProjectId], references: [id])
  childProjects       Project[]   @relation("ProjectLineage")
  notes               ProjectNote[]
  supervisorCorrections SupervisorCorrection[]
```

---

## SECTION 3 — WORKER MANAGEMENT (ENHANCED)

**Route:** `/admin/workers`
**Access:** `SUPER_ADMIN` (full), `COO` (full)

### Worker Directory Table

Enhanced from the basic listing. Columns:
| Name | Departments | Status | Current Load | Projects Done | Avg Quality | Tier2 Flags | Last Active | Actions |
|---|---|---|---|---|---|---|---|---|
| Chidi Okonkwo | Engineering, CS | 🟢 Active | 3/6 | 47 | 4.8⭐ | 0 flags | Today | [View] |
| Amara Eze | Medical, Nursing | 🟢 Active | 5/6 | 31 | 4.6⭐ | 1 flag | Yesterday | [View] |
| Kunle Adewale | Business, Econ | 🟡 Busy | 6/6 | 18 | 4.3⭐ | 3 flags⚠️ | Today | [View] |
| Faith Bello | Engineering | 🔴 Inactive | 0/6 | 12 | 4.5⭐ | 0 flags | 3 weeks ago | [Contact] |

**Current Load** = active projects / max concurrent (default 6). When at max, show as "BUSY — at capacity."

**Tier2 Flags** = rolling 30-day count from the `Worker.tier2FlagCount` field. ≥3 flags shows with ⚠️.

**Status logic:**
- Active: has worked in the last 14 days
- Busy: at or above capacity threshold
- Inactive: no project activity in 14+ days
- Suspended: manually suspended

### Add Worker Modal:

```
Add Worker
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Full Name              [___________________]
WhatsApp               [___________________]
Email                  [___________________]
Departments            [Engineering] [Medical] [Law] [Business]
                       [Nursing] [CS] [Economics] [Other...]
Academic background    [___________________] (e.g., "B.Eng Electrical")
Max concurrent projects [  6  ] (default)
Bank Name              [___________________]
Account Number         [___________________]
Account Name           [___________________]
Notes                  [___________________]
[Create Worker]
```

Worker bank details feed directly into the Payout Engine (Phase 2) for payment processing.

### Worker Detail / Profile Page

**Route:** `/admin/workers/:id`

```
CHIDI OKONKWO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status: 🟢 Active  |  Joined: Jul 15, 2025  |  WhatsApp: +234-XXX
Departments: Engineering (primary), Computer Science
Academic background: B.Eng Electrical, UNIBEN 2024
Max concurrent: 6  |  Current load: 3 projects

PERFORMANCE SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total projects completed:   47
On-time delivery rate:       94%  (target: 95%)  ⚠️ slightly below
QA first-pass rate:          91%  (target: 80%)  ✅
Supervisor acceptance rate:  98%  (target: 95%)  ✅
Client satisfaction:         4.8/5.0              ✅
Tier 2 reference flags:      0 (last 30 days)    ✅
Average payout per month:    ₦84,000

ACTIVE PROJECTS (3)
  EC-00312  Engineering  FYP Full      ❌ OVERDUE     Sep 25 deadline
  EC-00318  Engineering  FYP Full      🟡 IN_PROGRESS Sep 30 deadline
  EC-00321  CS           Seminar       🟢 IN_PROGRESS Oct 2 deadline

COMPLETED PROJECTS — Last 30 Days (6)
  EC-00289  Engineering  ✅ Delivered Sep 20  On time    Client satisfied
  EC-00278  CS           ✅ Delivered Sep 18  On time    Minor corrections
  EC-00271  Engineering  ✅ Delivered Sep 12  On time    Client satisfied
  EC-00264  Engineering  ✅ Delivered Sep 8   On time    Client satisfied
  EC-00255  CS           ✅ Delivered Sep 4   1 day late Minor corrections
  EC-00244  Engineering  ✅ Delivered Aug 31  On time    Client satisfied

EARNINGS HISTORY (from PayoutRecord)
  Sep 2026  ₦112,000  ⏳ Pending
  Aug 2026  ₦84,000   ✅ Paid Aug 28
  Jul 2026  ₦56,000   ✅ Paid Jul 31

TIER 2 REFERENCE FLAG HISTORY
  No flags in the last 30 days

COO NOTES
  Sep 24: Chidi is overdue on EC-00312. Sent reminder.
  Aug 15: Excellent work on the Engineering cluster this month.

COO ACTIONS
  [Assign Project]   [Message Worker]   [Suspend]   [Add Note]
  [Adjust Max Load]  [Flag for Review]  [View All Projects]
```

### Worker Performance Scoring

Build a utility that computes each worker's metrics for the COO view:

```typescript
// src/lib/operations/worker-metrics.ts

export async function getWorkerMetrics(workerId: string, periodDays = 90) {
  const cutoff = subDays(new Date(), periodDays);

  const projects = await prisma.project.findMany({
    where: { workerId, status: 'COMPLETED', updatedAt: { gte: cutoff } },
  });

  const onTime = projects.filter(p =>
    p.deliveredAt && p.internalDeadline && p.deliveredAt <= p.internalDeadline
  ).length;

  const qaPassFirst = // projects that passed QA on first submission
    projects.filter(p => p.qaFirstPassDate != null).length;

  const supervisorAccepted = projects.filter(p =>
    p.status === 'COMPLETED' && p.supervisorCorrections.length === 0
  ).length;

  return {
    totalCompleted: projects.length,
    onTimeRate:           projects.length ? onTime / projects.length : 0,
    qaFirstPassRate:      projects.length ? qaPassFirst / projects.length : 0,
    supervisorAcceptRate: projects.length ? supervisorAccepted / projects.length : 0,
    tier2FlagCount:       worker.tier2FlagCount,
  };
}
```

These metrics surface in the Worker Directory table and the Worker Profile page.

---

## SECTION 4 — QA REVIEW QUEUE (ENHANCED)

**Route:** `/admin/qa`
**Access:** `SUPER_ADMIN` (full), `COO` (full — assigns reviewers, monitors queue)

### What the QA Review Queue does

When a project passes all automated quality gates (formatting + structure + reference + voice), it moves to `IN_QA_REVIEW`. A human reviewer then runs the Layer 4 Delivery Checklist before the project can be marked APPROVED.

The COO manages this queue: assigns projects to reviewers, monitors throughput, escalates overdue reviews, and can review projects directly.

### QA Queue Layout

```
QA REVIEW QUEUE — 7 projects waiting
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Unassigned: 3]   [Assigned: 2]   [Reviewing: 1]   [Overdue (>24h): 1]

  Project       Client         Service   Worker      Submitted    Reviewer    Age    Actions
  ──────────────────────────────────────────────────────────────────────────────────────────
  EC-00307  Grace Obi       FYP Full  Chidi O.   Sep 23 2:14pm  Unassigned  26h⚠️  [Assign] [Review Now]
  EC-00319  Moses Agu       FYP Full  Amara E.   Sep 24 9:00am  Unassigned  5h     [Assign] [Review Now]
  EC-00324  Ruth Daniel     Proposal  Faith B.   Sep 24 11:30am Unassigned  2h30m  [Assign] [Review Now]
  EC-00301  John James      FYP Full  Kunle A.   Sep 23 8:00am  You (COO)   30h⚠️  [Continue Review]
  EC-00298  Peter Okafor    Seminar   Grace B.   Sep 24 1:00pm  Ifeoma (Jr) 1h     [Monitor]
  EC-00311  Faith Eze       FYP Full  Amara E.   Sep 23 4:00pm  Ifeoma (Jr) 22h    [Monitor]
```

**[Review Now] button** — opens the inline QA Review checklist directly within the admin UI. The COO or a reviewer works through the 16-item Layer 4 Delivery Checklist.

### Inline QA Review Checklist

When a reviewer clicks [Review Now], a full-page QA review panel opens:

```
QA REVIEW — EC-00307 — Grace Obi — Engineering FYP Full
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Worker: Chidi Okonkwo | Submitted: Sep 23 | Reviewer: You (COO)

AUTOMATED QUALITY GATES (all passed before reaching here)
  ✅ Formatting Check (Layer 3):    98.9% (89/90 checks passed)
  ✅ Structural Check (Layer 1):    Pass — all required sections present
  ✅ Reference Verification (Tier2): Pass — 82% CORE/CLOSELY_RELATED
  ✅ Voice Check (Layer 2a):         Pass — no flagged patterns

DOWNLOAD FOR REVIEW
  📄 [Download EC-00307_report.docx]   📄 [Download EC-00307_report.pdf]

LAYER 4 DELIVERY CHECKLIST — 16 items
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  DOCUMENT NAVIGATION
  ☐ D1  Table of Contents page numbers are correct (update fields, verify)
  ☐ D2  List of Figures entries match actual figures with correct page numbers
  ☐ D3  List of Tables entries match actual tables with correct page numbers
  ☐ D4  List of Appendices entries match actual appendices
  ☐ D5  Page numbering correct throughout (Roman prelims, Arabic body, no gaps)

  CLIENT INFORMATION
  ☐ D6  Client's name spelled correctly everywhere (title page, certification, declaration)
  ☐ D7  Matric number correct on all pages
  ☐ D8  Supervisor's name spelled correctly
  ☐ D9  HOD's name spelled correctly
  ☐ D10 Dedication names correct and match client's instructions
  ☐ D11 Acknowledgment names correct
  ☐ D12 University name and department correct throughout

  FILE QUALITY
  ☐ D13 File saved as .docx
  ☐ D14 PDF version also available
  ☐ D15 No tracked changes, comments, or hidden revision marks
  ☐ D16 No placeholder text ("insert figure here", "TODO", "[reference needed]")

REVIEWER DECISION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [ APPROVE — all 16 checks passed ]
  [ REVISION NEEDED — send back to worker with notes ]
  [ MINOR FIXES — I'll fix directly, then approve ]
  [ ESCALATE — senior domain review needed ]

  Notes for worker (if revision needed):
  [___________________________________________]
  
  [Submit Review Decision]
```

### QA Reviewer Assignment

The COO can assign reviews to junior QA reviewers. These are workers who have been designated as QA reviewers (a separate capability flag on the Worker model).

Add to Worker model:
```prisma
  isQaReviewer     Boolean  @default(false)
  qaReviewerSince  DateTime?
```

When assigning:
```
Assign Reviewer — EC-00307
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Available QA Reviewers:
  Ifeoma Obi   [Jr. Reviewer]  Currently reviewing: 1 project  [Assign]
  David Eze    [Jr. Reviewer]  Currently reviewing: 0 projects [Assign]
  (You — COO)                  Review directly              [Self-assign]
```

### Schema additions:

```prisma
model QaReview {
  id            String   @id @default(cuid())
  projectId     String   @unique
  project       Project  @relation(fields: [projectId], references: [id])
  reviewerId    String?  // Worker ID (QA reviewer) or ExecProfile ID (COO)
  reviewerType  String?  // WORKER, COO, SUPER_ADMIN
  assignedAt    DateTime?
  startedAt     DateTime?
  completedAt   DateTime?

  // Automated gate results (from previous phases)
  formattingScore    Float?
  structuralPass     Boolean?
  referenceVerPass   Boolean?
  voiceCheckPass     Boolean?

  // Tier 3 reference data (if triggered)
  tier3Triggered     Boolean  @default(false)
  tier3Results       Json?

  // Layer 4 checklist
  deliveryChecklist  Json?    // {d1: true, d2: true, ... d16: false}
  allChecksPassed    Boolean  @default(false)

  // Decision
  decision      String?  // APPROVED, REVISION_NEEDED, MINOR_FIXES, ESCALATED
  revisionNotes String?
  escalationReason String?

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

Also update Project model:
```prisma
  qaReview       QaReview?
  qaFirstPassDate DateTime?  // when first QA review was approved without revision
  deliveredAt    DateTime?
```

---

## SECTION 5 — RESEARCH APPROVALS (ENHANCED)

**Route:** `/admin/research-requests`
**Access:** `SUPER_ADMIN` (full), `COO` (full)

Research Approval is the step where a worker requests their paper-finding job to begin.
The system (OpenAlex pipeline) needs admin approval to run for each project to control costs.

The existing page needs enhancements:

### Research Request Table

Columns:
| Project | Client | Department | Papers Needed | Worker | Requested | Pipeline Status | Cost Estimate | Actions |
|---|---|---|---|---|---|---|---|---|
| EC-00318 | Amara | Engineering | 40 papers | Chidi O. | 1h ago | ⏳ Pending approval | ₦85–110 | [Approve] [Deny] |
| EC-00321 | Ruth | CS | 30 papers | Faith B. | 3h ago | ⏳ Pending approval | ₦65–85 | [Approve] [Deny] |
| EC-00289 | Moses | Medical | 50 papers | Amara E. | Sep 20 | ✅ Complete — 48 refs | ₦102 actual | [View Results] |

The cost estimate comes from the `AiUsageLog` model — average cost per research job for that department.

### Approval Action

When the COO clicks [Approve], the OpenAlex pipeline triggers immediately.
The COO sees real-time progress:

```
RESEARCH PIPELINE — EC-00318 (APPROVED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 1: OpenAlex multi-query search        ✅ Complete — 156 candidates
Step 2: Relevance filter                   ✅ Complete — 89 passed (87%)
Step 3: Track A (open access) download     ⏳ In progress... 12/24 PDFs
Step 4: Track B (paywalled) metadata       ✅ Complete — 65 references
Step 5: Tier 2 classification              ⏳ Waiting for Step 3...

Final count: 24 open access + 65 paywalled = 89 total verified references
```

### Schema addition:

```prisma
model ResearchRequest {
  id              String   @id @default(cuid())
  projectId       String
  project         Project  @relation(fields: [projectId], references: [id])
  workerId        String
  papersRequested Int
  status          String   @default("PENDING") // PENDING, APPROVED, DENIED, RUNNING, COMPLETE, FAILED
  approvedBy      String?
  approvedAt      DateTime?
  deniedBy        String?
  deniedAt        DateTime?
  denialReason    String?
  pipelineLog     Json?    // step-by-step progress
  totalReferences Int?     // final count
  openAccessCount Int?
  paywalled Count  Int?
  actualCostNaira Float?
  completedAt     DateTime?
  createdAt       DateTime @default(now())
}
```

---

## SECTION 6 — WORKER PERFORMANCE DASHBOARD

**Route:** `/admin/reports/operations`
**Access:** `SUPER_ADMIN` (full), `COO` (full)

This is the COO's primary reporting tool. Emmanuel uses it for the monthly operations review he presents to the CEO.

### Dashboard Layout

**Top row — Four headline KPIs (current month):**
```
[On-Time Delivery]    [QA First-Pass Rate]    [Supervisor Acceptance]    [Projects Completed]
      91%                    88%                      97%                      34
   ⚠️ vs 95% target       ✅ vs 80% target          ✅ vs 95% target         vs 31 last month
```

**Second row — Pipeline health:**
```
[Avg Time per Status (days)]

  NEW → CONFIRMED:    1.2d  (target: 2d) ✅
  CONFIRMED → ASSIGN: 0.8d  (target: 1d) ✅
  ASSIGN → PROGRESS:  1.1d  (target: 2d) ✅
  PROGRESS → SUBMIT:  12.3d (depends on project type)
  SUBMIT → QA:        0.4d  (target: 1d) ✅
  QA → APPROVED:      1.4d  (target: 1d) ⚠️
  APPROVED → DELIVER: 0.7d  (target: 1d) ✅
```

**Third row — Worker league table (this month):**

```
WORKER PERFORMANCE — September 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Rank  Worker          Projects  On-Time  QA Pass  Sup. Accept  Flags  Status
  ────────────────────────────────────────────────────────────────────────────────
  🥇 1  Grace Bello        8       100%     100%       100%        0     ⭐ Excellent
  🥈 2  Amara Eze          6       100%      83%       100%        0     ✅ Good
  🥉 3  Chidi Okonkwo      7        86%      86%       100%        0     ✅ Good
     4  Faith Adamu        4        75%     100%       100%        1     ⚠️ Watch
     5  Kunle Adewale      3        67%      67%        67%        2     🔴 Review
     6  Ifeoma Obi         6       100%      83%       100%        0     ✅ Good

  Monthly star: Grace Bello — 8 projects, all on time, all accepted first time
```

**Fourth row — Department breakdown:**

```
PROJECTS BY DEPARTMENT — September 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Engineering:     14 projects  Avg delivery: 13.2 days  On-time: 93%
  Medical/Lab Sci:  8 projects  Avg delivery: 11.4 days  On-time: 88%
  Computer Science: 5 projects  Avg delivery: 9.8 days   On-time: 100%
  Business:         4 projects  Avg delivery: 10.2 days  On-time: 75%  ⚠️
  Other:            3 projects  Avg delivery: 8.4 days   On-time: 100%

  Business delivery rate is below target — check if workload is too high for
  current Business-qualified workers.
```

**Fifth row — Supervisor correction tracking:**

```
SUPERVISOR CORRECTIONS — This Month
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total projects delivered:   34
  Projects with 0 corrections: 33 (97%)  ✅
  Projects with 1 correction:   1 (3%)
  Projects with 2+ corrections: 0 (0%)
  ─────────────────────────────────────────────────────
  EC-00278  Amara Eze  Engineering  Minor methodology clarification (round 1, resolved)
```

**Monthly report export:**
```
[Generate Monthly Report PDF]  [Export to .docx]  [Share with CEO ▼]
```

The monthly report document mirrors what Emmanuel presents to Prince in the monthly executive meeting.

---

## SECTION 7 — PAYOUT SUBMISSION (COO LIMITED VIEW)

**Route:** `/admin/finance/payouts` (already built in Phase 2)

This was designed in Phase 2 — the COO sees only worker payouts, can review the list, and submits it to the CFO. No changes needed here unless Phase 2 implemented it incorrectly.

**Verify the following from Phase 2 still works:**
- COO can see worker payout totals per worker
- COO can see the project-by-project breakdown per worker
- COO can click [Submit to CFO for Processing]
- COO cannot see ambassador commissions, executive commissions, or bucket data
- COO cannot mark payouts as paid (that belongs to the CFO)

If any of these are wrong from Phase 2, fix them in Phase 4.

---

## NEW API ROUTES

All routes are gated: `SUPER_ADMIN` or `COO` only (unless noted).

```
# Project Pipeline
GET    /api/admin/projects?status=all&workerId=all&dept=all&deadline=all
GET    /api/admin/projects/:id
PATCH  /api/admin/projects/:id/status     — change project status
PATCH  /api/admin/projects/:id/assign     — assign worker { workerId }
PATCH  /api/admin/projects/:id/deadline   — update internal deadline
POST   /api/admin/projects/:id/notes      — add COO note
PATCH  /api/admin/projects/:id/at-risk    — toggle at-risk flag
GET    /api/admin/projects/pipeline-summary — counts per status for the bar

# Worker Management
GET    /api/admin/workers?dept=all&status=all
GET    /api/admin/workers/:id
POST   /api/admin/workers                 — add new worker
PATCH  /api/admin/workers/:id             — update worker profile
POST   /api/admin/workers/:id/suspend     — suspend worker
POST   /api/admin/workers/:id/unsuspend
POST   /api/admin/workers/:id/flag        — flag for review
GET    /api/admin/workers/:id/metrics     — performance metrics
GET    /api/admin/workers/recommended?projectId=:id — ranked list for assignment

# QA Queue
GET    /api/admin/qa?status=unassigned,assigned,reviewing,overdue
GET    /api/admin/qa/:projectId           — full QA review detail
POST   /api/admin/qa/:projectId/assign    — assign reviewer
PATCH  /api/admin/qa/:projectId/checklist — update D1–D16 checkboxes
POST   /api/admin/qa/:projectId/decision  — submit APPROVED/REVISION_NEEDED/etc.

# Research Approvals
GET    /api/admin/research-requests?status=pending,approved,complete
POST   /api/admin/research-requests/:id/approve
POST   /api/admin/research-requests/:id/deny   { reason }
GET    /api/admin/research-requests/:id/progress — real-time pipeline status

# Operations Reports
GET    /api/admin/reports/operations?month=2026-09
GET    /api/admin/reports/operations/pipeline-timing?month=2026-09
GET    /api/admin/reports/operations/worker-performance?month=2026-09
GET    /api/admin/reports/operations/department-breakdown?month=2026-09
POST   /api/admin/reports/operations/export   — generates .docx monthly report
```

---

## BUILD SEQUENCE

Follow this order exactly. Each step verified before proceeding.

```
STEP 1: Schema migration
  — Add ProjectNote, SupervisorCorrection, QaReview, ResearchRequest models
  — Update Project model (internalDeadline, atRisk, qaFirstPassDate, deliveredAt,
    supervisorHighRisk, parentProjectId, revisionCount)
  — Update Worker model (isQaReviewer, qaReviewerSince)
  — Run: npm run db:migrate
  — Verify all tables in Supabase

STEP 2: Worker metrics utility
  — Create src/lib/operations/worker-metrics.ts
  — Implement getWorkerMetrics() function
  — Test with real worker data

STEP 3: Project Pipeline Bar
  — Build /api/admin/projects/pipeline-summary (counts per status)
  — Add the horizontal status bar to /admin/projects above the table
  — Clicking each status filters the table below
  — Test: verify counts are accurate, clicking filters work

STEP 4: Action Required Panel
  — Build the urgency logic (overdue, unassigned, QA >24h, near deadline,
    supervisor corrections, new requirements)
  — Add the panel below the pipeline bar
  — Test: create test scenarios for each alert type

STEP 5: Project Table Enhancement
  — Add "Days In Status" column with amber/red colouring
  — Add Ambassador column (show ambassador name if isAmbassadorDriven)
  — Add quick [Assign] inline button with worker recommendation panel
  — Test: inline assignment works, updates project status in DB

STEP 6: Project Detail Page Enhancement
  — Build the three-column layout (Project Info / Pipeline Status / COO Actions)
  — Add the Supervisor Corrections panel (shows when status = SUPERVISOR_CORRECTIONS)
  — Add the Project Notes timeline (COO and system notes)
  — Build all COO Actions: change status, reassign, set deadline, add note, flag
  — Test: status change flows correctly through the pipeline

STEP 7: Worker Directory Enhancement
  — Add performance columns (on-time rate, QA pass rate, tier2Flags)
  — Add status logic (Active/Busy/Inactive/Suspended)
  — Build Add Worker modal
  — Test: creating a worker, worker appears in recommended list for assignment

STEP 8: Worker Profile Page
  — Build the full profile layout (summary, active projects, completed projects,
    earnings history, tier2 flags, COO notes, COO actions)
  — Connect to PayoutRecord data from Phase 2 for earnings history
  — Test: earnings match what Phase 2 Payout Engine calculated

STEP 9: QA Queue Enhancement
  — Build the queue layout with four sub-tabs (Unassigned / Assigned / Reviewing / Overdue)
  — Build the inline QA review checklist (16 checkboxes D1–D16)
  — Build the reviewer assignment dropdown
  — Build the decision flow (Approve / Revision Needed / Minor Fixes / Escalate)
  — When decision = APPROVED: change project status to APPROVED
  — When decision = REVISION_NEEDED: change to REVISION_NEEDED, notify worker
  — Test: full QA review flow from assignment to approval

STEP 10: Research Approvals Enhancement
  — Build the request table with cost estimates
  — Build the approval action (triggers OpenAlex pipeline if available)
  — Build the real-time progress display for running pipelines
  — Test: approve a request, verify pipeline status updates

STEP 11: Operations Reports Page
  — Build /admin/reports/operations
  — Build the four headline KPIs (on-time, QA pass, supervisor acceptance, completed)
  — Build the pipeline timing table
  — Build the worker league table
  — Build the department breakdown
  — Build the supervisor correction tracker
  — Build the monthly report export (.docx)
  — Test: reports show accurate data for the current month

STEP 12: COO Payout Submission Verification
  — Confirm the COO view at /admin/finance/payouts works correctly from Phase 2
  — If any of the seven Phase 2 verification points are wrong, fix them here
  — Test: COO can submit payouts, cannot see ambassador/exec commissions

STEP 13: Connecting Phase 3 → Phase 4
  — When a project is created with ambassadorId, the Project Detail shows
    the ambassador's name, tier, and referral code
  — When the COO marks a project DELIVERED, this triggers the ambassador
    conversion tracking in Phase 3 (if it hasn't already happened at
    payment confirmation)
  — Test: project delivery for ambassador-driven project correctly shows
    ambassador in project detail

STEP 14: Worker notification system (simplified)
  — When a worker is assigned a project: create a notification record
    (no email/WhatsApp yet — show in the WorkBase worker portal if it exists,
    otherwise just log the notification for COO to manually WhatsApp the worker)
  — When a project is sent back (REVISION_NEEDED): log notification
  — When QA approves: log notification
  — Build /api/admin/notifications (list, mark-read)
  — Show a notification count badge in the admin topbar for COO

STEP 15: Final verification
  — Test the full project lifecycle:
    NEW → CONFIRMED → ASSIGNED → IN_PROGRESS → SUBMITTED → QA_REVIEW → APPROVED → DELIVERED → COMPLETED
  — Verify COO cannot access Finance (bucket data), Ambassadors, or Settings/Team
  — Verify COO CAN access /admin/finance/payouts (worker payout section only)
  — Verify all status transitions write to the project timeline
  — Run: npm run build — zero TypeScript errors
  — Deploy to Vercel
```

---

## TESTING CHECKLIST

Before declaring Phase 4 done, every item must pass.

### Project Pipeline
- [ ] Pipeline bar shows accurate counts per status
- [ ] Clicking a status in the pipeline bar filters the table
- [ ] Action Required panel shows: overdue, unassigned (>1d), QA >24h, approaching deadline, supervisor corrections, new requirements
- [ ] "Days In Status" column goes amber after 1.5× expected time, red after 2×
- [ ] Quick [Assign] button opens worker recommendation panel
- [ ] Worker recommendation sorts by: department match, then load, then rating
- [ ] Assigning a worker updates the project DB and changes status to ASSIGNED
- [ ] Ambassador column shows ambassador name for `isAmbassadorDriven` projects

### Project Detail
- [ ] Three-column layout renders correctly on desktop and mobile
- [ ] Project Info column shows: client details, payment status, ambassador info, parent/child project links
- [ ] Pipeline Status column shows: full status history with timestamps and actors
- [ ] COO Actions: all 7 actions work (change status, reassign, set deadline, add note, flag, request client update, mark for senior review)
- [ ] Notes timeline shows COO notes, system events, in chronological order
- [ ] Supervisor Corrections panel appears when status = SUPERVISOR_CORRECTIONS
- [ ] Supervisor Corrections panel shows: round number, client note, deadline, history

### Worker Management
- [ ] Worker table shows: departments, status (Active/Busy/Inactive/Suspended), load, metrics, flags
- [ ] Workers with tier2FlagCount ≥ 3 show ⚠️ warning
- [ ] Add Worker modal creates worker with bank details stored
- [ ] Worker Profile shows: all performance metrics, active projects, earnings history, flag history
- [ ] Earnings history reads from Phase 2 PayoutRecord correctly
- [ ] COO can flag a worker, suspend, or adjust max concurrent load

### QA Queue
- [ ] Queue shows four tabs: Unassigned, Assigned, Reviewing, Overdue (>24h)
- [ ] Projects in each tab are correct
- [ ] COO can assign a reviewer (worker with isQaReviewer = true, or self)
- [ ] Inline checklist: all 16 items (D1–D16) can be checked
- [ ] Decision: APPROVED → project status changes to APPROVED
- [ ] Decision: REVISION_NEEDED → project status changes to REVISION_NEEDED, notes sent to worker
- [ ] QaReview record is created and complete when review is submitted

### Research Approvals
- [ ] Pending requests show with cost estimate
- [ ] Approve triggers the research pipeline (or records approval for manual trigger)
- [ ] Deny requires a reason, marks request as DENIED
- [ ] Completed requests show final reference count and actual cost

### Operations Reports
- [ ] On-time delivery rate is mathematically correct (deliveredAt ≤ internalDeadline)
- [ ] QA first-pass rate is correct (projects that passed QA without REVISION_NEEDED)
- [ ] Supervisor acceptance rate is correct (COMPLETED projects with 0 supervisor corrections)
- [ ] Worker league table ranks by projects completed this month
- [ ] Department breakdown groups correctly
- [ ] Monthly report export produces a readable .docx

### Access Control
- [ ] COO cannot navigate to /admin/finance (redirected to /admin/projects)
- [ ] COO CAN navigate to /admin/finance/payouts (worker section only)
- [ ] COO cannot see ambassador commissions in /admin/finance/payouts
- [ ] COO cannot access /admin/ambassadors, /admin/growth
- [ ] COO cannot access /admin/settings/team or /admin/settings/services
- [ ] All COO API routes return 403 for HOG and CO_CEO_CFO attempts

### Build
- [ ] `npm run build` passes with zero TypeScript errors
- [ ] No `any` types introduced
- [ ] Deployed to Vercel

---

## IMPORTANT CONSTRAINTS

**Preserve the existing Super Admin experience.** Every existing feature that works for SUPER_ADMIN must continue working. Phase 4 adds to existing pages — it does not replace them.

**The delivery checklist (D1–D16) maps exactly to the EduCraft Quality Standard.** These 16 items are not configurable in the UI — they are fixed. Future updates to the standard require a code change, not a settings change. This is deliberate: the checklist is a quality standard, not user preference.

**Worker assignment is always COO-initiated, never automatic.** The system recommends workers but never auto-assigns. Emmanuel makes the final call on every assignment. The recommendation panel saves him time — it doesn't replace his judgment.

**Status transitions are irreversible except by SUPER_ADMIN.** Once a project moves to APPROVED, only SUPER_ADMIN can move it backwards. COO can move projects forward (or to SUPERVISOR_CORRECTIONS) but cannot reverse an approval once given. This protects the integrity of the QA sign-off.

**The supervisor corrections round limit is 3, hard-coded.** After round 3, the project shows an escalation prompt: "This project has reached the 3-round correction limit. Further corrections are out of scope and require a new service order." The COO cannot override this limit — only SUPER_ADMIN can create a 4th round (and they do it in the DB directly).

**Do not rebuild the Finance, Ambassador, or RBAC systems.** Phase 4 reads from Phase 2 (PayoutRecord for worker earnings history) and Phase 3 (Ambassador for referral attribution). It does not modify those systems.

---

## WHAT PHASE 5 WILL BUILD

Phase 5 is the Executive Command Center (SUPER_ADMIN only) — the cross-domain dashboard that pulls KPIs from all four platforms (Finance, Ambassador, Operations, plus the Report Production System when it exists). It is read-only: no actions, pure intelligence. Phase 5 depends on Phases 1–4 having built their API routes correctly, because it aggregates from all of them.
