# EDUCRAFT REPORT PRODUCTION SYSTEM

## The Automated Report Generation Architecture — Version 1.0

---

## WHAT THIS SYSTEM IS

The Report Production System is the engine that actually creates EduCraft's core product — academic project reports. It replaces the current process (a worker manually prompting an AI chapter by chapter over 5–8 hours) with an automated pipeline where the worker clicks "Write Report," watches a progress dashboard while 5 parallel agents generate all chapters simultaneously, reviews the quality-checked output, and downloads the finished document.

**Current state:** One report takes 5–8 hours of focused worker time. At 15K projects/year, that's 75,000–120,000 worker-hours annually.

**Target state:** One report takes 15–30 minutes of worker oversight time (monitoring progress, reviewing output, running quality checks). Active worker involvement drops by 90%.

**This is the system that makes the ₦1 billion target economically viable.** Without it, EduCraft needs hundreds of workers. With it, EduCraft needs dozens.

---

## THE FIVE SUB-SYSTEMS

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  CLIENT FILLS INTAKE FORM                               │
│  Data saved to WorkBase database                        │
│  Admin assigns project to worker                        │
│                                                         │
│  ↓                                                      │
│                                                         │
│  SUB-SYSTEM 1: RESEARCH PIPELINE                        │
│  Worker clicks "Get Research Papers"                    │
│  AI finds papers → Zotero verifies → references stored  │
│  Time: 5–10 minutes                                     │
│                                                         │
│  ↓                                                      │
│                                                         │
│  SUB-SYSTEM 2: PARALLEL CHAPTER GENERATION              │
│  Worker clicks "Write Report"                           │
│  5 agents run simultaneously (one per chapter)          │
│  Time: 10–20 minutes (parallel, not sequential)         │
│                                                         │
│  ↓                                                      │
│                                                         │
│  SUB-SYSTEM 3: DOCUMENT ASSEMBLY                        │
│  Main agent creates preliminary + supplementary pages   │
│  Combines everything into one formatted .docx           │
│  Time: 3–5 minutes                                      │
│                                                         │
│  ↓                                                      │
│                                                         │
│  SUB-SYSTEM 4: QUALITY GATE                             │
│  Formatting Script runs (Layer 3)                       │
│  Structural Check runs (Layer 1)                        │
│  Reference Verification Tier 2 runs (Layer 2b)          │
│  Voice Check runs (Layer 2a)                            │
│  Must pass ≥98% of checks                              │
│  Time: 2–5 minutes                                      │
│                                                         │
│  ↓                                                      │
│                                                         │
│  SUB-SYSTEM 5: WORKER REVIEW + DELIVERY                 │
│  Worker reviews output, downloads .docx and .pdf        │
│  If issues: re-run quality check on specific chapters   │
│  When satisfied: submit for human QA (Layer 4)          │
│  Time: 5–10 minutes                                     │
│                                                         │
│  TOTAL: ~30–50 minutes per report                       │
│  (down from 5–8 hours)                                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## SUB-SYSTEM 1: RESEARCH PIPELINE

### What It Does

Takes a project topic and produces a verified set of academic references ready for citation.

### The Current Process (Manual)

1. Worker takes the EduCraft research prompt
2. Changes the project topic in the prompt
3. Gives it to Claude or ChatGPT
4. AI searches for X number of papers and returns DOI + metadata
5. Worker compiles metadata into .bib format
6. Worker imports .bib to Zotero
7. Zotero pulls actual PDFs
8. Worker verifies papers are relevant (sometimes fails — this caused the only supervisor rejection)
9. Worker generates APA v7 references from Zotero
10. Worker uploads everything to Google Drive

### The Automated Process

```
Worker clicks "Get Research Papers" on project dashboard
        ↓
System loads:
  - Project topic (from database)
  - Department (from database)
  - Number of references needed (default: 40 for FYP)
  - EduCraft Research Prompt (from prompt library)
        ↓
System sends prompt to Claude API:
  "Find {N} research papers directly related to:
   Topic: {project_title}
   Department: {department}
   Requirements: base papers or closely related only.
   Return DOI, title, authors, year, journal for each.
   Format as .bib entries."
        ↓
System receives .bib formatted references
        ↓
System connects to Zotero API:
  - Creates a new collection named: "{project_id} — {short_topic}"
  - Imports all .bib entries
  - Triggers PDF retrieval for each entry
        ↓
System runs Reference Verification Tier 2:
  - Classifies each reference as CORE/CLOSELY_RELATED/TANGENTIAL/IRRELEVANT
  - If ≥75% CORE+CLOSELY_RELATED and zero IRRELEVANT → PASS
  - If FAIL → automatically requests replacement papers for flagged references
  - Re-runs verification on replacements
  - Maximum 3 replacement rounds before flagging for human review
        ↓
System stores verified references in database:
  - Reference table populated with DOI, title, authors, year, 
    journal, abstract, Zotero key
  - References linked to project record
        ↓
System generates APA v7 reference list from stored metadata
        ↓
Worker sees: "Research complete. {N} verified references found.
             {X}% CORE, {Y}% CLOSELY_RELATED."
             [View References] [Proceed to Write Report]
```

### Key Design Decision: Tier 2 Runs BEFORE Writing

In the current manual process, reference relevance is only checked after the entire report is written (if at all). In the automated system, Tier 2 runs immediately after paper retrieval — before any chapter is generated. This means:

- Irrelevant papers are caught and replaced BEFORE they contaminate the literature review
- The parallel chapter agents only receive pre-verified references
- The failure that caused the supervisor rejection becomes structurally impossible

