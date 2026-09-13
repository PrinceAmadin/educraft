# THE EDUCRAFT QUALITY STANDARD

## Version 1.0

---

## WHAT THIS DOCUMENT IS

This is the master quality standard for EduCraft — the single source of truth for what "quality" means across every report, every service tier, every department, and every person involved in producing and reviewing work.

It was built across six working sessions between Prince (EduCraft founder) and an external systems advisor, drawing from:

- EduCraft Masterclass materials (Days 2, 3, 4, 6)
- Engineering Chapter Writing Guides (Chapters 1–5)
- NMCN Format for Writing and Scoring Research Projects (Nursing)
- NALT Guidebook (Law)
- Real delivered project Table of Contents from Medical Laboratory Science, Nursing, Engineering, Computer Science, Economics, Literature, and History
- Real supervisor feedback including one external supervisor rejection (the single most important data point in the entire standard)
- Prince's direct formatting instructions accumulated across dozens of projects
- The EduCraft Master One-Shot Publication Paper Generation Template

Every rule in this standard traces to one of these sources. Nothing is theoretical.

---

## THE PROBLEM THIS STANDARD SOLVES

EduCraft's quality system currently lives inside Prince's brain. He holds the definition of good work, measures it personally, and enforces it through manual review. This works at 50–100 projects per year.

At 15,000 projects per year (the ₦1 billion revenue target), this is physically impossible. Prince would need to review 60 projects per working day — approximately one every 8 minutes for an entire 8-hour day, with no breaks, no other work, and no days off.

The quality standard externalises what is in Prince's brain into four written, measurable, enforceable layers that can be operated by scripts, AI systems, junior reviewers, and domain specialists — with Prince only involved in policy decisions and true escalations.

---

## THE FOUR LAYERS

Quality is not one thing. It is four different things, each checked differently.

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  LAYER 3: FORMATTING QUALITY                            │
│  Does it look right?                                    │
│  Method: Python script — fully automated                │
│  Time: <3 seconds                                       │
│  Cost: ₦0                                               │
│                                                         │
│  ↓ PASS                                                 │
│                                                         │
│  LAYER 1: STRUCTURAL QUALITY                            │
│  Does the report exist as it should?                    │
│  Method: Script + AI — mostly automated                 │
│  Time: <10 seconds                                      │
│  Cost: ₦5–10                                            │
│                                                         │
│  ↓ PASS                                                 │
│                                                         │
│  LAYER 2b: REFERENCE VERIFICATION                       │
│  Are the references real and relevant?                  │
│  Method: AI (Tier 2 batch) + AI (Tier 3 sampled)       │
│  Time: 30–60 seconds                                    │
│  Cost: ₦50–80                                           │
│                                                         │
│  ↓ PASS                                                 │
│                                                         │
│  LAYER 2a: VOICE QUALITY                                │
│  Does it read right?                                    │
│  Method: AI check + human review                        │
│  Time: 5–15 minutes (human component)                   │
│  Cost: ₦200–500 (human reviewer time)                   │
│                                                         │
│  ↓ PASS                                                 │
│                                                         │
│  LAYER 4: DELIVERY QUALITY                              │
│  Is it ready for the client's hands?                    │
│  Method: Human — final check                            │
│  Time: 5–10 minutes                                     │
│  Cost: ₦100–200 (human reviewer time)                   │
│                                                         │
│  ↓ PASS                                                 │
│                                                         │
│  ✅ DELIVERED TO CLIENT                                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Why This Order Matters

The layers are ordered from cheapest/fastest to most expensive/slowest. Each layer acts as a gate: if a document fails any layer, it goes back to the worker for revision. The worker fixes and resubmits. The pipeline restarts from the layer that failed — not from the beginning.

This means:
- A document with wrong font never wastes AI tokens on reference verification
- A document with missing chapters never wastes human time on voice review
- A document with irrelevant references never reaches the QA reviewer
- Only documents that pass all automated checks reach a human

