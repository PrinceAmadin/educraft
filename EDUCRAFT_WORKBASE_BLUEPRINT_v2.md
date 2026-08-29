# EduCraft WorkBase + Financial Dashboard — Blueprint v2.0

## What Changed From v1.0

This version incorporates the real EduCraft workflow as mapped by Prince on 27/08/2026, including:
- The actual 8-step client workflow (steps a–h) and every bottleneck
- The real data collection requirements for Final Year Projects
- The 45% downpayment model (not 100% upfront)
- The supervisor correction loop after delivery
- Mid-project data collection (Chapter 3 & 4 requirements)
- Multi-page conditional intake forms per service type
- The dedication/preliminary page data collection
- Explicit automation targets for each bottleneck

---

## THE CORE PROBLEM (From Prince's Workflow Map)

### Current Workflow (Manual)

```
Step a: Ambassadors post fliers
Step b: Client reaches out to EduCraft (WhatsApp)
Step c: EduCraft takes client details on WhatsApp (one at a time)
Step d: 45% downpayment is made
Step e: Assign report to a particular worker
Step f: Worker commences project with client details
Step g: Review and make corrections for the worker to correct
Step h: Corrections made, report sent to client when final payment is complete
```

Hidden steps not shown in the diagram:
- Requesting Chapter 3 & 4 specific requirements from client (mid-project)
- Collecting dedication and preliminary page information
- Supervisor correction loop after delivery
- Different data collection flows for different service types

### Bottleneck Analysis

At 15,000 projects per year (the ₦1B target), here's what each step looks like if done manually:

| Step | Manual Action | Time Per Project | Annual Time at 15K |
|---|---|---|---|
| b | Read and respond to WhatsApp inquiry | 5–10 min | 1,250–2,500 hours |
| c | Collect all client details via chat | 15–30 min | 3,750–7,500 hours |
| d | Send account number, verify payment | 10–15 min | 2,500–3,750 hours |
| e | Review requirements, find worker, assign | 10–20 min | 2,500–5,000 hours |
| f | Forward details to worker, explain requirements | 10–15 min | 2,500–3,750 hours |
| g | Review completed work, write corrections, send back | 30–60 min | 7,500–15,000 hours |
| h | Verify final payment, send deliverable | 10–15 min | 2,500–3,750 hours |
| **TOTAL** | | **~2.5 hours per project** | **~25,000–41,250 hours/year** |

That is 13–21 full-time employees working 8 hours a day, 5 days a week, 50 weeks a year — just on administrative processing. Not writing. Not quality control. Just moving information around.

**Prince's conclusion is correct: "That's advance slavery, not business."**

### Target Workflow (Automated)

```
Step a: Ambassadors share referral links → UNCHANGED (human)
Step b: Client clicks link, lands on intake form → AUTOMATED
Step c: Client fills multi-page form with all details → AUTOMATED
Step d: Client receives auto-calculated price, pays via payment link → AUTOMATED
Step e: System matches project to available worker, admin confirms with one click → SEMI-AUTOMATED
Step f: Worker receives full project package in their dashboard → AUTOMATED
Step g: Worker submits → enters QA queue → reviewer uses checklist → SEMI-AUTOMATED
Step h: QA passes → client notified → final payment verified → download unlocked → AUTOMATED
```

| Step | Automated Action | Admin Time Per Project | Annual Time at 15K |
|---|---|---|---|
| b | Form link shared by ambassador | 0 min | 0 hours |
| c | Client self-serves via form | 0 min | 0 hours |
| d | Auto-price + payment gateway/instructions | 1 min (verify) | 250 hours |
| e | System suggests worker, admin clicks assign | 2 min | 500 hours |
| f | Auto-forwarded via system | 0 min | 0 hours |
| g | QA checklist review | 15–20 min | 3,750–5,000 hours |
| h | Auto-notification + download | 1 min (verify) | 250 hours |
| **TOTAL** | | **~20 min per project** | **~4,750–6,000 hours/year** |

That reduces admin load by ~80%. The remaining hours are spent on actual quality review and human judgment — which is where admin time should go.

---

## PART 1 — THE DATA MODEL (Updated)

### 1.1 Core Entities

#### CLIENTS

| Field | Type | Required | Notes |
|---|---|---|---|
| client_id | Auto-generated | Auto | Format: `EC-C-XXXXX` |
| full_name | Text | Yes | |
| phone | Text | Yes | WhatsApp number — primary contact |
| email | Text | No | Optional but encouraged for notifications |
| university | Link | Yes | Links to Universities table |
| faculty | Text | Yes | |
| department | Text | Yes | |
| level | Dropdown | Yes | 100, 200, 300, 400, 500, PGD, Masters, PhD |
| matric_number | Text | No | Collected per-project, not per-client (see below) |
| referred_by | Link | No | Links to Ambassador |
| referral_code_used | Text | No | For tracking |
| date_registered | DateTime | Auto | |
| total_projects | Number | Auto | Calculated from projects |
| total_spent | Currency | Auto | Calculated from payments |
| status | Dropdown | Auto | Active, Completed, Inactive |
| notes | Long text | No | Internal notes |

**Design decision — matric number:** Matric number is collected at the project level, not the client level. Why? Because a client might come back for a second degree (PGD after BSc), or might have a correction to their matric number on a specific project. It belongs on the project, not the person.

#### PROJECTS

This is the most significantly updated entity from v1.0.

**Core Project Fields (all service types):**

| Field | Type | Required | Notes |
|---|---|---|---|
| project_id | Auto-generated | Auto | Format: `EC-XXXXX` |
| client_id | Link | Yes | Links to Client |
| service_type | Link | Yes | Links to Services table |
| project_category | Auto | Auto | Derived from service_type (Academic, Design, etc.) |
| status | Dropdown | Auto | See Pipeline — starts as NEW |
| created_at | DateTime | Auto | |
| updated_at | DateTime | Auto | |

**Academic Project Fields (Final Year Project, Seminar, Term Paper, IT Report):**

| Field | Type | Required | Notes |
|---|---|---|---|
| project_title | Text | Yes | Full project topic |
| matric_number | Text | Yes | Student's matric number |
| project_partners | Text | No | Name(s) of project partners, if group project |
| supervisor_name | Text | Yes | Main supervisor |
| other_supervisors | Text | No | Additional supervisors |
| hod_name | Text | Yes | Head of Department name |
| department_outline | Mixed | No | Department-specific format — text, image, or file |
| proposal_documents | File | No | Proposal, approval letter, or any existing docs |
| referencing_style | Dropdown | Yes | APA 7th, APA 6th, Harvard, IEEE, Chicago, MLA, Custom |
| minimum_pages | Dropdown | Yes | 70, 80, 90, Above 90, Not Specified |
| chapter_count | Number | Yes | Default: 5 for final year, varies for others |
| data_requirements | Dropdown | Yes | Primary, Secondary, Both, None, Not Sure |
| project_type | Dropdown | Yes | Theoretical, Practical/Implementation, Design-based, Survey-based |
| specific_deadline | Date | No | Client's hard deadline (if any) |
| internal_deadline | Date | Auto | Calculated: specific_deadline minus buffer, or default timeline |
| special_instructions | Long text | No | Anything unique |

**Preliminary Page Fields (collected separately — see Form Flow):**

| Field | Type | Required | Notes |
|---|---|---|---|
| dedication_type | Dropdown | Yes | See dedication options below |
| dedication_details | JSON/Long text | Yes | Structured data about dedication recipients |
| acknowledgment_people | JSON/Long text | No | People to acknowledge and their roles |

**Dedication Options:**
1. To God and to my parents
2. To God, my parents and siblings
3. To God, my parents and specific friends
4. Custom (client specifies)

For each person mentioned in dedication:
| Sub-field | Type |
|---|---|
| name | Text |
| relationship | Text |
| specific_message | Text (optional) |

**Mid-Project Collection Fields (Chapter 3 & 4 Requirements):**

| Field | Type | When Collected | Notes |
|---|---|---|---|
| ch3_requirements | Long text | After Chapters 1–2 drafted | Specific methodology/framework requirements |
| ch4_data | File/Long text | After Chapter 3 drafted | Raw data, questionnaire responses, implementation details |
| ch4_requirements | Long text | After Chapter 3 drafted | Analysis instructions, tools to use, expected outputs |
| implementation_specs | Long text | If project_type = Practical | Software specs, hardware specs, design parameters |
| mid_project_files | File | Variable | Any additional files client provides during project |

