# EDUCRAFT COMPLETE BUILD ROADMAP

## Everything We Designed, In Build Order

---

## WHAT'S ALREADY BUILT (Days 1–20 Sprint)

✅ Landing page (editorial design)
✅ Admin Command Center dashboard
✅ Projects list + detail + manual creation
✅ Client management
✅ Worker management + assignment
✅ Ambassador management
✅ Payout system
✅ Intake forms (multi-step, conditional)
✅ Referral tracking
✅ Pipeline status transitions (full state machine)
✅ Payment verification (manual)
✅ In-app notifications
✅ QA review system
✅ Worker portal
✅ Ambassador portal
✅ Ambassador application (/apply)
✅ Services page (/services)
✅ Project tracker (/track)
✅ Financial dashboard
✅ Expenses tracking
✅ Reports
✅ Settings + service management

---

## WHAT'S NOT YET BUILT

These are the systems we designed in detail across our brainstorming sessions but were not included in the original 20-day sprint:

| System | Spec Document | Status |
|---|---|---|
| UI Overhaul (design system) | EDUCRAFT_UI_CONSTITUTION.md | Not started |
| Paystack Payment Gateway | (to be designed) | Not started |
| Report Production System (parallel agents) | EDUCRAFT_REPORT_PRODUCTION_SYSTEM_v1.md | Not started |
| Automated Quality Check System | EDUCRAFT_QUALITY_STANDARD_v1.md + sub-docs | Not started |
| Formatting Quality Script (Python) | EDUCRAFT_FORMATTING_QUALITY_SCRIPT_v1.md | Not started |
| Reference Verification System (AI) | EDUCRAFT_REFERENCE_VERIFICATION_SYSTEM_v1.md | Not started |
| Research Pipeline (Zotero integration) | EDUCRAFT_REPORT_PRODUCTION_SYSTEM_v1.md §1 | Not started |
| Publication Generation | EDUCRAFT_REPORT_PRODUCTION_SYSTEM_v1.md | Not started |
| Ambassador existing codebase integration | (migration task) | Not started |
| Client Acquisition automation features | EDUCRAFT_CLIENT_ACQUISITION_SYSTEM_v1.md | Not started |

---

## THE COMPLETE BUILD PHASES

### PHASE A: UI OVERHAUL (Priority 1)
*Reference: EDUCRAFT_UI_CONSTITUTION.md*
*Model: Opus · Effort: High (establishing the visual system)*

This must come FIRST because every subsequent phase builds on this visual foundation. No point building new features in the old bordered-card style.

**A1 — Design System Foundation**
- Update global CSS/Tailwind config with new color tokens
- Create the new Surface component (background + shadow, not border)
- Set light mode as default
- Update the Card component globally — remove default borders
- Update typography scale (reduce uppercase, fix monospace usage)

**A2 — Public Pages Overhaul**
- Hero: one-word EduCraft, separate mobile composition, refined document mockups
- Scroll navigation: Traqly-style borderless double chevrons with teal glow
- Services page: search + category filters + compact grouped rows + correct pricing from flyers
- Ambassador application: remove outer form border, section headings for organization
- Sign-in: split layout (brand left, form right), no bordered card
- Footer: verify contact info, light/dark theme compatibility

**A3 — Dashboard Overhaul**
- Command Center: zones not cards, borderless stats, pipeline as one rail
- Projects list: remove table outer card, faint row dividers
- Project detail: remove tab container borders
- All forms: remove outer borders throughout
- Worker portal: same treatment
- Ambassador portal: integrate existing codebase, apply new UI skin
- Financial dashboard: big number first, chart second, reduce card clutter

**A4 — Mobile + Theme Pass**
- Complete mobile pass at 375px, 414px, 768px, 1024px
- Complete light theme verification on every page
- Redesign dark theme using multi-surface-depth approach (after light is solid)

---

### PHASE B: PAYSTACK PAYMENT GATEWAY
*Model: Sonnet · Effort: High*

Replace manual payment verification with automated Paystack integration.

**B1 — Paystack Setup**
- Connect EduCraft's verified Paystack account
- Store Paystack public key and secret key in environment variables
- Install Paystack Node.js SDK or use direct API calls

**B2 — Transaction Initialization**
- When a project is created (or when client reaches payment step in intake form):
  - Initialize a Paystack transaction for the downpayment amount (45% of price)
  - Transaction charge borne by client (not EduCraft)
  - Return a payment URL or inline payment widget
- Client pays via Paystack (card, bank transfer, USSD)
- On successful payment: Paystack sends webhook