At 15,000 projects/year, this order saves an estimated **4,000+ hours of human review time** by catching cheap problems before expensive checks.

### Cost Per Project (Full Pipeline)

| Layer | Cost | Paid By |
|---|---|---|
| Layer 3: Formatting | ₦0 | Script (free) |
| Layer 1: Structure | ₦5–10 | AI tokens |
| Layer 2b: References | ₦50–80 | AI tokens |
| Layer 2a: Voice | ₦200–500 | Human reviewer time |
| Layer 4: Delivery | ₦100–200 | Human reviewer time |
| **Total per FYP** | **₦355–790** | |

At ₦70,000 per FYP, the quality system costs 0.5–1.1% of revenue. This is the price of zero supervisor rejections.

---

## LAYER 3 — FORMATTING QUALITY

**Full specification:** `EDUCRAFT_FORMATTING_QUALITY_SCRIPT_v1.md`

### What It Checks

The formatting script reads the `.docx` file and verifies mechanical compliance:

| Category | Key Rules | Count |
|---|---|---|
| Font | Times New Roman, 12pt body and headings, bold headings, no coloured text | 6 rules |
| Spacing | Line spacing exactly 2.0, no extra spacing before/after headings | 5 rules |
| Margins | 1.0 inch all sides (±0.05 tolerance) | 4 rules |
| Alignment | Body justified, H1 centred UPPER CASE, H2 left Title Case, H3 left Sentence case | 4 rules |
| Headings | Correct styles applied, no heading level beyond H3 | 4 rules |
| Paragraphs | No indentation, no hyphens as dashes, all *et al.* italicised | 5 rules |
| Page numbering | Roman for prelims, Arabic from Chapter One, centre-aligned, restart at 1 | 4 rules |
| Tables | No unnecessary page breaks, three-line format (engineering), captions above and centred, all in List of Tables | 8 rules |
| Figures | Captions below and centred, all cited, all in List of Figures | 6 rules |
| Equations | Own line, borderless two-column table, numbered as Chapter.Number (no parentheses), symbols defined | 5 rules |
| TOC | Populated, matches headings, includes H1–H3, no dotted leaders | 5 rules |
| Lists | List of Figures, Tables, and Appendices must exist if any such elements exist, no dotted leaders | 9 rules |
| References | Section exists, alphabetical order, hanging indent, journal names italicised | 6 rules |

**Total: 71 formatting rules, all automatable.**

### Severity Levels

- **CRITICAL:** Wrong font, wrong page numbering, wrong margins — visible on every page
- **MAJOR:** Heading spacing, equation format, table breaks — significant but localised
- **MINOR:** Single caption style mismatch, slight spacing variation — unlikely to be noticed

### Formatting Profiles

Different service tiers use different rule sets:

| Profile | Key Differences |
|---|---|
| FYP_STANDARD | Default — all rules apply |
| FYP_PROPOSAL | Line spacing 1.5 instead of 2.0 |
| TERM_PAPER | Simplified — TOC optional, equation tables optional |
| PUBLICATION | Completely different — 10pt, two-column, US Letter, parenthesised equation numbers |
| ENGINEERING | FYP_STANDARD + strict three-line tables + strict equation tables |
| NURSING_NMCN | FYP_STANDARD + block quotation rules |

---

## LAYER 1 — STRUCTURAL QUALITY

**Full specification:** `EDUCRAFT_STRUCTURAL_QUALITY_v1.1.md`

### What It Checks

Structural quality verifies that the skeleton of the document is correct:

- All required sections exist (cover page, certification, abstract, chapters, references)
- Chapter count matches the department template
- Page counts fall within expected ranges
- Sub-sections within each chapter match the department's requirements
- Objectives stated in Chapter 1 are traceable through Chapters 3, 4, and 5

### The Precedence Hierarchy