**Financial Fields:**

| Field | Type | Notes |
|---|---|---|
| price | Currency | Total price (auto-calculated from service, can be overridden) |
| downpayment_amount | Currency | Auto: price × 0.45 |
| downpayment_status | Dropdown | Unpaid, Paid, Verified |
| downpayment_date | Date | When downpayment was confirmed |
| downpayment_reference | Text | Transaction reference |
| balance_amount | Currency | Auto: price - downpayment_amount |
| balance_status | Dropdown | Unpaid, Paid, Verified |
| balance_date | Date | When final payment confirmed |
| balance_reference | Text | Transaction reference |
| payment_method | Dropdown | Bank Transfer, Card, Cash, Other |

**Assignment & Quality Fields:**

| Field | Type | Notes |
|---|---|---|
| assigned_worker | Link | Links to Worker |
| assigned_date | DateTime | When worker was assigned |
| worker_accepted | Boolean | Has worker confirmed acceptance? |
| worker_accepted_date | DateTime | |
| qa_reviewer | Link | Links to QA person |
| qa_status | Dropdown | Pending, Passed, Failed, Revision Needed |
| qa_score | Number | Optional: numerical QA score |
| qa_notes | Long text | QA feedback/corrections |
| revision_count | Number | Auto-incremented |
| max_revisions | Number | Default: 3, then escalate |

**Delivery & Post-Delivery Fields:**

| Field | Type | Notes |
|---|---|---|
| delivery_date | DateTime | When sent to client |
| delivery_method | Dropdown | Portal Download, WhatsApp, Email |
| client_feedback | Dropdown | Not Rated, Satisfied, Neutral, Unsatisfied |
| supervisor_corrections | Boolean | Did supervisor request changes? |
| supervisor_correction_details | Long text | What the supervisor wants changed |
| supervisor_correction_status | Dropdown | None, Pending, In Progress, Completed |
| supervisor_correction_count | Number | How many rounds of supervisor corrections |
| final_completion_date | DateTime | When everything is truly done |

**Commission & Payout Fields:**

| Field | Type | Notes |
|---|---|---|
| ambassador_id | Link | Ambassador who referred this client |
| ambassador_commission_rate | Percentage | Based on ambassador tier at time of project |
| ambassador_commission | Currency | Auto: price × commission_rate |
| ambassador_commission_paid | Boolean | |
| worker_payout_rate | Percentage | Default: 40% |
| worker_payout | Currency | Auto: price × 0.40 |
| worker_payout_paid | Boolean | |
| educraft_revenue | Currency | Auto: price - commission - worker_payout |

**Files:**

| Field | Type | Notes |
|---|---|---|
| files_from_client | File (multiple) | Everything client uploads |
| files_from_worker | File (multiple) | Work submitted by worker |
| files_qa_reviewed | File (multiple) | QA-reviewed versions |
| files_delivered | File (multiple) | Final deliverables sent to client |
| files_supervisor_corrections | File (multiple) | Post-delivery correction files |

#### SERVICE TYPES (Expanded)

| Field | Type | Notes |
|---|---|---|
| service_id | Auto | |
| service_name | Text | Display name |
| service_code | Text | Short code for internal use |
| category | Dropdown | Academic, Design, Learning, Digital, Career |
| base_price | Currency | Standard starting price |
| pricing_model | Dropdown | Fixed, Variable, Quote-based |
| price_factors | JSON | What affects price (pages, chapters, urgency, etc.) |
| intake_form_template | Text | Which form flow to use (see Part 3) |
| estimated_days | Number | Average completion time |
| requires_downpayment | Boolean | Default: true |
| downpayment_percentage | Number | Default: 45% |
| is_active | Boolean | Currently offered? |
| description | Long text | What's included |
| deliverables | Text | What the client receives |

**Service Catalog (Initial):**

| Service | Code | Category | Base Price | Pricing | Form Template |
|---|---|---|---|---|---|
| Final Year Project (Full) | FYP-FULL | Academic | ₦70,000 | Fixed | academic_fyp |
| Final Year Project (3 Chapters) | FYP-3CH | Academic | ₦40,000 | Fixed | academic_fyp |
| Final Year Project (Single Chapter) | FYP-1CH | Academic | ₦15,000 | Fixed | academic_fyp_single |
| Seminar Report | SEM | Academic | ₦25,000 | Fixed | academic_seminar |
| Term Paper | TERM | Academic | ₦15,000 | Fixed | academic_termpaper |
| IT Report | IT-RPT | Academic | ₦20,000 | Fixed | academic_it_report |
| Data Analysis Only | DATA | Academic | ₦20,000 | Variable | academic_data |
| Presentation Design | PRES | Design | ₦15,000 | Variable | design_presentation |
| CV / Resume | CV | Career | ₦10,000 | Fixed | career_cv |
| Graphic Design (Flyer) | GD-FLY | Design | ₦8,000 | Quote | design_graphic |
| Masterclass (Individual) | MC-IND | Learning | ₦15,000 | Fixed | learning_masterclass |

**Why `intake_form_template` matters:** Different services collect different data. A Final Year Project needs matric number, supervisor name, HOD, dedication details. A CV needs work experience, skills, and career objectives. A presentation needs slide count and design preferences. The form template field tells the system which intake form to show. This is how you avoid a one-size-fits-all form that's confusing for simpler services.

#### AMBASSADORS (Updated with Tier System)

| Field | Type | Notes |
|---|---|---|
| ambassador_id | Auto | Format: `EC-A-XXXXX` |
| full_name | Text | |
| phone | Text | WhatsApp |
| email | Text | |
| university | Link | |
| department | Text | |
| level | Text | |
| referral_code | Auto | Unique code (e.g., `BLESSING2026`) |
| referral_link | Auto | `https://educraft.ng/start?ref=BLESSING2026` |
| date_joined | Date | |
| status | Dropdown | Active, Inactive, Suspended, Alumni |
| total_referrals | Number | Auto — leads generated |
| total_conversions | Number | Auto — leads who became paying clients |
| conversion_rate | Percentage | Auto |
| total_revenue_generated | Currency | Auto — sum of all project prices from their referrals |
| total_commission_earned | Currency | Auto |
| total_commission_paid | Currency | |
| commission_balance | Currency | Auto: earned - paid |
| performance_tier | Auto | Calculated from total_conversions |
| commission_rate | Auto | Determined by tier |
| bank_name | Text | |
| account_number | Text | |
| account_name | Text | |

**Tier Calculation:**

| Tier | Conversions | Commission Rate | Additional Benefits |
|---|---|---|---|
| Bronze | 0–5 | 10% | — |
| Silver | 6–15 | 12% | Priority support |
| Gold | 16–30 | 15% | Priority support + quarterly bonus |
| Platinum | 31+ | 15% | All above + early access to new services |

**Tier transitions are automatic.** When an ambassador's total_conversions crosses a threshold, their tier updates, and all future projects use the new rate. Past projects keep their original rate.

#### WORKERS (Same as v1.0 with additions)

| Field | Type | Notes |
|---|---|---|
| worker_id | Auto | Format: `EC-W-XXXXX` |
| full_name | Text | |
| phone | Text | |
| email | Text | |
| specialties | Multi-select | Departments they can handle |
| skills | Multi-select | SPSS, MATLAB, AutoCAD, Python, etc. |
| service_types | Multi-select | Which services they can work on |
| education_level | Dropdown | BSc, MSc, PhD, Other |
| date_joined | Date | |
| status | Dropdown | Active, On Break, Suspended, Terminated |
| availability | Auto | Available, Busy, Unavailable — based on current load vs max |
| current_active_projects | Number | Auto-counted |
| max_concurrent_projects | Number | Admin-set per worker |
| total_projects_completed | Number | Auto |
| average_delivery_days | Number | Auto |
| revision_rate | Percentage | Auto |
| on_time_rate | Percentage | Auto — % delivered before internal_deadline |
| rating | Number | Auto — average client satisfaction |
| total_earned | Currency | Auto |
| total_paid | Currency | |
| payout_balance | Currency | Auto: earned - paid |
| bank_name | Text | |
| account_number | Text | |
| account_name | Text | |
| notes | Long text | Strengths, weaknesses, internal observations |

