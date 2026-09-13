# EDUCRAFT HQ — 20-DAY BUILD ROADMAP

## September 10–30, 2026

---

## WHAT YOU'RE BUILDING

EduCraft HQ is one platform with two faces:

**External (public):** Landing page, services catalog, intake forms, project tracker, ambassador application
**Internal (authenticated):** Admin dashboard, project management, worker portal, ambassador portal, QA system, financial dashboard

Everything runs on the same Next.js codebase, same Supabase database, same Vercel deployment.

---

## CURRENT STATE (Day 0 — September 10)

| Component | Status |
|---|---|
| Next.js project | ✅ Running |
| Supabase database | ✅ Connected, migrated, seeded |
| Authentication | ✅ Working (login → /admin) |
| Landing page | ✅ Built (editorial design) |
| Admin dashboard | ⬜ Placeholder only |
| Projects CRUD | ⬜ Not built |
| Intake forms | ⬜ Not built |
| Worker portal | ⬜ Not built |
| Ambassador portal | ⬜ Not built (old app exists separately) |
| QA system | ⬜ Not built |
| Financial dashboard | ⬜ Not built |
| Services page | ⬜ Not built |
| Project tracker | ⬜ Not built |
| Ambassador application | ⬜ Not built |

---

## THE 20-DAY PLAN

### PHASE 1: ADMIN CORE (Days 1–5)
*The command center you'll use every day*

### PHASE 2: PROJECT LIFECYCLE (Days 6–10)
*Intake forms → assignment → tracking → delivery*

### PHASE 3: PEOPLE PORTALS (Days 11–15)
*Worker dashboard, ambassador dashboard, QA review*

### PHASE 4: FINANCE + PUBLIC PAGES (Days 16–18)
*Financial dashboard, services page, project tracker, ambassador application*

### PHASE 5: POLISH + DEPLOY (Days 19–20)
*Mobile optimization, bug fixes, final deployment*

---

## PHASE 1: ADMIN CORE (Days 1–5)

### Day 1 — Admin Command Center Dashboard

This is the screen you open every morning. It shows you the entire business at a glance.

**Claude Code prompt:**

```
Build the Admin Command Center dashboard at /admin.

Current state: Auth works, database is seeded with services 
and universities. The layout shell (sidebar + topbar) exists 
but /admin shows a placeholder.

Build the actual dashboard with these components:

1. TOP ROW — Four stats cards:
   - Active Projects: count from DB where status NOT IN 
     (COMPLETED, CANCELLED, REFUNDED)
   - Revenue This Month: sum of confirmed payments this 
     calendar month
   - Pending Payouts: sum of unpaid worker + ambassador amounts 
     from completed projects
   - At-Risk Projects: projects where internalDeadline < 3 days 
     from now and status is IN_PROGRESS

2. PROJECT PIPELINE BAR — horizontal visualization:
   Show count of projects in each status: NEW, 
   DOWNPAYMENT_VERIFIED, REQUIREMENTS_CONFIRMED, ASSIGNED, 
   IN_PROGRESS, AWAITING_CLIENT_INPUT, SUBMITTED, IN_QA_REVIEW, 
   APPROVED, BALANCE_VERIFIED, DELIVERED
   Each segment is clickable (links to /admin/projects?status=X)
   Use brand colors: teal segments, gold for at-risk

3. BOTTOM SECTION — two columns:
   Left: Recent Activity feed
     - Last 10 entries from ProjectStatusLog table
     - Format: "[Project ID] moved to [status] — [time ago]"
   Right: Action Required list
     - Unpaid payments to verify (downpayment_status = Paid but 
       not Verified)
     - Projects needing worker assignment (status = 
       REQUIREMENTS_CONFIRMED, no worker assigned)
     - Overdue projects (past internal deadline)
     - QA queue count (status = SUBMITTED)

Pull all data from the database via API routes under /api/dashboard.
Use Recharts for any charts. Show skeleton loaders while loading.
Since the DB may have no real projects yet, show zeros — do NOT 
use mock data.

Also fix the greeting: show "Welcome back, Prince" — update the 
seed script to add firstName "Prince" to the admin user.

Reference: EDUCRAFT_WORKBASE_BLUEPRINT_v2.md Part 5, Screen 1
Brand: dark theme, teal #0D9488, gold #F59E0B, shadcn/ui components
Mobile: stack cards vertically, pipeline as 2-row grid
```

### Day 2 — Projects List + Project Detail

**Session 1 — Projects List:**

```
Build the Projects List page at /admin/projects.

This is a filterable, sortable table of all projects.

FILTERS (always visible above table):
  Status: dropdown (all pipeline statuses)
  Service: dropdown (from services table)
  University: dropdown (from universities table)
  Worker: dropdown (from workers table)
  Payment: dropdown (Unpaid, Partial, Paid)
  Date range: from → to
  Search: by project ID, client name, or topic

TABLE COLUMNS:
  Project ID | Client Name | Service | Status | Worker | 
  Deadline | Price | Payment Status | Actions (→ detail)

Color coding:
  Green row accent: on track
  Yellow: deadline within 5 days
  Red: overdue
  Blue: awaiting client input

Mobile: transform table rows into cards showing:
  Project ID + Status badge (top)
  Client name + Service (middle)
  Worker + Deadline + Price (bottom)

Use the shared DataTable component from shadcn/ui.
Implement pagination (20 per page).
Empty state: "No projects yet. Projects will appear here 
when clients submit through the intake form."
```