```
LEVEL 1: UNIVERSAL RULES          ← Always apply
LEVEL 2: TEMPLATE RULES           ← Template A or Template B
LEVEL 3: DEPARTMENT RULES         ← Engineering, Nursing, Law, etc.
LEVEL 4: CLIENT INSTRUCTIONS      ← Supervisor's TOC overrides all
```

Higher levels override lower levels where they conflict. Client instructions (supervisor-provided TOC) always win.

### Templates

**Template A — Analytical/Empirical** (Engineering, Sciences, Business, Nursing, CS, Economics, Agriculture)
- Chapter 1: Introduction (12–14 pages)
- Chapter 2: Literature Review (20–25 pages)
- Chapter 3: Methodology (25–30 pages — the meaty chapter)
- Chapter 4: Results / Data Analysis (20–25 pages)
- Chapter 5: Summary, Conclusion, Recommendations (5–8 pages)

**Template B — Thematic/Argumentative** (Literature, History, Philosophy, Cultural Studies)
- Chapter 1: Introduction (10–15 pages)
- Chapters 2, 3, 4: Thematic chapters (15–30 each, no chapter more than 1.75× the shortest)
- Chapter 5: Conclusion (5–8 pages)

### Department Overrides (Validated)

| Department | Override | Status |
|---|---|---|
| Engineering | Block diagram, design calculations, BEME, three-line tables, equation rules | ✅ Validated |
| Nursing (NMCN) | Mark allocations, reference currency (books ≤10y, journals ≤5y), ethical considerations mandatory | ✅ Validated |
| Law (NALT) | Six chapters (not five), Doctrinal vs Non-Doctrinal sub-templates, footnote citations | ✅ Validated |
| Medical/Lab Sciences | 10-section Chapter 1, 13-section "Materials and Methods" Chapter 3, mandatory ethical considerations and appendices | ✅ Validated |
| Computer Science | System Design starting Chapter 3, X.0 Introduction convention | ✅ Validated |
| Economics | Conceptual/Empirical/Theoretical/Gap Chapter 2 structure | ✅ Validated |
| Education | Empirical (Template A) vs Theoretical (Template B) split | ✅ Validated |
| Business | Standard Template A + Business overrides | ⚠️ Needs validation |
| Agriculture | Experimental design focus in Chapter 3 | ⚠️ Needs validation |

### Special Service Types

| Service | Structure |
|---|---|
| Final Year Proposal | Same chapter names as department's full report, 15–20 pages, 1.5 spacing, overview depth |
| Publication Report | Fixed 5-section structure (I–V), 5–8 pages, two-column layout |

### Project Lineage

Projects can chain: **Proposal → Full Report → Publication**. When a client returns for the next stage, the system links projects via `parentProjectId` so workers continue from existing work rather than starting from scratch.

---

## LAYER 2b — REFERENCE VERIFICATION

**Full specification:** `EDUCRAFT_REFERENCE_VERIFICATION_SYSTEM_v1.md`

### What It Checks

Reference verification ensures that every cited source is real, relevant, and correctly used.

### The Three Tiers

**Tier 1 — Existence Check (Already Solved)**

EduCraft's Zotero pipeline guarantees every reference has a verified DOI, confirmed metadata, and an actual retrievable PDF. No new work needed.

**Tier 2 — Batch Relevance Check (Runs on Every Chapter)**

An AI classifies each reference in a chapter as CORE, CLOSELY_RELATED, TANGENTIAL, or IRRELEVANT relative to the project topic.

Pass rules (all three must be met):
- ≥75% CORE or CLOSELY_RELATED
- Zero IRRELEVANT
- TANGENTIAL ≤15%

Failure returns the chapter to the worker with a specific list of flagged references and replacement instructions.

**Tier 3 — Per-Citation Coherence Check (Runs Selectively)**

For each in-text citation, the AI checks whether the cited source actually supports the specific claim being made in that sentence.