#### UNIVERSITIES (Same as v1.0)

| Field | Type | Notes |
|---|---|---|
| university_id | Auto | |
| university_name | Text | |
| abbreviation | Text | UNIBEN, UNILAG, etc. |
| type | Dropdown | Federal, State, Private |
| state | Text | |
| region | Dropdown | South-South, South-West, South-East, North-Central, North-West, North-East |
| ambassador_count | Number | Auto |
| total_clients | Number | Auto |
| total_revenue | Currency | Auto |
| status | Dropdown | Active, Prospecting, Inactive |
| entry_date | Date | |

#### PAYMENTS (Updated for Split Payment Model)

| Field | Type | Notes |
|---|---|---|
| payment_id | Auto | Format: `EC-PAY-XXXXX` |
| type | Dropdown | Client Downpayment, Client Balance, Worker Payout, Ambassador Commission, Expense, Refund |
| direction | Dropdown | Inflow, Outflow |
| project_id | Link | Related project |
| person_id | Link | Client, Worker, or Ambassador |
| amount | Currency | |
| payment_method | Dropdown | Bank Transfer, Card, Cash, Other |
| reference | Text | Transaction reference |
| date | DateTime | |
| confirmed_by | Text | Who verified |
| status | Dropdown | Pending, Confirmed, Failed, Reversed |
| notes | Long text | |

#### EXPENSES (Same as v1.0)

| Field | Type | Notes |
|---|---|---|
| expense_id | Auto | |
| category | Dropdown | Software, Internet/Data, Marketing, Equipment, Personnel, Miscellaneous |
| description | Text | |
| amount | Currency | |
| date | Date | |
| recurring | Boolean | |
| frequency | Dropdown | Monthly, Quarterly, Annual, One-time |
| approved_by | Text | |

#### PROJECT STATUS LOG (Audit Trail)

| Field | Type | Notes |
|---|---|---|
| log_id | Auto | |
| project_id | Link | |
| from_status | Text | |
| to_status | Text | |
| changed_by | Text | User or "System" |
| changed_at | DateTime | |
| notes | Text | Reason for change |
| time_in_previous_status | Duration | Auto-calculated |

---

## PART 2 — THE PROJECT PIPELINE (Updated)

### 2.1 Full Pipeline with Split Payment

This pipeline reflects EduCraft's real workflow, including the 45% downpayment model and the post-delivery supervisor correction loop.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EDUCRAFT PROJECT PIPELINE                        │
│                                                                     │
│  NEW                                                                │
│   │                                                                 │
│   ▼ (45% downpayment received and verified)                        │
│  DOWNPAYMENT VERIFIED                                               │
│   │                                                                 │
│   ▼ (admin reviews requirements, confirms everything is clear)      │
│  REQUIREMENTS CONFIRMED                                             │
│   │                                                                 │
│   ▼ (worker assigned by admin)                                      │
│  ASSIGNED                                                           │
│   │                                                                 │
│   ▼ (worker accepts and begins)                                     │
│  IN PROGRESS                                                        │
│   │                                                                 │
│   ├──► AWAITING CLIENT INPUT (if Ch.3/4 requirements needed)        │
│   │         │                                                       │
│   │         ▼ (client provides requirements)                        │
│   │    back to IN PROGRESS                                          │
│   │                                                                 │
│   ▼ (worker submits completed draft)                                │
│  SUBMITTED                                                          │
│   │                                                                 │
│   ▼ (enters QA queue)                                               │
│  IN QA REVIEW                                                       │
│   │                                                                 │
│   ├──► REVISION NEEDED (QA fails)                                   │
│   │         │                                                       │
│   │         ▼ (worker fixes, re-submits)                            │
│   │    back to SUBMITTED                                            │
│   │                                                                 │
│   ▼ (QA passes)                                                     │
│  APPROVED                                                           │
│   │                                                                 │
│   ▼ (balance payment verified — remaining 55%)                      │
│  BALANCE VERIFIED                                                   │
│   │                                                                 │
│   ▼ (deliverable sent/unlocked to client)                           │
│  DELIVERED                                                          │
│   │                                                                 │
│   ├──► SUPERVISOR CORRECTIONS (supervisor requests changes)         │
│   │         │                                                       │
│   │         ▼ (corrections completed and re-delivered)              │
│   │    back to DELIVERED                                            │
│   │                                                                 │
│   ▼ (client confirms or 7 days no response)                        │
│  COMPLETED                                                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Special Statuses

| Status | Meaning | Transition Rules |
|---|---|---|
| ON HOLD | Waiting for client — they haven't provided required info/files | Can happen from any active status. Returns to previous status when resolved. |
| CANCELLED | Client requested cancellation | If before work started: full refund possible. If after work started: partial refund at admin discretion. |
| REFUNDED | Payment returned | Only from CANCELLED. Creates outflow payment record. |
| DISPUTED | Client complaint about quality | Triggers founder review. Cannot auto-resolve. |
| AWAITING CLIENT INPUT | Mid-project pause for Ch.3/4 requirements | Only from IN PROGRESS. Deadline clock pauses. |
| SUPERVISOR CORRECTIONS | Post-delivery changes from client's supervisor | Only from DELIVERED. Free corrections within scope. Out-of-scope = new project. |

### 2.3 Pipeline Rules (System-Enforced)

1. **No advancement past NEW without verified downpayment.** System checks: downpayment_status = "Verified" before allowing transition to DOWNPAYMENT VERIFIED.

2. **No worker assignment without confirmed requirements.** System checks: project has service_type, project_title, and either description or files_from_client.

3. **Worker must accept before project moves to IN PROGRESS.** Prevents projects sitting in limbo because a worker didn't see the assignment.

4. **No delivery without QA pass.** qa_status must = "Passed" before project can move to APPROVED.