**Session 2 — Project Detail:**

```
Build the Project Detail page at /admin/projects/[id].

HEADER:
  Project ID | Service name | Price | Status badge
  Client: name | university | department
  Worker: name (or "Unassigned") | Assigned date
  Deadline: date + "X days remaining" or "OVERDUE" in red

TABBED CONTENT:

Tab 1 — Requirements:
  All data from the project record: title, matric number, 
  supervisor, HOD, referencing style, pages, special instructions
  Files uploaded by client (download links)

Tab 2 — Timeline:
  Visual timeline from ProjectStatusLog entries
  Each entry: status change + timestamp + who changed it

Tab 3 — Financials:
  Price breakdown: total, downpayment amount/status, 
  balance amount/status
  Commission breakdown: ambassador name + rate + amount + paid?
  Worker payout: amount + paid?
  EduCraft revenue

Tab 4 — Files:
  Grouped by category: from_client, from_worker, qa_reviewed, 
  delivered
  Upload button for each category
  Download links for all files

Tab 5 — Notes:
  Internal notes (textarea + save)
  QA feedback display

ACTION BUTTONS (contextual based on status):
  - "Verify Payment" (when downpayment/balance is Paid but not Verified)
  - "Assign Worker" (when status is REQUIREMENTS_CONFIRMED)
  - "Move to QA" (when status is SUBMITTED)
  - "Approve" (when QA passes)
  - "Deliver" (when balance is verified)
  
Each action button changes the project status and creates 
a ProjectStatusLog entry.

Reference: EDUCRAFT_WORKBASE_BLUEPRINT_v2.md Part 5, Screen 3
```

### Day 3 — Manual Project Creation + Client Management

**Session 1 — Create Project (Admin-Side):**

```
Build the manual project creation page at /admin/projects/new.

This is for when a client contacts via WhatsApp and the admin 
enters their details manually (before the intake form replaces this).

FORM SECTIONS:

Section 1 — Client Information:
  - Select existing client OR create new
  - If new: full name*, phone*, email, university* (dropdown), 
    faculty, department*, level* (dropdown), referral code (optional)

Section 2 — Service Selection:
  - Service type* (dropdown from services table — shows name + price)
  - Service variant (if applicable)
  - Express delivery checkbox (+₦2,000 or +₦5,000)
  - Auto-calculate total price

Section 3 — Project Details:
  - Project title*
  - (Show additional fields based on service type — conditional)
  - For FYP: matric number, supervisor, HOD, referencing style, 
    pages, project type, chapter count
  - For Term Paper: course title, course code, word count
  - Special instructions (textarea)
  - Client deadline (date picker)
  - File uploads

Section 4 — Review:
  - Summary of all entered data
  - Price calculation
  - "Create Project" button

On submit: create Client (if new) + create Project with status 
NEW + generate Project ID (EC-XXXXX) + redirect to project detail.

Use React Hook Form + Zod for validation.
Multi-step form with progress indicator.
```

**Session 2 — Clients List + Client Detail:**

```
Build the Clients pages:

/admin/clients — List of all clients
  Table: Client ID | Name | University | Department | 
  Projects Count | Total Spent | Last Active
  Search by name, phone, or university
  Click row → client detail

/admin/clients/[id] — Client profile
  Header: name, phone, email, university, department, level
  Referred by: ambassador name (if any)
  Stats: total projects, total spent, first order date

  Project History: table of all projects for this client
  (links to project detail pages)
  
  Notes: internal notes about this client
```

### Day 4 — Worker Management + Worker Assignment

**Session 1 — Workers List + Worker Detail:**

```
Build the Workers pages:

/admin/workers — List of all workers
  Table: Worker ID | Name | Specialties | Active Projects / Max |
  Rating | On-Time Rate | Revision Rate | Payout Balance
  Filter by: availability, specialty, status
  
/admin/workers/[id] — Worker profile
  Header: name, phone, email, education level
  Specialties: list of departments they handle
  Skills: SPSS, MATLAB, AutoCAD, etc.
  Performance: total completed, avg delivery days, revision rate, 
  on-time rate, rating
  Earnings: total earned, total paid, balance
  Bank details: name, number, bank
  
  Project History: all projects assigned to this worker
  
  Status controls: Active / On Break / Suspended / Terminated

/admin/workers/new — Add new worker form
  Name*, phone*, email, specialties (multi-select), skills 
  (multi-select), education level, max concurrent projects, 
  bank details
```

**Session 2 — Worker Assignment Screen:**