Runs on:
- Chapters that failed Tier 2 (after revision and resubmission)
- All chapters from workers with 3+ Tier 2 flags in 30 days
- All chapters for clients whose supervisors have previously rejected EduCraft work
- 10% random sample of all other chapters

### The Failure This Prevents

EduCraft's only external supervisor rejection was caused by Chapter 2 references that were topically unrelated to the project. The supervisor pulled up the cited papers and found they had nothing to do with the topic. Tier 2 catches this specific failure mode automatically.

---

## LAYER 2a — VOICE QUALITY

**Full specification:** `EDUCRAFT_VOICE_v1.1.md`

### What It Checks

Voice quality ensures the report reads like a technically competent human wrote it — not like an AI generated plausible-sounding academic prose.

### The Five Core Principles

1. **Technical depth over decorative language** — specific facts beat elaborate phrasing
2. **Evidence for every important claim** — unverified claims signal AI generation
3. **Specificity over generality** — replace "high performance" with the actual value
4. **Logical flow, not transition words** — paragraphs connect through ideas, not through "Moreover" and "Furthermore"
5. **The work must stay at the centre** — every paragraph relates back to the project

### Banned Constructions

The Voice standard bans specific phrases, constructions, and patterns that signal AI-generated or low-quality work:

| Category | Examples | Count |
|---|---|---|
| Banned opening phrases | "In today's rapidly evolving...", "It is important to note..." | 12+ phrases |
| Banned promotional language | "Groundbreaking," "Revolutionary," "Game-changing" | 10+ words |
| Banned transition sequences | "Firstly... Secondly... Thirdly...", "Moreover... Furthermore..." | 3 patterns |
| Banned vague qualifiers | "high gain" (use "7.8 dBi"), "good efficiency" (use "94.8%") | 8+ patterns |
| Banned punctuation | Em-dashes and en-dashes as sentence separators — use commas | 1 rule |
| Banned meta-commentary | "This section will discuss..." — just do it | 3 patterns |
| Banned section cross-referencing | "as discussed in Section 3.3" — explain in place instead | 1 rule (supervisor-corrected) |
| Uncited visual content | Tables, figures, images from external sources must be cited | 1 rule (supervisor-corrected) |
| Table page breaks | Tables must not break across pages unnecessarily | 1 rule (flagged across multiple projects) |
| Undefined equation symbols | Every symbol must be defined with units | 1 rule (supervisor-corrected) |

### Chapter-by-Chapter Voice Character

Each chapter has its own voice:

| Chapter | Voice Character | Key Requirement |
|---|---|---|
| Chapter 1 | Confident framing | Move from broad field → specific problem → aim → objectives |
| Chapter 2 | Analytical synthesis | Compare and critique sources, don't just summarise them |
| Chapter 3 | Precise instruction | Enough detail for reproducibility, justify every method choice |
| Chapter 4 | Objective reporting then interpretation | Present results first, then interpret, then connect to objectives |
| Chapter 5 | Reflective closure | No new material, verify each objective as achieved or not |

### The Voice Check Procedure

18 checks organised in three tiers:

- **Structural signals (fast — 10 checks):** Banned phrases, heading spacing, section cross-references, table/figure citations, equation formatting, table page breaks
- **Content signals (deeper — 5 checks):** Vague qualifiers, unsupported claims, reference relevance, project focus, results-interpretation pairing
- **Voice signals (subjective — 3 checks):** Does it read human? Would a supervisor suspect AI? If either fails → human review required

---

## LAYER 4 — DELIVERY QUALITY

### What It Checks

Delivery quality is the final human gate before work reaches the client. It verifies that the report is truly ready — not just technically correct, but practically complete.

### The Delivery Checklist