### Zotero API Integration

| API Action | Endpoint | Purpose |
|---|---|---|
| Create collection | `POST /users/{userId}/collections` | Group references per project |
| Add items | `POST /users/{userId}/items` | Import .bib entries |
| Get item metadata | `GET /users/{userId}/items/{itemKey}` | Retrieve abstracts for Tier 2 |
| Get attachment | `GET /users/{userId}/items/{itemKey}/file` | Retrieve PDFs |

**Zotero API Key:** Stored securely in environment variables. One EduCraft organizational account.

**Google Drive Integration (for client delivery of research papers):**
After Zotero retrieval, PDFs are uploaded to a Google Drive folder:
- Folder structure: `EduCraft Research/{project_id}/`
- Share link generated automatically
- Link stored in project record
- Worker can share link with client (EduCraft's selling point: "we give you the actual papers")

### Token Cost for Sub-System 1

| Step | Tokens | Cost (estimate) |
|---|---|---|
| Research prompt → AI | ~2,000 input + ~5,000 output | ₦30–50 |
| Tier 2 verification | ~3,000 input + ~2,000 output | ₦20–30 |
| Replacement rounds (if needed) | ~2,000 per round × 1–3 rounds | ₦10–30 |
| **Total** | | **₦60–110** |

---

## SUB-SYSTEM 2: PARALLEL CHAPTER GENERATION

### What It Does

Generates all 5 chapters of the report simultaneously using 5 independent AI agents, each with chapter-specific prompts, writing guidelines, and the project's verified references.

### Architecture

```
                    ┌─────────────────┐
                    │  ORCHESTRATOR   │
                    │  (Main Thread)  │
                    └────────┬────────┘
                             │
              Distributes project data + references
              + department-specific prompts to all agents
                             │
         ┌───────┬───────┬───┴───┬───────┬───────┐
         │       │       │       │       │       │
    ┌────▼──┐┌───▼───┐┌──▼────┐┌─▼─────┐┌▼──────┐
    │ AGENT ││ AGENT ││ AGENT ││ AGENT ││ AGENT │
    │  A1   ││  A2   ││  A3   ││  A4   ││  A5   │
    │ Ch. 1 ││ Ch. 2 ││ Ch. 3 ││ Ch. 4 ││ Ch. 5 │
    └───┬───┘└───┬───┘└───┬───┘└───┬───┘└───┬───┘
        │        │        │        │        │
        │    Each agent runs independently
        │    Each has its own prompt + guidelines
        │    Each receives the full reference set
        │    Each outputs a complete chapter
        │        │        │        │        │
    ┌───▼────────▼────────▼────────▼────────▼───┐
    │            ORCHESTRATOR COLLECTS            │
    │         All 5 chapter outputs               │
    │     Passes to Sub-System 3 (Assembly)       │
    └────────────────────────────────────────────┘
```

### What Each Agent Receives

Every parallel agent gets the same base context plus its chapter-specific instructions:

**Shared context (sent to all 5 agents):**

```
PROJECT CONTEXT:
  Project ID: {project_id}
  Topic: {project_title}
  Department: {department}
  University: {university}
  Supervisor: {supervisor_name}
  Project Type: {project_type} (Theoretical/Practical/Survey/Design)
  
CLIENT REQUIREMENTS:
  Minimum pages: {minimum_pages}
  Referencing style: {referencing_style}
  Data requirements: {data_requirements}
  Special instructions: {special_instructions}
  Department outline: {department_outline} (if provided)
  Supervisor TOC: {supervisor_toc} (if provided)

VERIFIED REFERENCES:
  {full list of verified references with DOI, title, authors, 
   year, journal, abstract — from Sub-System 1}

TABLE OF CONTENTS:
  {generated from department template or supervisor's TOC}

EDUCRAFT FORMATTING STANDARD:
  {condensed formatting rules relevant to generation}
```

**Agent-specific instructions (unique to each agent):**

| Agent | Chapter | Receives Additionally |
|---|---|---|
| A1 | Chapter 1: Introduction | EduCraft Chapter 1 prompt for this department + writing guidelines |
| A2 | Chapter 2: Literature Review | EduCraft Chapter 2 prompt + reference list with abstracts + synthesis guidelines |
| A3 | Chapter 3: Methodology | EduCraft Chapter 3 prompt + department-specific methodology template + design guidelines |
| A4 | Chapter 4: Results/Analysis | EduCraft Chapter 4 prompt + data analysis guidelines + client's Chapter 3/4 data (if practical project) |
| A5 | Chapter 5: Conclusion | EduCraft Chapter 5 prompt + objectives from A1 output (see dependency handling below) |

### The Chapter 5 Dependency Problem

Prince identified this in his notes: "The preliminary and supplementary pages can't run in parallel because they need information from Chapters 1–5 before they can be created."

The same applies partially to Chapter 5. A strong Chapter 5 must:
- Summarize findings from Chapter 4
- Verify each objective from Chapter 1 as achieved or not
- Draw conclusions from the actual results

**If Chapter 5 runs truly in parallel, it doesn't have the actual Chapter 1 objectives or Chapter 4 results to reference.** It would need to infer them from the project topic alone, which produces generic conclusions.

**Solution — Staggered Parallelism:**

```
TIME 0:  Start A1 (Ch.1), A2 (Ch.2), A3 (Ch.3), A4 (Ch.4)
         [4 agents running in parallel]
         
         A5 (Ch.5) WAITS

TIME T1: A1 completes → extract objectives list
         A4 completes → extract key findings
         
         Feed objectives + findings to A5
         A5 starts

TIME T2: A2 completes
TIME T3: A3 completes
TIME T4: A5 completes (started later but chapter is short — 5–8 pages)

TOTAL TIME: Max(T1, T2, T3) + A5_generation_time
```

In practice, Chapter 5 is the shortest chapter (5–8 pages) so even with the delayed start, it finishes close to when the other agents finish. The total time penalty is small — maybe 2–3 extra minutes.

**What A5 receives after A1 and A4 complete:**

```
OBJECTIVES (extracted from A1 output):
  1. To design a microstrip patch antenna for 5G applications
  2. To simulate the antenna using HFSS software
  3. To fabricate a prototype and measure its performance
  4. To compare simulated and measured results

KEY FINDINGS (extracted from A4 output):
  - Simulated gain: 7.8 dBi at 28 GHz
  - Measured gain: 7.2 dBi (8% lower than simulated)
  - Bandwidth: 3.1 GHz (exceeds design target of 2 GHz)
  - Return loss: -22 dB (meets <-10 dB requirement)

Use these to write Chapter 5:
  - Summary of what was done
  - For each objective: state whether achieved, with evidence
  - Conclusion drawn from the findings
  - Recommendations for future work
  - Limitations of the study
```

### The Prompt Library

Each department × chapter combination has its own stored prompt. These are the EduCraft "trade secret" prompts Prince has developed over time.

```
Prompt Library Structure:

prompts/
├── engineering/
│   ├── chapter_1.md       ← EduCraft Engineering Ch.1 Writing Guide
│   ├── chapter_2.md       ← Engineering Ch.2 Writing Guide
│   ├── chapter_3.md       ← Engineering Ch.3 Master Writing Guide
│   ├── chapter_4.md       ← Engineering Ch.4 Writing Guide
│   └── chapter_5.md       ← Engineering Ch.5 Writing Guide
├── nursing/
│   ├── chapter_1.md
│   ├── chapter_2.md
│   ├── chapter_3.md       ← NMCN-specific methodology
│   ├── chapter_4.md
│   └── chapter_5.md       ← "Discussion, Conclusions and Recommendations"
├── medical_science/
│   ├── chapter_1.md       ← 10-section Chapter 1
│   ├── chapter_2.md
│   ├── chapter_3.md       ← "Materials and Methods" (13+ sections)
│   ├── chapter_4.md       ← "Results"
│   └── chapter_5.md       ← "Discussion, Conclusions and Recommendations"
├── computer_science/
│   ├── chapter_1.md
│   ├── chapter_2.md
│   ├── chapter_3.md       ← System Design focus
│   ├── chapter_4.md       ← Implementation + Testing
│   └── chapter_5.md
├── law_doctrinal/         ← Template B, 6 chapters
│   ├── chapter_1.md
│   ├── chapter_2.md
│   ├── chapter_3.md
│   ├── chapter_4.md
│   ├── chapter_5.md
│   └── chapter_6.md       ← Law has 6 chapters
├── economics/
│   └── ...
├── humanities/            ← Template B, thematic
│   └── ...
├── shared/
│   ├── voice_rules.md     ← Condensed EduCraft Voice Standard
│   ├── formatting_rules.md ← Condensed formatting requirements
│   ├── reference_rules.md  ← APA v7 in-text citation format
│   └── anti_ai_rules.md   ← The banned phrases and constructions
└── preliminary/
    ├── dedication.md       ← Dedication page generation prompt
    ├── acknowledgment.md   ← Acknowledgment page prompt
    ├── abstract.md         ← Abstract generation prompt (needs Ch.1–5 data)
    └── preliminary_page.md ← Cover, title, certification, declaration
```

### Token Optimization

Each parallel agent receives:
- Shared context: ~3,000 tokens
- Verified references (titles + abstracts for Ch.2, titles only for others): ~2,000–8,000 tokens
- Chapter-specific prompt: ~2,000–4,000 tokens
- Voice rules + formatting rules: ~1,500 tokens

**Input per agent: ~8,500–16,500 tokens**
**Output per agent: ~4,000–12,000 tokens (depends on chapter length)**

| Agent | Input Tokens | Output Tokens | Cost (estimate) |
|---|---|---|---|
| A1 (Ch.1) | ~10,000 | ~6,000 | ₦60–80 |
| A2 (Ch.2) | ~16,000 | ~12,000 | ₦100–140 |
| A3 (Ch.3) | ~14,000 | ~12,000 | ₦100–130 |
| A4 (Ch.4) | ~12,000 | ~10,000 | ₦80–110 |
| A5 (Ch.5) | ~10,000 | ~4,000 | ₦50–70 |
| **Total** | **~62,000** | **~44,000** | **₦390–530** |

**Important — Token saving note from Prince's design:** The preliminary and supplementary pages agent does NOT re-read all 5 chapters. Instead, the orchestrator extracts only the specific information needed:
- From A1: objectives list, project title, aim
- From A2: nothing needed for prelims
- From A3: nothing needed for prelims
- From A4: key findings (for abstract)
- From A5: conclusion summary (for abstract)

This means the prelims agent receives ~3,000 tokens of extracted data instead of ~44,000 tokens of full chapter text. **92% token reduction** for the preliminary pages generation.

### Parallel Execution Implementation

**Option A — Server-Side Concurrent API Calls (Recommended):**

```javascript
// orchestrator.js (pseudocode)

async function generateReport(projectId) {
  // 1. Load project data and references from database
  const project = await loadProject(projectId);
  const references = await loadReferences(projectId);
  const prompts = await loadPromptLibrary(project.department);
  
  // 2. Build shared context
  const sharedContext = buildSharedContext(project, references);
  
  // 3. Run Chapters 1-4 in parallel
  const [ch1, ch2, ch3, ch4] = await Promise.all([
    generateChapter(1, sharedContext, prompts.chapter_1),
    generateChapter(2, sharedContext, prompts.chapter_2),
    generateChapter(3, sharedContext, prompts.chapter_3),
    generateChapter(4, sharedContext, prompts.chapter_4),
  ]);
  
  // 4. Extract data for Chapter 5
  const objectives = extractObjectives(ch1);
  const findings = extractFindings(ch4);
  
  // 5. Generate Chapter 5 with extracted data
  const ch5 = await generateChapter(5, sharedContext, prompts.chapter_5, {
    objectives,
    findings
  });
  
  // 6. Pass to Sub-System 3 (Assembly)
  return { ch1, ch2, ch3, ch4, ch5 };
}

async function generateChapter(chapterNum, context, prompt, extras = {}) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    messages: [{
      role: "user",
      content: buildChapterPrompt(chapterNum, context, prompt, extras)
    }]
  });
  return response.content[0].text;
}
```

**Option B — Claude Code Sub-Agents:**

If building within Claude Code's agent framework, each chapter becomes a sub-agent:

```
Main Agent (Orchestrator)
  ├── spawn sub-agent: "Write Chapter 1" with context + Ch.1 prompt
  ├── spawn sub-agent: "Write Chapter 2" with context + Ch.2 prompt
  ├── spawn sub-agent: "Write Chapter 3" with context + Ch.3 prompt
  ├── spawn sub-agent: "Write Chapter 4" with context + Ch.4 prompt
  │
  ├── await all 4 sub-agents
  │
  ├── extract objectives from Ch.1, findings from Ch.4
  ├── spawn sub-agent: "Write Chapter 5" with extracted data
  │
  ├── await Ch.5 sub-agent
  │
  └── pass all chapters to Assembly
```

**Recommendation:** Use Option A (server-side concurrent API calls) for production. It's more reliable, easier to monitor, and doesn't depend on Claude Code's sub-agent infrastructure. Option B is useful during development and testing.

### Model Choice

**Locked in: `claude-sonnet-4-6`** for all generation tasks. This is the best cost/quality balance. Opus would double cost to ₦1,000–1,500 per project. Haiku would halve cost but likely fail the Voice standard. Start with Sonnet, observe output quality over the first 50 projects, and adjust only if data justifies it.

### Prompt Library Architecture — Shared Base with Department Overrides

The prompt library uses **shared base prompts** with department-specific overrides, not independent prompts per department. This is because 70–80% of the logic in Chapters 1, 2, 4, and 5 is identical across departments — only Chapter 3 (Methodology) genuinely needs full replacement per department.

```
prompts/
├── base/
│   ├── chapter_1_base.md          ← Shared Ch.1 logic (all departments)
│   ├── chapter_2_base.md          ← Shared literature review methodology
│   ├── chapter_3_base.md          ← Minimal shared logic
│   ├── chapter_4_base.md          ← Shared present→interpret→connect
│   ├── chapter_5_base.md          ← Shared summarize→verify→conclude
│   ├── voice_rules.md             ← EduCraft Voice Standard (condensed)
│   ├── formatting_rules.md        ← Formatting requirements
│   └── anti_ai_rules.md           ← Banned phrases and constructions
│
├── overrides/
│   ├── engineering/
│   │   ├── chapter_1_override.md  ← Adds: Outline of Project
│   │   ├── chapter_3_override.md  ← FULL REPLACEMENT: design calcs, BEME, testing
│   │   └── chapter_4_override.md  ← Adds: sim vs measurement comparison
│   ├── medical_science/
│   │   ├── chapter_1_override.md  ← EXTENDS to 10 sections
│   │   ├── chapter_3_override.md  ← FULL REPLACEMENT: 13-section Materials and Methods
│   │   ├── chapter_4_override.md  ← Adds: statistical test format
│   │   └── chapter_5_override.md  ← Renames + reorders: Discussion FIRST
│   ├── nursing/
│   │   ├── chapter_3_override.md  ← FULL REPLACEMENT: NMCN methodology
│   │   └── chapter_5_override.md  ← Renames: Discussion of Findings
│   ├── computer_science/
│   │   ├── chapter_3_override.md  ← FULL REPLACEMENT: System Design, DB
│   │   └── chapter_4_override.md  ← Adds: screenshots, testing
│   ├── law_doctrinal/
│   │   └── ALL chapters override  ← Template B, 6 chapters
│   └── humanities/
│       └── ALL chapters override  ← Template B, thematic
│
└── preliminary/
    ├── dedication.md
    ├── acknowledgment.md
    ├── abstract.md
    └── preliminary_page.md
```

**Runtime logic:** Load base prompt → check for department override → if FULL_REPLACEMENT, use override only; if EXTENDS, append override to base; if MODIFIES, apply specific changes to base → append shared voice/formatting/anti-AI rules.

**Maintainability advantage:** When a Voice rule is updated (e.g., new banned phrase), one file changes and every department benefits. With independent prompts, 8+ files would need updating.

### Worker Autonomy — Hands-Off with 30-Minute Recall Window

**Default flow (95% of projects):** System generates → quality gate runs → if ≥98% pass → auto-submits to QA queue. Worker receives notification with download links.

**Override flow (5% — worker spots an issue):** Worker downloads and reviews → spots a problem the quality gate missed → clicks "Recall from QA" (available for 30 minutes after auto-submission) → project pulled back → worker fixes and re-submits manually.

The 30-minute window balances speed (worker doesn't need to do anything for most projects) with safety (worker can intervene for the rare cases where AI produces something obviously wrong that the quality gate missed).

### Network Break Recovery — Checkpoint System

Every agent saves progress to the database every 2,000 tokens of output. If network breaks mid-generation:

- Completed chapters are preserved (not re-generated on resume)
- Partially generated chapters are discarded and re-generated from scratch
- Not-started chapters generate normally
- Worker sees: "Generation interrupted. 3 of 5 chapters completed. [Resume] [Restart]"

```prisma
model GenerationCheckpoint {
  id              String   @id @default(cuid())
  projectId       String
  project         Project  @relation(fields: [projectId], references: [id])
  chapterNumber   Int
  status          String   // pending, in_progress, completed, failed
  progressPercent Int      @default(0)
  partialOutput   String?
  fullOutput      String?
  tokensUsed      Int      @default(0)
  startedAt       DateTime?
  completedAt     DateTime?
  errorMessage    String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

### Token Limit Handling — Chunked Generation

If a chapter's expected output exceeds the model's max output tokens, the system automatically splits into logical chunks (by section groups), generates each chunk sequentially, and stitches them together. The continuation prompt includes the last 500 tokens of the previous chunk for coherence. Most chapters fit in a single call with `max_tokens: 16000`.

### Token Monitoring — Admin Dashboard

Every AI call logs token usage to an `AIUsageLog` table:

```prisma
model AIUsageLog {
  id              String   @id @default(cuid())
  projectId       String?
  project         Project? @relation(fields: [projectId], references: [id])
  workerId        String?
  worker          Worker?  @relation(fields: [workerId], references: [id])
  subsystem       String   // research_pipeline, chapter_generation, quality_gate, assembly, publication
  chapterNumber   Int?
  model           String   // claude-sonnet-4-6
  inputTokens     Int
  outputTokens    Int
  totalTokens     Int
  costNaira       Float
  durationMs      Int
  status          String   // success, failed, truncated
  createdAt       DateTime @default(now())
}
```

Admin dashboard shows: total monthly spend, cost per project average, cost breakdown by sub-system, per-worker cost comparison (identifies inefficient workers who trigger frequent re-generation), and monthly trend.

### Generation Queue — Rate Limiting

When multiple workers trigger generation simultaneously, requests enter a FIFO queue with deadline-based priority. The queue processor runs up to N concurrent generations (N based on API rate limit, typically 5–10). Workers see their queue position and estimated start time.

```prisma
model GenerationQueue {
  id          String   @id @default(cuid())
  projectId   String   @unique
  project     Project  @relation(fields: [projectId], references: [id])
  workerId    String
  priority    Int      @default(0)
  status      String   // queued, processing, completed, failed
  queuedAt    DateTime @default(now())
  startedAt   DateTime?
  completedAt DateTime?
}
```

### Updated Total Cost Per Report

| Component | Cost Per FYP |
|---|---|
| Research Pipeline | ₦60–110 |
| Chapter Generation (5 agents) | ₦390–530 |
| Document Assembly | ₦15–25 |
| Quality Gate | ₦55–90 |
| Re-generation (~20% of projects, amortised) | ₦12–28 |
| **Total average per FYP** | **₦530–785** |

At ₦70,000 per FYP: **0.76–1.12% of revenue.**

---

## SUB-SYSTEM 3: DOCUMENT ASSEMBLY

### What It Does

Takes the 5 raw chapter outputs from Sub-System 2, generates preliminary and supplementary pages, and assembles everything into a single properly formatted `.docx` file.

### Assembly Pipeline

```
STAGE 1 — PRELIMINARY PAGES GENERATION
  Input: Extracted data from chapters + client intake data
  ┌─────────────────────────────────────────┐
  │ Generate:                               │
  │   - Cover page (from client data)       │
  │   - Title page (from client data)       │
  │   - Declaration page (template)         │
  │   - Certification page (template)       │
  │   - Dedication (from intake form data)  │
  │   - Acknowledgment (from intake data)   │
  │   - Abstract (from Ch.1 aim + Ch.4      │
  │     findings + Ch.5 conclusion)         │
  └─────────────────────────────────────────┘

STAGE 2 — CHAPTER FORMATTING
  For each chapter (1–5):
  ┌─────────────────────────────────────────┐
  │ - Apply heading styles (H1, H2, H3)    │
  │ - Format equations in 2-column tables   │
  │ - Format all tables (three-line)        │
  │ - Apply figure/table caption styles     │
  │ - Insert in-text citations (APA v7)     │
  │ - Apply font (TNR 12pt) and spacing     │
  │   (2.0)                                 │
  │ - Apply justified alignment             │
  │ - Ensure no paragraph indentation       │
  └─────────────────────────────────────────┘

STAGE 3 — SUPPLEMENTARY PAGES
  ┌─────────────────────────────────────────┐
  │ Generate:                               │
  │   - References list (from stored refs,  │
  │     APA v7, alphabetical, hanging       │
  │     indent, journal names italicised)   │
  │   - Appendices (if applicable)          │
  └─────────────────────────────────────────┘

STAGE 4 — DOCUMENT ASSEMBLY
  ┌─────────────────────────────────────────┐
  │ Create single .docx file:              │
  │   1. Preliminary pages (Section 1 —     │
  │      Roman numeral page numbers)        │
  │   2. Section break                      │
  │   3. Chapter 1–5 (Section 2 —           │
  │      Arabic page numbers starting at 1) │
  │   4. References                         │
  │   5. Appendices                         │
  │                                         │
  │ Generate:                               │
  │   - Table of Contents (from H1–H3,     │
  │     no dotted leaders)                  │
  │   - List of Tables (from table          │
  │     captions, no dotted leaders)        │
  │   - List of Figures (from figure        │
  │     captions, no dotted leaders)        │
  │   - List of Appendices (if any,         │
  │     no dotted leaders)                  │
  │                                         │
  │ Apply:                                  │
  │   - Page margins (1.0 inch all sides)   │
  │   - Centre-aligned page numbers         │
  │   - Roman numerals for Section 1        │
  │   - Arabic numerals for Section 2       │
  └─────────────────────────────────────────┘

STAGE 5 — EXPORT
  ┌─────────────────────────────────────────┐
  │ Save as:                                │
  │   - {project_id}_report.docx            │
  │   - {project_id}_report.pdf             │
  │                                         │
  │ Store in:                               │
  │   - Project file storage (S3)           │
  │   - Linked to project record in DB      │
  └─────────────────────────────────────────┘
```

### Technical Implementation

The document assembly uses `python-docx` for .docx generation:

```python
# assembly.py (pseudocode)

from docx import Document
from docx.shared import Pt, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH

def assemble_report(project, chapters, prelims, references, appendices):
    doc = Document()
    
    # Section 1: Preliminary pages (Roman numerals)
    section1 = doc.sections[0]
    set_margins(section1, top=Inches(1), bottom=Inches(1), 
                left=Inches(1), right=Inches(1))
    set_page_numbers(section1, format='lowerRoman', start=1, 
                     alignment='center')
    
    add_cover_page(doc, project)
    add_title_page(doc, project)
    add_declaration(doc, project)
    add_certification(doc, project)
    add_dedication(doc, prelims.dedication)
    add_acknowledgment(doc, prelims.acknowledgment)
    add_abstract(doc, prelims.abstract)
    add_toc_placeholder(doc)  # Updated after all content added
    add_list_of_tables(doc)
    add_list_of_figures(doc)
    add_list_of_appendices(doc)
    
    # Section break
    add_section_break(doc)
    
    # Section 2: Main body (Arabic numerals starting at 1)
    section2 = doc.sections[-1]
    set_margins(section2, top=Inches(1), bottom=Inches(1),
                left=Inches(1), right=Inches(1))
    set_page_numbers(section2, format='decimal', start=1,
                     alignment='center')
    unlink_from_previous(section2)
    
    for chapter in chapters:
        add_chapter(doc, chapter)
    
    add_references(doc, references)
    
    if appendices:
        add_appendices(doc, appendices)
    
    # Update TOC, LoF, LoT fields
    update_all_fields(doc)
    
    return doc
```

### Token Cost for Sub-System 3

| Step | Tokens | Cost |
|---|---|---|
| Abstract generation | ~2,000 input + ~500 output | ₦10–15 |
| Dedication + Acknowledgment | ~1,000 input + ~500 output | ₦5–10 |
| Document assembly (python-docx) | 0 (no AI) | ₦0 |
| **Total** | | **₦15–25** |

---

## SUB-SYSTEM 4: QUALITY GATE

### What It Does

Runs the EduCraft Quality Standard against the generated report before the worker can download it. This is the A/B testing Prince designed — comparing the output against EduCraft's proprietary quality benchmarks.

### The Quality Pipeline (Automated)

```
Generated .docx file
        ↓
STEP 1 — Formatting Quality Script (Layer 3)
  Checks: 71 formatting rules
  Time: <3 seconds
  Result: Pass count, fail count, severity per failure
        ↓
STEP 2 — Structural Quality Check (Layer 1)
  Checks: Section presence, chapter balance, page counts
  Time: <10 seconds
  Result: Template compliance score
        ↓
STEP 3 — Reference Verification Tier 2 (Layer 2b)
  Checks: Citation relevance per chapter
  Time: ~30 seconds
  Result: Relevance scores per chapter
        ↓
STEP 4 — Voice Check (Layer 2a — AI-assisted)
  Checks: Banned phrases, transition patterns, vague qualifiers,
          section cross-references, paragraph uniformity
  Time: ~60 seconds
  Result: Voice compliance score per chapter
        ↓
AGGREGATE SCORE
  Total applicable checks: ~90 (for a typical Engineering FYP)
  Checks passed: X
  Quality score: X / 90 = Y%
  
  If Y ≥ 98% → QUALITY GATE PASSED
  If Y < 98% → QUALITY GATE FAILED
                Show specific failures to worker
                Worker can: fix manually, or re-generate specific chapters
```

### The 98% Threshold in Practice

For an Engineering FYP with ~90 applicable checks:
- 98% = 88 checks passed, 2 or fewer failures
- Zero CRITICAL failures allowed (even one = automatic fail regardless of percentage)
- The 2 allowed failures must be MINOR severity

**If the quality gate fails,** the worker sees a detailed report:

```
QUALITY GATE — FAILED (94.4%)
──────────────────────────────

Score: 85/90 checks passed (94.4%)
Required: 98% (88/90)
Gap: 3 additional checks need to pass

FAILURES:

🟠 MAJOR — Voice: Chapter 2 paragraph 14 starts with "Moreover"
   Fix: Rewrite the opening of this paragraph without transition word

🟠 MAJOR — Voice: Chapter 3 contains 2 vague qualifiers 
   ("high efficiency" at para 8, "good performance" at para 23)
   Fix: Replace with specific numerical values from the design

🔴 CRITICAL — Formatting: Equation 3.4 is inline, not in 
   borderless two-column table
   Fix: Move equation to its own line in a 2-column table

🟡 MINOR — Structure: Chapter 1 is 11 pages (minimum is 12)
   Fix: Expand Background of Study or add Scope of Study detail

🟡 MINOR — Formatting: "et al." not italicised in 2 locations
   Fix: Italicise all occurrences

ACTIONS:
[Re-generate Chapter 2]  [Re-generate Chapter 3]
[Fix Formatting Issues]  [Run Quality Check Again]
```

### Chapter-Specific Re-Generation

When the quality gate fails on specific chapters, the worker can re-generate only those chapters. The system:

1. Takes the existing shared context + references
2. Adds the specific quality failures as additional instructions:
   ```
   IMPORTANT — Previous generation had these issues:
   - Paragraph 14 started with "Moreover" — avoid this
   - Use specific values instead of "high efficiency" 
     and "good performance"
   ```
3. Re-runs only the failing agent (not all 5)
4. Replaces only the failing chapter in the assembled document
5. Re-runs the quality gate

This targeted re-generation costs ~₦60–140 per chapter instead of ~₦390–530 for the full report.

---

## SUB-SYSTEM 5: WORKER EXPERIENCE

### The Worker Dashboard View

When a worker is assigned a project and all client data is loaded:

```
PROJECT EC-00234 — Final Year Project
──────────────────────────────────────

Client: John Okafor | UNIBEN | Mechanical Engineering
Topic: Design and Fabrication of a Solar-Powered Repeater
Type: Practical/Implementation
Deadline: Aug 16, 2026

STEP 1 — RESEARCH
[Get Research Papers]     Status: Not started

STEP 2 — REPORT GENERATION  
[Write Report]            Status: Locked (complete Step 1 first)

STEP 3 — QUALITY CHECK
[Run Quality Check]       Status: Locked (complete Step 2 first)

STEP 4 — REVIEW & SUBMIT
[Download .docx]          Status: Locked (pass quality check first)
[Download .pdf]           
[Submit for QA Review]    
```

### Progress Dashboard (During Generation)

When the worker clicks "Write Report," they see a real-time progress dashboard:

```
GENERATING REPORT — EC-00234
──────────────────────────────────────

Overall Progress: ████████████░░░░░░░░ 62%

CHAPTER STATUS:
  Chapter 1 — Introduction          ✅ Complete (4m 12s)
  Chapter 2 — Literature Review      ⏳ Generating... 67%
  Chapter 3 — Methodology            ✅ Complete (5m 48s)
  Chapter 4 — Results                ⏳ Generating... 43%
  Chapter 5 — Conclusion             ⏱️ Waiting (needs Ch.1 + Ch.4)

NEXT STEPS:
  → Chapter 5 will start automatically when Ch.1 and Ch.4 complete
  → Preliminary pages generated after all chapters complete
  → Quality check runs automatically after assembly

Estimated time remaining: ~8 minutes
```

### Progress Tracking Implementation

The orchestrator emits progress events via WebSocket or Server-Sent Events (SSE):

```javascript
// Progress events emitted by the orchestrator

{ type: "chapter_started", chapter: 1, timestamp: "..." }
{ type: "chapter_progress", chapter: 1, percent: 25, timestamp: "..." }
{ type: "chapter_progress", chapter: 1, percent: 50, timestamp: "..." }
{ type: "chapter_progress", chapter: 1, percent: 75, timestamp: "..." }
{ type: "chapter_complete", chapter: 1, duration_seconds: 252, timestamp: "..." }
{ type: "chapter_started", chapter: 5, timestamp: "...", note: "Dependencies met" }
{ type: "assembly_started", timestamp: "..." }
{ type: "assembly_complete", timestamp: "..." }
{ type: "quality_check_started", timestamp: "..." }
{ type: "quality_check_complete", score: 98.9, passed: true, timestamp: "..." }
{ type: "report_ready", docx_url: "...", pdf_url: "...", timestamp: "..." }
```

The worker's browser listens to these events and updates the progress UI in real-time. No page refreshes needed.

**The progress percentage per chapter** is estimated based on token output:
- If the expected output for Chapter 2 is ~12,000 tokens and 8,000 have been generated so far → 67% progress
- The Claude API streams responses, so tokens arrive incrementally and progress updates smoothly

### Post-Generation Worker Actions

After the report is generated and the quality gate passes:

```
REPORT READY — EC-00234
──────────────────────────────────────

Quality Score: 98.9% ✅ (89/90 checks passed)
1 minor issue: "et al." not italicised in 1 location (auto-fixed)

GENERATED FILES:
  📄 EC-00234_report.docx    [Download]
  📄 EC-00234_report.pdf     [Download]

ACTIONS:
  [Preview Report]           ← Opens in-browser document viewer
  [Re-generate Chapter ▼]    ← Dropdown to pick specific chapter
  [Run Quality Check Again]  ← After manual edits
  [Submit for QA Review]     ← Sends to human QA (Layer 4)
```

The worker can:
1. **Download and review** — open in Word, make manual adjustments
2. **Re-generate specific chapters** — if they want a different approach
3. **Run quality check again** — after making manual changes to the .docx
4. **Submit for QA Review** — when satisfied, sends the document into the human QA pipeline

---

## TOTAL COST PER REPORT

| Sub-System | Cost |
|---|---|
| Sub-System 1: Research Pipeline | ₦60–110 |
| Sub-System 2: Parallel Chapter Generation | ₦390–530 |
| Sub-System 3: Document Assembly | ₦15–25 |
| Sub-System 4: Quality Gate | ₦55–90 |
| Sub-System 5: Worker Experience | ₦0 (UI only) |
| **Total AI cost per FYP** | **₦520–755** |

At ₦70,000 per FYP, the AI generation cost is **0.7–1.1% of revenue**.

**Comparison to current worker cost:**
- Current: worker paid 40% = ₦28,000 per project
- With automation: AI cost ~₦650 + reduced worker time (₦5,000–10,000 for oversight)
- **Net savings per project: ~₦18,000–22,000**

At 15,000 projects/year, automation saves **₦270M–330M annually** in worker costs alone. That's the difference between a ₦1B revenue business with ₦300M profit and a ₦1B revenue business with ₦550M+ profit.

---

## THE RETURNING CLIENT FLOW

### Proposal → Full Report Continuation

When a client who previously ordered a proposal returns for the full report:

```
System detects: Client has completed proposal (EC-00100)
        ↓
System loads proposal data:
  - Topic, aim, objectives (already defined)
  - Initial references (already verified)
  - Chapter outlines (already written as overviews)
        ↓
Report generation uses proposal as foundation:
  - Chapter prompts include: "Expand from this proposal overview: {proposal_chapter_text}"
  - References are expanded (add more papers to the existing verified set)
  - Objectives are kept consistent (no drift from proposal to report)
        ↓
Result: A report that is genuinely a continuation of the proposal,
        not a separate document that happens to share a topic
```

### Full Report → Publication

When a client requests a publication after completing their report:

```
System detects: Client has completed FYP (EC-00150)
        ↓
System loads project data from database:
  - Topic, methodology, results, conclusions
  - All references (already verified)
  - No need to upload or re-read the full document
        ↓
Publication agent receives:
  - Extracted project data (NOT the full 100-page document)
  - EduCraft Master Publication Prompt
  - Token cost: ~3,000–5,000 input (vs 30,000–50,000 if reading full doc)
        ↓
Result: Publication paper generated at 85–90% lower token cost
```

---

## BUILDING WITH CLAUDE CODE — IMPLEMENTATION PHASES

### Phase 1: Prompt Library + Single Chapter Generation (Weeks 1–2)

- Create the prompt library file structure
- Port Prince's existing engineering chapter prompts into the library
- Build single-chapter generation (not parallel yet)
- Test: generate one chapter with correct formatting and voice
- Validate against the EduCraft Voice standard

### Phase 2: Parallel Generation + Orchestrator (Weeks 3–4)

- Build the orchestrator with Promise.all parallelism
- Implement the Chapter 5 dependency (staggered start)
- Build progress event emission (WebSocket/SSE)
- Build the worker progress dashboard UI
- Test: generate all 5 chapters in parallel, confirm they're coherent

### Phase 3: Document Assembly (Weeks 5–6)

- Build the python-docx assembly pipeline
- Implement preliminary pages generation
- Implement two-section page numbering (Roman + Arabic)
- Build TOC, List of Figures, List of Tables, List of Appendices generation
- Test: assemble a complete .docx with correct formatting

### Phase 4: Quality Gate Integration (Weeks 7–8)

- Integrate the Formatting Quality Script
- Integrate the Structural Quality Checker
- Integrate Reference Verification Tier 2
- Integrate Voice Check (AI-assisted)
- Build the aggregate quality score calculation
- Build the worker feedback UI for quality failures
- Test: run full pipeline end-to-end

### Phase 5: Research Pipeline + Zotero Integration (Weeks 9–10)

- Build Zotero API integration (create collection, import items, retrieve PDFs)
- Build Google Drive API integration (upload PDFs, generate share links)
- Build the "Get Research Papers" workflow
- Integrate Tier 2 pre-verification (before writing, not after)
- Test: full research → generation → assembly → quality pipeline

### Phase 6: Polish + Production (Weeks 11–12)

- Chapter-specific re-generation
- Publication generation from existing project data
- Proposal → Full Report continuation
- Error handling and recovery (what if an agent fails mid-generation?)
- Rate limiting (don't exceed Claude API limits)
- Cost tracking per project
- Deployment

---

## METRICS AND SUCCESS CRITERIA

### 30-Day Check

- [ ] Single chapter generation produces output matching EduCraft Voice standards
- [ ] Parallel generation completes all 5 chapters without errors
- [ ] Document assembly produces correctly formatted .docx
- [ ] Quality gate catches the same issues Prince would catch manually

### 90-Day Check

- [ ] Average report generation time under 30 minutes (including research)
- [ ] Quality gate pass rate on first generation ≥80%
- [ ] AI cost per project within projected range (₦520–755)
- [ ] Worker oversight time reduced to under 30 minutes per project
- [ ] Zero supervisor rejections attributed to automated generation quality

### 12-Month Check

- [ ] System has produced 1,000+ reports
- [ ] Quality gate pass rate on first generation ≥90% (system learning from failures)
- [ ] Prompt library covers all major departments
- [ ] Worker time per project stabilised at 15–30 minutes
- [ ] Cost savings vs. manual process confirmed at ₦18,000+ per project

---

*Version 1.1 — Updated with locked decisions: Sonnet model (observe-and-adjust), shared base prompts with department overrides, hands-off worker flow with 30-minute recall window. Added: checkpoint recovery for network breaks, chunked generation for token limits, token monitoring dashboard, generation queue with rate limiting. Ready for Claude Code implementation.*