```
Build the Worker Assignment flow.

When admin clicks "Assign Worker" on a project in 
REQUIREMENTS_CONFIRMED status, show the assignment screen:

LEFT PANEL: Project summary
  Topic, department, project type, deadline, required skills

RIGHT PANEL: Recommended workers
  Auto-filtered by:
  1. Matching specialty (department match)
  2. Current load (fewer active projects first)
  3. Availability (not Busy or Unavailable)
  4. Performance rating (higher first)
  
  Each worker card shows:
    Name | Worker ID
    Specialty: [departments]
    Load: X/Y active projects [green if under max, red if at max]
    Rating: X/5 | On-Time: X% | Revision Rate: X%
    [ASSIGN] button

  On click "ASSIGN":
  - Update project: workerId, assignedDate, status → ASSIGNED
  - Create ProjectStatusLog entry
  - Redirect to project detail

Reference: EDUCRAFT_WORKBASE_BLUEPRINT_v2.md Part 5, Screen 5
```

### Day 5 — Ambassador Management + Payout System

**Session 1 — Ambassador Pages:**

```
Build the Ambassador management pages (admin side):

/admin/ambassadors — Ambassadors list
  Table: Ambassador ID | Name | University | Referrals | 
  Conversions | Rate | Revenue Generated | Commission Balance | Tier
  Filter by: university, tier, status
  
/admin/ambassadors/[id] — Ambassador profile
  Header: name, phone, university, department, tier badge
  Referral link: displayed prominently with copy button
  Performance: total referrals, conversions, conversion rate,
  total revenue generated
  Commission: total earned, total paid, balance
  Bank details
  
  Referral History: list of all clients referred by this ambassador
  Payout History: list of all commission payments
  
  Tier progress: visual bar showing progress to next tier
  (e.g., "4/6 conversions to Silver")

/admin/ambassadors/new — Add ambassador form
  Name*, phone*, email, university* (dropdown), department, level
  Auto-generate: referral code, referral link, ambassador ID

/admin/ambassadors/schools — School coverage view
  Card per university: ambassador count, fill status, revenue
  Progress bar: active/total ambassadors
  (This replaces the old Ambassador Panel schools view)
```

**Session 2 — Payout Queue:**

```
Build the Payout system at /admin/finance/payouts.

TWO TABS: Worker Payouts | Ambassador Commissions

Each tab shows a table of pending payouts:

WORKER PAYOUTS:
  Worker Name | Projects (list of IDs) | Amount Owed | 
  Bank Details | [Mark Paid ✓]
  
  Only shows projects with status = COMPLETED and 
  workerPayoutPaid = false
  
  "Mark Paid" button:
  - Creates a Payment record (type: WORKER_PAYOUT, direction: OUTFLOW)
  - Sets workerPayoutPaid = true on each project
  - Updates worker's running totals
  
  Bulk action: "Mark All Paid" with date + reference field

AMBASSADOR COMMISSIONS:
  Ambassador Name | Projects | Commission Rate | Amount Owed |
  Bank Details | [Mark Paid ✓]
  
  Same logic but for ambassador commissions.

TOTAL PENDING banner at top: "₦X owed to Y workers + Z ambassadors"

Reference: EDUCRAFT_WORKBASE_BLUEPRINT_v2.md Part 5, Screen 7
```

---

## PHASE 2: PROJECT LIFECYCLE (Days 6–10)

### Day 6 — Public Intake Form Engine

**Session 1 — Service Selection Page:**

```
Build the service selection page at /intake.

This is the first page a client sees when starting a project.
It shows all active services organized by category with prices.

LAYOUT: Service cards grouped by category
  
  📝 Academic Writing
    Final Year Project (Full) — from ₦70,000 [Start →]
    Seminar Report — ₦25,000 [Start →]
    IT Report — from ₦15,000 [Start →]
    Term Paper — ₦15,000 [Start →]
    ...

  🎨 Presentations & Design
    PowerPoint Slides — from ₦8,000 [Start →]
    ...

  📦 Combos (Save More)
    Proposal + Report — ₦90,000 [Start →]
    ...

Each card links to /intake/[serviceCode] which loads the 
correct multi-step form.

Data comes from the services table (GET /api/services — public).
Only show services where isActive = true.
Sort by sortOrder field.

Mobile: full-width cards, stacked by category.
This page is PUBLIC (no auth required).
```

**Session 2 — Multi-Step Form Engine:**