**B3 — Webhook Handler**
- Build `POST /api/webhooks/paystack` endpoint
- Verify webhook signature (Paystack secret)
- On successful payment:
  - Create Payment record (type: CLIENT_DOWNPAYMENT, direction: INFLOW, status: CONFIRMED)
  - Update project: downpaymentStatus → "Verified", downpaymentDate, downpaymentReference
  - Trigger status transition: NEW → DOWNPAYMENT_VERIFIED (automatic)
  - Create notification for admin: "Payment received for EC-XXXXX"
- Handle failed/abandoned payments gracefully

**B4 — Balance Payment**
- When project reaches APPROVED status:
  - Initialize Paystack transaction for balance amount (55%)
  - Send payment link to client (via notification, project tracker page, or WhatsApp)
- On successful balance payment:
  - Create Payment record (type: CLIENT_BALANCE)
  - Update project: balanceStatus → "Verified"
  - Trigger status transition: APPROVED → BALANCE_VERIFIED (automatic)
  - Notify admin: "Balance received for EC-XXXXX — ready for delivery"

**B5 — Payment Dashboard Integration**
- Financial dashboard shows Paystack-verified transactions
- Reconciliation view: Paystack records vs EduCraft records
- Payment method breakdown (card vs bank transfer vs USSD)

**B6 — Intake Form Integration**
- After intake form submission, redirect to Paystack payment page
- On successful payment → project created AND downpayment verified in one flow
- On abandoned payment → project created as NEW with downpaymentStatus "Unpaid"

---

### PHASE C: RESEARCH PIPELINE (Zotero Integration)
*Reference: EDUCRAFT_REPORT_PRODUCTION_SYSTEM_v1.md §Sub-System 1*
*Model: Sonnet · Effort: High*

**C1 — Zotero API Connection**
- Connect to EduCraft's organizational Zotero account via API key
- Build functions: create collection, add items, retrieve metadata, get PDFs
- Store Zotero API key in environment variables

**C2 — Automated Research Paper Finding**
- Worker clicks "Get Research Papers" on their project dashboard
- System sends project topic + department to Claude API with the EduCraft research prompt
- AI returns DOI + metadata for N papers (default: 40 for FYP)
- System compiles into .bib format

**C3 — Zotero Import + PDF Retrieval**
- System creates a Zotero collection: "{project_id} — {short_topic}"
- Imports .bib entries via Zotero API
- Triggers PDF retrieval for each entry
- Stores abstracts in the Reference table (for later Tier 2/3 verification)

**C4 — Pre-Writing Reference Verification (Tier 2)**
- BEFORE any writing begins, run Tier 2 batch relevance check
- Classify each reference as CORE/CLOSELY_RELATED/TANGENTIAL/IRRELEVANT
- If ≥75% CORE+CLOSELY_RELATED and zero IRRELEVANT → PASS
- If FAIL → automatically request replacement papers, re-verify
- Maximum 3 replacement rounds before flagging for human review

**C5 — Google Drive Integration**
- Upload verified PDFs to Google Drive folder: `EduCraft Research/{project_id}/`
- Generate shareable link
- Store link in project record
- Worker can share link with client ("Here are your actual research papers")

**C6 — Worker Dashboard Integration**
- "Get Research Papers" button on worker's project view
- Progress indicator while research runs
- Results: "42 verified references found. 78% CORE, 15% CLOSELY_RELATED."
- [View References] [Proceed to Write Report]

---

### PHASE D: REPORT PRODUCTION SYSTEM (Parallel Agents)
*Reference: EDUCRAFT_REPORT_PRODUCTION_SYSTEM_v1.md §Sub-Systems 2–3*
*Model: Opus · Effort: High (this is the most complex system)*

**D1 — Prompt Library**
- Create the `prompts/` folder structure (base + overrides per department)
- Port Prince's existing engineering chapter prompts into the library
- Create base prompts for Chapters 1–5
- Create department overrides for: Engineering, Medical/Lab Science, Nursing, Computer Science, Economics, Law, Humanities
- Each prompt includes: condensed Voice rules, formatting rules, anti-AI rules
- Build the prompt loader: base + override + shared rules → final prompt

**D2 — Single Chapter Generation**
- Build the `generateChapter()` function
- Input: shared context + references + chapter-specific prompt
- Output: chapter text (raw Markdown or structured content)
- Uses Claude API (claude-sonnet-4-6, max_tokens: 16000)
- Handle token limits: chunked generation for long chapters
- Test with one chapter, validate against Voice standard

**D3 — Parallel Orchestrator**
- Build the orchestrator: `generateReport(projectId)`
- Run Chapters 1–4 in parallel via `Promise.all()`
- Extract objectives from Chapter 1, findings from Chapter 4
- Feed both to Chapter 5 (staggered start — waits for Ch.1 + Ch.4)
- Collect all 5 chapter outputs

