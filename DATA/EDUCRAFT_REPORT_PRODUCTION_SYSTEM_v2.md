# EDUCRAFT REPORT PRODUCTION SYSTEM — VERSION 2.0
## The Complete Build Specification
### Parallel Generation Engine + Mode Matrix Architecture

---

> **How to use this document:**
> This is the single source of truth for building EduCraft's automated report production system. Every architectural decision is captured here. You can paste this document directly into Claude Code as context, or reference it section by section as you build each phase. Nothing is left to assumption. Where code is given, it is production-ready pseudocode unless explicitly marked as illustrative.

---

## TABLE OF CONTENTS

1. What This System Is — and Why It Exists
2. System Overview Diagram
3. The Five Research Modes (The Architectural Breakthrough)
4. The Mode Matrix Table
5. Client Intake Flow — From Form to Mode Assignment
6. The Prompt Library Architecture
7. Sub-System 1: Research Pipeline
8. Sub-System 2: Mode-Aware Parallel Chapter Generation Engine
9. Sub-System 3: Document Assembly
10. Sub-System 4: Quality Gate
11. Sub-System 5: Worker Experience
12. Database Schema Additions
13. API Endpoints
14. Token Cost Model
15. Build Phases (Implementation Order)
16. Folder Structure
17. Reference Spec Documents

---

## SECTION 1 — WHAT THIS SYSTEM IS AND WHY IT EXISTS

### The Business Problem

EduCraft currently produces academic project reports manually. A worker takes a project topic, opens Claude or ChatGPT, and prompts it chapter by chapter over 5–8 hours. They format manually. They compile references manually. They check quality manually. At ₦70,000 per Final Year Project (FYP), 40% goes to the worker (₦28,000). The business cannot scale because time is the bottleneck.

### The Target State

A worker clicks two buttons. The system does the rest.

- **"Get Research Papers"** → AI finds 40 verified references, imports to Zotero, stores abstracts
- **"Write Report"** → parallel agents generate all chapters simultaneously, document assembly runs, quality gate checks, report is ready in 30–50 minutes

Worker oversight drops from 5–8 hours to 15–30 minutes per project. AI cost per report: ₦530–785. Net saving per project: ₦18,000–22,000. At 15,000 projects/year: ₦270M–330M in annual savings.

### The Major Architectural Insight (Mode Matrix)

The original design assumed all reports could be generated in parallel — all 5 chapters at the same time, fully automated. This was wrong.

The EduCraft system serves departments across 50 universities. Reports fall into five structurally different categories based on HOW the researcher collects data. This is the Mode Matrix:

- **Mode 1 (Thematic/Argumentative):** Fully parallel. No data collection. Law, Humanities, Philosophy.
- **Mode 2 (Survey/Questionnaire):** Partial parallel. Ch.1–3 auto → PAUSE for survey → Ch.4–5 auto.
- **Mode 3 (Implementation/Build):** Two pauses. Ch.1–2 auto → PAUSE for prototype → Ch.3 auto → PAUSE for test results → Ch.4–5 auto.
- **Mode 4 (Laboratory/Experimental):** One pause. Ch.1–2 auto → PAUSE for lab data → Ch.3–5 auto.
- **Mode 5 (Secondary Data/API):** Fully automated with data fetch. Ch.1–3 auto → API fetch → Ch.4–5 auto.

The system must know the mode BEFORE any generation begins. Every pipeline decision branches from the mode.

---

## SECTION 2 — SYSTEM OVERVIEW DIAGRAM

```
CLIENT FILLS INTAKE FORM
  │  ├── Topic, department, university, supervisor, deadline
  │  ├── Project type question (plain-language mode detection)
  │  └── Additional files (supervisor TOC, department outline)
  │
  ↓
MODE CLASSIFICATION ENGINE
  │  ├── Step 1: Department-to-mode default mapping
  │  ├── Step 2: Keyword scan of project topic
  │  ├── Step 3: Intake form answer weighting
  │  └── Step 4: COO VERIFICATION CARD (must approve before generation)
  │
  ↓
RESEARCH PIPELINE (Sub-System 1)
  │  Worker clicks "Get Research Papers"
  │  ├── AI generates DOI + metadata for N references
  │  ├── Zotero import + PDF retrieval
  │  ├── Reference Verification Tier 2 (pre-writing)
  │  └── References stored in database, linked to project
  │
  ↓
PARALLEL CHAPTER GENERATION ENGINE (Sub-System 2)
  │  Worker clicks "Write Report"
  │  Mode 1: All 5 chapters parallel (no pauses)
  │  Mode 2: Ch.1–3 parallel → PAUSE (survey) → Ch.4–5 parallel
  │  Mode 3: Ch.1–2 parallel → PAUSE (prototype) → Ch.3 → PAUSE (tests) → Ch.4–5
  │  Mode 4: Ch.1–2 parallel → PAUSE (lab data) → Ch.3–5 parallel
  │  Mode 5: Ch.1–3 parallel → API FETCH (automated) → Ch.4–5 parallel
  │
  ↓
DOCUMENT ASSEMBLY (Sub-System 3)
  │  ├── Stage 1: Preliminary pages (cover, title, declaration, certification,
  │  │            dedication, acknowledgement, abstract, abbreviations)
  │  ├── Stage 2: Chapter formatting (headings, fonts, spacing, tables, equations)
  │  ├── Stage 3: Supplementary pages (references, appendices)
  │  ├── Stage 4: Document assembly (two-section: Roman prelims + Arabic body)
  │  ├── Stage 5: TOC, List of Tables, List of Figures, List of Appendices
  │  └── Stage 6: Export .docx + .pdf
  │
  ↓
QUALITY GATE (Sub-System 4)
  │  ├── Layer 1: Formatting Quality Script (71 rules, <3 seconds)
  │  ├── Layer 2: Structural Quality Check (section presence, chapter balance)
  │  ├── Layer 3: Reference Verification Tier 2 (post-writing citation check)
  │  └── Layer 4: Voice Check (banned phrases, AI-sounding prose detection)
  │  If ≥98% → auto-submit to QA queue
  │  If <98% → return to worker with specific failure report
  │
  ↓
WORKER REVIEW + DELIVERY (Sub-System 5)
  │  ├── Download .docx and .pdf
  │  ├── Optional: re-generate specific failing chapters
  │  ├── 30-minute recall window after auto-submission
  │  └── Submit for human QA (Layer 4 of Quality Standard)
```

---

## SECTION 3 — THE FIVE RESEARCH MODES

Every project maps to exactly one Research Mode. The mode is set before generation begins and cannot change during generation.

### MODE 1 — THEMATIC / ARGUMENTATIVE

**Who uses it:** Law (Doctrinal), Humanities, Philosophy, Theology, Religious Studies

**What it means:** The researcher makes an argument from primary and secondary sources. No survey. No lab. No system build. No secondary dataset. The "data" is texts, cases, and scholarship.

**Template:** TEMPLATE_B — 6-chapter thematic structure
- Chapter 1: Introduction (Problem + Aim + Thesis)
- Chapter 2: First Thematic Argument
- Chapter 3: Second Thematic Argument
- Chapter 4: Third Thematic Argument
- Chapter 5: Fourth Thematic Argument
- Chapter 6: Conclusion, Summary, and Recommendations

**Pipeline:** All chapters fully parallel. No pauses. Chapter 6 (Conclusion) waits for Ch.1 (objectives) and Ch.5 (final argument) in the same staggered-start pattern as Ch.5 in other modes.

**Data source:** Legal databases (LexisNexis, NLTD), Google Scholar, library. No external APIs.

**Agent context:** Each thematic chapter agent receives the project thesis statement, all verified references with abstracts, and the specific argumentative assignment for that chapter.

---

### MODE 2 — SURVEY / QUESTIONNAIRE

**Who uses it:** Nursing, Business (empirical), Education (empirical), Sociology, Psychology, Public Health, Mass Communication, Public Administration

**What it means:** The researcher designs a survey instrument, administers it to a population, and analyses the responses statistically (SPSS, Excel). The quantitative results form Chapter 4.

**Template:** TEMPLATE_A — Standard 5-chapter

**Pipeline:**
```
Ch.1 (Introduction)        AUTO ──┐
Ch.2 (Literature Review)   AUTO ──┤── All parallel
Ch.3 (Methodology)         AUTO ──┘
                                  ↓
                          ⏸ PAUSE: Survey administered by client/workers
                          Workers collect data, analyse in SPSS/Excel
                          Workers upload SPSS output (.sav) or Excel export
                                  ↓
Ch.4 (Results/Analysis)    AUTO ──┐── Both parallel, after data upload
Ch.5 (Conclusion)          AUTO ──┘
```

**Human handoff:** After Ch.3, the system sends a notification to the client/worker: "Methodology chapter is ready. Please administer the survey and upload the SPSS or Excel output file to continue." Generation resumes automatically when the file is uploaded.