```
Build the multi-step intake form engine at /intake/[serviceCode].

The form engine loads different field configurations based on 
the service's intakeFormTemplate field.

FORM ENGINE ARCHITECTURE:
- FormProgress component (step indicator at top)
- FormStep component (renders fields for current step)
- Navigation: [Back] [Next] buttons, sticky on mobile
- Data preserved when navigating back
- Validation per step (can't advance with errors)
- Final step: review + submit

Use React Hook Form for state management.
Use Zod for per-step validation schemas.

BUILD THESE FORM TEMPLATES:

1. academic_fyp (Final Year Project):
   Step 1: Personal Info (name, phone, email, university dropdown, 
           faculty, department, matric number, referral code)
   Step 2: Project Details (title, supervisor, HOD, project type, 
           chapters, referencing style, data requirements, pages)
   Step 3: Requirements & Files (department outline upload/type, 
           proposal docs upload, special instructions, deadline, 
           express delivery checkbox)
   Step 4: Preliminary Pages (dedication type radio + dynamic 
           name fields, acknowledgment checkboxes + details)
   Step 5: Review & Submit (summary, price calculation, payment 
           instructions, T&C checkbox, submit)

2. academic_termpaper (Term Paper):
   Step 1: Personal Info (name, university, department, phone)
   Step 2: Details (course title, course code, topic, word count, 
           referencing style, deadline)
   Step 3: Files (upload lecturer instructions)
   Step 4: Review & Submit

3. academic_seminar (Seminar Report):
   Step 1: Personal Info
   Step 2: Seminar Details (topic, supervisor, referencing style)
   Step 3: Requirements & Files
   Step 4: Review & Submit

On submit: 
  POST /api/intake
  Creates Client (if new) + Project (status: NEW)
  Auto-generates Project ID
  If referral code provided, links to ambassador
  Redirects to /intake/success with project ID

Reference: EDUCRAFT_WORKBASE_BLUEPRINT_v2.md Part 3
Mobile-first: large touch targets, native selects on mobile
```

### Day 7 — Intake Form Completion + Referral Tracking

**Session 1 — Remaining Form Templates:**

```
Build the remaining intake form templates:

4. academic_it (IT Report):
   Step 1: Personal Info + matric number
   Step 2: IT Details (company name, company address, IT duration, 
           department at company, supervisor at company, topic)
   Step 3: Files (IT letter, log book template)
   Step 4: Review & Submit

5. career_cv (CV/Resume):
   Step 1: Contact Info (name, phone, email, LinkedIn, address)
   Step 2: Education (dynamic list: degree, university, year, CGPA)
   Step 3: Experience (dynamic list: title, company, dates, description)
   Step 4: Skills + Certifications
   Step 5: Style Preference (radio with preview: Modern/Classic/Creative)
   Step 6: Review & Submit

6. design_presentation (PowerPoint):
   Step 1: Personal Info
   Step 2: Presentation Details (topic, purpose, audience, slides, 
           content source)
   Step 3: Design Preferences (color scheme, style)
   Step 4: Files (upload content/reference)
   Step 5: Review & Submit

7. editing (Editing & Formatting):
   Step 1: Personal Info
   Step 2: Editing Details (type, page count, referencing style)
   Step 3: Upload Document
   Step 4: Review & Submit
```

**Session 2 — Referral Tracking + Success Page:**

```
Build referral tracking and the submission success page.

REFERRAL TRACKING:
  When a client fills the referral code field in the intake form:
  1. Validate the code against the ambassadors table
  2. If valid: link the client to that ambassador (referredById)
  3. Link the project to that ambassador (ambassadorId)
  4. Auto-calculate commission based on ambassador's current tier rate
  
  Also support URL-based referral:
  /intake?ref=BLESSING2026
  → Pre-fill the referral code field
  → Store in hidden field

SUCCESS PAGE at /intake/success:
  "Your project has been submitted! 🎓"
  
  Project ID: EC-XXXXX (large, prominent)
  
  "Save this ID — you'll use it to track your project."
  
  PAYMENT INSTRUCTIONS:
  Amount: ₦XX,XXX (45% downpayment)
  Bank: [EduCraft bank details]
  Account: [number]
  Reference: [Project ID]
  
  "After payment, your project will be assigned to a 
   specialist within 24 hours."
  
  [Track Your Project →] links to /track/EC-XXXXX
```

### Day 8 — Project Pipeline Actions + Status Transitions

```
Build the complete project pipeline status transition system.

Every status change must:
1. Validate the transition is allowed (enforce pipeline rules)
2. Update the project status
3. Create a ProjectStatusLog entry
4. Trigger any automated actions

TRANSITION RULES (enforce in API):

NEW → DOWNPAYMENT_VERIFIED
  Requires: downpaymentStatus = "Verified"

DOWNPAYMENT_VERIFIED → REQUIREMENTS_CONFIRMED
  Requires: service type + project title + at least one of 
  (description, specialInstructions, files)

REQUIREMENTS_CONFIRMED → ASSIGNED
  Requires: workerId is set

ASSIGNED → IN_PROGRESS
  Requires: workerAccepted = true

IN_PROGRESS → AWAITING_CLIENT_INPUT
  Allowed: any time (pauses deadline)
  Action: set deadlinePausedAt = now()

AWAITING_CLIENT_INPUT → IN_PROGRESS
  Action: calculate paused days, extend internalDeadline

IN_PROGRESS → SUBMITTED
  Requires: at least one file in from_worker category

SUBMITTED → IN_QA_REVIEW
  Action: add to QA queue

IN_QA_REVIEW → APPROVED (QA passes)
  Requires: qaStatus = "Passed"

IN_QA_REVIEW → REVISION_NEEDED (QA fails)
  Action: increment revisionCount
  If revisionCount >= 3: flag for founder review

REVISION_NEEDED → SUBMITTED (worker resubmits)

APPROVED → BALANCE_VERIFIED
  Requires: balanceStatus = "Verified"

BALANCE_VERIFIED → DELIVERED
  Action: set deliveryDate

DELIVERED → SUPERVISOR_CORRECTIONS
  Action: log supervisor correction details

SUPERVISOR_CORRECTIONS → DELIVERED (corrections done)
  Action: increment supervisorCorrectionCount

DELIVERED → COMPLETED
  After 7 days with no response, or client confirms

Build these as a state machine in lib/services/projects.ts.
Each transition is an API call: PATCH /api/projects/[id]/status
Body: { newStatus, notes }
The API validates, transitions, logs, and returns the updated project.

Add action buttons on the project detail page that only show 
when the transition is valid for the current status.
```