**D4 — Progress Tracking (WebSocket/SSE)**
- Emit real-time progress events during generation
- Events: chapter_started, chapter_progress (%), chapter_complete, assembly_started, quality_check_started, report_ready
- Worker dashboard shows live progress: "Chapter 2 — Generating... 67%"
- Each chapter shows: pending → generating (with %) → complete
- Estimated time remaining based on token output rate

**D5 — Checkpoint Recovery**
- Save checkpoints every 2,000 output tokens to GenerationCheckpoint table
- On network break: completed chapters preserved, partial chapters discarded
- Worker sees: "Generation interrupted. 3/5 chapters complete. [Resume] [Restart]"
- Resume only re-generates incomplete chapters

**D6 — Document Assembly (python-docx)**
- Build the assembly pipeline in Python
- Stage 1: Generate preliminary pages (cover, title, certification, declaration, dedication, acknowledgment, abstract)
  - Abstract needs extracted data from Ch.1 (aim) + Ch.4 (findings) + Ch.5 (conclusion)
  - Other prelim pages use client intake data
- Stage 2: Format each chapter (heading styles, equations in tables, table formatting, citations)
- Stage 3: Generate supplementary pages (References list from stored refs, Appendices)
- Stage 4: Assemble single .docx (two-section page numbering: Roman prelims, Arabic body)
- Stage 5: Generate TOC, List of Figures, List of Tables, List of Appendices (no dotted leaders)
- Stage 6: Export .docx + .pdf
- Store files in project record

**D7 — "Write Report" Button**
- Worker's project dashboard: [Write Report] button (appears after research is complete)
- Click triggers the full pipeline: parallel generation → assembly → quality gate
- Hands-off flow: auto-submits to QA if quality gate passes (98%+)
- 30-minute recall window for worker to intervene if needed

**D8 — Token Monitoring**
- Log every AI call to AIUsageLog table
- Track: project, worker, subsystem, chapter, model, tokens, cost, duration
- Admin dashboard: monthly spend, cost per project, cost per worker, cost by subsystem
- Flag high-cost projects and workers

**D9 — Generation Queue**
- FIFO queue for concurrent generation requests
- Max N concurrent generations (based on API rate limit)
- Deadline-based priority (urgent projects jump the queue)
- Worker sees queue position and estimated start time when queued

---

### PHASE E: AUTOMATED QUALITY CHECK SYSTEM
*Reference: EDUCRAFT_QUALITY_STANDARD_v1.md + all sub-documents*
*Model: Sonnet · Effort: High*

**E1 — Formatting Quality Script (Python)**
- Build the Python script per EDUCRAFT_FORMATTING_QUALITY_SCRIPT_v1.md
- 71 formatting rules across 13 categories
- Profiles: FYP_STANDARD, FYP_PROPOSAL, TERM_PAPER, PUBLICATION, ENGINEERING, NURSING_NMCN
- Input: .docx file path + service type + department
- Output: JSON report + human-readable summary
- Runtime target: <3 seconds per document
- Severity levels: CRITICAL / MAJOR / MINOR
- Integrate as API endpoint: POST /api/quality/formatting-check

**E2 — Structural Quality Checker**
- Build per EDUCRAFT_STRUCTURAL_QUALITY_v1.1.md
- Template A vs Template B detection
- Department-specific overrides
- Supervisor TOC override (when provided)
- Section presence checks, chapter balance, page count validation
- Objective traceability (AI: extract objectives from Ch.1, verify addressed in Ch.3–5)
- Reference count validation

**E3 — Reference Verification Tier 2 (Post-Writing)**
- Build per EDUCRAFT_REFERENCE_VERIFICATION_SYSTEM_v1.md
- Runs automatically when worker submits a chapter
- AI classifies each reference: CORE / CLOSELY_RELATED / TANGENTIAL / IRRELEVANT
- Pass: ≥75% CORE+CLOSELY_RELATED, zero IRRELEVANT, ≤15% TANGENTIAL
- Fail: structured feedback to worker listing flagged references

**E4 — Reference Verification Tier 3 (Selective)**
- Per-citation coherence check
- Runs on: Tier 2 failures, bad-worker flags (3+ in 30 days), high-risk clients, 10% random sample
- AI checks: does this specific source support this specific claim?
- Pass: ≥85% SUPPORTS
- Results shown to QA reviewer alongside their manual review