| # | Check | Method |
|---|---|---|
| D1 | Table of Contents page numbers are correct (update TOC fields, verify visually) | Human |
| D2 | List of Figures entries match actual figures with correct page numbers | Human |
| D3 | List of Tables entries match actual tables with correct page numbers | Human |
| D4 | List of Appendices entries match actual appendices with correct page numbers | Human |
| D5 | Page numbering is correct throughout (Roman prelims, Arabic body, no gaps, no duplicates) | Human |
| D6 | Client's name is spelled correctly everywhere it appears (title page, certification, declaration) | Human |
| D7 | Matric number is correct on all pages where it appears | Human |
| D8 | Supervisor's name is spelled correctly | Human |
| D9 | HOD's name is spelled correctly | Human |
| D10 | Dedication names are spelled correctly and match client's instructions | Human |
| D11 | Acknowledgment names are correct | Human |
| D12 | University name and department are correct throughout | Human |
| D13 | File is saved as .docx (not .doc, not .pdf only) | Human |
| D14 | File is also exported as .pdf for client reference | Human |
| D15 | No tracked changes, comments, or hidden revision marks remain in the document | Human |
| D16 | No placeholder text ("insert figure here", "TODO", "[reference needed]") remains | Human |

### Why This Layer Is Human-Only

Delivery quality catches things that scripts and AI cannot:
- Whether a name is spelled the way the client wants it (not just whether it matches the intake form)
- Whether the printed page numbers visually match the TOC (requires rendering, not just XML)
- Whether something "feels off" — the kind of thing a careful human notices that no checklist covers

This is the most expensive layer per project (5–10 minutes of human time), but it is also the last line of defense. At 15K projects, this layer requires 2 dedicated Junior QA reviewers each handling ~20 projects per day.

---

## QUALITY TARGETS

### Quantitative Targets

| Metric | Target | Measurement |
|---|---|---|
| First-time supervisor acceptance rate | ≥95% | Projects delivered with no supervisor correction requests |
| In-scope revision request rate | ≤10% | Revisions requested within agreed project scope |
| Full rejection rate | ≤1% | Projects where supervisor rejects entirely |
| Formatting check first-pass rate | ≥75% | Documents that pass Layer 3 on first submission |
| Structural check first-pass rate | ≥85% | Documents that pass Layer 1 on first submission |
| Reference verification pass rate | ≥85% | Chapters that pass Tier 2 on first submission |
| Voice check pass rate | ≥80% | Chapters that pass Layer 2a on first review |

### Qualitative Targets

- No client should ever receive a document with wrong page numbering
- No supervisor should ever find irrelevant references in a literature review
- No report should read as obviously AI-generated to a competent academic reader
- No EduCraft report should contain undefined equation symbols, uncited figures, or broken tables

### The 98% Quality Definition (Resolved)

In Session 1, Prince defined "98% quality" as:
- 98% of checklist items passed AND
- 98% probability the supervisor won't ask for corrections

The quality standard operationalises this as follows:

**98% of checklist items passed** = a document must pass at least 98% of the applicable rules across all four layers. For an Engineering FYP with ~90 applicable rules (71 formatting + ~15 structural + ~4 reference), this means no more than 1–2 failures — and zero CRITICAL failures.

**98% probability of supervisor acceptance** = the ≥95% first-time acceptance target, combined with the ≤10% revision rate and ≤1% rejection rate, means that 95 out of 100 projects are accepted immediately, 4 need minor revisions, and at most 1 is rejected. This is the operational meaning of "98% quality" — a client can expect their work to be accepted by their supervisor with near-certainty.

---

## WHO OWNS QUALITY

### The Tiered QA Model