### Day 9 — Payment Verification + Notifications

**Session 1 — Payment Verification Flow:**

```
Build the payment verification system.

When a client says "I've paid," the admin needs to verify 
and record it.

ON PROJECT DETAIL PAGE — Payment section:

DOWNPAYMENT:
  Status: [Unpaid / Paid (unverified) / Verified]
  If Paid (unverified):
    [Verify Payment] button
    → Opens modal: payment method dropdown, reference number, 
      date, notes
    → On confirm: creates Payment record, sets 
      downpaymentStatus = "Verified", transitions project to 
      DOWNPAYMENT_VERIFIED

BALANCE:
  Status: [Unpaid / Paid (unverified) / Verified]
  Same flow as downpayment but for balance.

The admin can also mark payment from the Projects List 
using a quick action dropdown.

Payment records go into the payments table with type 
CLIENT_DOWNPAYMENT or CLIENT_BALANCE.
```

**Session 2 — In-App Notifications:**

```
Build the in-app notification system.

Every important event creates a notification for the relevant user:

ADMIN NOTIFICATIONS:
  - New project submitted (from intake form)
  - Payment marked as paid (needs verification)
  - Worker submitted completed work (needs QA assignment)
  - Project overdue
  - Revision count reached 3 (needs founder review)

WORKER NOTIFICATIONS:
  - New project assigned to you
  - QA feedback received (revision needed)
  - QA passed

AMBASSADOR NOTIFICATIONS:
  - New referral used your code
  - Referral converted to paying client
  - Commission paid

Implementation:
  - Notifications table already in schema
  - Bell icon in topbar shows unread count (red badge)
  - Dropdown shows last 10 notifications
  - Click notification → navigates to relevant page
  - "Mark all read" button
  
  API: GET /api/notifications (filtered by current user)
       PATCH /api/notifications/[id]/read
       PATCH /api/notifications/read-all
```

### Day 10 — QA Review System

```
Build the QA Review system.

/admin/qa — QA Queue
  Table of all projects with status SUBMITTED or IN_QA_REVIEW.
  Sorted by deadline (most urgent first).
  
  Columns: Project ID | Worker | Service | Submitted Date | 
  Deadline | Revision # | [Review]

/admin/qa/[id] — QA Review Interface
  LEFT: Download submitted files
  
  RIGHT: QA Checklist (loaded based on service type)
  
  For Final Year Projects:
    [ ] All required chapters present
    [ ] Title page formatted correctly
    [ ] Table of contents matches actual content
    [ ] Abstract present and coherent
    [ ] References properly formatted
    [ ] In-text citations match reference list
    [ ] Page numbering correct (Roman prelims, Arabic body)
    [ ] Figures and tables labeled and referenced
    [ ] Meets minimum page count
    [ ] Grammar and spelling acceptable
    [ ] File format correct (.docx)
    [ ] Preliminary pages complete
    [ ] No placeholder text remains
    [ ] All equations in borderless two-column tables
    [ ] All et al. italicised
    [ ] Tables don't break across pages unnecessarily
    [ ] All figures/tables cited with sources

  QA NOTES: textarea for detailed feedback
  
  DECISION BUTTONS:
    [✅ PASS] → status → APPROVED, qaStatus = "Passed"
    [🔄 REVISION NEEDED] → status → REVISION_NEEDED, 
       qaStatus = "Revision Needed", increment revisionCount
    [⚠️ ESCALATE] → flag for founder review

  Checklist progress saved as you check items (auto-save).
  
Reference: EDUCRAFT_WORKBASE_BLUEPRINT_v2.md Part 5, Screen 6
```

---

## PHASE 3: PEOPLE PORTALS (Days 11–15)

### Day 11 — Worker Portal

```
Build the Worker Portal — all pages under /worker.

/worker (Dashboard):
  Welcome message with worker name
  Stats cards: Active Assignments | Completed This Month | 
  Earnings This Month | Average Rating
  
  ACTIVE ASSIGNMENTS — card list:
  Each card shows:
    Project ID | Service | Client name
    Topic (truncated)
    Deadline: [date] — [X days remaining]
    Status badge
    [View Details →]
  
  Sorted by deadline (most urgent first)

/worker/projects/[id] (Assignment Detail):
  Project info: topic, department, requirements, files
  Deadline with countdown
  
  STATUS ACTIONS (based on current status):
  If ASSIGNED: [Accept Assignment] → status → IN_PROGRESS
  If IN_PROGRESS: 
    [Upload Completed Work] → file upload + submit
    → status → SUBMITTED
  If REVISION_NEEDED:
    QA feedback displayed prominently (red box)
    [Upload Revised Work] → resubmit

  FILES section:
    From Client: download links
    My Submissions: list of all files I've submitted
    QA Feedback: displayed if revision was requested

/worker/earnings:
  Summary: Total Earned | Total Paid | Balance
  Table: project-by-project earnings
  Each row: Project ID | Service | Amount | Status (Paid/Pending)

/worker/profile:
  My info (read-only, contact admin to change)
  My stats: completed projects, avg delivery days, 
  revision rate, on-time rate, rating
  Bank details (editable)

WORKER CANNOT SEE:
  - Other workers' projects
  - Client contact details (unless you decide otherwise)
  - Financial data beyond their own payouts
  - Ambassador information
  - Pricing or commission data
```