**E5 — Voice Check (AI-Assisted)**
- Build per EDUCRAFT_VOICE_v1.1.md
- Automated checks: banned phrases, transition patterns, vague qualifiers, section cross-references, paragraph uniformity, uncited figures/tables, equation formatting, table page breaks
- AI checks: overall voice quality, human vs AI-sounding prose
- Flagged sections highlighted for human QA reviewer

**E6 — Quality Gate Integration**
- Chain all checks in order: Formatting → Structural → Reference → Voice
- Each layer is a gate: fail at any layer → return to worker with specific feedback
- Resubmission restarts from the failed layer only (not from beginning)
- Aggregate quality score: X/90 checks passed = Y%
- 98% threshold for auto-submission to QA
- Quality report visible on project detail page

**E7 — Chapter-Specific Re-Generation**
- When quality gate fails on specific chapters:
  - Worker can re-generate ONLY the failing chapters
  - System includes quality failures as additional instructions in the re-generation prompt
  - Replaces only the failing chapter in the assembled document
  - Re-runs quality gate
  - Cost: ~₦60–140 per chapter instead of ~₦530–785 for full report

---

### PHASE F: PUBLICATION GENERATION
*Reference: EDUCRAFT_REPORT_PRODUCTION_SYSTEM_v1.md + EDUCRAFT_STRUCTURAL_QUALITY_v1.1.md §3.11*
*Model: Sonnet · Effort: Medium*

**F1 — Publication Generation (Path 1: New Client)**
- Client uploads complete project report document
- System reads document, extracts: topic, methodology, results, conclusions, references
- Applies EduCraft Master Publication Prompt (Prince's one-shot prompt)
- Generates 5–8 page publication paper
- Formatting: two-column, 10pt, US Letter, three-line tables, parenthesised equation numbers

**F2 — Publication Generation (Path 2: Returning Client)**
- System detects: client has completed FYP in database
- NO document upload needed — uses stored project data
- 85–90% token savings vs Path 1
- Same generation quality, lower cost

**F3 — Publication Quality Checks**
- PQ1–PQ14 checks from the structural quality spec
- No report-dependent language ("Chapter Three", "project report")
- Two-column layout verified
- All et al. italicised
- References match citations

---

### PHASE G: PROJECT LINEAGE + ADVANCED FEATURES
*Model: Sonnet · Effort: Medium*

**G1 — Project Lineage**
- Add `parentProjectId` to Project model
- Support chains: Proposal → Full Report → Publication
- When returning client orders next stage, system auto-links and pre-populates
- Worker receives parent project data — continues, doesn't restart

**G2 — Proposal Generation**
- Same chapter names as department's full report
- 15–20 pages, 1.5 spacing, overview depth
- Future-tense content acceptable
- Reduced reference count (15–25)

**G3 — Client Portal (Future)**
- Clients log in to see project status
- Upload additional files
- Download delivered work
- Request revisions
- View payment history

---

## BUILD ORDER SUMMARY

| Phase | What | Estimated Effort | Priority |
|---|---|---|---|
| **A** | UI Overhaul | 3–5 days | **DO FIRST** |
| **B** | Paystack Payment Gateway | 2–3 days | **DO SECOND** |
| **C** | Research Pipeline (Zotero) | 3–4 days | **DO THIRD** |
| **D** | Report Production (Parallel Agents) | 7–10 days | **DO FOURTH** |
| **E** | Quality Check System | 5–7 days | **DO FIFTH** |
| **F** | Publication Generation | 2–3 days | **DO SIXTH** |
| **G** | Project Lineage + Advanced | 2–3 days | **DO SEVENTH** |

**Total estimated: 24–35 days of focused building**

---

## MODEL/EFFORT PER PHASE

| Phase | Model | Effort | Reasoning |
|---|---|---|---|
| A (UI Overhaul) | Opus | High | Establishing the visual system everything inherits |
| B (Paystack) | Sonnet | High | Payment logic has security implications — worth extra reasoning |
| C (Research Pipeline) | Sonnet | High | API integration + verification logic |
| D1–D3 (Prompt Library + Generation) | Opus | High | Core architecture — parallel agents, prompt composition |
| D4–D9 (Progress, Checkpoints, Queue) | Sonnet | Medium | Standard implementation patterns |
| E1 (Formatting Script) | Sonnet | High | 71 rules, XML parsing |
| E2–E5 (Quality Checks) | Sonnet | Medium–High | AI prompts already written in spec docs |
| E6–E7 (Gate Integration) | Sonnet | Medium | Wiring existing components together |
| F (Publication) | Sonnet | Medium | Straightforward — prompt already exists |
| G (Lineage + Advanced) | Sonnet | Medium | Database additions + UI |

---

*This is the COMPLETE roadmap — every system we designed across all brainstorming sessions. No more gaps between what we planned and what gets built.*