```
LEVEL 1: AUTOMATED SYSTEMS
  What: Formatting Script + Structural Checker + Reference Verification
  Runs: On every submission, automatically
  Catches: 60–70% of all quality issues
  Cost: ₦55–90 per project (AI tokens only)
  Human time: Zero

LEVEL 2: AI CONTENT REVIEW
  What: Voice Check (AI-assisted)
  Runs: On documents that pass Level 1
  Catches: AI-generated language, vague claims, weak citations
  Cost: ₦50–100 per project (AI tokens)
  Human time: Minimal (reviews AI output)

LEVEL 3: JUNIOR QA REVIEWERS
  What: Delivery Check + Voice verification + spot-checks
  Runs: On documents that pass Levels 1 and 2
  Catches: Name misspellings, visual layout issues, "something feels off"
  Staffing: 2 Junior QA reviewers at scale (~600 projects/month each)
  Handles: 90% of all projects that reach human review

LEVEL 4: SENIOR DOMAIN REVIEWERS
  What: Subject-matter verification for technical/professional departments
  Runs: On Engineering, Nursing, Law projects + any escalation
  Catches: Wrong design calculations, inappropriate methodology, domain errors
  Staffing: 3 part-time domain specialists (Engineering, Nursing/Health, Business/Law)
  Handles: ~10% of projects (the ones requiring domain expertise)

LEVEL 5: FOUNDER (PRINCE)
  What: Policy decisions, dispute resolution, standard updates
  Runs: On true escalations only
  Handles: <1% of projects
```

### Staffing Projection at ₦1B Scale (15K Projects/Year)

| Role | Count | Type | Responsibility |
|---|---|---|---|
| Operations Manager | 1 | Full-time | Oversees daily QA flow, handles Level 3 escalations |
| Junior QA Reviewers | 2 | Full-time | Each handles ~600 projects/month (Layer 4 delivery checks) |
| Senior Domain Reviewer — Engineering | 1 | Part-time (contract) | Reviews engineering projects flagged by automated systems |
| Senior Domain Reviewer — Health/Nursing | 1 | Part-time (contract) | Reviews medical/nursing projects |
| Senior Domain Reviewer — Business/Law | 1 | Part-time (contract) | Reviews business and law projects |
| Founder (Prince) | 0.05 FTE | As needed | Policy, disputes, standard updates |

**Total QA team cost:** estimated at 5–8% of EduCraft's 50% revenue share. At ₦1B revenue with 50% gross margin (₦500M), the QA team costs roughly ₦25M–40M per year. This is the cost of maintaining 95%+ first-time acceptance.

---

## THE COMPLETE QUALITY PIPELINE

### Step-by-Step: What Happens When a Worker Submits a Chapter

```
STEP 1 — WORKER SUBMITS COMPLETED DOCUMENT
  System receives .docx file
  Project status changes to SUBMITTED

STEP 2 — FORMATTING CHECK (Layer 3)
  Script runs automatically (<3 seconds)
  ┌── PASS → proceed to Step 3
  ├── REVISION NEEDED → return to worker with specific formatting failures
  └── HARD FAIL → return to worker with critical alert

STEP 3 — STRUCTURAL CHECK (Layer 1)
  Script + AI runs automatically (<10 seconds)
  ┌── PASS → proceed to Step 4
  ├── REVISION NEEDED → return to worker (missing sections, thin chapters)
  └── HARD FAIL → return to worker (missing required sections)

STEP 4 — REFERENCE VERIFICATION TIER 2 (Layer 2b)
  AI runs automatically (~30 seconds per chapter)
  ┌── PASS → proceed to Step 5
  ├── SOFT FAIL → return to worker (tangential references flagged)
  └── HARD FAIL → return to worker (irrelevant references found)
  
  If Tier 3 is triggered (flagged worker, high-risk client, 
  or 10% sample):
    Tier 3 runs in background — results shown to QA reviewer at Step 6

STEP 5 — VOICE CHECK (Layer 2a)
  AI runs initial check (~30 seconds)
  Flags specific paragraphs for human review
  ┌── AI PASS (no flags) → proceed to Step 6
  └── AI FLAGS FOUND → Junior QA reviewer checks flagged sections
      ┌── Reviewer approves → proceed to Step 6
      └── Reviewer rejects → return to worker with voice feedback

STEP 6 — QA REVIEW (Layer 4)
  Project status changes to IN_QA_REVIEW
  Junior QA reviewer runs delivery checklist (5–10 minutes)
  
  For Engineering/Nursing/Law projects:
    Senior Domain Reviewer also reviews (subject-matter check)
  
  ┌── PASS → proceed to Step 7
  ├── MINOR ISSUES → reviewer fixes directly, proceed to Step 7
  └── REVISION NEEDED → return to worker with QA notes

STEP 7 — APPROVED
  Project status changes to APPROVED
  System sends balance payment request to client
  Balance payment verified → project status changes to BALANCE VERIFIED

STEP 8 — DELIVERY
  Deliverable sent/unlocked to client
  Project status changes to DELIVERED

STEP 9 — POST-DELIVERY
  If supervisor requests corrections → SUPERVISOR CORRECTIONS status
  Worker makes corrections within scope (up to 3 rounds)
  Corrected document goes through abbreviated pipeline (Layer 3 + Layer 4 only)
  
  After 7 days with no client response → auto-COMPLETED
```