### Day 12 — Ambassador Portal

```
Build the Ambassador Portal — all pages under /ambassador.

This REPLACES the old standalone Ambassador Panel app.
Migrate the visual style to match EduCraft HQ's dark theme.

/ambassador (Dashboard):
  Welcome + tier badge (Bronze/Silver/Gold/Platinum)
  
  MY REFERRAL LINK — large, prominent:
    https://educraft.ng/intake?ref=[CODE]
    [Copy Link] [Share on WhatsApp] buttons
    QR code (generated)
  
  Stats cards:
    Total Referrals | Conversions | Conversion Rate | 
    Commission Balance
  
  Tier progress bar:
    "4 of 6 conversions to Silver (12% commission)"
    Visual progress bar with tier milestones marked

/ambassador/referrals:
  Table of all referrals:
    Date | Client Name | Service | Status | 
    Converted? (Yes/No) | Commission
  
  Filter: All | Converted | Pending

/ambassador/commissions:
  Summary: Total Earned | Total Paid | Balance
  Table: commission-by-commission history
  Each row: Project ID | Client | Rate | Amount | 
  Date Earned | Date Paid | Status

/ambassador/leaderboard:
  Top 10 ambassadors ranked by conversions this month
  (Show name + university + conversions count)
  Highlight current ambassador's position
  "You're #X this month"

/ambassador/profile:
  My info (name, phone, university, department)
  Bank details (editable — save triggers admin notification)
  My referral code and link
  Tier history

AMBASSADOR CANNOT SEE:
  - Project details (beyond status)
  - Worker information
  - Financial data beyond their own commissions
  - Other ambassadors' detailed stats (only leaderboard ranking)
```

### Day 13 — Ambassador Application + Public Pages

**Session 1 — Ambassador Application:**

```
Build the public ambassador application at /apply.

FORM FIELDS:
  Full name*
  Phone (WhatsApp)*
  Email
  University* (dropdown from universities table + "Other")
  Department
  Level (dropdown)
  "Why do you want to be an EduCraft ambassador?" (textarea, 
   max 200 characters)
  
  [Apply Now]

On submit:
  - Create a record in an AmbassadorApplication table (new model)
  - Status: PENDING
  - Show success message: "Thanks for applying! We'll review 
    your application and get back to you within 48 hours."
  - Admin gets notification: "New ambassador application from [name]"

ADMIN SIDE — /admin/ambassadors/applications:
  Table of pending applications
  [Approve] → creates Ambassador record, generates referral code, 
  sends notification
  [Reject] → updates status, optionally sends a message
```

**Session 2 — Services Page + Track Project:**

```
Build two public pages:

1. /services — Full service catalog
  All active services from the database
  Organized by category with prices
  Each service has: name, description, price, deliverables
  [Order Now →] button links to /intake/[serviceCode]
  
  Design: match the editorial style of the landing page
  Mobile: full-width cards stacked by category

2. /track/[projectId] — Public project tracker
  NO AUTH REQUIRED
  Client enters their project ID → sees status
  
  Shows: project pipeline with current position highlighted
  Current status in plain language:
    NEW: "We've received your request. Please complete payment."
    DOWNPAYMENT_VERIFIED: "Payment received. Our team is 
     reviewing your requirements."
    ASSIGNED: "A specialist has been assigned to your project."
    IN_PROGRESS: "Your project is being worked on."
    SUBMITTED: "Your project is in quality review."
    APPROVED: "Your project is ready! Please complete the 
     balance payment."
    DELIVERED: "Your project has been delivered. Check your 
     email/WhatsApp."
  
  NO sensitive data shown (no worker name, no financial details, 
  no internal notes)
  
  Simple, clean, one-screen design.
```

### Day 14 — Settings + Service Management

```
Build the Settings pages:

/admin/settings — General settings
  Company info: name, phone, email, bank details
  Default downpayment percentage (45%)
  Default commission rates per tier
  
/admin/settings/services — Service management
  Table of all services (active and inactive)
  For each: name, code, category, base price, active status
  [Edit] → modal with all service fields
  [Add New Service] → creation form
  Toggle active/inactive
  
  This is where Prince manages pricing changes, adds new 
  services, or deactivates old ones.

/admin/settings/team — Team management
  List of all admin users
  [Add Admin] → email + password + role (SUPER_ADMIN or OPS_MANAGER)
  [Deactivate] → disable account
```