**Ch.3 output:** Full survey methodology — research design, population, sample size (Taro Yamane), sampling technique, instrument description, validity, reliability (Cronbach's Alpha target ≥ 0.70), data collection procedure, analysis plan.

**Ch.4 input:** SPSS output file or structured Excel export. Agent reads the file and translates it into academic prose: demographic tables, reliability analysis, descriptive statistics (mean, SD), hypothesis testing (t-test, ANOVA, chi-square, regression).

---

### MODE 3 — IMPLEMENTATION / BUILD

**Who uses it:** Engineering (all branches), Computer Science (implementation track), Information Technology, Architecture, Mechatronics, Biomedical Engineering

**What it means:** The researcher designs and builds a system, prototype, or device. The report documents the design rationale, build process, and test results.

**Template:** TEMPLATE_A — Standard 5-chapter

**Pipeline:**
```
Ch.1 (Introduction)        AUTO ──┐── Parallel
Ch.2 (Literature Review)   AUTO ──┘
                                  ↓
                    ⏸ PAUSE 1: Client/worker confirms prototype specifications
                    System sends: "Please confirm the system requirements, tools,
                    and architecture to be used before we write Chapter 3."
                                  ↓
Ch.3 (System Design + Build) AUTO ──────────── Single chapter
                                  ↓
                    ⏸ PAUSE 2: System testing completed
                    Workers/client uploads: test results, performance data, UAT feedback
                                  ↓
Ch.4 (Results + Discussion) AUTO ──┐── Parallel
Ch.5 (Conclusion)           AUTO ──┘
```

**Ch.3 output:** System architecture, tools and technologies (justified), data flow diagrams (DFD), entity-relationship diagram (ERD), implementation modules, feature list mapped to objectives, testing plan.

**Ch.4 input:** Test case results table (Test ID, Description, Expected Output, Actual Output, Pass/Fail), performance benchmarks, UAT feedback, screenshots if included.

**Note:** For CS and Engineering departments, Results and Discussion are COMBINED in Chapter 4 (no separate discussion chapter). Chapter 5 evaluates the system against objectives.

---

### MODE 4 — LABORATORY / EXPERIMENTAL

**Who uses it:** Microbiology, Medical Laboratory Science (MLS), Biochemistry, Agriculture (field trials and greenhouse), Botany, Zoology, Chemistry, Food Science, Pharmacology

**What it means:** The researcher conducts experiments in a lab or field and records measurements. Statistical analysis (ANOVA, Duncan's test) determines significance.

**Template:** TEMPLATE_A — Standard 5-chapter

**Pipeline:**
```
Ch.1 (Introduction)        AUTO ──┐── Parallel
Ch.2 (Literature Review)   AUTO ──┘
                                  ↓
                    ⏸ PAUSE: Lab/field work conducted by client
                    Workers receive experimental data from client
                    Workers upload: tabulated measurements, ANOVA outputs,
                    post-hoc test results, figures/graphs
                                  ↓
Ch.3 (Materials + Methods) AUTO ──┐
Ch.4 (Results)             AUTO ──┤── All parallel, after data upload
Ch.5 (Discussion +         AUTO ──┘
      Conclusion)
```

**Important:** Chapter 3 for Mode 4 is written AFTER the lab work, not before. The researcher cannot write their materials and methods until they know what they actually did in the lab. Chapter 3 is a retrospective documentation of the experimental procedure.

**Ch.4 input:** Raw experimental data (tabulated), ANOVA table (F-value, p-value, df), post-hoc test (Duncan's MRT, Tukey HSD), figures/bar charts.

**Ch.4 output (Medical Science departments):** Results ONLY. No interpretation. Discussion is separated into Chapter 5 for MLS, Microbiology, and Nursing.

**Ch.5 for Mode 4:** Combines Discussion (interpretation of results in context of literature), Summary, Conclusion, and Recommendations.

---

### MODE 5 — SECONDARY DATA / QUANTITATIVE MODELLING

**Who uses it:** Economics, Finance, Accounting (quantitative track), Statistics, Agricultural Economics, Development Studies (quantitative)

**What it means:** The researcher downloads publicly available datasets (CBN, NBS, World Bank, NSE, IMF) and uses econometric software (EViews, Stata, R) to model relationships between variables.

**Template:** TEMPLATE_A — Standard 5-chapter

**Pipeline:**
```
Ch.1 (Introduction)        AUTO ──┐
Ch.2 (Literature Review)   AUTO ──┤── All parallel
Ch.3 (Methodology)         AUTO ──┘
                                  ↓
              🔄 AUTOMATED API FETCH (no human action needed)
              System reads: variable list + time period from Ch.3
              Fetches from: CBN API, NBS SDMX feed, World Bank WDI API, NSE data
              Formats: structured CSV per variable
              Duration: 2–5 minutes (automated, no human required)
                                  ↓
Ch.4 (Results + Analysis)  AUTO ──┐── Parallel, using fetched data
Ch.5 (Conclusion)          AUTO ──┘
```

**Ch.3 output:** Must include: research design (quantitative, secondary data), data sources named explicitly (CBN Statistical Bulletin, NBS Annual Abstract, World Bank WDI), variable definitions (with proxies and units), model specification (written equation), estimation technique (OLS, ARDL, VAR, GMM — justified), pre-estimation tests (ADF/PP unit root, Johansen cointegration, lag selection), post-estimation tests (Breusch-Godfrey serial correlation, White heteroscedasticity, Jarque-Bera normality, CUSUM stability).

**Ch.4 input:** Structured CSV from API fetch. Agent generates: descriptive statistics table, correlation matrix, unit root test table, cointegration table, main regression table (matching EViews/Stata output format), diagnostic test results, Granger causality table (if applicable).

**Ch.5 output:** Policy implications addressed to named institutions (CBN, FMF, NSE), contribution to literature, limitations (data period, structural breaks), future research directions.

---

## SECTION 4 — THE MODE MATRIX TABLE

```
╔═══════════════════╦═══════╦════════════╦════════════╦════════════╦═══════╗
║ MODE              ║ Ch. 1 ║ Ch. 2      ║ Ch. 3      ║ Ch. 4      ║ Ch. 5 ║
╠═══════════════════╬═══════╬════════════╬════════════╬════════════╬═══════╣
║ 1 — Thematic      ║ ✓AUTO ║ ✓AUTO      ║ ✓AUTO      ║ ✓AUTO      ║ ✓AUTO ║
║ (Template B: 6ch) ║       ║ (Arg 1)    ║ (Arg 2)    ║ (Arg 3)    ║(Arg 4)║
╠═══════════════════╬═══════╬════════════╬════════════╬════════════╬═══════╣
║ 2 — Survey        ║ ✓AUTO ║ ✓AUTO      ║ ✓AUTO →    ║ ✓AUTO      ║ ✓AUTO ║
║                   ║       ║            ║ ⏸ PAUSE    ║ (post-data)║       ║
╠═══════════════════╬═══════╬════════════╬════════════╬════════════╬═══════╣
║ 3 — Build         ║ ✓AUTO ║ ✓AUTO →    ║ ✓AUTO →    ║ ✓AUTO      ║ ✓AUTO ║
║                   ║       ║ ⏸ PAUSE 1  ║ ⏸ PAUSE 2  ║ (post-test)║       ║
╠═══════════════════╬═══════╬════════════╬════════════╬════════════╬═══════╣
║ 4 — Lab           ║ ✓AUTO ║ ✓AUTO →    ║ ✓AUTO      ║ ✓AUTO      ║ ✓AUTO ║
║                   ║       ║ ⏸ PAUSE    ║ (post-lab) ║ (post-lab) ║       ║
╠═══════════════════╬═══════╬════════════╬════════════╬════════════╬═══════╣
║ 5 — API Data      ║ ✓AUTO ║ ✓AUTO      ║ ✓AUTO +    ║ ✓AUTO      ║ ✓AUTO ║
║                   ║       ║            ║ 🔄API FETCH ║ (post-fetch)║      ║
╚═══════════════════╩═══════╩════════════╩════════════╩════════════╩═══════╝

Legend:
  ✓AUTO       = Agent generates automatically, no human action needed
  ⏸ PAUSE     = Generation stops; human must upload data to resume
  🔄API FETCH = System fetches data automatically; no human action needed
  (post-data) = Chapter generated after human data upload
  (post-lab)  = Chapter generated after lab data received
  (post-fetch)= Chapter generated after automated API fetch completes
```

---

## SECTION 5 — CLIENT INTAKE FLOW AND MODE ASSIGNMENT

### 5.1 The Intake Form

The intake form is filled by the CLIENT (not a worker). It collects all project data and includes the mode detection question.

**Form fields collected:**

```
Personal Information:
  - Full name
  - Email address
  - Phone number
  - University
  - Department
  - Faculty
  - Level (300, 400, 500, Postgraduate)
  - Supervisor name and title
  - HOD name and title
  - Matriculation number

Project Details:
  - Project topic / title
  - Project type (see Mode Detection Question below)
  - Minimum page count required
  - Referencing style (APA v7 default; Harvard if specified)
  - Special instructions (free text)
  - Supervisor-provided TOC (file upload, optional)
  - Department-provided outline (file upload, optional)

Payment:
  - Service type (FYP, Proposal, Term Paper, Publication)
  - Amount (auto-calculated from service + page count)

Parent reference (for preliminary pages):
  - Parent/guardian name or "Mr and Mrs [surname]"

Deadline:
  - Project submission date
```

### 5.2 The Mode Detection Question (Plain Language)

This is the most important intake form question. It must be in plain language — the client should not need to understand academic terminology to answer it.

**Question displayed on the form:**

> **How will your project collect its information?**
> 
> Pick the option that best describes what you or your supervisor expects you to do:

Options (radio buttons):

```
○  A  — I will read books, journals, and legal cases, and make an argument.
         My project is more about analysing existing knowledge than collecting new data.
         (Examples: legal analysis, historical research, literary criticism, theoretical frameworks)

○  B  — I will design a questionnaire or survey and give it to people to fill out.
         I will then analyse their responses using SPSS, Excel, or similar software.
         (Examples: nurses' attitudes survey, students' academic performance study, consumer behaviour research)

○  C  — I will design and build something — a software system, a device, a machine, or an app.
         My project involves creating something that works and then testing it.
         (Examples: hospital management system, smart irrigation device, banking app, automated attendance system)

○  D  — I will conduct experiments in a lab, a greenhouse, or a field.
         I will collect samples and measure things (bacteria growth, soil nutrients, crop yield, chemical reactions, etc.)
         (Examples: antimicrobial activity study, effect of fertiliser on maize yield, proximate analysis of food samples)

○  E  — I will download published data (from CBN, NBS, World Bank, or similar sources)
         and use statistical software to analyse trends, relationships, or models.
         (Examples: effect of exchange rate on GDP, relationship between inflation and interest rates, stock market analysis)
```

**Mapping:**
- Answer A → MODE 1 (Thematic)
- Answer B → MODE 2 (Survey)
- Answer C → MODE 3 (Build)
- Answer D → MODE 4 (Lab)
- Answer E → MODE 5 (API/Secondary Data)

### 5.3 Keyword Alert System (Automated Scan)

The system scans the project topic text immediately after form submission and flags potential mode mismatches to the COO before approval.

**Keyword → Mode flags:**

```javascript
const MODE_KEYWORDS = {
  MODE_3_BUILD: [
    'design and implementation', 'development of a', 'design and development',
    'build a', 'construction of', 'prototype', 'system design', 'web application',
    'mobile application', 'android application', 'management system',
    'information system', 'automated', 'smart system', 'iot-based'
  ],
  MODE_2_SURVEY: [
    'attitude of', 'perception of', 'knowledge of', 'awareness of',
    'factors affecting', 'effect of covid', 'prevalence of', 'assessment of',
    'determinants of', 'survey of', 'influence of', 'impact of'
  ],
  MODE_4_LAB: [
    'antimicrobial activity', 'antibacterial', 'antifungal', 'proximate analysis',
    'phytochemical', 'physicochemical', 'soil analysis', 'yield of',
    'effect of [substance]', 'isolation and characterisation',
    'formulation and evaluation', 'microbiological quality'
  ],
  MODE_5_QUANTITATIVE: [
    'time series', 'panel data', 'gdp', 'exchange rate', 'inflation',
    'interest rate', 'stock market', 'fiscal policy', 'monetary policy',
    'co-integration', 'granger causality', 'ardl', 'var model',
    /\(\d{4}[–-]\d{4}\)/  // matches year ranges like (2000–2023)
  ],
  MODE_1_THEMATIC: [
    'jurisprudence', 'doctrinal analysis', 'critical analysis of',
    'nature and scope', 'legal framework', 'constitutional', 'rights of',
    'feminist literary', 'post-colonial', 'discourse analysis', 'thematic analysis'
  ]
};

function scanTopicForModeKeywords(topic) {
  const topicLower = topic.toLowerCase();
  const flags = [];
  
  for (const [mode, keywords] of Object.entries(MODE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (keyword instanceof RegExp) {
        if (keyword.test(topic)) flags.push({ mode, trigger: keyword.toString() });
      } else if (topicLower.includes(keyword)) {
        flags.push({ mode, trigger: keyword });
      }
    }
  }
  return flags;
}
```

### 5.4 Department-to-Mode Default Mapping

If the keyword scan returns no flags and the client's intake answer is ambiguous, the system falls back to the department default:

```javascript
const DEPARTMENT_MODE_DEFAULTS = {
  // MODE 1 — THEMATIC
  'Law': 'MODE_1',
  'Jurisprudence and International Law': 'MODE_1',
  'Public Law': 'MODE_1',
  'Private and Property Law': 'MODE_1',
  'English': 'MODE_1',
  'Literature in English': 'MODE_1',
  'Linguistics': 'MODE_1',
  'History': 'MODE_1',
  'Philosophy': 'MODE_1',
  'Religious Studies': 'MODE_1',
  'Islamic Studies': 'MODE_1',
  'Theatre Arts': 'MODE_1',
  'Fine and Applied Arts': 'MODE_1',
  'Music': 'MODE_1',

  // MODE 2 — SURVEY
  'Nursing Science': 'MODE_2',
  'Nursing': 'MODE_2',
  'Public Health': 'MODE_2',
  'Business Administration': 'MODE_2',
  'Marketing': 'MODE_2',
  'Management': 'MODE_2',
  'Human Resource Management': 'MODE_2',
  'Education': 'MODE_2',
  'Science Education': 'MODE_2',
  'Psychology': 'MODE_2',
  'Sociology': 'MODE_2',
  'Social Work': 'MODE_2',
  'Mass Communication': 'MODE_2',
  'Journalism': 'MODE_2',
  'Public Administration': 'MODE_2',
  'Political Science': 'MODE_2',
  'Library and Information Science': 'MODE_2',
  'Adult Education': 'MODE_2',
  'Health Education': 'MODE_2',

  // MODE 3 — BUILD
  'Computer Science': 'MODE_3',
  'Computer Engineering': 'MODE_3',
  'Software Engineering': 'MODE_3',
  'Information Technology': 'MODE_3',
  'Information and Communication Technology': 'MODE_3',
  'Electrical and Electronic Engineering': 'MODE_3',
  'Electronic Engineering': 'MODE_3',
  'Mechanical Engineering': 'MODE_3',
  'Civil Engineering': 'MODE_3',
  'Chemical Engineering': 'MODE_3',
  'Petroleum Engineering': 'MODE_3',
  'Architecture': 'MODE_3',
  'Mechatronics Engineering': 'MODE_3',
  'Biomedical Engineering': 'MODE_3',
  'Aerospace Engineering': 'MODE_3',
  'Materials and Metallurgical Engineering': 'MODE_3',
  'Agricultural Engineering': 'MODE_3',

  // MODE 4 — LAB
  'Microbiology': 'MODE_4',
  'Medical Laboratory Science': 'MODE_4',
  'Biochemistry': 'MODE_4',
  'Chemistry': 'MODE_4',
  'Biology': 'MODE_4',
  'Botany': 'MODE_4',
  'Zoology': 'MODE_4',
  'Food Science and Technology': 'MODE_4',
  'Food Science': 'MODE_4',
  'Pharmacology': 'MODE_4',
  'Pharmacy': 'MODE_4',
  'Physiology': 'MODE_4',
  'Anatomy': 'MODE_4',
  'Medicine': 'MODE_4',
  'Veterinary Medicine': 'MODE_4',
  'Agriculture': 'MODE_4',
  'Animal Science': 'MODE_4',
  'Crop Science': 'MODE_4',
  'Soil Science': 'MODE_4',
  'Fisheries and Aquaculture': 'MODE_4',
  'Forestry and Wildlife': 'MODE_4',
  'Environmental Biology': 'MODE_4',
  'Industrial Chemistry': 'MODE_4',
  'Pure and Applied Chemistry': 'MODE_4',

  // MODE 5 — SECONDARY DATA / API
  'Economics': 'MODE_5',
  'Finance': 'MODE_5',
  'Accounting': 'MODE_5',
  'Banking and Finance': 'MODE_5',
  'Insurance': 'MODE_5',
  'Statistics': 'MODE_5',
  'Agricultural Economics': 'MODE_5',
  'Agricultural Economics and Extension': 'MODE_5',
  'Development Studies': 'MODE_5',  // note: may sometimes be MODE_2
  'Actuarial Science': 'MODE_5',

  // SPECIAL: Accounting can be either MODE_2 (audit/perception) or MODE_5 (quant)
  // Accounting: use keyword scan to determine; default to MODE_5
};

// Fallback: unknown department → flag for COO manual assignment
function getDepartmentModeDefault(department) {
  return DEPARTMENT_MODE_DEFAULTS[department] || 'UNKNOWN_FLAG_COO';
}
```

### 5.5 COO Verification Card

**No chapter is generated without COO approval of the mode assignment.**

The COO sees this card in the admin dashboard before the project enters the generation queue:

```
╔══════════════════════════════════════════════════════════════╗
║         MODE ASSIGNMENT — COO VERIFICATION REQUIRED          ║
╠══════════════════════════════════════════════════════════════╣
║ Project:         EC-00234                                    ║
║ Client:          [Student Name], [University]                ║
║ Department:      [Department]                                ║
║ Project Topic:   [Full project title]                        ║
╠══════════════════════════════════════════════════════════════╣
║ CLIENT ANSWERED: Option B (Survey/Questionnaire)             ║
║ DEPARTMENT DEFAULT: Mode 2 (Survey)                          ║
║ KEYWORD FLAGS: "perception of" → Mode 2 ✓                   ║
╠══════════════════════════════════════════════════════════════╣
║ SYSTEM RECOMMENDATION: MODE 2 — SURVEY                       ║
║ Confidence: HIGH (all three signals agree)                   ║
╠══════════════════════════════════════════════════════════════╣
║ [ ✓ APPROVE MODE 2 ]  [ CHANGE MODE ▼ ]  [ FLAG FOR REVIEW ]║
╚══════════════════════════════════════════════════════════════╝
```

**If signals conflict** (e.g., department default = Mode 5, but client answered "Survey"), the card shows:

```
╠══════════════════════════════════════════════════════════════╣
║ ⚠ CONFLICT DETECTED                                          ║
║ CLIENT ANSWERED: Option E (Secondary Data)                   ║
║ DEPARTMENT DEFAULT: Mode 2 (Accounting → Survey)             ║
║ KEYWORD FLAGS: "determinants of inflation" → Mode 5          ║
║                                                              ║
║ This project may be quantitative Accounting, not survey.     ║
║ COO must confirm before generation begins.                   ║
╠══════════════════════════════════════════════════════════════╣
```

Once COO approves, the mode is LOCKED. It cannot be changed without COO re-approval.

---

## SECTION 6 — THE PROMPT LIBRARY ARCHITECTURE

### 6.1 Folder Structure

```
prompts/
├── chapter-1/
│   ├── chapter_1_collective_prompt.docx    ← Mode Matrix Edition (v4)
│   └── README.md
│
├── chapter-2/
│   ├── chapter_2_collective_prompt.docx    ← Mode Matrix Edition (v3)
│   └── README.md
│
├── chapter-3/
│   ├── chapter_3_collective_prompt.docx    ← Mode Matrix Edition (v3)
│   └── README.md
│
├── chapter-4/
│   ├── chapter_4_collective_prompt.docx    ← Mode Matrix Edition (v2)
│   └── README.md
│
├── chapter-5/
│   ├── chapter_5_collective_prompt.docx    ← Mode Matrix Edition (v2)
│   └── README.md
│
└── preliminary-pages/
    └── preliminary_pages_prompt.md         ← v1.0 (boilerplate for all departments)
```

### 6.2 How the Prompt Library is Used at Runtime

Each collective prompt `.docx` contains department sections tagged with:
```
[DEPARTMENT: ENGINEERING]
... all prompt instructions for Engineering ...
[END DEPARTMENT: ENGINEERING]
```

At runtime, the prompt loader:
1. Identifies the project's department (from intake form)
2. Opens the collective prompt `.docx` for the chapter being generated
3. Extracts the `[DEPARTMENT: {dept_name}]` section
4. Appends the shared mode-routing instructions for the project's assigned mode
5. Appends: voice rules, formatting rules, anti-AI rules, reference rules
6. Builds the final prompt string sent to the Claude API

```javascript
// prompt_loader.js

const mammoth = require('mammoth'); // .docx to text extraction

async function loadChapterPrompt(chapterNum, department, researchMode) {
  // 1. Load the collective prompt docx
  const promptPath = `./prompts/chapter-${chapterNum}/chapter_${chapterNum}_collective_prompt.docx`;
  const { value: fullText } = await mammoth.extractRawText({ path: promptPath });
  
  // 2. Extract department section
  const deptSection = extractDepartmentSection(fullText, department);
  
  // 3. Load mode-specific routing instructions
  const modeInstructions = getModeInstructions(chapterNum, researchMode);
  
  // 4. Load shared rules
  const voiceRules = await readFile('./prompts/shared/voice_rules.md');
  const formattingRules = await readFile('./prompts/shared/formatting_rules.md');
  const antiAIRules = await readFile('./prompts/shared/anti_ai_rules.md');
  const referenceRules = await readFile('./prompts/shared/reference_rules.md');
  
  // 5. Assemble final prompt
  return `
${modeInstructions}

DEPARTMENT-SPECIFIC INSTRUCTIONS:
${deptSection}

EDUCRAFT VOICE RULES:
${voiceRules}

FORMATTING RULES:
${formattingRules}

ANTI-AI RULES — PHRASES THAT ARE NEVER ACCEPTABLE:
${antiAIRules}

REFERENCING RULES (APA v7):
${referenceRules}
  `.trim();
}

function extractDepartmentSection(text, department) {
  // Normalise department name for matching
  const deptTag = department.toUpperCase().replace(/\s+/g, '_');
  const startMarker = `[DEPARTMENT: ${deptTag}]`;
  const endMarker = `[END DEPARTMENT: ${deptTag}]`;
  
  const startIdx = text.indexOf(startMarker);
  const endIdx = text.indexOf(endMarker);
  
  if (startIdx === -1) {
    // Fallback: use faculty-level prompt
    return extractFacultyFallback(text, department);
  }
  
  return text.slice(startIdx + startMarker.length, endIdx).trim();
}

function getModeInstructions(chapterNum, researchMode) {
  // Returns the mode-specific routing text for this chapter
  // This comes from the SHARED section at the top of the collective prompt
  // OR from a mode_instructions map defined in the system
  const modeMap = {
    1: getModeInstructionsForChapter(chapterNum, 'THEMATIC'),
    2: getModeInstructionsForChapter(chapterNum, 'SURVEY'),
    3: getModeInstructionsForChapter(chapterNum, 'BUILD'),
    4: getModeInstructionsForChapter(chapterNum, 'LAB'),
    5: getModeInstructionsForChapter(chapterNum, 'API_DATA'),
  };
  return modeMap[researchMode] || modeMap[1];
}
```

### 6.3 Department Fallback (Unknown Departments)

If a department name does not exactly match a tagged section in the collective prompt, the system:
1. Tries a fuzzy match (e.g., "Electrical Engineering" → "ELECTRICAL_AND_ELECTRONIC_ENGINEERING")
2. Falls back to the faculty-level prompt if available
3. Falls back to the generic TEMPLATE_A base prompt if no faculty match

The COO is notified when a fallback is triggered, so the prompt library can be updated for that department.

---

## SECTION 7 — SUB-SYSTEM 1: RESEARCH PIPELINE

### 7.1 Trigger

Worker clicks "Get Research Papers" on their project dashboard. The project must be in `DOWNPAYMENT_VERIFIED` or later status before this button is visible.

### 7.2 Step-by-Step Flow

```
Step 1: Load project context from database
  - project_id, project_title, department, research_mode, reference_count_required

Step 2: Send research prompt to Claude API
  Input:
    "Find {N} peer-reviewed academic papers directly related to:
    
    Topic: {project_title}
    Department: {department}
    
    Requirements:
    - Papers must be directly relevant — not tangentially related
    - Include papers from the last 10 years (2014–2024) unless citing foundational work
    - For Mode 5 (quantitative economics/finance): prioritise empirical papers using
      similar econometric methods to the project's expected methodology
    - For Mode 4 (laboratory): prioritise experimental studies with measurable results
    - Return EXACTLY {N} papers
    
    Format each as a .bib entry:
    @article{key,
      author = {Last, First and Last2, First2},
      title  = {Title},
      year   = {YYYY},
      journal = {Journal Name},
      volume = {V},
      number = {N},
      pages  = {pp--pp},
      doi    = {10.xxxx/xxxxx}
    }"
  
  Output: {N} .bib entries

Step 3: Parse .bib entries, validate DOI format
  - If DOI is missing: flag the entry for Tier 2 replacement
  - Create Reference records in database (status: PENDING_VERIFICATION)

Step 4: Connect to Zotero API
  - Create collection: "{project_id} — {truncated_topic}"
  - Import all .bib entries via POST /users/{userId}/items
  - Trigger PDF retrieval for each entry
  - Store Zotero item keys in Reference records

Step 5: Run Reference Verification Tier 2 (pre-writing)
  - For each reference: send title + abstract to Claude with the Tier 2 prompt
  - Classify: CORE / CLOSELY_RELATED / TANGENTIAL / IRRELEVANT
  - PASS: ≥75% CORE+CLOSELY_RELATED AND zero IRRELEVANT
  - FAIL: flag irrelevant papers, request replacements
  - Maximum 3 replacement rounds before escalating to COO

Step 6: Generate APA v7 reference list from verified references
  - Stored in project record
  - Used for reference list page in document assembly

Step 7: Upload PDFs to Google Drive
  - Folder: EduCraft Research/{project_id}/
  - Generate share link
  - Store link in project record

Step 8: Update project status
  - researchStatus: COMPLETE
  - Unlock "Write Report" button
  - Notify worker: "Research complete. {N} verified references found."
```

### 7.3 Reference Count by Service Type

| Service Type | Default Reference Count |
|---|---|
| Final Year Project (FYP) | 40 |
| Project Proposal | 20 |
| Term Paper | 15 |
| Postgraduate (Masters) | 60 |
| Postgraduate (PhD) | 80 |

### 7.4 Zotero API Endpoints

| Action | Endpoint | Method |
|---|---|---|
| Create collection | `/users/{userId}/collections` | POST |
| Import .bib items | `/users/{userId}/items` | POST |
| Get item metadata | `/users/{userId}/items/{itemKey}` | GET |
| Get attachment (PDF) | `/users/{userId}/items/{itemKey}/file` | GET |

Zotero API key: stored in environment variable `ZOTERO_API_KEY`. One EduCraft organisational account shared across all projects.

---

## SECTION 8 — SUB-SYSTEM 2: MODE-AWARE PARALLEL CHAPTER GENERATION ENGINE

### 8.1 Orchestrator Entry Point

```javascript
// orchestrator.js

const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateReport(projectId) {
  // 1. Load project data
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { references: true, intakeForm: true, checkpoints: true }
  });
  
  // 2. Validate mode is approved
  if (!project.modeApprovedByCOO) {
    throw new Error('MODE_NOT_APPROVED: COO must approve research mode before generation.');
  }
  
  // 3. Build shared context (sent to all agents)
  const sharedContext = buildSharedContext(project);
  
  // 4. Load prompts for this department
  const prompts = await loadAllChapterPrompts(project.department, project.researchMode);
  
  // 5. Branch by research mode
  switch (project.researchMode) {
    case 1: return await generateMode1(projectId, project, sharedContext, prompts);
    case 2: return await generateMode2(projectId, project, sharedContext, prompts);
    case 3: return await generateMode3(projectId, project, sharedContext, prompts);
    case 4: return await generateMode4(projectId, project, sharedContext, prompts);
    case 5: return await generateMode5(projectId, project, sharedContext, prompts);
    default: throw new Error(`Unknown research mode: ${project.researchMode}`);
  }
}
```

### 8.2 Shared Context Builder

```javascript
function buildSharedContext(project) {
  const references = project.references
    .filter(r => r.verificationStatus === 'VERIFIED')
    .map(r => `${r.authors} (${r.year}). ${r.title}. ${r.journal}. DOI: ${r.doi}`)
    .join('\n');

  return `
═══════════════════════════════════════════════════════════
PROJECT CONTEXT — SHARED ACROSS ALL CHAPTER AGENTS
═══════════════════════════════════════════════════════════

PROJECT ID:          ${project.id}
PROJECT TOPIC:       ${project.title}
DEPARTMENT:          ${project.department}
FACULTY:             ${project.faculty}
UNIVERSITY:          ${project.university}
SUPERVISOR:          ${project.supervisorTitle} ${project.supervisorName}
PROJECT TYPE:        ${project.serviceType}
RESEARCH MODE:       Mode ${project.researchMode} (${MODE_NAMES[project.researchMode]})

CLIENT REQUIREMENTS:
  Minimum pages:     ${project.minimumPages}
  Referencing style: ${project.referencingStyle || 'APA v7'}
  Special notes:     ${project.specialInstructions || 'None'}

SUPERVISOR TOC:      ${project.supervisorTOC ? '[PROVIDED — use as structure guide]' : 'Not provided — use department template'}
DEPARTMENT OUTLINE:  ${project.departmentOutline ? '[PROVIDED — follow exactly]' : 'Not provided — use department template'}

VERIFIED REFERENCES (${project.references.length} papers):
${references}

TABLE OF CONTENTS:
${project.generatedTOC || '[Will be generated from department template]'}

═══════════════════════════════════════════════════════════
`.trim();
}
```

### 8.3 Mode 1 — Thematic (Fully Parallel)

```javascript
async function generateMode1(projectId, project, sharedContext, prompts) {
  emit(projectId, 'generation_started', { mode: 1, totalChapters: 6 });
  
  // Template B — 6 chapters
  // Ch.2–5 = thematic arguments; Ch.1 = intro; Ch.6 = conclusion
  
  // Run Ch.1–5 in parallel (all thematic arguments + intro)
  emit(projectId, 'batch_started', { chapters: [1, 2, 3, 4, 5] });
  
  const [ch1, ch2, ch3, ch4, ch5] = await Promise.all([
    generateChapter(projectId, 1, sharedContext, prompts.chapter_1, project),
    generateChapter(projectId, 2, sharedContext, prompts.chapter_2, project),
    generateChapter(projectId, 3, sharedContext, prompts.chapter_3, project),
    generateChapter(projectId, 4, sharedContext, prompts.chapter_4, project),
    generateChapter(projectId, 5, sharedContext, prompts.chapter_5, project),
  ]);
  
  // Ch.6 (Conclusion) waits for thesis summary from Ch.1 and all 4 arguments
  const thesisSummary = extractThesis(ch1);
  const argumentSummaries = [ch2, ch3, ch4, ch5].map(ch => extractArgumentSummary(ch));
  
  const ch6 = await generateChapter(projectId, 6, sharedContext, prompts.chapter_6, project, {
    thesisSummary,
    argumentSummaries
  });
  
  emit(projectId, 'generation_complete', { chapters: 6 });
  return { ch1, ch2, ch3, ch4, ch5, ch6 };
}
```

### 8.4 Mode 2 — Survey (Pause After Ch.3)

```javascript
async function generateMode2(projectId, project, sharedContext, prompts) {
  emit(projectId, 'generation_started', { mode: 2, totalChapters: 5 });
  
  // Phase 1: Generate Ch.1, 2, 3 in parallel
  emit(projectId, 'batch_started', { chapters: [1, 2, 3], phase: 'pre_survey' });
  
  const [ch1, ch2, ch3] = await Promise.all([
    generateChapter(projectId, 1, sharedContext, prompts.chapter_1, project),
    generateChapter(projectId, 2, sharedContext, prompts.chapter_2, project),
    generateChapter(projectId, 3, sharedContext, prompts.chapter_3, project),
  ]);
  
  // Save progress and pause
  await saveChapterOutputs(projectId, { ch1, ch2, ch3 });
  await setPipelineStatus(projectId, 'PAUSED_AWAITING_SURVEY_DATA');
  
  emit(projectId, 'pipeline_paused', {
    phase: 'SURVEY',
    message: 'Chapters 1–3 are complete. Please administer the survey and upload the SPSS output (.sav) or Excel export to continue.',
    uploadRequired: 'SPSS_OR_EXCEL',
    chaptersComplete: [1, 2, 3],
    chaptersRemaining: [4, 5]
  });
  
  // Wait for data upload (event-driven — resumes when worker uploads file)
  // This function returns here. The pipeline resumes via resumeMode2() below.
  return { phase: 'PAUSED', chaptersComplete: { ch1, ch2, ch3 } };
}

async function resumeMode2(projectId, uploadedDataFile) {
  const { ch1, ch2, ch3 } = await loadSavedChapters(projectId);
  const sharedContext = await buildSharedContext(await loadProject(projectId));
  const prompts = await loadAllChapterPrompts(/* ... */);
  
  // Extract objectives from Ch.1 for Ch.5
  const objectives = extractObjectives(ch1);
  
  // Parse uploaded data file
  const surveyData = await parseSurveyData(uploadedDataFile);
  
  // Phase 2: Generate Ch.4 and Ch.5
  // Ch.4 needs survey data; Ch.5 waits for Ch.1 objectives + Ch.4 findings
  
  const ch4 = await generateChapter(projectId, 4, sharedContext, prompts.chapter_4, project, {
    surveyData,
    objectives
  });
  
  const findings = extractFindings(ch4);
  
  const ch5 = await generateChapter(projectId, 5, sharedContext, prompts.chapter_5, project, {
    objectives,
    findings
  });
  
  emit(projectId, 'generation_complete', { chapters: 5 });
  return { ch1, ch2, ch3, ch4, ch5 };
}
```

### 8.5 Mode 3 — Build (Two Pauses)

```javascript
async function generateMode3(projectId, project, sharedContext, prompts) {
  emit(projectId, 'generation_started', { mode: 3, totalChapters: 5 });
  
  // Phase 1: Ch.1 + Ch.2 in parallel
  const [ch1, ch2] = await Promise.all([
    generateChapter(projectId, 1, sharedContext, prompts.chapter_1, project),
    generateChapter(projectId, 2, sharedContext, prompts.chapter_2, project),
  ]);
  
  await saveChapterOutputs(projectId, { ch1, ch2 });
  await setPipelineStatus(projectId, 'PAUSED_AWAITING_PROTOTYPE_SPECS');
  
  emit(projectId, 'pipeline_paused', {
    phase: 'PROTOTYPE_SPECS',
    message: 'Chapters 1 and 2 are complete. Please confirm: (1) the tools and technologies to be used, (2) the system architecture, and (3) the features/modules to be implemented. This will be used to write Chapter 3.',
    uploadRequired: 'PROTOTYPE_SPECS_OR_CONFIRMATION',
    chaptersComplete: [1, 2],
    chaptersRemaining: [3, 4, 5]
  });
  
  return { phase: 'PAUSED_PHASE_1', chaptersComplete: { ch1, ch2 } };
}

async function resumeMode3Phase1(projectId, prototypeSpecs) {
  const { ch1, ch2 } = await loadSavedChapters(projectId);
  const sharedContext = await buildSharedContext(await loadProject(projectId));
  const prompts = await loadAllChapterPrompts(/* ... */);
  
  const ch3 = await generateChapter(projectId, 3, sharedContext, prompts.chapter_3, project, {
    prototypeSpecs
  });
  
  await saveChapterOutputs(projectId, { ch3 });
  await setPipelineStatus(projectId, 'PAUSED_AWAITING_TEST_RESULTS');
  
  emit(projectId, 'pipeline_paused', {
    phase: 'TEST_RESULTS',
    message: 'Chapter 3 (System Design) is complete. Please conduct system testing and upload results: test case table (Pass/Fail), performance benchmarks, UAT feedback.',
    uploadRequired: 'TEST_RESULTS_AND_BENCHMARKS',
    chaptersComplete: [1, 2, 3],
    chaptersRemaining: [4, 5]
  });
  
  return { phase: 'PAUSED_PHASE_2', chaptersComplete: { ch1, ch2, ch3 } };
}

async function resumeMode3Phase2(projectId, testResults) {
  const { ch1, ch2, ch3 } = await loadSavedChapters(projectId);
  const sharedContext = await buildSharedContext(await loadProject(projectId));
  const prompts = await loadAllChapterPrompts(/* ... */);
  
  const objectives = extractObjectives(ch1);
  
  const ch4 = await generateChapter(projectId, 4, sharedContext, prompts.chapter_4, project, {
    testResults,
    objectives
  });
  
  const findings = extractFindings(ch4);
  
  const ch5 = await generateChapter(projectId, 5, sharedContext, prompts.chapter_5, project, {
    objectives,
    findings
  });
  
  emit(projectId, 'generation_complete', { chapters: 5 });
  return { ch1, ch2, ch3, ch4, ch5 };
}
```

### 8.6 Mode 4 — Lab (One Pause After Ch.2)

```javascript
async function generateMode4(projectId, project, sharedContext, prompts) {
  emit(projectId, 'generation_started', { mode: 4, totalChapters: 5 });
  
  // Phase 1: Ch.1 + Ch.2 in parallel
  const [ch1, ch2] = await Promise.all([
    generateChapter(projectId, 1, sharedContext, prompts.chapter_1, project),
    generateChapter(projectId, 2, sharedContext, prompts.chapter_2, project),
  ]);
  
  await saveChapterOutputs(projectId, { ch1, ch2 });
  await setPipelineStatus(projectId, 'PAUSED_AWAITING_LAB_DATA');
  
  emit(projectId, 'pipeline_paused', {
    phase: 'LAB_DATA',
    message: 'Chapters 1 and 2 are complete. Please conduct the lab/field work and upload: tabulated measurements, ANOVA outputs, post-hoc test results, and any figures/graphs.',
    uploadRequired: 'LAB_DATA_AND_STATISTICAL_OUTPUT',
    chaptersComplete: [1, 2],
    chaptersRemaining: [3, 4, 5]
  });
  
  return { phase: 'PAUSED', chaptersComplete: { ch1, ch2 } };
}

async function resumeMode4(projectId, labData) {
  const { ch1, ch2 } = await loadSavedChapters(projectId);
  const sharedContext = await buildSharedContext(await loadProject(projectId));
  const prompts = await loadAllChapterPrompts(/* ... */);
  
  const objectives = extractObjectives(ch1);
  
  // Ch.3, 4, and 5 all generated together after lab data received
  const [ch3, ch4] = await Promise.all([
    generateChapter(projectId, 3, sharedContext, prompts.chapter_3, project, { labData }),
    generateChapter(projectId, 4, sharedContext, prompts.chapter_4, project, { labData, objectives }),
  ]);
  
  const findings = extractFindings(ch4);
  
  const ch5 = await generateChapter(projectId, 5, sharedContext, prompts.chapter_5, project, {
    objectives,
    findings,
    labData  // Ch.5 for Mode 4 includes discussion (interpretation) of lab results
  });
  
  emit(projectId, 'generation_complete', { chapters: 5 });
  return { ch1, ch2, ch3, ch4, ch5 };
}
```

### 8.7 Mode 5 — Secondary Data / API (Automated Fetch)

```javascript
async function generateMode5(projectId, project, sharedContext, prompts) {
  emit(projectId, 'generation_started', { mode: 5, totalChapters: 5 });
  
  // Phase 1: Ch.1, 2, 3 in parallel
  const [ch1, ch2, ch3] = await Promise.all([
    generateChapter(projectId, 1, sharedContext, prompts.chapter_1, project),
    generateChapter(projectId, 2, sharedContext, prompts.chapter_2, project),
    generateChapter(projectId, 3, sharedContext, prompts.chapter_3, project),
  ]);
  
  emit(projectId, 'api_fetch_started', {
    message: 'Chapters 1–3 complete. Fetching secondary data from CBN, NBS, and World Bank...'
  });
  
  // Extract model specification from Ch.3
  const modelSpec = extractModelSpec(ch3);
  // e.g., { variables: ['GDP', 'INF', 'EXR', 'M2'], period: { start: 2000, end: 2023 }, frequency: 'annual' }
  
  // Automated data fetch (no human action required)
  const fetchedData = await fetchSecondaryData(modelSpec);
  
  emit(projectId, 'api_fetch_complete', {
    datasets: fetchedData.datasetsUsed,
    rows: fetchedData.totalRows,
    period: `${modelSpec.period.start}–${modelSpec.period.end}`
  });
  
  const objectives = extractObjectives(ch1);
  
  const ch4 = await generateChapter(projectId, 4, sharedContext, prompts.chapter_4, project, {
    fetchedData,
    modelSpec,
    objectives
  });
  
  const findings = extractFindings(ch4);
  
  const ch5 = await generateChapter(projectId, 5, sharedContext, prompts.chapter_5, project, {
    objectives,
    findings,
    modelSpec,
    policyContext: project.department
  });
  
  emit(projectId, 'generation_complete', { chapters: 5 });
  return { ch1, ch2, ch3, ch4, ch5 };
}

// API Fetch Functions
async function fetchSecondaryData(modelSpec) {
  const results = {};
  const { variables, period, frequency } = modelSpec;
  
  const fetchPromises = variables.map(variable => fetchVariableData(variable, period, frequency));
  const variableData = await Promise.all(fetchPromises);
  
  variableData.forEach((data, i) => {
    results[variables[i]] = data;
  });
  
  return {
    data: results,
    datasetsUsed: variableData.map(d => d.source),
    totalRows: variableData[0]?.values?.length || 0
  };
}

async function fetchVariableData(variable, period, frequency) {
  const API_SOURCES = {
    GDP: { source: 'World Bank WDI', indicator: 'NY.GDP.MKTP.CD', country: 'NGA' },
    INF: { source: 'CBN Statistical Bulletin', endpoint: process.env.CBN_API_URL + '/inflation' },
    EXR: { source: 'CBN Statistical Bulletin', endpoint: process.env.CBN_API_URL + '/exchange_rate' },
    M2: { source: 'CBN Statistical Bulletin', endpoint: process.env.CBN_API_URL + '/money_supply' },
    CPI: { source: 'NBS', endpoint: process.env.NBS_API_URL + '/cpi' },
    STOCK_INDEX: { source: 'NSE', endpoint: process.env.NSE_API_URL + '/index' },
    // ... extend as needed
  };
  
  // World Bank WDI example
  if (API_SOURCES[variable]?.source === 'World Bank WDI') {
    const { indicator, country } = API_SOURCES[variable];
    const url = `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&date=${period.start}:${period.end}&per_page=100`;
    const response = await fetch(url);
    const data = await response.json();
    return parseWorldBankResponse(data, variable);
  }
  
  // CBN/NBS/NSE — use environment-configured API keys
  // ...
}
```

### 8.8 Core generateChapter() Function

```javascript
async function generateChapter(projectId, chapterNum, sharedContext, chapterPrompt, project, extras = {}) {
  // Check for existing checkpoint
  const checkpoint = await getCheckpoint(projectId, chapterNum);
  if (checkpoint?.status === 'completed') {
    return checkpoint.fullOutput; // Return cached result, do not re-generate
  }
  
  // Build the full prompt
  const fullPrompt = `
${sharedContext}

═══════════════════════════════════════════════════════════
CHAPTER ${chapterNum} GENERATION INSTRUCTIONS
═══════════════════════════════════════════════════════════
${chapterPrompt}

${extras.objectives ? `\nOBJECTIVES FROM CHAPTER 1:\n${extras.objectives.map((o, i) => `${i+1}. ${o}`).join('\n')}` : ''}
${extras.findings ? `\nKEY FINDINGS FROM CHAPTER 4:\n${extras.findings}` : ''}
${extras.surveyData ? `\nSURVEY DATA (from SPSS/Excel upload):\n${JSON.stringify(extras.surveyData, null, 2)}` : ''}
${extras.labData ? `\nLABORATORY DATA:\n${JSON.stringify(extras.labData, null, 2)}` : ''}
${extras.fetchedData ? `\nSECONDARY DATA (API-fetched):\n${JSON.stringify(extras.fetchedData, null, 2)}` : ''}
${extras.testResults ? `\nSYSTEM TEST RESULTS:\n${JSON.stringify(extras.testResults, null, 2)}` : ''}
${extras.prototypeSpecs ? `\nPROTOTYPE SPECIFICATIONS:\n${extras.prototypeSpecs}` : ''}
${extras.thesisSummary ? `\nTHESIS SUMMARY (for Mode 1 conclusion):\n${extras.thesisSummary}` : ''}
${extras.argumentSummaries ? `\nARGUMENT SUMMARIES:\n${extras.argumentSummaries.join('\n\n')}` : ''}

═══════════════════════════════════════════════════════════
NOW GENERATE CHAPTER ${chapterNum}:
Write the complete chapter. Do not include the chapter title header line — the assembly system adds it. Start directly with the first section heading (e.g., "1.1 Background of the Study").
═══════════════════════════════════════════════════════════
`.trim();

  emit(projectId, 'chapter_started', { chapter: chapterNum });
  
  // Create/update checkpoint
  await upsertCheckpoint(projectId, chapterNum, 'in_progress');
  
  let fullOutput = '';
  let tokensUsed = 0;
  
  // Streaming generation with checkpoint saves
  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    messages: [{ role: 'user', content: fullPrompt }]
  });
  
  for await (const chunk of stream.text_stream) {
    fullOutput += chunk;
    tokensUsed += 1; // approximate; actual token count from final message
    
    // Save checkpoint every ~2000 tokens output
    if (fullOutput.length % 8000 < 10) { // ~2000 tokens ≈ 8000 chars
      await updateCheckpointProgress(projectId, chapterNum, fullOutput);
      const percent = Math.min(95, Math.floor(fullOutput.length / 500));
      emit(projectId, 'chapter_progress', { chapter: chapterNum, percent });
    }
  }
  
  const finalMessage = await stream.finalMessage();
  const inputTokens = finalMessage.usage.input_tokens;
  const outputTokens = finalMessage.usage.output_tokens;
  
  // Log token usage
  await logAIUsage(projectId, chapterNum, inputTokens, outputTokens);
  
  // Mark checkpoint complete
  await upsertCheckpoint(projectId, chapterNum, 'completed', fullOutput);
  
  emit(projectId, 'chapter_complete', { chapter: chapterNum, outputTokens });
  
  return fullOutput;
}
```

### 8.9 Chunked Generation (For Long Chapters)

When a chapter is expected to exceed 16,000 output tokens (approximately 12,000 words), the system splits by sections:

```javascript
async function generateChapterChunked(projectId, chapterNum, sharedContext, chapterPrompt, project, extras) {
  const sections = getChapterSections(chapterNum, project.department);
  // e.g., for Ch.2: ['Introduction', 'Conceptual Framework', 'Empirical Review', 
  //                  'Gap in Literature', 'Summary of Review']
  
  const chunks = [];
  let previousChunkTail = '';
  
  for (const section of sections) {
    const chunkPrompt = `
${sharedContext}
${chapterPrompt}

CURRENT TASK: Generate ONLY the "${section}" section of Chapter ${chapterNum}.
${previousChunkTail ? `\nCONTINUITY — Last 500 words of previous section:\n"${previousChunkTail}"\nContinue smoothly from this point.\n` : ''}

Generate the "${section}" section now:
    `.trim();
    
    const chunkOutput = await singleAPICall(chunkPrompt);
    chunks.push(chunkOutput);
    
    // Keep last 500 chars for continuity
    previousChunkTail = chunkOutput.slice(-500);
  }
  
  return chunks.join('\n\n');
}
```

---

## SECTION 9 — SUB-SYSTEM 3: DOCUMENT ASSEMBLY

### 9.1 Assembly Pipeline

```
INPUT:
  - Chapter outputs (ch1–ch5 or ch1–ch6 for Template B)
  - Project context (intake form data)
  - Verified references list (APA v7, from database)
  - Appendices files (if client uploaded any)

STAGE 1 — PRELIMINARY PAGES GENERATION
  Agent: Preliminary Pages Agent
  Prompt: prompts/preliminary-pages/preliminary_pages_prompt.md
  Input:  Project context + Ch.1 aim + Ch.4 findings + Ch.5 conclusion
  Output: Cover, Title, Declaration, Certification, Dedication,
          Acknowledgement, Abstract (250–300 words), List of Abbreviations

STAGE 2 — CHAPTER FORMATTING
  For each chapter:
  - Apply heading styles (H1 for chapter title, H2 for section, H3 for subsection)
  - Format equations in borderless 2-column tables
  - Apply three-line table formatting
  - Insert figure and table captions
  - Apply TNR 12pt, 2.0 line spacing, justified alignment
  - Ensure no paragraph first-line indentation
  - No hyphens — replace with commas or restructure

STAGE 3 — SUPPLEMENTARY PAGES
  - References list (APA v7, alphabetical, hanging indent, journal names italicised)
  - Appendices (if applicable)

STAGE 4 — DOCUMENT ASSEMBLY
  Section 1 (Preliminary):
    - Roman numeral page numbers (i, ii, iii...), centred
    - Cover page → Title page → Declaration → Certification → Dedication →
      Acknowledgement → Abstract → TOC placeholder → List of Tables →
      List of Figures → List of Abbreviations

  [SECTION BREAK — unlinked from previous]

  Section 2 (Main Body):
    - Arabic page numbers (1, 2, 3...) starting at 1, centred
    - Chapter 1 → Chapter 2 → ... → Chapter 5 (or 6)
    - References
    - Appendices

STAGE 5 — TOC, LoT, LoF, LoA
  - Table of Contents (H1–H3, NO dotted leaders)
  - List of Tables (from table captions, NO dotted leaders)
  - List of Figures (from figure captions, NO dotted leaders)
  - List of Appendices (if any)

STAGE 6 — EXPORT
  - Save as {project_id}_report.docx
  - Convert to {project_id}_report.pdf
  - Upload to project file storage (S3)
  - Link to project record in database
```

### 9.2 Abstract Generation (Special Case)

The abstract is the most data-dependent preliminary page. It must be generated by an AI call using extracted data from the completed chapters:

```javascript
async function generateAbstract(project, ch1Output, ch4Output, ch5Output) {
  const aim = extractAim(ch1Output);
  const objectives = extractObjectives(ch1Output);
  const methodology = extractMethodologySummary(ch3Output, project.researchMode);
  const findings = extractFindings(ch4Output);
  const conclusion = extractConclusion(ch5Output);
  
  const abstractPrompt = buildAbstractPrompt({
    projectTitle: project.title,
    department: project.department,
    researchMode: project.researchMode,
    aim,
    objectives,
    methodology,
    findings,
    conclusion
  });
  
  // Load preliminary pages prompt for abstract section
  const prelimPrompt = await readFile('./prompts/preliminary-pages/preliminary_pages_prompt.md');
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{ role: 'user', content: `${prelimPrompt}\n\nGenerate ONLY the abstract for this project:\n${abstractPrompt}` }]
  });
  
  const abstractText = response.content[0].text;
  
  // Validate word count
  const wordCount = abstractText.split(/\s+/).length;
  if (wordCount < 250 || wordCount > 300) {
    // Re-generate with explicit word count instruction
    return await regenerateAbstractWithWordCount(abstractText, wordCount);
  }
  
  return abstractText;
}
```

### 9.3 Document Assembly Implementation (python-docx)

```python
# assembly.py

from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import re

def assemble_report(project, chapters, prelims, references, appendices=None):
    doc = Document()
    
    # ── Set default styles ────────────────────────────────────
    set_default_style(doc)
    
    # ── SECTION 1: Preliminary pages (Roman numerals) ─────────
    section1 = doc.sections[0]
    set_margins(section1)
    set_page_numbers_roman(section1)
    
    add_cover_page(doc, project, prelims)
    add_page_break(doc)
    add_title_page(doc, project, prelims)
    add_page_break(doc)
    add_declaration(doc, project)
    add_page_break(doc)
    add_certification(doc, project)
    add_page_break(doc)
    add_dedication(doc, prelims['dedication'])
    add_page_break(doc)
    add_acknowledgement(doc, prelims['acknowledgement'])
    add_page_break(doc)
    add_abstract(doc, prelims['abstract'])
    add_page_break(doc)
    add_toc_placeholder(doc)  # Will be updated by Word when document is opened
    add_page_break(doc)
    add_list_of_tables_placeholder(doc)
    add_page_break(doc)
    add_list_of_figures_placeholder(doc)
    add_page_break(doc)
    if prelims.get('abbreviations'):
        add_abbreviations(doc, prelims['abbreviations'])
        add_page_break(doc)
    
    # ── SECTION BREAK (unlinked) ───────────────────────────────
    add_section_break(doc)
    
    # ── SECTION 2: Main body (Arabic numerals from 1) ─────────
    section2 = doc.sections[-1]
    set_margins(section2)
    set_page_numbers_arabic(section2)
    unlink_header_footer(section2)
    
    # ── Add chapters ───────────────────────────────────────────
    for chapter_num, chapter_content in enumerate(chapters, 1):
        add_chapter(doc, chapter_num, chapter_content)
        if chapter_num < len(chapters):
            add_page_break(doc)
    
    # ── References ────────────────────────────────────────────
    add_page_break(doc)
    add_references_section(doc, references)
    
    # ── Appendices ────────────────────────────────────────────
    if appendices:
        add_page_break(doc)
        add_appendices(doc, appendices)
    
    return doc

def set_default_style(doc):
    """Set Times New Roman 12pt, 2.0 spacing, justified as document default."""
    style = doc.styles['Normal']
    style.font.name = 'Times New Roman'
    style.font.size = Pt(12)
    style.paragraph_format.line_spacing = Pt(24)  # 2.0 × 12pt
    style.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    style.paragraph_format.first_line_indent = Inches(0)

def set_margins(section):
    section.top_margin = Inches(1.0)
    section.bottom_margin = Inches(1.0)
    section.left_margin = Inches(1.0)
    section.right_margin = Inches(1.0)

def format_chapter_content(doc, raw_markdown_text):
    """
    Convert AI-generated markdown-formatted chapter text to python-docx formatting.
    Handles: ##, ###, **bold**, *italic*, tables, numbered lists, equations.
    """
    lines = raw_markdown_text.split('\n')
    
    for line in lines:
        line = line.strip()
        if not line:
            doc.add_paragraph()
            continue
        
        # Heading detection
        if line.startswith('### '):
            p = doc.add_paragraph(style='Heading 3')
            p.add_run(line[4:])
        elif line.startswith('## '):
            p = doc.add_paragraph(style='Heading 2')
            p.add_run(line[3:])
        elif line.startswith('# '):
            p = doc.add_paragraph(style='Heading 1')
            p.add_run(line[2:])
        # Equation detection (lines starting with $$ or [Equation:)
        elif line.startswith('$$') or line.startswith('[Equation:'):
            add_equation_table(doc, line)
        # Table detection (lines starting with |)
        elif line.startswith('|'):
            # handled as block — collect all table lines first
            pass  # table accumulation handled in a pre-processing step
        else:
            # Regular paragraph
            p = doc.add_paragraph()
            add_formatted_run(p, line)

def add_equation_table(doc, equation_text):
    """Format equations in borderless 2-column table: left col = equation, right col = number."""
    table = doc.add_table(rows=1, cols=2)
    table.style = 'Table Grid'
    
    # Remove all borders
    for cell in table.rows[0].cells:
        tc = cell._tc
        tcPr = tc.get_or_add_tcPr()
        tcBorders = OxmlElement('w:tcBorders')
        for border_name in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']:
            border = OxmlElement(f'w:{border_name}')
            border.set(qn('w:val'), 'nil')
            tcBorders.append(border)
        tcPr.append(tcBorders)
    
    # Left cell: equation text
    clean_eq = equation_text.replace('$$', '').replace('[Equation:', '').replace(']', '').strip()
    table.rows[0].cells[0].text = clean_eq
    
    # Right cell: equation number (extracted from text if present)
    eq_num = extract_equation_number(equation_text)
    right_cell = table.rows[0].cells[1]
    right_cell.text = f'({eq_num})' if eq_num else ''
    right_cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
```

---

## SECTION 10 — SUB-SYSTEM 4: QUALITY GATE

### 10.1 Four-Layer Quality Pipeline

```
LAYER 1 — FORMATTING QUALITY SCRIPT (Python, <3 seconds)
  71 rules across 13 categories:
  - Font: TNR 12pt body, 14pt headings
  - Spacing: 2.0 line spacing, no extra space before/after paragraphs
  - Margins: 1 inch all sides
  - Tables: three-line (top + header-body divider + bottom only)
  - Equations: in borderless 2-column tables
  - Page numbers: centred, Roman prelims, Arabic body
  - References: APA v7 format, alphabetical, hanging indent
  - et al.: italicised
  - Section numbering: 1.1, 1.2, 1.2.1 (not 1.0, 1.0.1)
  - Chapter titles: CHAPTER ONE not Chapter 1
  - No first-line indent (0 indent on all body paragraphs)

LAYER 2 — STRUCTURAL QUALITY CHECK (AI-assisted, <10 seconds)
  - Section presence (all required headings for the department + mode)
  - Chapter page count balance (±20% of expected)
  - Objective traceability (each Ch.1 objective addressed in Ch.4 + Ch.5)
  - Template A vs Template B compliance
  - Reference count (meets minimum for service type)

LAYER 3 — REFERENCE VERIFICATION TIER 2 (AI, ~30 seconds)
  - For each citation in the generated chapters: is it plausibly from the
    verified reference list?
  - For each verified reference: does it appear in the report where expected?
  - PASS: ≥75% CORE+CLOSELY_RELATED, zero IRRELEVANT

LAYER 4 — VOICE CHECK (AI-assisted, ~60 seconds)
  Automated checks:
  - Scan for all banned phrases from EDUCRAFT_VOICE_v1.1.md
  - Paragraph opening words (no "Moreover", "Furthermore", "Additionally",
    "Firstly", "In conclusion", "Lastly", "In today's")
  - Vague qualifiers ("high efficiency", "good performance", "rapidly growing",
    "significant impact", "plays a crucial role")
  - Section cross-references ("as discussed in Chapter Three" — banned)
  - Paragraph length uniformity (no paragraphs under 3 sentences)
  AI checks:
  - Overall voice quality (human vs AI-sounding)
  - Technical depth vs decorative language ratio

AGGREGATE SCORE:
  Total checks: ~90 for standard Engineering FYP
  Pass threshold: ≥98% (87/90 minimum)
  CRITICAL failures: any one = automatic fail (no threshold waiver)
  MAJOR failures: each counts as one failed check
  MINOR failures: three minors = one failed check

IF PASS (≥98%): auto-submit to QA queue with 30-minute recall window
IF FAIL (<98%): return to worker with specific failure report + re-generate options
```

### 10.2 Quality Gate Failure Report (Worker View)

```
╔══════════════════════════════════════════════════════════════╗
║              QUALITY GATE — FAILED (94.4%)                   ║
╠══════════════════════════════════════════════════════════════╣
║  Score: 85 / 90 checks passed (94.4%)                       ║
║  Required: ≥98% (88 / 90)                                   ║
║  Gap: 3 more checks must pass                                ║
╠══════════════════════════════════════════════════════════════╣
║  FAILURES:                                                   ║
║                                                              ║
║  🔴 CRITICAL — Chapter 3 has inline equation (not in table)  ║
║     Location: Chapter 3, paragraph 8, "Equation 3.2"        ║
║     Fix: Move to borderless 2-column table format            ║
║                                                              ║
║  🟠 MAJOR — Chapter 2, paragraph 14 opens with "Moreover"    ║
║     Fix: Rewrite paragraph opening                           ║
║                                                              ║
║  🟠 MAJOR — "high efficiency" appears 3× in Chapter 4        ║
║     Locations: para 4, para 11, para 19                      ║
║     Fix: Replace with specific performance values            ║
║                                                              ║
║  🟡 MINOR — "et al." not italicised (2 locations in Ch.2)    ║
║     Fix: Italicise both occurrences                          ║
╠══════════════════════════════════════════════════════════════╣
║  ACTIONS:                                                    ║
║  [ Re-generate Chapter 2 ]  [ Re-generate Chapter 3 ]       ║
║  [ Re-generate Chapter 4 ]  [ Fix Formatting Only ]         ║
║  [ Run Quality Check Again ]                                 ║
╚══════════════════════════════════════════════════════════════╝
```

### 10.3 Chapter-Specific Re-Generation

When quality gate fails on specific chapters, only those chapters are re-generated:

```javascript
async function regenerateChapter(projectId, chapterNum, qualityFailures) {
  const project = await loadProject(projectId);
  const sharedContext = await buildSharedContext(project);
  const chapterPrompt = await loadChapterPrompt(chapterNum, project.department, project.researchMode);
  
  // Add quality failures as additional instructions
  const failureContext = `
IMPORTANT — PREVIOUS GENERATION HAD THESE QUALITY FAILURES.
DO NOT REPEAT THESE MISTAKES:

${qualityFailures.map(f => `- ${f.description}: ${f.fix}`).join('\n')}
`;
  
  const updatedPrompt = `${chapterPrompt}\n\n${failureContext}`;
  
  const savedExtras = await loadChapterExtras(projectId, chapterNum);
  
  // Clear old checkpoint
  await clearCheckpoint(projectId, chapterNum);
  
  return await generateChapter(projectId, chapterNum, sharedContext, updatedPrompt, project, savedExtras);
}
```

---

## SECTION 11 — SUB-SYSTEM 5: WORKER EXPERIENCE

### 11.1 Worker Dashboard View

```
PROJECT EC-00234
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Client:     Chukwuemeka Obi  |  University of Benin
Department: Computer Science
Topic:      Design and Implementation of a Hospital Management System
Mode:       Mode 3 — Implementation/Build  ✓ COO Approved

STEP 1 — RESEARCH
  Status: ✅ Complete
  Result: 40 references verified (82% CORE, 18% CLOSELY_RELATED)
  [View References]  [Share Research Folder with Client]

STEP 2 — REPORT GENERATION
  Status: ⏳ Phase 2 of 3 — Awaiting Test Results Upload
  ✅ Phase 1 complete: Chapters 1 and 2 generated
  ⏸ Paused: Upload system test results to continue
  [Upload Test Results]

STEP 3 — QUALITY CHECK
  Status: 🔒 Locked (complete generation first)

STEP 4 — REVIEW & SUBMIT
  Status: 🔒 Locked
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 11.2 Progress Dashboard (During Active Generation)

```
GENERATING REPORT — EC-00234  |  Mode 2 — Survey
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overall Progress: ████████████████░░░░  80%

CHAPTER STATUS:
  Chapter 1 — Introduction          ✅ Complete (4m 12s)
  Chapter 2 — Literature Review      ✅ Complete (6m 33s)
  Chapter 3 — Methodology            ✅ Complete (5m 48s) → ⏸ Survey sent
  Chapter 4 — Results                ⏳ Generating... 67%
  Chapter 5 — Conclusion             ⏱ Waiting for Chapter 4

CURRENT PHASE: Post-Survey — Generating analysis chapters
Estimated time remaining: ~8 minutes

NEXT STEP: Quality gate runs automatically after generation.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 11.3 Progress Events (WebSocket/SSE)

```javascript
// Events emitted during generation
{ type: "generation_started",   projectId, mode, totalChapters }
{ type: "batch_started",        projectId, chapters: [1,2,3], phase }
{ type: "chapter_started",      projectId, chapter: 2 }
{ type: "chapter_progress",     projectId, chapter: 2, percent: 67 }
{ type: "chapter_complete",     projectId, chapter: 2, durationSeconds: 393 }
{ type: "pipeline_paused",      projectId, phase, message, uploadRequired }
{ type: "api_fetch_started",    projectId, message }
{ type: "api_fetch_complete",   projectId, datasets, rows, period }
{ type: "assembly_started",     projectId }
{ type: "assembly_complete",    projectId }
{ type: "quality_check_started",projectId }
{ type: "quality_check_complete",projectId, score, passed, failures }
{ type: "report_ready",         projectId, docxUrl, pdfUrl }
{ type: "generation_failed",    projectId, error, chapterNum }
```

---

## SECTION 12 — DATABASE SCHEMA ADDITIONS

All new tables needed for the Report Production System (additions to the existing EduCraft WorkBase schema):

```prisma
// Add to schema.prisma

model ResearchMode {
  id                  String   @id @default(cuid())
  projectId           String   @unique
  project             Project  @relation(fields: [projectId], references: [id])
  
  modeNumber          Int      // 1, 2, 3, 4, or 5
  modeName            String   // "THEMATIC", "SURVEY", "BUILD", "LAB", "API_DATA"
  
  // How mode was determined
  clientIntakeAnswer  String?  // "A", "B", "C", "D", or "E"
  departmentDefault   String?  // The department's default mode
  keywordTriggers     String[] // Keywords that flagged the mode
  conflictDetected    Boolean  @default(false)
  
  // COO approval
  cooApprovedBy       String?
  cooApprovedAt       DateTime?
  cooNotes            String?
  isLocked            Boolean  @default(false) // Cannot change once generation starts
  
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

model Reference {
  id                  String   @id @default(cuid())
  projectId           String
  project             Project  @relation(fields: [projectId], references: [id])
  
  // Bibliographic data
  doi                 String?
  title               String
  authors             String
  year                Int
  journal             String?
  volume              String?
  issue               String?
  pages               String?
  abstract            String?
  url                 String?
  
  // Zotero integration
  zoteroKey           String?
  zoteroCollectionId  String?
  pdfUrl              String?  // Google Drive link
  
  // Verification
  verificationStatus  String   @default("PENDING") // PENDING, CORE, CLOSELY_RELATED, TANGENTIAL, IRRELEVANT, REPLACED
  verificationTier    Int?     // 2 = pre-writing, 3 = post-writing
  verificationNotes   String?
  
  // APA v7 formatted string
  apaFormatted        String?
  
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

model GenerationCheckpoint {
  id                  String   @id @default(cuid())
  projectId           String
  project             Project  @relation(fields: [projectId], references: [id])
  
  chapterNumber       Int
  phase               String?  // "PRE_SURVEY", "POST_SURVEY", "PRE_TEST", "POST_TEST", etc.
  status              String   @default("pending") // pending, in_progress, completed, failed, paused
  progressPercent     Int      @default(0)
  partialOutput       String?  @db.Text
  fullOutput          String?  @db.Text
  
  // Mode-specific extras stored for resume
  extrasJson          String?  @db.Text  // JSON: { surveyData, labData, testResults, etc. }
  
  inputTokens         Int      @default(0)
  outputTokens        Int      @default(0)
  
  startedAt           DateTime?
  completedAt         DateTime?
  errorMessage        String?
  
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  
  @@unique([projectId, chapterNumber])
}

model PipelinePause {
  id                  String   @id @default(cuid())
  projectId           String
  project             Project  @relation(fields: [projectId], references: [id])
  
  pausePhase          String   // "SURVEY", "PROTOTYPE_SPECS", "TEST_RESULTS", "LAB_DATA"
  pausedAt            DateTime @default(now())
  resumedAt           DateTime?
  
  // What was uploaded to resume
  uploadedFileUrl     String?
  uploadedFileType    String?  // "SPSS", "EXCEL", "TEST_RESULTS", "LAB_DATA"
  uploadedBy          String?  // worker userId
  
  // Parsed data (stored for re-generation fallback)
  parsedDataJson      String?  @db.Text
  
  status              String   @default("WAITING") // WAITING, RESUMED, EXPIRED
  
  @@unique([projectId, pausePhase])
}

model AIUsageLog {
  id                  String   @id @default(cuid())
  projectId           String?
  project             Project? @relation(fields: [projectId], references: [id])
  workerId            String?
  worker              Worker?  @relation(fields: [workerId], references: [id])
  
  subsystem           String   // "research_pipeline", "chapter_generation", "quality_gate", "assembly", "preliminary_pages"
  chapterNumber       Int?
  phase               String?  // for paused pipeline modes: "PRE_SURVEY", "POST_SURVEY", etc.
  
  model               String   // "claude-sonnet-4-6"
  inputTokens         Int
  outputTokens        Int
  totalTokens         Int
  costNaira           Float
  durationMs          Int
  status              String   // "success", "failed", "truncated"
  
  createdAt           DateTime @default(now())
}

model GenerationQueue {
  id                  String   @id @default(cuid())
  projectId           String   @unique
  project             Project  @relation(fields: [projectId], references: [id])
  workerId            String
  
  priority            Int      @default(0)  // 0 = normal, 1 = urgent
  status              String   @default("queued")  // queued, processing, completed, failed
  
  queuedAt            DateTime @default(now())
  startedAt           DateTime?
  completedAt         DateTime?
  
  estimatedStartTime  DateTime?
  queuePosition       Int?
}

model QualityReport {
  id                  String   @id @default(cuid())
  projectId           String
  project             Project  @relation(fields: [projectId], references: [id])
  
  // Scores
  totalChecks         Int
  checksPassed        Int
  qualityScore        Float    // percentage
  passed              Boolean
  
  // Layer scores
  formattingScore     Float
  structuralScore     Float
  referenceScore      Float
  voiceScore          Float
  
  // Failures (JSON array of failure objects)
  failuresJson        String   @db.Text
  
  // Actions taken
  reGeneratedChapters Int[]    // chapter numbers that were re-generated after this report
  
  createdAt           DateTime @default(now())
}

// Add to Project model:
// researchPipelineStatus  String?   // "NOT_STARTED", "IN_PROGRESS", "COMPLETE"
// generationStatus        String?   // "NOT_STARTED", "IN_PROGRESS", "PAUSED", "COMPLETE", "FAILED"
// generationPhase         String?   // mode-specific: "PRE_SURVEY", "AWAITING_LAB_DATA", etc.
// docxUrl                 String?
// pdfUrl                  String?
// qualityScore            Float?
// qualityPassedAt         DateTime?
// autoSubmittedToQA       Boolean?
// recallWindowExpiresAt   DateTime?
```

---

## SECTION 13 — API ENDPOINTS

```
Research Pipeline:
  POST /api/projects/:id/research/start
  GET  /api/projects/:id/research/status
  GET  /api/projects/:id/references
  DELETE /api/projects/:id/references/:refId  (remove and replace)

Mode Classification:
  GET  /api/projects/:id/mode
  POST /api/projects/:id/mode/approve     (COO action)
  PUT  /api/projects/:id/mode/change      (COO action, pre-generation only)

Generation:
  POST /api/projects/:id/generate/start
  GET  /api/projects/:id/generate/status
  POST /api/projects/:id/generate/upload-data   (resume after pause — multipart form data)
  POST /api/projects/:id/generate/resume        (after data upload processed)
  POST /api/projects/:id/generate/regenerate-chapter  (body: { chapterNum, qualityFailures })
  DELETE /api/projects/:id/generate/cancel

Quality:
  POST /api/projects/:id/quality/run
  GET  /api/projects/:id/quality/latest-report

Document:
  GET  /api/projects/:id/documents/docx   (download)
  GET  /api/projects/:id/documents/pdf    (download)

Progress (SSE):
  GET  /api/projects/:id/progress/stream  (text/event-stream)
```

---

## SECTION 14 — TOKEN COST MODEL

### Per-Report Cost Breakdown

| Component | Low Estimate | High Estimate | Notes |
|---|---|---|---|
| Research Pipeline | ₦60 | ₦110 | Research query + Tier 2 verification |
| Ch.1 Generation | ₦60 | ₦80 | ~10K input, ~6K output |
| Ch.2 Generation | ₦100 | ₦140 | ~16K input (references + abstracts), ~12K output |
| Ch.3 Generation | ₦100 | ₦130 | ~14K input, ~12K output |
| Ch.4 Generation | ₦80 | ₦110 | ~12K input, ~10K output |
| Ch.5 Generation | ₦50 | ₦70 | ~10K input, ~4K output |
| Preliminary Pages | ₦15 | ₦25 | Abstract + dedication + acknowledgement |
| Document Assembly | ₦0 | ₦0 | python-docx (no AI tokens) |
| Quality Gate | ₦55 | ₦90 | Voice check + reference check |
| Re-generation (~20% amortised) | ₦12 | ₦28 | Single chapter re-run × 0.2 |
| **TOTAL PER FYP** | **₦532** | **₦783** | |

### Mode-Specific Cost Variations

| Mode | Modifier | Reason |
|---|---|---|
| Mode 1 (Thematic, 6 chapters) | +₦70–100 | Extra chapter (Ch.6 Conclusion) |
| Mode 2 (Survey) | +₦20–40 | SPSS data parsing step |
| Mode 3 (Build, 2 pauses) | +₦0 | Same token count, just spread over time |
| Mode 4 (Lab) | +₦0 | Same token count |
| Mode 5 (API) | +₦15–30 | API fetch + data formatting step |

### Revenue Context

At ₦70,000 per FYP: AI cost = **0.76–1.12% of revenue**.
Worker oversight cost: ₦5,000–10,000 (30 minutes @ skilled worker rate).
Total automated cost: ~₦6,000–11,000 vs ₦28,000 manual = **₦17,000–22,000 saved per project**.

---

## SECTION 15 — BUILD PHASES (IMPLEMENTATION ORDER)

### Phase D1 — Prompt Library Setup (Week 1)

- [ ] Create `prompts/` folder structure
- [ ] Verify Chapter 1–5 collective prompt .docx files are in place (Mode Matrix v4/v3/v2)
- [ ] Create `prompts/preliminary-pages/preliminary_pages_prompt.md` ✅ DONE
- [ ] Create `prompts/shared/voice_rules.md` (extract from EDUCRAFT_VOICE_v1.1.md)
- [ ] Create `prompts/shared/formatting_rules.md` (extract from formatting quality spec)
- [ ] Create `prompts/shared/anti_ai_rules.md` (extract banned phrases from Voice spec)
- [ ] Create `prompts/shared/reference_rules.md` (APA v7 in-text citation rules)
- [ ] Build `prompt_loader.js`: reads .docx, extracts department section, appends shared rules
- [ ] Test prompt loader: verify correct department section extraction for 5 departments

### Phase D2 — Single Chapter Generation (Week 1–2)

- [ ] Build `generateChapter()` function with streaming
- [ ] Build token usage logging to AIUsageLog
- [ ] Build checkpoint creation/update/recovery
- [ ] Build progress event emission (SSE)
- [ ] Test: generate one Engineering chapter, validate voice and formatting
- [ ] Test: generate one Nursing chapter (Mode 2 dept)
- [ ] Test: generate one Economics chapter (Mode 5 dept)

### Phase D3 — Mode Classification Engine (Week 2)

- [ ] Add ResearchMode table to database schema
- [ ] Build `getDepartmentModeDefault()` with full department mapping
- [ ] Build `scanTopicForModeKeywords()` with keyword lists
- [ ] Build intake form mode detection question (5 options A–E)
- [ ] Build COO verification card in admin dashboard
- [ ] Build mode locking (cannot change after generation starts)
- [ ] Test: submit 10 test projects, verify correct mode assignment

### Phase D4 — Parallel Orchestrator (Week 2–3)

- [ ] Build `generateReport()` orchestrator with mode branching
- [ ] Build `generateMode1()` — fully parallel
- [ ] Build `generateMode2()` — pause after Ch.3
- [ ] Build `generateMode3()` — two pauses
- [ ] Build `generateMode4()` — pause after Ch.2
- [ ] Build `generateMode5()` — automated API fetch
- [ ] Build `resumeModeX()` functions for each paused mode
- [ ] Build pause notification system (email + in-app)
- [ ] Build data upload handler (multipart form, parse SPSS/Excel/test results)
- [ ] Test: full generation for one project per mode

### Phase D5 — Secondary Data API Fetch (Mode 5, Week 3)

- [ ] Build World Bank WDI API integration
- [ ] Build CBN API integration (or scraper if no API available)
- [ ] Build NBS SDMX API integration (or scraper)
- [ ] Build NSE data integration
- [ ] Build `extractModelSpec()` (reads variables and time period from Ch.3 output)
- [ ] Build `fetchSecondaryData()` orchestrator
- [ ] Build CSV formatter for fetched data
- [ ] Test: fetch GDP + INF + EXR for 2000–2023 Nigeria

### Phase D6 — Progress Tracking + Worker Dashboard UI (Week 3)

- [ ] Build SSE endpoint `/api/projects/:id/progress/stream`
- [ ] Build progress event emitter in orchestrator
- [ ] Build worker progress dashboard UI (live chapter status, percent bars)
- [ ] Build pause display (phase-specific message + upload button)
- [ ] Build pipeline status display (paused, generating, complete)
- [ ] Build generation queue display (position + estimated start time)

### Phase D7 — Document Assembly (Week 4–5)

- [ ] Build `assembly.py` with python-docx
- [ ] Build preliminary pages generator (all 8 pages)
- [ ] Build abstract AI generation (with 250–300 word count validation)
- [ ] Build chapter formatter (markdown → docx styles)
- [ ] Build equation table formatter (borderless 2-column)
- [ ] Build three-line table formatter
- [ ] Build section break + dual page numbering (Roman + Arabic)
- [ ] Build TOC, LoT, LoF, LoA placeholder insertion
- [ ] Build references section (APA v7, alphabetical, hanging indent)
- [ ] Build .docx → .pdf export
- [ ] Build S3 upload + URL storage
- [ ] Test: assemble complete report, check all formatting in Word

### Phase D8 — Quality Gate (Week 5–6)

- [ ] Integrate Formatting Quality Script (existing spec doc)
- [ ] Build Structural Quality Checker (section presence, page count)
- [ ] Build Reference Verification Tier 2 (post-writing)
- [ ] Build Voice Check (banned phrase scanner + AI voice quality check)
- [ ] Build aggregate quality score calculation
- [ ] Build quality failure report display (worker-facing)
- [ ] Build chapter-specific re-generation with failure context
- [ ] Build auto-submit logic (≥98% → QA queue, 30-minute recall window)
- [ ] Test: run quality gate on 3 generated reports, verify failures are caught

### Phase D9 — Research Pipeline + Zotero (Week 6–7)

- [ ] Build Zotero API client (create collection, import .bib, get PDFs)
- [ ] Build Google Drive upload + share link generation
- [ ] Build reference .bib parser
- [ ] Build Reference Verification Tier 2 pre-writing
- [ ] Build "Get Research Papers" button + backend flow
- [ ] Build research progress indicator (worker dashboard)
- [ ] Test: full research pipeline for 3 different department projects

### Phase D10 — Generation Queue + Token Monitoring (Week 7)

- [ ] Build FIFO generation queue with priority
- [ ] Build queue processor (max N concurrent generations)
- [ ] Build queue position display for workers
- [ ] Build admin token monitoring dashboard
- [ ] Build per-project, per-worker, per-subsystem cost views
- [ ] Build monthly spend tracking and alerting

### Phase D11 — End-to-End Testing + Polish (Week 8)

- [ ] Run 10 complete test projects (2 per mode)
- [ ] Validate chapter quality against EduCraft Voice standard
- [ ] Validate document formatting in Microsoft Word
- [ ] Validate quality gate catches real formatting and voice issues
- [ ] Load test: 5 concurrent project generations
- [ ] Fix all bugs identified in testing
- [ ] Worker UAT: 2 workers use the system on real projects

---

## SECTION 16 — FOLDER STRUCTURE

```
educraft/
├── src/
│   ├── report-production/
│   │   ├── orchestrator.js          ← Main entry point
│   │   ├── modes/
│   │   │   ├── mode1-thematic.js
│   │   │   ├── mode2-survey.js
│   │   │   ├── mode3-build.js
│   │   │   ├── mode4-lab.js
│   │   │   └── mode5-api.js
│   │   ├── prompt-loader.js         ← .docx reader + department extraction
│   │   ├── chapter-generator.js     ← generateChapter() with streaming + checkpoints
│   │   ├── context-builder.js       ← buildSharedContext()
│   │   ├── data-extractors.js       ← extractObjectives(), extractFindings(), etc.
│   │   ├── api-fetch/
│   │   │   ├── world-bank.js
│   │   │   ├── cbn.js
│   │   │   ├── nbs.js
│   │   │   └── nse.js
│   │   ├── assembly/
│   │   │   ├── assembly.py          ← python-docx assembly pipeline
│   │   │   ├── formatters/
│   │   │   │   ├── chapter_formatter.py
│   │   │   │   ├── equation_formatter.py
│   │   │   │   ├── table_formatter.py
│   │   │   │   └── reference_formatter.py
│   │   │   └── prelims_generator.py
│   │   ├── quality/
│   │   │   ├── quality-gate.js      ← Chain all 4 layers
│   │   │   ├── formatting-check.py  ← 71 formatting rules
│   │   │   ├── structural-check.js
│   │   │   ├── reference-check.js   ← Tier 2 post-writing
│   │   │   └── voice-check.js
│   │   └── queue/
│   │       ├── generation-queue.js
│   │       └── queue-processor.js
│   │
│   ├── research-pipeline/
│   │   ├── research-pipeline.js
│   │   ├── zotero-client.js
│   │   ├── google-drive-client.js
│   │   └── reference-verifier.js
│   │
│   ├── mode-classification/
│   │   ├── mode-classifier.js       ← Department defaults + keyword scan
│   │   ├── department-defaults.js   ← Full mapping (60+ departments)
│   │   └── keyword-patterns.js      ← Keyword lists per mode
│   │
│   └── api/
│       ├── generation.routes.js
│       ├── research.routes.js
│       ├── mode.routes.js
│       ├── quality.routes.js
│       └── progress.sse.js
│
└── prompts/
    ├── chapter-1/
    │   └── chapter_1_collective_prompt.docx  (v4 — Mode Matrix)
    ├── chapter-2/
    │   └── chapter_2_collective_prompt.docx  (v3 — Mode Matrix)
    ├── chapter-3/
    │   └── chapter_3_collective_prompt.docx  (v3 — Mode Matrix)
    ├── chapter-4/
    │   └── chapter_4_collective_prompt.docx  (v2 — Mode Matrix)
    ├── chapter-5/
    │   └── chapter_5_collective_prompt.docx  (v2 — Mode Matrix)
    ├── preliminary-pages/
    │   └── preliminary_pages_prompt.md        (v1 — boilerplate)
    └── shared/
        ├── voice_rules.md
        ├── formatting_rules.md
        ├── anti_ai_rules.md
        └── reference_rules.md
```

---

## SECTION 17 — REFERENCE SPEC DOCUMENTS

All reference documents are in `/mnt/user-data/outputs/`:

| Document | Contents | Used In |
|---|---|---|
| `EDUCRAFT_VOICE_v1.1.md` | Five principles, banned phrases, paragraph rules | Shared voice rules, quality gate voice check |
| `EDUCRAFT_FORMATTING_QUALITY_SCRIPT_v1.md` | 71 formatting rules, severity levels | Quality Gate Layer 1 |
| `EDUCRAFT_STRUCTURAL_QUALITY_v1.1.md` | Section presence, chapter balance, objective traceability | Quality Gate Layer 2 |
| `EDUCRAFT_REFERENCE_VERIFICATION_SYSTEM_v1.md` | Tier 2 + Tier 3 verification logic | Research pipeline + post-writing check |
| `EDUCRAFT_QUALITY_STANDARD_v1.md` | Master quality framework | All quality layers |
| `EDUCRAFT_Chapter1_Collective_Prompt_v4.docx` | Ch.1 prompts, all departments, Mode Matrix | Chapter 1 generation |
| `EDUCRAFT_Chapter2_Collective_Prompt_v3.docx` | Ch.2 prompts, all departments, Mode Matrix | Chapter 2 generation |
| `EDUCRAFT_Chapter3_Collective_Prompt_v3.docx` | Ch.3 prompts, all departments, Mode Matrix | Chapter 3 generation |
| `EDUCRAFT_Chapter4_Collective_Prompt_v2.docx` | Ch.4 prompts, all departments, Mode Matrix | Chapter 4 generation |
| `EDUCRAFT_Chapter5_Collective_Prompt_v2.docx` | Ch.5 prompts, all departments, Mode Matrix | Chapter 5 generation |
| `EDUCRAFT_Classification_Pipeline_Spec.docx` | Full mode classification spec, COO card, keyword lists | Mode classification engine |
| `prompts/preliminary-pages/preliminary_pages_prompt.md` | Boilerplate for all 8 preliminary pages | Preliminary pages generation |

---

## APPENDIX A — PROMPT LIBRARY SHARED RULES (EXTRACT FROM VOICE SPEC)

The following shared rules are appended to EVERY chapter prompt at runtime. They are distilled from `EDUCRAFT_VOICE_v1.1.md`. Maintain the full version in the shared rules file; this is the summary:

**Anti-AI Phrases (NEVER appear in any output):**
- "In today's rapidly evolving technological landscape"
- "It is important to note that"
- "It should be noted that"
- "Firstly, ... Secondly, ... Lastly,"
- "Moreover" / "Furthermore" / "Additionally" as paragraph openers
- "plays a crucial role"
- "significant impact"
- "rapidly growing"
- "this study aims to"
- "the importance of this study cannot be overstated"

**Voice Rules (apply always):**
- Every paragraph starts with an author-attributed statement or a direct claim, never a transition word
- Every quantitative claim must have a citation or a specific value
- No vague qualifiers ("high efficiency" → replace with actual efficiency value)
- No section cross-references ("as discussed in Chapter Three" — banned)
- Minimum paragraph length: 3 sentences
- No hyphens anywhere — use commas or restructure
- et al. always italicised
- Department-specific heading numbering (1.1, not 1.0)

---

## APPENDIX B — DATA UPLOAD FORMATS

When the pipeline pauses for human data, the system accepts these file formats:

| Mode | Pause Phase | Accepted Formats | Parser |
|---|---|---|---|
| Mode 2 | Survey data | .sav (SPSS), .xlsx (Excel), .csv | SPSS output parser / Excel parser |
| Mode 3 | Prototype specs | .pdf, .docx, .txt, form submission | Text extraction |
| Mode 3 | Test results | .xlsx, .csv, .pdf, .txt | Excel/CSV parser |
| Mode 4 | Lab data | .xlsx, .csv, .pdf | Excel/CSV parser + PDF OCR |

**SPSS .sav parsing:** Use `savReaderWriter` (Python library) to extract frequency tables, means, ANOVA outputs, and regression coefficients. Format as structured JSON for the Ch.4 agent.

**Excel parsing:** Use `openpyxl` (Python) or `xlsx` (Node.js) to extract tables. Identify relevant sheets by header keywords (Frequency, Reliability, Regression, ANOVA, etc.).

---

*EDUCRAFT REPORT PRODUCTION SYSTEM — Version 2.0*
*This document is the complete build specification for the EduCraft Parallel Generation Engine.*
*Last updated: September 2026*
*Reference for Claude Code: paste this document as context before beginning any Phase D–E build task.*