### Pipeline Timing (Best Case)

| Step | Time | Cumulative |
|---|---|---|
| Formatting check | 3 seconds | 3 seconds |
| Structural check | 10 seconds | 13 seconds |
| Reference verification | 30 seconds | 43 seconds |
| Voice check (AI) | 30 seconds | 73 seconds |
| Voice check (human, if needed) | 5 minutes | ~6 minutes |
| QA review (human) | 5–10 minutes | ~16 minutes |
| **Total automated checks** | **~73 seconds** | |
| **Total with human review** | **~16 minutes** | |

Compare to the current process: Prince personally reviews each document for 30–60 minutes. The quality pipeline is 2–3× faster AND more consistent.

### Resubmission Rules

When a document fails any layer and the worker resubmits:

| Failed Layer | Resubmission Starts From |
|---|---|
| Layer 3 (Formatting) | Layer 3 (re-check formatting only) |
| Layer 1 (Structure) | Layer 1 (formatting already passed) |
| Layer 2b (References) | Layer 2b (formatting and structure already passed) |
| Layer 2a (Voice) | Layer 2a (earlier layers already passed) |
| Layer 4 (QA Review) | Layer 4 (earlier layers already passed) |

The pipeline does NOT restart from the beginning on resubmission. Only the failed layer and subsequent layers are re-checked. This prevents unnecessary re-processing.

---

## SERVICE TIER QUALITY MATRIX

Not all services require all quality layers at full intensity.

| Layer | FYP Full | FYP 3-Ch | Seminar | Term Paper | IT Report | Publication | Proposal | Editing |
|---|---|---|---|---|---|---|---|---|
| Layer 3: Formatting | Full | Full | Full | Simplified | Simplified | Publication profile | Proposal profile | Full |
| Layer 1: Structure | Full | Full | Full | Simplified | Simplified | Publication checklist | Proposal checklist | Skip |
| Layer 2b: References | Full (Tier 2 + Tier 3 sampling) | Full | Full | Skip | Skip | Derived from source | Tier 2 only | Skip |
| Layer 2a: Voice | Full | Full | Full | Simplified | Simplified | Publication voice | Full | Full |
| Layer 4: Delivery | Full | Full | Full | Basic | Basic | Full | Basic | Basic |

**"Simplified"** means: fewer checks apply, lower thresholds, faster review. The standard scales with the service tier — a ₦15,000 term paper does not get the same scrutiny as a ₦70,000 FYP. This is an explicit, honest design decision.

**"Skip"** means: this layer does not apply to this service type. Term papers and IT reports do not go through reference verification because they do not use the Zotero pipeline — their references are simpler and less critical.

---

## THE FEEDBACK LOOP

Quality is not static. The standard improves through three feedback mechanisms:

### 1. Worker Performance Tracking

Every worker accumulates quality data:

| Metric | Tracked |
|---|---|
| Formatting first-pass rate | How often their documents pass Layer 3 on first try |
| Structural first-pass rate | How often their documents pass Layer 1 on first try |
| Reference Tier 2 flag count | Rolling 30-day count of Tier 2 failures |
| Voice revision rate | How often their chapters are sent back for voice issues |
| QA revision rate | How often QA sends their work back |
| Supervisor correction rate | How often clients report supervisor corrections after delivery |

Workers with consistently poor metrics get:
- Additional training on the specific failure pattern
- Temporary Tier 3 reference checks on all their submissions (not just 10% sample)
- Reduced project assignment until metrics improve
- In severe cases: suspension or termination

### 2. Systemic Pattern Detection

The admin dashboard surfaces patterns across all workers:

- "5 workers this month had Tier 2 failures involving network-planning papers cited in hardware projects" → the research prompt needs updating, not the workers
- "Heading spacing failures increased 40% this month" → the AI report generator is inserting extra spacing again, update the generation prompt
- "3 supervisor corrections this month cited undefined equation symbols" → workers are skipping the symbol definition step, add it to the formatting script as a CRITICAL check

### 3. Standard Updates

The quality standard is a living document. It is updated when:

- A supervisor flags a new failure pattern that no current rule catches
- A department changes its formatting requirements
- A professional body (NMCN, NALT) updates its guidelines
- EduCraft enters a new department and needs a new structural template
- Worker feedback reveals a rule that is too strict or too lenient

All updates are versioned and documented. Workers are notified of changes that affect their work.

---

## DOCUMENT INVENTORY

The EduCraft Quality Standard consists of this master document plus four detailed specifications:

| Document | Content | Audience |
|---|---|---|
| **This document** (EduCraft Quality Standard v1.0) | Overview, pipeline, roles, targets, service matrix | Everyone: founders, ops manager, QA team, workers |
| **EduCraft Voice v1.1** | Writing style rules, banned phrases, chapter voice characters, voice check procedure | Workers, QA reviewers, AI prompt engineers |
| **Structural Quality v1.1** | Templates A and B, department overrides, page counts, section checklists, supervisor TOC override | Workers, structural checker script, QA reviewers |
| **Reference Verification System v1.0** | Tiers 1–3, AI prompts, pass/fail thresholds, sampling logic, cost projections | AI engineers, QA reviewers, admin dashboard |
| **Formatting Quality Script v1.0** | 71 formatting rules, profiles, script architecture, output format, severity levels | Developers (Claude Code), QA reviewers |

### Version History

| Version | Date | Changes |
|---|---|---|
| v1.0 | September 2026 | Initial release — all four layers defined, validated against real projects and supervisor feedback |

---

## WHAT THIS STANDARD MAKES POSSIBLE

With this standard in place, EduCraft can:

1. **Onboard new workers in hours, not weeks** — hand them the Voice document and the relevant department structural checklist. They know exactly what "good" looks like before writing a single word.

2. **Catch 60–70% of quality issues automatically** — before any human sees the document. Formatting errors, structural gaps, and irrelevant references are caught by scripts and AI in under 90 seconds.

3. **Scale QA to 15,000 projects/year** — with 2 junior reviewers + 3 part-time domain specialists, not 15 full-time reviewers. The automated layers handle the volume; humans handle the judgment.

4. **Maintain ≥95% first-time supervisor acceptance** — because the specific failure modes that cause rejections (irrelevant references, missing sections, broken formatting, undefined symbols, AI-sounding prose) are now caught before delivery.

5. **Improve continuously** — worker performance data, systemic pattern detection, and standard updates create a feedback loop that makes the system better every month.

6. **Reduce Prince's involvement to policy only** — the quality system runs without the founder reviewing every document. Prince decides the rules. The system enforces them.

This is the infrastructure that makes the ₦1 billion target achievable — not by working harder, but by building the machine that works for you.

---

*EduCraft Quality Standard v1.0 — Built across Sessions 1–6. Validated against real projects, real supervisor feedback, real department requirements, and real EduCraft delivery experience. September 2026.*