### Day 15 — Expenses Tracking + Reports

**Session 1 — Expenses:**

```
Build the Expenses tracking at /admin/finance/expenses.

[Add Expense] button → modal:
  Category: dropdown (Software, Internet/Data, Marketing, 
  Equipment, Personnel, Miscellaneous)
  Description*
  Amount*
  Date*
  Recurring? checkbox
  If recurring: frequency dropdown (Monthly, Quarterly, Annual)

TABLE of all expenses:
  Date | Category | Description | Amount | Recurring?
  Filter by: category, date range
  
  Summary at top: "Total expenses this month: ₦XX,XXX"

Monthly recurring expenses auto-display as projected costs.
```

**Session 2 — Reports Page:**

```
Build the Reports page at /admin/reports.

MONTHLY REPORT — auto-generated from database:

Revenue Summary:
  Total revenue (sum of all confirmed payments)
  EduCraft share (after worker + ambassador payouts)
  Net profit (after expenses)

Project Summary:
  Total projects created
  Total completed
  Total cancelled
  Average delivery time
  QA first-pass rate

People Summary:
  Active workers + top performer
  Active ambassadors + top performer
  New clients this month

Export: [Download CSV] [Download PDF]

Date range selector: pick any month to view its report.
```

---

## PHASE 4: FINANCE + POLISH (Days 16–18)

### Day 16 — Financial Dashboard

```
Build the Financial Intelligence Dashboard at /admin/finance.

TOP ROW — Revenue cards:
  Revenue Today | Revenue This Week | Revenue This Month | 
  Revenue This Year
  Each shows amount + % change vs previous period

REVENUE CHART — Recharts line/bar chart:
  Toggle: Daily (30 days) | Weekly (12 weeks) | Monthly (12 months)
  
FINANCIAL BREAKDOWN — three columns:
  Column 1 — Income:
    Total revenue
    EduCraft share
    Worker payouts
    Ambassador commissions
    
  Column 2 — Expenses:
    Software (Claude AI)
    Internet/Data
    Marketing
    Other
    Total expenses
    
  Column 3 — Profit:
    EduCraft share - expenses = Net profit
    Profit margin %

OUTSTANDING BALANCES:
  Unpaid client balances (projects approved, balance not paid)
  Pending worker payouts
  Pending ambassador commissions
  Each clickable → goes to relevant list

BUSINESS INTELLIGENCE:
  Revenue by service type (pie/bar chart)
  Revenue by university (bar chart)
  Top workers by revenue generated
  Top ambassadors by revenue generated

Reference: EDUCRAFT_WORKBASE_BLUEPRINT_v2.md Part 5
```

### Day 17 — Mobile Optimization Pass

```
Do a complete mobile optimization pass across the entire app.

85% of EduCraft users are on mobile. Every page must work 
perfectly on a phone screen.

CHECK EVERY PAGE:

Public pages:
  [ ] Landing page — already responsive? Test on 375px viewport
  [ ] /services — cards stack properly
  [ ] /intake — form fields are full-width, touch-friendly (48px min)
  [ ] /track — single column, clean
  [ ] /apply — form is full-width

Admin pages:
  [ ] Dashboard — cards stack, pipeline is 2-row grid
  [ ] Projects list — table transforms to cards on mobile
  [ ] Project detail — tabs stack, action buttons are full-width
  [ ] Workers/Ambassadors/Clients lists — card view on mobile
  [ ] QA review — checklist is touch-friendly
  [ ] Finance dashboard — charts resize properly
  [ ] Settings — forms are full-width

Worker portal:
  [ ] Dashboard — assignment cards stack
  [ ] Project detail — all content readable
  [ ] Earnings — table transforms to cards

Ambassador portal:
  [ ] Dashboard — referral link is easily copyable on mobile
  [ ] Leaderboard — clean mobile layout

Navigation:
  [ ] Sidebar collapses to hamburger menu on mobile
  [ ] OR: bottom navigation bar (5 icons max)
  
  Admin bottom nav: Dashboard | Projects | QA | Finance | More
  Worker bottom nav: Dashboard | Projects | Earnings | Profile
  Ambassador bottom nav: Dashboard | Referrals | Commissions | Profile

Test at these breakpoints: 375px, 414px, 768px, 1024px, 1440px

Fix any: overflow, text truncation, touch targets too small, 
buttons too close together, forms not full-width.
```

### Day 18 — Light Theme Pass + Bug Fixes

```
SESSION 1 — Light theme complete pass:

Switch to light mode and verify every single page:
  [ ] All text has sufficient contrast
  [ ] Cards have visible borders or shadows
  [ ] Charts readable on light background
  [ ] Status badges visible in both themes
  [ ] The teal accent works on both light and dark backgrounds
  [ ] Footer has distinct background in light mode
  [ ] Tables have visible row separators
  [ ] Form inputs have visible borders
  [ ] The theme toggle works on every page

SESSION 2 — Bug fix sweep:

  Run: npm run build
  Fix ALL TypeScript errors and warnings
  
  Test these critical flows end-to-end:
  [ ] Admin login → dashboard loads → data displays
  [ ] Create project manually → appears in projects list
  [ ] Client submits intake form → project appears in admin
  [ ] Assign worker → worker sees it in their portal
  [ ] Worker submits → appears in QA queue
  [ ] QA passes → project moves to APPROVED
  [ ] Verify payment → project delivered
  [ ] Ambassador referral tracked → commission calculated
  [ ] Financial dashboard shows correct totals
  
  Fix any broken flows.
```