5. **No delivery without balance payment.** balance_status must = "Verified" before project can move from APPROVED to DELIVERED. (Work is done, but client doesn't receive it until they pay the remaining 55%.)

6. **Deadline alerts are automatic:**
   - 5 days before internal_deadline → gentle reminder to worker
   - 3 days before → urgent reminder to worker + alert to admin
   - 1 day before → critical alert to admin
   - Deadline passed → project flagged OVERDUE, admin notified immediately

7. **Revision cap.** revision_count ≥ 3 → project flagged for founder review. System blocks further revisions until a founder reviews and decides.

8. **Supervisor correction cap.** supervisor_correction_count ≥ 2 → flag for admin review. Determine if corrections are in-scope (free) or out-of-scope (new project or additional charge).

9. **AWAITING CLIENT INPUT pauses the deadline.** When a project moves to this status, the internal_deadline is extended by the number of days the client takes to respond. The worker shouldn't be penalized for client delays.

### 2.4 Payment Flow

```
CLIENT SUBMITS REQUEST
        │
        ▼
  System calculates total price (from service type)
  System calculates downpayment (price × 45%)
  System displays payment instructions:
    - Amount: ₦31,500 (for ₦70K project)
    - Account: EduCraft account details
    - Reference: Project ID (EC-XXXXX)
        │
        ▼
  Client pays downpayment
        │
        ▼
  Admin verifies payment (or payment gateway auto-verifies)
  System moves project to DOWNPAYMENT VERIFIED
  System records payment in Payments table (type: Client Downpayment)
        │
        ▼
  [...project work happens...]
        │
        ▼
  Project passes QA → status: APPROVED
  System notifies client:
    "Your project is ready! Please complete the balance payment."
    - Balance: ₦38,500
    - Account: EduCraft account details
    - Reference: EC-XXXXX
        │
        ▼
  Client pays balance
        │
        ▼
  Admin verifies payment
  System moves project to BALANCE VERIFIED
  System records payment in Payments table (type: Client Balance)
        │
        ▼
  Deliverable unlocked/sent → DELIVERED
```

**Why this matters:** The 45/55 split protects both sides. EduCraft doesn't start work without commitment. Client doesn't pay full price before seeing results. The system enforces this — no shortcuts.

---

## PART 3 — MULTI-PAGE INTAKE FORMS

This is one of the highest-impact automations. Instead of collecting data over 15–30 minutes of WhatsApp conversation, the client fills a structured form in 5–8 minutes.

### 3.1 Form Architecture

Each service type has its own form template with different pages. The system loads the right template based on what the client selects.

### 3.2 Form Flow: Final Year Project (Full) — `academic_fyp`

**Page 1 — Personal Information**

```
ABOUT YOU
──────────────────────────────────

Full Name *
[________________________]

Project Partner(s) — if this is a group project
[________________________]
(Leave blank if individual project)

University *
[Dropdown: List of universities + "Other"]

If "Other": [________________________]

Faculty *
[________________________]

Department *
[________________________]

Matric Number *
[________________________]

Phone (WhatsApp) *
[________________________]

Email
[________________________]

Referral Code (if you have one)
[________________________]

[NEXT →]
```

**Page 2 — Project Details**

```
YOUR PROJECT
──────────────────────────────────

Full Project Title *
[________________________]
[________________________]

Supervisor's Name *
[________________________]

Other Supervisor(s) — if any
[________________________]

Head of Department (HOD) Name *
[________________________]

Project Type *
○ Theoretical / Literature-based
○ Practical / Implementation-based
○ Design-based
○ Survey / Questionnaire-based
(This helps us assign the right specialist)

Number of Chapters *
○ 5 Chapters (standard)
○ 3 Chapters
○ Other: [___]

Referencing Style *
○ APA 7th Edition
○ APA 6th Edition
○ Harvard
○ IEEE
○ Chicago
○ MLA
○ My department uses a custom style (please upload guide)

Data Requirements *
○ Primary Data (surveys, interviews, experiments)
○ Secondary Data (existing data, literature)
○ Both
○ I'm not sure — I'd like guidance

[NEXT →]
```

**Page 3 — Requirements & Files**

```
REQUIREMENTS
──────────────────────────────────

Does your department have a specific project outline/format?
○ Yes — I'll upload it
○ Yes — I'll type it below
○ No / I'm not sure

If uploading:
[📎 Upload department outline (image, PDF, or document)]

If typing:
[Large text area]
[________________________]
[________________________]

Minimum Number of Pages *
○ 70 pages
○ 80 pages
○ 90 pages
○ Above 90 pages
○ Not specified by my department

Do you have a project proposal or any existing documents?
[📎 Upload files (multiple allowed)]
(Proposal, approval letter, past work, similar projects, etc.)

Special Instructions
[Large text area]
Anything else we should know? Specific requirements from your supervisor?
Any topics/areas you want emphasized?
[________________________]

Specific Deadline
[Date picker]
(When must this be submitted to your department?)
Leave blank if no specific date.

[NEXT →]
```

**Page 4 — Preliminary Pages**

```
PRELIMINARY PAGES
──────────────────────────────────
(This helps us write your dedication and acknowledgment pages)

DEDICATION
Who do you want to dedicate this project to? *
○ To God and my parents
○ To God, my parents and siblings
○ To God, my parents and specific friends
○ I want to write a custom dedication

If parents selected:
  Father's Name: [________________________]
  Mother's Name: [________________________]

If siblings selected:
  Sibling 1 Name: [________________________]
  Sibling 2 Name: [________________________]
  [+ Add another sibling]

If specific friends selected:
  Friend 1 Name: [________________________]
  Friend 2 Name: [________________________]
  [+ Add another friend]

If custom:
  [Large text area — write your dedication]

ACKNOWLEDGMENT
Who do you want to acknowledge? (Check all that apply)
☐ God
☐ Supervisor
☐ Head of Department
☐ Parents
☐ Siblings
☐ Friends
☐ Lecturers (specify names)
☐ Others (specify)

For each checked, we'll craft an appropriate acknowledgment.
Any specific things you want mentioned?
[Large text area]

[NEXT →]
```

**Page 5 — Review & Submit**

```
REVIEW YOUR ORDER
──────────────────────────────────

Service: Final Year Project (Full — 5 Chapters)
Price: ₦70,000

Downpayment (45%): ₦31,500
Balance (due on completion): ₦38,500

──────────────────────────────────

YOUR DETAILS:
Name: John Okafor
University: University of Benin
Department: Mechanical Engineering
Matric: ENG/17/XXXX
...

PROJECT:
Title: Design and Fabrication of a Solar-Powered...
Supervisor: Dr. Okonkwo
...

──────────────────────────────────

PAYMENT INSTRUCTIONS:
To proceed, please make a downpayment of ₦31,500 to:

Bank: [EduCraft's Bank]
Account Number: [XXXXXXXXXX]
Account Name: [EduCraft Account Name]
Reference: EC-00234

After payment, your project will be assigned to a specialist
within 24 hours.

☐ I confirm all details above are correct *
☐ I agree to EduCraft's terms of service *

[SUBMIT ORDER]
```

### 3.3 Form Flow: Seminar Report — `academic_seminar`

Simplified version of the FYP form:

- Page 1: Personal Info (same as FYP but no project partners)
- Page 2: Seminar Details (topic, supervisor, referencing style — no HOD, no chapter breakdown)
- Page 3: Requirements & Files (same structure, fewer fields)
- Page 4: Review & Submit (no preliminary pages — seminars typically don't have dedications)

### 3.4 Form Flow: Term Paper — `academic_termpaper`

Even simpler:

- Page 1: Personal Info (name, university, department, phone)
- Page 2: Term Paper Details (course title, course code, topic, word count, referencing style, deadline)
- Page 3: Upload any instructions from lecturer
- Page 4: Review & Submit

### 3.5 Form Flow: CV / Resume — `career_cv`

Completely different data:

- Page 1: Personal Info (name, phone, email, LinkedIn)
- Page 2: Education (degree, university, graduation year, CGPA)
- Page 3: Experience (job titles, companies, dates, descriptions)
- Page 4: Skills, certifications, interests
- Page 5: Style Preferences (modern, classic, creative — with visual examples)
- Page 6: Review & Submit

### 3.6 Form Flow: Presentation Design — `design_presentation`

- Page 1: Personal Info
- Page 2: Presentation Details (topic, purpose, audience, number of slides, content source)
- Page 3: Design Preferences (color scheme, style — formal, creative, minimal)
- Page 4: Upload content/reference materials
- Page 5: Review & Submit

### 3.7 Mid-Project Data Collection (Chapter 3 & 4 Form)

This is triggered by the system when a project reaches the Chapter 3/4 stage and the project_type is Practical/Implementation or Survey-based.

The worker or admin moves the project to AWAITING CLIENT INPUT, which sends the client a link to a short form:

```
ADDITIONAL REQUIREMENTS — EC-XXXXX
──────────────────────────────────

Hi [Client Name],

We're making great progress on your project. To continue with
Chapters 3 and 4, we need some additional information from you.

For Practical/Implementation Projects:
──────────────────────────────────
What software/tools did you use for implementation?
[________________________]

Describe what you built/implemented:
[Large text area]

Upload screenshots, code, or documentation:
[📎 Upload files]

Any specific results or outputs to include?
[Large text area]


For Survey-based Projects:
──────────────────────────────────
Upload your completed questionnaire responses:
[📎 Upload files (CSV, Excel, PDF)]

How many respondents?
[________________________]

Any specific analysis you want performed?
(e.g., correlation, regression, chi-square, frequency tables)
[Large text area]

[SUBMIT]
```

When the client submits this form:
- Data is attached to the project record
- Project status returns to IN PROGRESS
- Worker is notified: "Chapter 3/4 requirements received for EC-XXXXX"
- Internal deadline resumes (was paused during AWAITING CLIENT INPUT)

---

## PART 4 — USER ROLES AND PERMISSIONS (Updated)

### 4.1 Super Admin (Founders)

**Full access to everything.** This role runs the business.

**Home Dashboard shows:**
- Pipeline overview (project counts by status)
- Revenue cards (today, week, month, year)
- At-risk projects (deadline approaching, overdue, stuck)
- Pending actions (payments to verify, workers to assign, payouts to make)
- Recent activity feed
- Alerts and anomalies

**Key capabilities:**
- Create/edit/delete all records
- Assign workers to projects
- Verify payments
- Process payouts
- Run QA reviews
- Access financial dashboard
- Manage ambassadors, workers, services, universities
- Export data
- Override pipeline rules (with audit log)

### 4.2 Operations Manager (Future hire — when you can afford one)

**Same as Super Admin except:**
- Cannot delete records (only archive)
- Cannot change pricing or commission structures
- Cannot access founder-level financial reports (net profit, total expenses)
- Cannot override pipeline rules

**Why plan for this now:** You identified that having only 2 co-founders is a bottleneck. The first internal hire should be an Operations Manager who can handle day-to-day WorkBase operations (verify payments, assign workers, run QA) so you two can focus on growth. Building the role into the system now means you can onboard them in a day when the time comes.

### 4.3 Worker

**Can see:** Their assigned projects only.

**Dashboard shows:**
- Active assignments (with deadlines and countdown)
- Project details and requirements (full read access to their projects)
- QA feedback on submitted work
- Earnings summary and payout history
- Performance stats (their own)

**Can do:**
- Accept/decline assignments
- Update project status (mark In Progress, Submit work)
- Upload completed files
- View QA feedback
- Request deadline extension (goes to admin for approval)

**Cannot do:**
- See other workers' projects
- See client contact details (unless you decide otherwise)
- See financial data beyond their own payouts
- Change project requirements or pricing
- Skip pipeline steps

### 4.4 Ambassador

**Can see:** Their referral performance only.

**Dashboard shows:**
- Their unique referral link (with copy/share button)
- Referral stats (total leads, conversions, conversion rate)
- Commission summary (earned, paid, balance)
- Performance tier and progress to next tier
- Payout history

**Can do:**
- Copy/share referral link
- View their stats
- Update their bank details
- View leaderboard (optional — shows top ambassadors anonymously or by name)

**Cannot do:**
- See project details
- See worker information
- See financial data beyond their own commissions
- See other ambassadors' detailed stats (only leaderboard ranking)

### 4.5 Client (Future — not in initial build)

Will eventually see their project status, upload files, download deliverables, and submit revision requests via a portal. For now, WhatsApp delivery continues.

---

## PART 5 — SUPER ADMIN SCREENS (Detailed)

### SCREEN 1: Command Center (Home Dashboard)

**Layout: Full-width, single page, everything visible at a glance.**

```
╔══════════════════════════════════════════════════════════════╗
║  EDUCRAFT WORKBASE                    [Search] [+ New Project]║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐    ║
║  │ ACTIVE   │ │ REVENUE  │ │ PENDING  │ │ AT RISK      │    ║
║  │ PROJECTS │ │ (MONTH)  │ │ PAYOUTS  │ │ PROJECTS     │    ║
║  │    47    │ │₦3.45M    │ │₦890K     │ │    3         │    ║
║  │+12 today │ │↑18% vs   │ │23 workers│ │deadline <48h │    ║
║  │          │ │last month│ │14 ambass.│ │              │    ║
║  └──────────┘ └──────────┘ └──────────┘ └──────────────┘    ║
║                                                              ║
║  PROJECT PIPELINE                                            ║
║  ┌────┬────┬────┬────┬────┬────┬────┬────┬────┬────┐        ║
║  │NEW │DOWN│CONF│ASGN│PROG│WAIT│SUBM│ QA │APPR│DELV│        ║
║  │ 5  │ 8  │ 3  │ 2  │ 15 │ 1  │ 4  │ 6  │ 2  │ 1 │        ║
║  └────┴────┴────┴────┴────┴────┴────┴────┴────┴────┘        ║
║  (Each segment is clickable → shows projects in that stage)  ║
║                                                              ║
║  ┌─────────────────────────┐ ┌─────────────────────────┐    ║
║  │ RECENT ACTIVITY         │ │ ACTION REQUIRED          │    ║
║  │                         │ │                          │    ║
║  │ EC-00234 → IN PROGRESS  │ │ ⚠ EC-00215 deadline 2d  │    ║
║  │   by Worker Chidi, 2m   │ │ ⚠ EC-00220 rev #3       │    ║
║  │                         │ │ 💰 12 commissions unpaid │    ║
║  │ EC-00231 payment ₦31.5K │ │ 👤 Worker Emeka 5/3     │    ║
║  │   verified, 15m ago     │ │   projects (overloaded)  │    ║
║  │                         │ │ 📋 4 projects in QA queue│    ║
║  │ New client: Amina Yusuf │ │ 💳 3 balance payments    │    ║
║  │   UNILAG, 1h ago       │ │   awaiting verification  │    ║
║  │                         │ │                          │    ║
║  │ EC-00229 passed QA      │ │                          │    ║
║  │   2h ago                │ │                          │    ║
║  └─────────────────────────┘ └─────────────────────────┘    ║
╚══════════════════════════════════════════════════════════════╝
```

**Every item in "Action Required" is clickable and takes you to the relevant screen to resolve it.**

### SCREEN 2: Projects List

**Full-featured table with filters, search, sorting, and bulk actions.**

**Filter bar (always visible):**
```
Status: [All ▼]  Service: [All ▼]  University: [All ▼]
Worker: [All ▼]  Ambassador: [All ▼]  Payment: [All ▼]
Date: [From] → [To]  Priority: [All ▼]
[Search by Project ID, client name, or topic...]
```

**Table columns:**
```
ID        | Client       | Service    | Status      | Worker   | Deadline  | Price    | Payment     | ⚡
EC-00234  | John Okafor  | FYP Full   | In Progress | Chidi O. | Aug 16    | ₦70,000  | 45% Paid    | [→]
EC-00231  | Amina Yusuf  | Seminar    | Downpay Ver | —        | Sep 1     | ₦25,000  | 45% Paid    | [→]
EC-00230  | David Ade    | FYP Full   | In QA       | Amara E. | Aug 10    | ₦70,000  | 45% Paid    | [→]
```

**Color coding:**
- 🟢 Green: on track
- 🟡 Yellow: deadline within 5 days
- 🔴 Red: overdue or at-risk
- 🔵 Blue: awaiting client input
- ⚪ Grey: completed

**Bulk actions:**
- Export filtered results to CSV
- Bulk mark payments as verified
- Bulk assign to worker (for similar projects)

### SCREEN 3: Project Detail View

**Single project, all information, tabbed layout.**

**Header:**
```
EC-00234 | Final Year Project (Full) | ₦70,000
Status: ████████░░░░░░░░ IN PROGRESS
Client: John Okafor | UNIBEN | Mechanical Engineering
Worker: Chidi Okonkwo | Assigned: Aug 5
Deadline: Aug 16 (11 days remaining)
```

**Tab 1 — Requirements**
All data from the intake form, organized and readable. Includes all files uploaded by client.

**Tab 2 — Preliminary Pages**
Dedication and acknowledgment data collected from the form.

**Tab 3 — Mid-Project Data**
Chapter 3/4 requirements (if collected). Shows whether the client has responded or if we're still waiting.

**Tab 4 — Timeline**
```
Aug 1, 10:30 AM — NEW (Client submitted form)
Aug 1, 2:15 PM  — DOWNPAYMENT VERIFIED (₦31,500 — Admin Prince)
Aug 2, 9:00 AM  — REQUIREMENTS CONFIRMED (Admin Prince)
Aug 2, 11:30 AM — ASSIGNED to Chidi Okonkwo
Aug 2, 12:00 PM — Worker accepted assignment
Aug 2, 12:05 PM — IN PROGRESS
Aug 8, 3:00 PM  — AWAITING CLIENT INPUT (Ch.3/4 requirements requested)
Aug 10, 9:00 AM — Client submitted Ch.3/4 data
Aug 10, 9:01 AM — IN PROGRESS (resumed, deadline extended +2 days)
```

**Tab 5 — Financials**
```
PRICE BREAKDOWN
───────────────────────────
Total Price:           ₦70,000
Downpayment (45%):     ₦31,500  ✅ Verified — Aug 1
Balance (55%):         ₦38,500  ⏳ Pending

PAYOUT BREAKDOWN
───────────────────────────
Ambassador (Blessing, 12%): ₦8,400   ⏳ Not yet due (project incomplete)
Worker (Chidi, 40%):        ₦28,000  ⏳ Not yet due (project incomplete)
EduCraft (48%):             ₦33,600

Payouts become due when project reaches COMPLETED status.
```

**Tab 6 — Files**
```
FROM CLIENT:
📎 Project_Proposal.pdf (uploaded Aug 1)
📎 Department_Outline.jpg (uploaded Aug 1)
📎 Questionnaire_Responses.xlsx (uploaded Aug 10 — Ch.3/4 data)

FROM WORKER:
📎 EC-00234_Draft_v1.docx (submitted Aug 12)
📎 EC-00234_Draft_v2.docx (submitted Aug 14 — after QA revision)

DELIVERED TO CLIENT:
📎 EC-00234_Final.docx (delivered Aug 15)
```

**Tab 7 — Notes & Communication**
Internal notes, QA feedback, admin comments. Not visible to client or worker (unless specifically shared).

### SCREEN 4: Worker Assignment

**Triggered when admin clicks "Assign Worker" on a project in REQUIREMENTS CONFIRMED status.**

```
ASSIGN WORKER — EC-00234
────────────────────────────────────

PROJECT SUMMARY:
Topic: Design and Fabrication of a Solar-Powered...
Department: Mechanical Engineering
Type: Practical/Implementation
Chapters: 5
Deadline: Aug 16 (14 days from now)
Skills needed: Mechanical Engineering, possibly AutoCAD/SolidWorks

RECOMMENDED WORKERS (auto-filtered):
────────────────────────────────────

1. Chidi Okonkwo                               [ASSIGN]
   Specialty: Mechanical Eng, Civil Eng
   Skills: AutoCAD, SolidWorks, MATLAB
   Load: 1/3 active projects ✅
   Rating: 4.7/5 | On-time: 94% | Revisions: 5%
   Avg delivery: 4.2 days

2. Kunle Adebayo                               [ASSIGN]
   Specialty: Mechanical Eng
   Skills: AutoCAD, Arduino
   Load: 2/3 active projects ✅
   Rating: 4.3/5 | On-time: 88% | Revisions: 8%
   Avg delivery: 5.1 days

3. Tunde Fashola                               [ASSIGN]
   Specialty: Mechanical Eng, Electrical Eng
   Skills: MATLAB, Simulink
   Load: 3/3 active projects ⚠️ AT CAPACITY
   Rating: 4.9/5 | On-time: 97% | Revisions: 2%
   Avg delivery: 3.8 days

[Show all workers ▼]
```

**The system auto-recommends workers** by matching the project's department and required skills against worker profiles, then sorting by availability, rating, and on-time delivery rate. Admin just clicks ASSIGN.

### SCREEN 5: QA Review

**Queue view + review interface.**

```
QA QUEUE (6 projects)
────────────────────────────────────

Priority  | Project    | Worker     | Submitted  | Deadline  | Rev#
──────────|───────────|───────────|───────────|──────────|────
🔴 URGENT | EC-00230  | Amara E.  | Aug 8     | Aug 10    | 0
🟡 SOON   | EC-00228  | Chidi O.  | Aug 7     | Aug 14    | 1
🟢 NORMAL | EC-00225  | Kunle A.  | Aug 6     | Aug 20    | 0
...

[Click any row to open QA Review]
```

**QA Review Interface:**

```
QA REVIEW — EC-00230
────────────────────────────────────

📎 Download submitted file: EC-00230_Draft_v1.docx

SERVICE: Final Year Project (Full)
REFERENCING: APA 7th Edition
DEPARTMENT: Accounting
CHAPTERS REQUIRED: 5
PAGES REQUIRED: 80+

QA CHECKLIST:
────────────────────────────────────
☐ All required chapters present (1–5)
☐ Title page complete and correctly formatted
☐ Table of contents matches content
☐ Abstract present and coherent
☐ Chapter 1: Background, problem statement, objectives present
☐ Chapter 2: Literature review — sufficient sources, properly cited
☐ Chapter 3: Methodology — appropriate for project type
☐ Chapter 4: Data analysis/results — complete
☐ Chapter 5: Summary, conclusion, recommendations present
☐ References formatted in APA 7th Edition
☐ In-text citations match reference list
☐ Page numbering correct
☐ Figures and tables labeled and referenced in text
☐ Appendices included where required
☐ Meets minimum page count (80+)
☐ Grammar and spelling acceptable
☐ File format correct (.docx)
☐ Preliminary pages complete (title, dedication, acknowledgment, TOC)
☐ No placeholder text or incomplete sections

QA NOTES:
[Large text area for detailed feedback]

DECISION:
[✅ PASS — Ready for delivery]
[🔄 REVISION NEEDED — Send back to worker with notes]
[⚠️ ESCALATE — Needs founder review]
```

### SCREEN 6: Payout Queue

**Two tabs: Worker Payouts | Ambassador Commissions**

```
WORKER PAYOUTS — PENDING
────────────────────────────────────
Only projects with status = COMPLETED are shown here.

Worker          | Projects              | Amount   | Bank              | Action
────────────────|──────────────────────|─────────|──────────────────|────────
Chidi Okonkwo   | EC-00220, EC-00218   | ₦56,000  | Zenith 2045XXXXX | [Pay ✓]
Amara Eze       | EC-00215             | ₦28,000  | GTB 0178XXXXXXX  | [Pay ✓]
Kunle Adebayo   | EC-00210, EC-00205   | ₦42,000  | Access 0023XXXXX | [Pay ✓]

TOTAL PENDING: ₦126,000

[Mark All Paid]  [Export to CSV]
```

```
AMBASSADOR COMMISSIONS — PENDING
────────────────────────────────────

Ambassador      | Projects              | Rate | Amount   | Bank              | Action
────────────────|──────────────────────|─────|─────────|──────────────────|────────
Blessing Ige    | EC-00220, EC-00218   | 12%  | ₦16,800  | UBA 2134XXXXXXX  | [Pay ✓]
David Osa       | EC-00215             | 10%  | ₦7,000   | GTB 0156XXXXXXX  | [Pay ✓]

TOTAL PENDING: ₦23,800

[Mark All Paid]  [Export to CSV]
```

**When "Pay ✓" is clicked:**
- System records payment in Payments table
- Updates `worker_paid` / `commission_paid` on each project
- Updates the person's running totals
- Logs the action with timestamp and admin name

---

## PART 6 — FINANCIAL INTELLIGENCE DASHBOARD

### 6.1 Revenue Overview (Top Cards)

| Card | Value | Context |
|---|---|---|
| Revenue Today | ₦210,000 | 3 payments received |
| Revenue This Week | ₦890,000 | ↑ 23% vs last week |
| Revenue This Month | ₦3,450,000 | ↑ 18% vs last month |
| Revenue This Year | ₦28,700,000 | 29% of ₦1B target |

**The "% of ₦1B target" is a motivational anchor.** You should always see how far you are from the goal.

### 6.2 Revenue Chart

Line or bar chart with toggle:
- Daily (last 30 days)
- Weekly (last 12 weeks)
- Monthly (last 12 months)
- Yearly (all time)

Overlay option: compare this month vs last month, or this year vs last year.

### 6.3 Cash Flow Breakdown

```
INCOME (This Month)
────────────────────────────────────
Client Downpayments Received:       ₦1,552,500   (49 projects × avg ₦31,684)
Client Balance Payments Received:   ₦1,897,500   (38 completed projects)
Total Inflow:                       ₦3,450,000

OUTFLOW (This Month)
────────────────────────────────────
Worker Payouts:                     ₦1,380,000   (40% of completed project revenue)
Ambassador Commissions:             ₦345,000     (~10% avg of completed project revenue)
Software (Claude AI):               ₦33,500
Internet/Data:                      ₦20,000
Other Expenses:                     ₦0
Total Outflow:                      ₦1,778,500

────────────────────────────────────
NET CASH FLOW:                      ₦1,671,500
EFFECTIVE MARGIN:                   48.4%
```

### 6.4 Outstanding Money

```
MONEY COMING IN (Expected)
────────────────────────────────────
Unpaid Balance Payments:            ₦423,500     (11 projects approved, balance not yet paid)
Projects In Progress (future bal):  ₦577,500     (15 projects still being worked on)

MONEY GOING OUT (Owed)
────────────────────────────────────
Unpaid Worker Payouts:              ₦168,000     (6 workers, across 8 completed projects)
Unpaid Ambassador Commissions:      ₦42,000      (5 ambassadors)
Total Owed:                         ₦210,000

CASH POSITION:
────────────────────────────────────
Bank Balance:                       ₦2,450,000   (manual input or bank API)
Less Outstanding Payouts:           ₦210,000
Available Cash:                     ₦2,240,000
```

### 6.5 Business Intelligence

**Project Metrics:**

| Metric | Value | Trend |
|---|---|---|
| Total Projects (Month) | 49 | ↑ 12% |
| Completed | 38 | |
| Active | 8 | |
| Cancelled | 3 | 6.1% cancellation rate |
| Avg Price per Project | ₦70,408 | Stable |
| Avg Completion Time | 5.3 days | ↓ Improving |
| QA First-Pass Rate | 74% | Target: 85% |
| Avg Revisions | 0.8 | Target: < 0.5 |

**Revenue by Service:**

| Service | Revenue | % of Total | Projects |
|---|---|---|---|
| FYP (Full) | ₦2,660,000 | 77% | 38 |
| Seminar Report | ₦375,000 | 11% | 15 |
| Data Analysis | ₦180,000 | 5% | 9 |
| Presentation | ₦135,000 | 4% | 9 |
| Other | ₦100,000 | 3% | 8 |

**Revenue by University:**

| University | Revenue | Clients | Avg per Client |
|---|---|---|---|
| UNIBEN | ₦1,200,000 | 15 | ₦80,000 |
| ABUAD | ₦890,000 | 11 | ₦80,909 |
| UNILAG | ₦560,000 | 8 | ₦70,000 |
| Others | ₦800,000 | 15 | ₦53,333 |

**Ambassador Performance:**

| Ambassador | Referrals | Conversions | Rate | Revenue | Commission | Tier |
|---|---|---|---|---|---|---|
| Blessing Ige | 34 | 12 | 35% | ₦840,000 | ₦100,800 | Silver |
| David Osa | 21 | 8 | 38% | ₦560,000 | ₦56,000 | Silver |
| Favour Ade | 15 | 5 | 33% | ₦350,000 | ₦35,000 | Bronze |

**Worker Performance:**

| Worker | Completed | Rating | On-Time | Revision Rate | Revenue Generated |
|---|---|---|---|---|---|
| Amara Eze | 67 | 4.9 | 97% | 2% | ₦4,690,000 |
| Chidi Okonkwo | 43 | 4.7 | 94% | 5% | ₦3,010,000 |
| Kunle Adebayo | 38 | 4.3 | 88% | 8% | ₦2,660,000 |

### 6.6 Trend Alerts (Automatic)

```
🔴 CRITICAL
- Revenue down 23% vs same period last month
- Worker Emeka's revision rate jumped from 5% to 22%
- 3 projects overdue (EC-00198, EC-00201, EC-00205)

🟡 WARNING
- Ambassador David inactive for 30 days
- Average delivery time increased from 4.2 to 6.1 days
- Cancellation rate 6.1% (target: < 3%)

🟢 POSITIVE
- Return client rate up to 37% (was 28% last month)
- ABUAD revenue up 45% — ambassador program working
- QA first-pass rate improved from 68% to 74%
```

---

## PART 7 — AUTOMATIONS (Complete List)

### 7.1 Project Lifecycle Automations

| # | Trigger | Action | Channel |
|---|---|---|---|
| 1 | Client submits intake form | Create project (status: NEW), generate Project ID, notify admin | In-app + WhatsApp to admin |
| 2 | Admin verifies downpayment | Move to DOWNPAYMENT VERIFIED, record payment, notify client "payment received" | In-app + WhatsApp to client |
| 3 | Admin confirms requirements | Move to REQUIREMENTS CONFIRMED, project enters assignment queue | In-app |
| 4 | Admin assigns worker | Move to ASSIGNED, notify worker with full project details | In-app + WhatsApp to worker |
| 5 | Worker accepts assignment | Move to IN PROGRESS, start deadline countdown | In-app |
| 6 | Worker does not accept within 24hrs | Alert admin: "Worker has not accepted EC-XXXXX" | In-app + WhatsApp to admin |
| 7 | Admin triggers Ch.3/4 collection | Move to AWAITING CLIENT INPUT, send form link to client, pause deadline | In-app + WhatsApp to client |
| 8 | Client submits Ch.3/4 form | Attach data to project, resume deadline, move back to IN PROGRESS, notify worker | In-app + WhatsApp to worker |
| 9 | Worker submits completed work | Move to SUBMITTED, add to QA queue, notify QA reviewer | In-app |
| 10 | QA passes | Move to APPROVED, notify admin, send balance payment request to client | In-app + WhatsApp to client |
| 11 | QA fails (revision needed) | Move to REVISION NEEDED, increment revision_count, notify worker with QA notes | In-app + WhatsApp to worker |
| 12 | Revision count reaches 3 | Flag for founder review, block further auto-revisions | In-app + WhatsApp to admin |
| 13 | Admin verifies balance payment | Move to BALANCE VERIFIED, record payment | In-app |
| 14 | Admin delivers project | Move to DELIVERED, notify client with download link | In-app + WhatsApp to client |
| 15 | Client reports supervisor corrections | Move to SUPERVISOR CORRECTIONS, notify assigned worker | In-app + WhatsApp to worker |
| 16 | Supervisor corrections completed | Move back to DELIVERED, notify client | In-app + WhatsApp to client |
| 17 | Supervisor correction count ≥ 2 | Flag for admin review (scope check) | In-app |
| 18 | 7 days after delivery with no response | Auto-move to COMPLETED | System |
| 19 | Project reaches COMPLETED | Calculate final payouts, add to payout queue | System |

### 7.2 Deadline Automations

| # | Trigger | Action |
|---|---|---|
| 20 | Internal deadline is 5 days away + status IN PROGRESS | Gentle reminder to worker |
| 21 | Internal deadline is 3 days away + status IN PROGRESS | Urgent reminder to worker + alert to admin |
| 22 | Internal deadline is 1 day away + status IN PROGRESS | Critical alert to worker + admin |
| 23 | Internal deadline passed + status not SUBMITTED or beyond | Flag OVERDUE, notify admin immediately |
| 24 | AWAITING CLIENT INPUT for 3+ days | Reminder to client: "We're waiting for your Chapter 3/4 information" |
| 25 | AWAITING CLIENT INPUT for 7+ days | Alert admin: "Client unresponsive on EC-XXXXX" |

### 7.3 Financial Automations

| # | Trigger | Action |
|---|---|---|
| 26 | Project reaches COMPLETED | Calculate ambassador commission based on current tier rate |
| 27 | Project reaches COMPLETED | Calculate worker payout at 40% |
| 28 | Ambassador crosses tier threshold | Update tier, update commission rate for future projects |
| 29 | Payout marked as paid | Create payment record, update running totals |
| 30 | Weekly (Sunday night) | Generate weekly financial summary for admin |
| 31 | Monthly (1st of month) | Generate monthly financial report |

### 7.4 Performance Automations

| # | Trigger | Action |
|---|---|---|
| 32 | Worker's revision rate exceeds 15% (rolling 10 projects) | Flag worker for review |
| 33 | Worker's on-time rate drops below 80% | Flag worker for review |
| 34 | Ambassador inactive for 30+ days | Send re-engagement message |
| 35 | Ambassador inactive for 60+ days | Change status to Inactive, notify admin |
| 36 | Worker current_active_projects = max_concurrent | Auto-set availability to Busy |
| 37 | Worker active projects drop below max | Auto-set availability to Available |

---

## PART 8 — TECHNICAL ARCHITECTURE

### 8.1 Recommended Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js (React) | Fast, SEO-friendly for intake forms, great developer experience |
| Backend | Next.js API Routes or separate Node.js/Express | Keep it simple — one codebase |
| Database | PostgreSQL | Relational data model (all your entities are relational) |
| ORM | Prisma | Type-safe database queries, easy migrations |
| Auth | NextAuth.js or Clerk | Role-based authentication out of the box |
| File Storage | AWS S3 or Cloudinary | Store client uploads, deliverables |
| Hosting | Vercel (frontend) + Railway (database) | Affordable, scalable, easy deploys |
| Notifications | In-app initially, then WhatsApp Business API | Start simple |
| Charts | Recharts or Chart.js | For financial dashboard |

**Estimated monthly infrastructure cost:** ₦15,000–₦40,000 (well within budget).

### 8.2 Database Schema

```sql
-- Core tables (maps directly to entities in Part 1)
universities
clients
projects
services
ambassadors
workers
payments
expenses
project_status_log

-- Supporting tables
users                    -- Authentication (links to client/worker/ambassador/admin)
project_files            -- File metadata (links to S3 storage)
qa_checklists            -- QA checklist templates per service type
qa_reviews               -- Individual QA review records
notifications            -- In-app notification queue
settings                 -- System settings (commission rates, default deadlines, etc.)
```

### 8.3 Key API Endpoints

**Public (no auth required):**
```
GET  /api/services              — List active services with prices (for intake form)
GET  /api/universities          — List universities (for form dropdown)
POST /api/intake                — Submit intake form (creates client + project)
POST /api/intake/ch34/:id       — Submit Chapter 3/4 additional data
GET  /api/referral/:code        — Validate referral code
```

**Admin (auth required, role: admin):**
```
GET    /api/dashboard/summary     — Key metrics for command center
GET    /api/dashboard/pipeline    — Project counts by status
GET    /api/dashboard/revenue     — Revenue data for charts
GET    /api/dashboard/alerts      — Current alerts

GET    /api/projects              — List projects (with filters, pagination)
GET    /api/projects/:id          — Single project detail
PATCH  /api/projects/:id/status   — Change project status (with validation)
PATCH  /api/projects/:id/assign   — Assign worker
PATCH  /api/projects/:id/payment  — Verify payment (downpayment or balance)

GET    /api/clients               — List clients
GET    /api/clients/:id           — Client detail with project history

GET    /api/workers               — List workers (with filters)
GET    /api/workers/:id           — Worker detail with stats
GET    /api/workers/recommend/:projectId — Get recommended workers for a project

GET    /api/ambassadors           — List ambassadors with performance
GET    /api/ambassadors/:id       — Ambassador detail

GET    /api/payouts/pending       — Pending worker and ambassador payouts
POST   /api/payouts/process       — Mark payouts as paid (bulk)

GET    /api/finance/summary       — Financial summary
GET    /api/finance/cashflow      — Cash flow breakdown
GET    /api/finance/by-service    — Revenue by service type
GET    /api/finance/by-university — Revenue by university
GET    /api/finance/by-period     — Revenue over time (for charts)

GET    /api/reports/weekly        — Weekly report data
GET    /api/reports/monthly       — Monthly report data
```

**Worker (auth required, role: worker):**
```
GET    /api/worker/projects           — My assigned projects
GET    /api/worker/projects/:id       — Project detail (limited view)
PATCH  /api/worker/projects/:id/accept — Accept assignment
PATCH  /api/worker/projects/:id/submit — Submit completed work + upload files
GET    /api/worker/earnings           — My earnings and payout history
GET    /api/worker/stats              — My performance stats
```

**Ambassador (auth required, role: ambassador):**
```
GET    /api/ambassador/dashboard      — My referral stats
GET    /api/ambassador/referrals      — My referral list and conversion history
GET    /api/ambassador/commissions    — My commission history
GET    /api/ambassador/link           — My referral link and code
```

---

## PART 9 — BUILD SEQUENCE (Updated 12-Week Plan)

### Weeks 1–2: Database + Auth + Core CRUD

**Goal: Get the skeleton standing.**

- Set up Next.js project with PostgreSQL + Prisma
- Define all database tables and relationships
- Build authentication (admin login, role-based access)
- Build CRUD for: Projects, Clients, Workers, Ambassadors, Services
- Seed database with EduCraft's current services and pricing
- No UI polish — just functional forms and tables

**Deliverable:** Admin can log in, create a project manually, and see it in a list.

### Weeks 3–4: Project Pipeline + Assignment

**Goal: The operational backbone works.**

- Build project status pipeline with transition rules
- Build the Command Center dashboard (key metrics + pipeline view)
- Build Worker Assignment screen with auto-recommendations
- Build project detail view with all tabs
- Implement status change audit log
- Build activity feed

**Deliverable:** Admin can move a project through the entire pipeline from NEW to COMPLETED, with worker assignment.

### Weeks 5–6: Client Intake Forms

**Goal: Clients can self-serve.**

- Build the multi-page intake form engine
- Create form templates: academic_fyp, academic_seminar, academic_termpaper
- Build referral code tracking (links intake to ambassador)
- Auto-calculate pricing based on service selection
- Build the mid-project Chapter 3/4 collection form
- Generate Project ID and confirmation on submission
- Mobile-optimize all forms

**Deliverable:** A client can fill a form on their phone, submit it, and a project appears in WorkBase automatically.

### Weeks 7–8: QA + Financial Tracking

**Goal: Quality control and money tracking are systematic.**

- Build QA review queue and checklist interface
- Build payment tracking (downpayment + balance model)
- Build Payout Queue (workers + ambassadors)
- Connect payouts to Payments table
- Build commission calculation with ambassador tiers
- Auto-flag overdue projects and at-risk items

**Deliverable:** Admin can verify payments, review QA, and process payouts — all within WorkBase.

### Weeks 9–10: Financial Dashboard

**Goal: You never manually calculate financials again.**

- Build revenue summary cards
- Build revenue charts (line/bar, multiple time ranges)
- Build cash flow breakdown
- Build outstanding balances view
- Build revenue by service, university, time period
- Build worker and ambassador performance tables
- Build trend alerts

**Deliverable:** Open one screen, understand the entire financial health of EduCraft in 60 seconds.

### Weeks 11–12: Worker + Ambassador Portals + Polish

**Goal: Other people can use the system.**

- Build Worker portal (their projects, earnings, stats)
- Build Ambassador portal (referral link, stats, commissions)
- Notification system (in-app alerts for all roles)
- Mobile responsiveness across all screens
- Data export (CSV for backup)
- Testing with real project data
- Bug fixes and polish
- Deploy to production

**Deliverable:** Workers log in and see their assignments. Ambassadors log in and see their referral performance. Admins run the entire operation from WorkBase.

---

## PART 10 — POST-DEPLOYMENT: WHAT TO ADD NEXT

After the 12-week build, these features are the next priorities (in order):

1. **WhatsApp Business API integration** — Automated notifications to clients, workers, and ambassadors via WhatsApp (instead of manual messages)

2. **Client Portal** — Clients log in, see project status, upload files, download deliverables, request revisions

3. **Payment Gateway** — Paystack or Flutterwave integration for direct card/bank payments with auto-verification (eliminates manual payment verification)

4. **Report Production Integration** — Connect the EduCraft trade secret AI writing system directly to WorkBase so workers access it from their project dashboard

5. **Mobile App** — A dedicated mobile app for workers and ambassadors (PWA or React Native)

6. **Advanced Analytics** — Forecasting, seasonal trend analysis, capacity planning, ambassador ROI analysis

---

## PART 11 — SUCCESS METRICS

### 30-Day Check

- [ ] Every new project enters WorkBase (not just WhatsApp)
- [ ] Admin time per project reduced from ~2.5 hours to ~30 minutes
- [ ] Financial reporting takes minutes, not hours
- [ ] Zero projects fall through cracks

### 60-Day Check

- [ ] 50%+ of clients submit via intake form (not WhatsApp data collection)
- [ ] Worker assignment takes under 2 minutes
- [ ] Commission and payout tracking is fully automated
- [ ] One founder can manage operations alone using WorkBase for a full week

### 90-Day Check

- [ ] Financial dashboard replaces manual bookkeeping entirely
- [ ] QA pass rate improves by 10%+ (consistency from checklists)
- [ ] Average admin time per project under 20 minutes
- [ ] First ambassador logs into their portal and sees their stats
- [ ] EduCraft is operationally ready to handle 3x current volume

### 12-Month Check

- [ ] WorkBase is handling 200+ projects per month
- [ ] System has scaled without adding proportional admin time
- [ ] Revenue target tracking is live on dashboard
- [ ] Worker and ambassador management is data-driven (not intuition)
- [ ] Foundation is in place for Phase 2 (₦200M) and Phase 3 (₦500M)

---

*Blueprint v2.0 — Incorporates real EduCraft workflow, 45% downpayment model, multi-page intake forms, mid-project data collection, supervisor correction loop, and financial intelligence dashboard. Ready for Claude Code implementation.*