---

## PHASE 5: FINAL DEPLOY (Days 19–20)

### Day 19 — Data Migration + Final Testing

```
SESSION 1 — Migrate existing data:

  Create a migration script that imports:
  - All existing ambassadors from the old Ambassador Panel 
    (names, schools, IDs, referral codes)
  - Any existing client data you have
  - Any existing project records
  
  Verify the migrated data appears correctly in the new system.

SESSION 2 — Full end-to-end testing:

  Test as each role:
  
  AS ADMIN:
  [ ] Log in → see dashboard
  [ ] Create a test project manually
  [ ] Verify payment → assign worker → track through pipeline
  [ ] Process QA → approve → deliver
  [ ] View financial dashboard
  [ ] Manage workers, ambassadors, services
  
  AS WORKER:
  [ ] Log in → see assignments
  [ ] Accept assignment → submit work
  [ ] See earnings
  
  AS AMBASSADOR:
  [ ] Log in → see referral link + stats
  [ ] Check leaderboard
  [ ] Check commissions
  
  AS CLIENT (public):
  [ ] Fill intake form → submit successfully
  [ ] Track project with ID
  [ ] Apply as ambassador
  
  Fix anything that breaks.
```

### Day 20 — Deploy to Production

```
SESSION 1 — Production deployment:

  1. Push all code to GitHub (git add, commit, push)
  
  2. In Vercel dashboard:
     - Verify all environment variables are set:
       DATABASE_URL, DIRECT_URL, NEXTAUTH_SECRET, NEXTAUTH_URL
     - NEXTAUTH_URL must be your production URL 
       (https://educraft-xxx.vercel.app or custom domain)
     - Redeploy from latest commit
  
  3. Verify production works:
     [ ] Landing page loads
     [ ] Login works
     [ ] Dashboard loads with data
     [ ] Intake form submits successfully
     [ ] All portals accessible
  
  4. If you have a custom domain (educraft.ng):
     - Add it in Vercel: Settings → Domains → Add
     - Update DNS records as Vercel instructs
     - Update NEXTAUTH_URL to the custom domain
     - Redeploy

SESSION 2 — Launch checklist:

  [ ] Production URL works
  [ ] All pages load without errors
  [ ] Mobile version works (test on actual phone)
  [ ] Light and dark themes both work
  [ ] Intake form submits and creates projects
  [ ] Login works for all roles
  [ ] Ambassador application form works
  [ ] Financial data displays correctly
  
  ANNOUNCE:
  → Post in Ambassador Community: "EduCraft HQ is LIVE. 
     Here's your new dashboard: [link]"
  → Update all ambassador referral links to point to 
     the new intake form
  → Update WhatsApp bio with the new website
```

---

## DAILY SCHEDULE TEMPLATE

For maximum output during these 20 days:

```
06:00–07:00  Wake + review yesterday's progress
07:00–12:00  DEEP BUILD SESSION 1 (5 hours, no interruptions)
12:00–13:00  Lunch + break
13:00–18:00  DEEP BUILD SESSION 2 (5 hours)
18:00–19:00  Dinner + break
19:00–22:00  BUILD SESSION 3 (3 hours — polish, bug fixes, testing)
22:00–23:00  Plan tomorrow's sessions, write Claude Code prompts
23:00        Sleep (you need sleep to code well)

Total: ~13 productive hours per day
Over 20 days: ~260 hours of build time
```

---

## WHAT TO DO WHEN YOU GET STUCK

1. **Claude Code errors:** Paste the exact error message. Don't describe it — paste it.
2. **Design decisions:** Reference the spec documents (they're in your project root).
3. **"Should I build X or Y first?":** Follow this roadmap's order. It's sequenced so each day builds on the previous.
4. **Feature creep temptation:** If an idea comes up that's not on this list, write it down in a "LATER" note. Don't build it now. Ship first, improve after.
5. **Fatigue:** If you hit a wall, switch from building to testing. Fresh eyes on existing work is productive even when you can't write new code.

---

## SUCCESS CRITERIA — September 30

On the last day, EduCraft HQ should be able to:

- [ ] Accept a client's project submission through the intake form
- [ ] Show the admin every project, its status, and what needs to happen next
- [ ] Let the admin assign workers and track projects through the full pipeline
- [ ] Let workers see their assignments, submit work, and check earnings
- [ ] Let ambassadors see their referral stats, commissions, and leaderboard
- [ ] Show the admin the financial health of the business on one screen
- [ ] Track payments, payouts, and expenses
- [ ] Work on a phone as well as it works on a desktop
- [ ] Look professional enough that Prince opens it every morning with pride

---

*This is the build plan. Follow it day by day. Ship on September 30.*
