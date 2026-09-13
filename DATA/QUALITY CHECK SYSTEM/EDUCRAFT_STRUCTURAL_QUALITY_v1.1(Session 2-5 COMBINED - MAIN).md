# EDUCRAFT STRUCTURAL QUALITY STANDARD

## Layer 1 of the EduCraft Quality Standard — Version 1.1 (Prince-Validated)

---

## WHAT THIS DOCUMENT IS

Structural Quality asks one question: **does the report exist as it should?**

Not "is the writing good" (that's Voice — Layer 2a). Not "is it formatted correctly" (that's Formatting — Layer 3). Not "is it ready to send" (that's Delivery — Layer 4).

Structural Quality is about the *skeleton* of the document: which chapters exist, which sections exist inside each chapter, whether the page counts make sense, whether preliminary and supplementary pages are complete.

This layer is almost entirely automatable. A Python script reading a `.docx` file can answer 90% of these checks in under a second. The remaining 10% require a human or AI to interpret whether the actual content matches the expected structure.

---

## THE PRECEDENCE HIERARCHY

Structural rules are applied in this order. Higher-precedence rules override lower-precedence rules where they conflict.

```
LEVEL 1: UNIVERSAL RULES        (bottom — always apply)
LEVEL 2: TEMPLATE RULES         (Template A or Template B)
LEVEL 3: DEPARTMENT RULES       (Engineering, Nursing, Law, etc.)
LEVEL 4: CLIENT INSTRUCTIONS    (top — override everything if in writing)
```

**Example:**

A Nursing project defaults to Template A + NMCN Department Rules. The NMCN rules specify that Chapter 5 must be titled "Discussion of Findings" (not "Summary, Conclusion and Recommendations" which is the Template A default). The NMCN rule wins.

But if the client uploads a supervisor's TOC saying Chapter 5 should be titled "Findings, Discussion, and Implications," the supervisor's TOC wins over NMCN. Client instructions are highest precedence.

**The key architectural rule:** the automated checker must be told which precedence level applies to each project before it runs. This is captured at intake.

---

## THE SUPERVISOR-PROVIDED STRUCTURE OVERRIDE

This is critical. Real EduCraft clients frequently arrive saying "my supervisor gave me this structure." When this happens, the entire structural check switches from template-based to supervisor-based.

### Intake Requirements

The intake form must capture the following before assigning a project:

| Field | Type | Purpose |
|---|---|---|
| Has your supervisor provided a specific TOC/structure? | Yes / No / Not Sure | Triggers the override |
| If Yes — Upload the supervisor's TOC | File upload (image, PDF, or Word) | Ground truth |
| If Yes — Or type the TOC directly | Structured text field | Alternative to upload |
| Specific section names required by supervisor | Free text | Custom naming |
| Sections to omit or add | Free text | Deviations from template |
| Specific chapter count (if not standard 5) | Number | Non-standard structures |

### Override Behaviour

**When a supervisor's TOC is provided:**

1. The system parses the supervisor's TOC into a structured schema
2. The automated checker uses the parsed TOC as the ground truth
3. Template A/B rules are **suspended** for structural checks
4. Universal rules **still apply** (References must exist, preliminary pages must exist, etc.)
5. Formatting and Voice rules still apply as normal
6. The parsed TOC is stored with the project record for future reference

**When "Not Sure" is selected:**

The project is flagged for a 30-second admin check before assignment. The admin either confirms no custom structure is needed (proceed with template) or requests the TOC from the client. This prevents projects from being assigned and worked on before this critical decision is made.

**When no TOC is provided (default):**

Template A or Template B rules apply, based on the department mapping in Level 3.

---

## LEVEL 1 — UNIVERSAL STRUCTURAL RULES

These rules apply to **every** EduCraft academic report regardless of department, template, or client instructions. Even a supervisor cannot override these — they are the definition of what makes something a complete academic report.

### 1.1 Required Sections Every Report Must Contain

| # | Section | Method | Pass Rule |
|---|---|---|---|
| U1 | Cover page | Script | First page contains project title, student name, institution, date |
| U2 | Title page | Script | Second page, similar to cover but with "By" and matric number |
| U3 | Declaration | Script | Page exists with signed declaration statement |
| U4 | Certification / Approval page | Script | Page exists with supervisor and HOD signature fields |
| U5 | Abstract | Script | Section exists with heading "Abstract" |
| U6 | Table of Contents | Script | Section exists, populated (not empty) |
| U7 | Main body (chapters) | Script | At least one chapter present with numbered sections |
| U8 | References | Script | Section exists with entries |

**Any missing section from U1–U8 → HARD REJECT.** The report cannot be delivered.

### 1.2 Conditionally Required Sections

| # | Section | Required When | Method |
|---|---|---|---|
| U9 | Dedication | If any dedication data was collected at intake | Script |
| U10 | Acknowledgments | If any acknowledgment names were provided at intake | Script |
| U11 | List of Figures | If report contains 3 or more figures | Script |
| U12 | List of Tables | If report contains 3 or more tables | Script |
| U13 | List of Abbreviations / Nomenclature | If Engineering or scientific and contains 5+ specialized abbreviations | Script + AI |
| U14 | Appendices | If any supplementary material was collected at intake | Script |

Missing conditionally required section → **REVISION NEEDED** (not hard reject).

### 1.3 Universal Page Count Rules

| Service Tier | Page Range | Padding Flag (20% above max) |
|---|---|---|
| Final Year Project — Engineering | 70–110 | Flag above 132 |
| Final Year Project — Medical/Laboratory Sciences | 85–110 | Flag above 132 |
| Final Year Project — Arts/Humanities | 70–90 | Flag above 108 |
| Final Year Project — Business/Nursing/Law | 70–100 | Flag above 120 |
| Final Year Proposal | 15–20 | Flag above 24 |
| Seminar Report | 50–60 | Flag above 72 |
| Term Paper | 25–30 | Flag above 36 |
| IT Report | 40–60 | Flag above 72 |
| Publication Report | 5–8 | Flag above 10 |

**Outside range on the low side → REVISION NEEDED (too thin).**
**Outside range on the high side beyond the padding flag → REVISION NEEDED (padding suspected — human checks whether the extra content is justified or filler).**

The padding rule is template-aware because different departments genuinely produce longer reports (Medical/Science projects have more laboratory procedures and data tables). The threshold is always 20% above the maximum of the department's expected range.

### 1.4 Universal Chapter Numbering Rules

- Chapters are numbered with **words only**: "Chapter One," "Chapter Two," etc. Not "Chapter 1." This is the EduCraft standard based on Nigerian university convention.
- Section numbers use decimal format: 1.1, 1.2, 1.3, 2.1, 2.2
- Sub-section numbers extend the decimal: 1.1.1, 1.1.2, 3.3.1
- No section number goes beyond three levels (1.1.1.1 is not acceptable)
- Some departments start each chapter with X.0 Introduction (e.g., 1.0 Introduction, 2.0 Introduction) — this is acceptable and department-specific

### 1.5 Universal Reference List Rules

- References section must exist and contain entries
- Every citation used in-text must appear in the References list
- Every References entry must be cited at least once in-text
- All visual sources (figures, tables, images) cited in-text must appear in References
- References must be in alphabetical order by author surname (unless the department uses numbered referencing like IEEE)
- Reference count minimums (validated by Prince):

| Service | Minimum References | Typical Range |
|---|---|---|
| Final Year Project (Full) | 35 | 35–70+ |
| Seminar Report | 25 | 25–34 |
| Term Paper | 15 | 15–20 |
| Publication Report | 15 | 15–30 |
| Final Year Proposal | 15 | 15–25 |

---

## LEVEL 2 — TEMPLATE RULES

### 2.1 TEMPLATE A — Analytical / Empirical Structure

**Used by default for:**
- Engineering (all disciplines)
- Sciences (Chemistry, Physics, Biology, Biochemistry, etc.)
- Computer Science
- Business / Accounting / Marketing / Finance
- Nursing / Public Health / Medical Sciences
- Social Sciences with data (Psychology, Sociology, Economics)
- Agriculture
- Education (research-based studies)

**Chapter Structure:**

| Chapter | Title (default) | Page Range | Purpose |
|---|---|---|---|
| Chapter 1 | Introduction | 12–14 | Frames the project |
| Chapter 2 | Literature Review | 20–25 | Synthesis of prior work |
| Chapter 3 | Methodology / Materials and Methods | 25–30 | The methodology (meaty chapter) |
| Chapter 4 | Results / Data Analysis / Presentation of Findings | 20–25 | Findings |
| Chapter 5 | Summary, Conclusion, and Recommendations | 5–8 | Closure |

**Chapter 1 — Required Sub-Sections:**

| # | Section | Method |
|---|---|---|
| A1.1 | Background of the Study | Script (section header check) + AI (content check) |
| A1.2 | Statement of the Problem | Script + AI |
| A1.3 | Aim and Objectives | Script + AI |
| A1.4 | Significance of the Study | Script + AI |
| A1.5 | Scope of the Study | Script + AI |
| A1.6 | Definition of Terms / Operational Definitions | Script (may be optional depending on department) |

**Chapter 2 — Required Sub-Sections:**

| # | Section | Method |
|---|---|---|
| A2.1 | Conceptual Review / Review of Related Theories | Script + AI |
| A2.2 | Empirical Review / Review of Related Works | Script + AI |
| A2.3 | Theoretical Framework | Script + AI (may be inside 2.1 for some departments) |
| A2.4 | Research Gap | Script + AI |
| A2.5 | Summary / Conclusion of the Review | Script + AI |

**Chapter 3 — Required Sub-Sections:**

The exact sub-sections vary heavily by department (see Level 3 overrides). Universal minimum:

| # | Section | Method |
|---|---|---|
| A3.1 | Research Design / Approach | Script + AI |
| A3.2 | Method of Data Collection / Materials | Script + AI |
| A3.3 | Method of Data Analysis / Design Procedure | Script + AI |
| A3.4 | (Department-specific — see Level 3) | Script + AI |

**Chapter 4 — Required Sub-Sections:**

| # | Section | Method |
|---|---|---|
| A4.1 | Presentation of Data / Results | Script + AI |
| A4.2 | Analysis and Interpretation | Script + AI |
| A4.3 | Discussion of Findings | Script + AI |
| A4.4 | Answering the Research Questions / Hypotheses (if applicable) | Script + AI |

**Chapter 5 — Required Sub-Sections:**

| # | Section | Method |
|---|---|---|
| A5.1 | Summary of Findings | Script + AI |
| A5.2 | Conclusion | Script + AI |
| A5.3 | Recommendations | Script + AI |
| A5.4 | Suggestions for Further Studies | Script + AI |
| A5.5 | Limitations of the Study | Script + AI |

**Objective Traceability Rule (Template A specific):**

Every objective stated in Chapter 1 Section 1.3 must be traceable through the report:
- Addressed by a method in Chapter 3
- Reported in Chapter 4
- Verified as achieved or not achieved in Chapter 5

This check is done by AI, not script. The AI extracts objectives from 1.3, then searches for evidence of each objective being addressed later. Missing traceability for any objective → **REVISION NEEDED**.

### 2.2 TEMPLATE B — Thematic / Argumentative Structure

**Used by default for:**
- Literature (English, African, Comparative)
- History
- Cultural Studies
- Philosophy
- Theology / Religious Studies
- Some Education topics (non-empirical)
- Some Political Science (theoretical)
- Some Law topics (see Level 3 — NALT Doctrinal Approach)

**Chapter Structure:**

Chapters 2, 3, and 4 in Template B are **thematic chapters**. Their titles are the argument, not a functional role.

| Chapter | Role | Title Pattern | Page Range |
|---|---|---|---|
| Chapter 1 | Introduction | "Introduction" or the framing title | 10–15 |
| Chapter 2 | Thematic Chapter 1 | Reflects the argument | 15–30 |
| Chapter 3 | Thematic Chapter 2 | Reflects the argument | 15–30 |
| Chapter 4 | Thematic Chapter 3 | Reflects the argument | 15–30 |
| Chapter 5 | Conclusion | "Conclusion" or "Findings and Conclusion" | 5–8 |

**Balance Rule (Template B specific):**

Among the thematic chapters (2, 3, 4), no chapter may be more than **1.75× the length of the shortest thematic chapter**. Example: if the shortest thematic chapter is 16 pages, no thematic chapter can exceed 28 pages.

**Chapter 1 — Required Sub-Sections:**

| # | Section | Method |
|---|---|---|
| B1.1 | Background of the Study | Script + AI |
| B1.2 | Aim and Objectives of the Study | Script + AI |
| B1.3 | Significance of the Study | Script + AI |
| B1.4 | Scope of the Study | Script + AI |
| B1.5 | Research Methodology | Script (usually briefer than in Template A) |
| B1.6 | Review of Related Literature (light touch) | Script + AI |
| B1.7 | Limitations of the Study | Script (optional in some departments) |

**Chapters 2, 3, 4 — Thematic Chapters:**

Each thematic chapter must contain:
- A clear title that reflects an argumentative claim (not a functional role)
- Numbered sub-sections that develop that claim
- Endnotes at the end of the chapter (if the department uses endnotes) OR in-text citations (if the department uses APA/MLA)
- Cross-references to primary and secondary sources

**Chapter 5 — Required Sub-Sections:**

| # | Section | Method |
|---|---|---|
| B5.1 | Conclusion | Script + AI |
| B5.2 | Key Findings | Script + AI |
| B5.3 | Recommendations for Further Research | Script + AI |

**Reference/Bibliography Format Rule (Template B specific):**

Template B departments often use:
- **Bibliography** (not "References") — for MLA/Chicago
- **Works Cited** — for MLA
- **References** — for APA
- **Endnotes at end of each chapter** — for Chicago-style history

The intake form must capture which format the department uses. If not captured, default to APA 7 (universal fallback).

### 2.3 Automatic Template Selection

Given a department name at intake, the system selects the default template:

| Department | Default Template |
|---|---|
| Engineering (all) | A + Engineering Overrides (§3.1) |
| Medicine / Medical Lab Science / Science Lab Technology | A + Medical Overrides (§3.9) |
| Sciences (Chemistry, Physics, Biology, Biochemistry, Microbiology) | A + Medical Overrides (§3.9) where lab-based |
| Computer Science | A + CS Overrides (§3.5) |
| Business / Accounting / Finance / Marketing | A + Business Overrides (§3.4) |
| Economics | A + Economics Overrides (§3.6) |
| Nursing / Midwifery / Public Health | A + NMCN Overrides (§3.2) |
| Pharmacy | A |
| Agriculture | A + Agriculture Overrides (§3.7) |
| Psychology / Sociology / Political Science (empirical) | A |
| Education (research-based) | A |
| English / Literature | B |
| History | B |
| Philosophy | B |
| Theology / Religious Studies | B |
| Cultural Studies | B |
| Political Science (theoretical) | B |
| Law | Ask (Doctrinal → B, Non-Doctrinal → A) |
| Education (non-empirical/theoretical) | B |

**Ambiguous cases:** If the department is not listed or is ambiguous, the intake system asks: "Is this project mainly analysing existing texts/documents/theories (Template B) or collecting and analysing data (Template A)?" The worker or client makes the call.

---

## LEVEL 3 — DEPARTMENT-SPECIFIC OVERRIDES

These override Template A or Template B defaults where they conflict.

### 3.1 ENGINEERING (Template A + Engineering Overrides)

**Source:** EduCraft Engineering Chapter Writing Guides (One through Five)

**Chapter 1 Overrides:**

Standard Template A Chapter 1 sections apply, plus:

| # | Section | Required |
|---|---|---|
| E1.6 | Outline of the Project | Yes — engineering-specific |

**Chapter 3 Overrides:**

Engineering Chapter 3 is significantly more complex than the Template A default. It must contain:

| # | Section | Method |
|---|---|---|
| E3.1 | Block Diagram | Script (image presence check) + AI (relevance check) |
| E3.2 | Design Calculations | Script + AI (calculations must reference project components) |
| E3.3 | Design Implementation | Script + AI |
| E3.3.1 | Complete Circuit Diagram / System Schematic | Script (image) + AI (for electrical/electronic projects) |
| E3.3.2 | Packaging / Casing | Script + AI (for physical prototype projects) |
| E3.3.3 | Working Principle | Script + AI |
| E3.4 | Bill of Engineering Measurement and Evaluation (BEME) | Script (table presence) + AI (cost reasonableness) |
| E3.5 | Testing | Script + AI |

**Engineering-Specific Content Rules:**

- Every equation must appear on its own line, numbered as Chapter.Number (3.1, 3.2, etc.)
- Every equation must define every symbol with units
- Simulation results must never be presented as physical measurements
- Design calculations must relate to core components — not peripheral (this was the specific failure in the rejected report)
- Every design choice must have a technical reason
- No fabricated values, results, DOIs, or citations

**Engineering-Specific Format Rules:**

- Block diagrams, circuit diagrams, schematics: pure black and white, professional CAD/schematic tool appearance
- No decorative colour, gradients, 3D effects, or AI infographic styling in engineering diagrams
- Three-line tables (top border, header bottom border, bottom border only, 0.5pt)
- Table descriptions before the table, left-aligned
- Figure descriptions after the figure, centre-aligned

### 3.2 NURSING (Template A + NMCN Overrides)

**Source:** Nursing and Midwifery Council of Nigeria (NMCN) Format for Writing and Scoring Research Projects, Revised February 2018

**Chapter 1 Overrides:**

The NMCN format uses slightly different section names:

| # | NMCN Section | Marks |
|---|---|---|
| N1.1 | Background to the Study | 3 |
| N1.2 | Statement of Problem | 2 |
| N1.3 | Objectives of the Study | 2 |
| N1.4 | Research Questions / Hypothesis | 2 |
| N1.5 | Significance of the Study (Contribution to profession, health providers, society) | 2 |
| N1.6 | Scope of Study (must include variables, location, population) | 2 |
| N1.7 | Operational Definition of Terms (must relate to key concepts and objectives) | 2 |

**Chapter 2 Overrides:**

| # | NMCN Section | Marks |
|---|---|---|
| N2.1 | Conceptual Review — must address key concepts in topic and objectives | 3 |
| N2.2 | Theoretical Review — must state theory/framework with link to study | 1 |
| N2.3 | Empirical Review — must have relevance to objectives | 5 |
| N2.4 | Referencing within text using APA format | 1 |
| N2.5 | Currency of references — Books ≤10 years, Journals ≤5 years | 2 |

**Currency Rule:** For Nursing projects, an automated check must verify:
- Book references cited are no older than 10 years from project date
- Journal references cited are no older than 5 years from project date
- Exceptions allowed for seminal works (with justification note)

If more than 20% of references violate the currency rule → **REVISION NEEDED**.

**Chapter 3 Overrides:**

| # | NMCN Section | Marks |
|---|---|---|
| N3.1 | Design | 1 |
| N3.2 | Setting (geographical location and characteristics) | 2 |
| N3.3 | Target Population | 1 |
| N3.4 | Sample Size (with formula shown) | 1 |
| N3.5 | Sampling Technique (method, description, inclusion criteria) | 3 |
| N3.6 | Instruments for Data Collection (type, nature, item number) | 3 |
| N3.7 | Validity of Instrument (face and content) | 1 |
| N3.8 | Reliability of Instrument (test and reliability index) | 1 |
| N3.9 | Method of Data Collection (description, duration, sample covered) | 3 |
| N3.10 | Method of Data Analysis (choice of technique with explanation) | 2 |
| N3.11 | Ethical Consideration (ethical approval, administration from subjects) | 2 |

**Ethical Consideration Rule:** This section is mandatory for Nursing projects. Missing → **HARD REJECT** for Nursing template.

**Chapter 4 Overrides:**

Chapter 4 in NMCN is titled "Results" and focuses on:

| # | NMCN Section | Marks |
|---|---|---|
| N4.1 | Presentation of results using tables and figures | 4 |
| N4.2 | Proper labelling of tables and figures | 3 |
| N4.3 | Proper description of content | 4 |
| N4.4 | Answering research questions / hypotheses | 4 |

**Chapter 5 Overrides:**

Chapter 5 in NMCN is titled "Discussion of Findings" — different from Template A default:

| # | NMCN Section | Marks |
|---|---|---|
| N5.1 | Identify key findings | 3 |
| N5.2 | State implication of findings with literature support | 6 |
| N5.3 | Align findings with previous studies cited | 3 |
| N5.4 | Implications of findings to nursing | 3 |
| N5.5 | Limitations of the study | 1 |
| N5.6 | Summary of the study | 1 |
| N5.7 | Conclusion | 1 |
| N5.8 | Recommendations | 2 |
| N5.9 | Suggestions for further studies | 1 |

**Nursing-Specific Format Rules:**

- Font: Times New Roman 12pt
- Double line spacing
- Paragraphing: block style
- Quotations over 40 words: free-standing block, no quotation marks, single spacing within block
- APA 7th Edition referencing, alphabetical arrangement
- Preliminary pages numbered in Roman numerals

### 3.3 LAW (Two Sub-Templates)

**Source:** NALT (Nigerian Association of Law Teachers) Guidebook, ABUAD Ratified 2015

Law projects use ONE of two sub-templates. This must be identified at intake.

#### 3.3.1 LAW — Doctrinal Approach (Template B variant)

Used when the project is theoretical / literature-based / analysing legal texts and doctrine.

| Chapter | Title | Notes |
|---|---|---|
| Chapter 1 | Introduction | Standard framing |
| Chapter 2 | Conceptual and Theoretical Framework and Literature Review | Combined chapter — different from Template A |
| Chapter 3 | Thematic Chapter (per topic) | |
| Chapter 4 | Thematic Chapter (per topic) | |
| Chapter 5 | Thematic Chapter (per topic) | |
| Chapter 6 | Conclusion | **Six chapters, not five** — Law Doctrinal specific |

**Six-Chapter Rule:** Law Doctrinal projects have SIX chapters, not five. The automated checker must be told this at intake.

**Reference Format:** NALT Citation Guidelines, not APA. This uses footnotes and a bibliography at the end.

#### 3.3.2 LAW — Non-Doctrinal Approach (Template A variant)

Used when the project involves empirical data collection.

| Chapter | Title | Notes |
|---|---|---|
| Chapter 1 | Introduction | Standard framing |
| Chapter 2 | Literature Review | Standard Template A |
| Chapter 3 | Research Methodology | Standard Template A |
| Chapter 4 | Research Analysis and Data Presentation | Similar to Template A Chapter 4 |
| Chapter 5 | Findings and Discussion | |
| Chapter 6 | Conclusion | **Still six chapters** |

Both Law sub-templates use six chapters total. Both use NALT footnote citation style, not APA.

### 3.4 BUSINESS / ACCOUNTING / MARKETING / FINANCE (Template A + Business Overrides)

**Source:** Web research — Nigerian university standard practice (needs Prince's validation)

Business projects use Template A with these additions:

**Chapter 3 Overrides:**

| # | Section |
|---|---|
| B3.1 | Research Design |
| B3.2 | Population of the Study |
| B3.3 | Sample and Sampling Technique |
| B3.4 | Data Collection Instrument |
| B3.5 | Validity and Reliability of the Instrument |
| B3.6 | Method of Data Analysis |

**Chapter 5 Overrides:**

Standard Template A Chapter 5 plus:

| # | Section |
|---|---|
| B5.6 | Contribution to Knowledge |
| B5.7 | Recommendations to Management / Practice | 

**Business-Specific Content Rules:**

- Hypotheses must be stated clearly in Chapter 1 (as H1, H2, etc.) and Ho / H1 forms in Chapter 3
- Statistical tests used must be justified (why chi-square, why regression, why ANOVA)
- Financial data must be presented in Naira with USD conversion where relevant
- References may be APA 7 (most common) or Harvard (some schools)

**⚠️ TO BE VALIDATED BY PRINCE**

### 3.5 COMPUTER SCIENCE (Template A + CS Overrides)

**Source:** Prince-validated from actual delivered CS projects

CS projects use Template A with these modifications. Each chapter starts with X.0 Introduction (1.0 Introduction, 2.0 Introduction, 3.0 Introduction, etc.).

**Chapter 3 Overrides:**

| # | Section |
|---|---|
| C3.0 | Introduction |
| C3.1 | System Design (Architecture, Data Flow, Entity Relationship) |
| C3.2 | Choice of Programming Language / Development Environment |
| C3.3 | Database Design |
| C3.4 | System Requirements (Hardware and Software) |

**Note:** There is NO "Analysis of the Existing System" or "Analysis of the Proposed System" section. Chapter 3 starts directly with System Design.

**Chapter 4 Overrides:**

| # | Section |
|---|---|
| C4.0 | Introduction |
| C4.1 | System Implementation |
| C4.2 | Testing and Results |
| C4.3 | Discussion of Findings |

**CS-Specific Content Rules:**

- Code snippets must be presented in monospace font, in code blocks, not inline
- Screenshots of the running application must be included in Chapter 4
- ER diagrams, DFDs, use case diagrams must appear where relevant
- References use APA 7 or IEEE depending on department

**✅ VALIDATED BY PRINCE**

### 3.6 ECONOMICS (Template A + Economics Overrides)

**Source:** Prince-validated from actual delivered Economics projects

Economics projects follow Template A closely, with a specific Chapter 2 structure.

**Chapter 2 Overrides (Prince-validated):**

| # | Section |
|---|---|
| Ec2.1 | Conceptual Review |
| Ec2.2 | Empirical Review |
| Ec2.3 | Theoretical Review |
| Ec2.4 | Literature Gap |

**Chapter 3 Overrides:**

| # | Section |
|---|---|
| Ec3.1 | Theoretical Framework (model specification) |
| Ec3.2 | Model Specification (mathematical formulation) |
| Ec3.3 | Method of Data Analysis (econometric techniques used) |
| Ec3.4 | Source of Data |
| Ec3.5 | Estimation Technique (OLS, GMM, VAR, etc.) |

**Econometric Analysis Rule:** Every econometric result must include:
- The coefficient value
- Standard error
- t-statistic or p-value
- R-squared / Adjusted R-squared
- F-statistic

Missing any of these in a regression output table → **REVISION NEEDED**.

**✅ VALIDATED BY PRINCE (Chapter 2); Chapter 3 from web research**

### 3.7 AGRICULTURE (Template A + Agriculture Overrides)

Agriculture is heavily empirical. Chapter 3 focuses on experimental design.

**Chapter 3 Overrides:**

| # | Section |
|---|---|
| Ag3.1 | Study Area (geographical location, climate, soil type) |
| Ag3.2 | Experimental Design (CRD, RCBD, Split-Plot, etc.) |
| Ag3.3 | Materials Used (seeds, chemicals, equipment) |
| Ag3.4 | Field Layout and Treatment Application |
| Ag3.5 | Data Collection (parameters measured, frequency) |
| Ag3.6 | Statistical Analysis |

**Agriculture-Specific Rule:** The experimental design must be justified — why CRD vs RCBD, why split-plot, etc.

**⚠️ TO BE VALIDATED BY PRINCE**

### 3.8 EDUCATION (Both Templates — Depends on Type)

Education projects split cleanly:

**Empirical Education (Template A):**
Studies involving surveys, tests, questionnaires — use Template A defaults.

**Theoretical Education (Template B):**
Studies analysing curricula, philosophies, or policies — use Template B thematic structure.

Ask at intake which type.

**✅ VALIDATED BY PRINCE — "This Education Analysis is very correct"**

### 3.9 MEDICAL / LABORATORY SCIENCES (Template A + Medical Overrides)

**Source:** Prince-validated from actual delivered Medical Laboratory Science and related projects (TOC screenshots from real EduCraft deliveries)

**Applies to:** Medicine and Surgery, Medical Laboratory Science, Science Laboratory Technology, Microbiology, Biochemistry, and any other science course requiring laboratory work or questionnaire-based data collection.

**Key differences from generic Template A:**
- Chapter One has 10 sub-sections (not 6)
- Chapter Three is titled "Materials and Methods" and has 13+ sub-sections
- Chapter Four is titled "Results" (not "Data Analysis")
- Chapter Five is titled "Discussion, Conclusions and Recommendations" — Discussion comes FIRST, before Conclusion

**Chapter 1 Overrides (expanded — 10 sub-sections):**

| # | Section |
|---|---|
| M1.1 | Background of/to the Study |
| M1.2 | Statement of the Problem |
| M1.3 | Gap in Knowledge / Justification of the Study |
| M1.4 | Aim of the Study |
| M1.5 | Specific Objectives of the Study |
| M1.6 | Research Questions |
| M1.7 | Research Hypotheses |
| M1.8 | Significance of the Study |
| M1.9 | Scope of the Study |
| M1.10 | Operational Definition of Terms |

**Note:** Aim (M1.4) and Specific Objectives (M1.5) are SEPARATE sections, not combined. This is different from generic Template A. Chapter 1 page count will be 14–18 pages (higher than generic Template A's 12–14).

**Chapter 2 Overrides:**

Medical/Science Chapter 2 follows the same general Template A structure but is significantly longer (often 60+ pages) due to depth of conceptual review. The sub-sections are topic-driven, not standardised. Example from a Malaria project:

| # | Section |
|---|---|
| 2.1 | Overview of [Primary Concept] |
| 2.1.1–2.1.8 | Deep sub-topics under the primary concept |
| 2.2 | [Secondary Concept Related to Study] |
| 2.2.1–2.2.6 | Deep sub-topics |
| 2.3–2.7 | Additional conceptual areas |
| 2.8 | Empirical Review of Related Studies |
| 2.9 | Summary of Literature and Knowledge Gap |

**Chapter 3 Overrides — "Materials and Methods" (13+ sub-sections):**

| # | Section |
|---|---|
| M3.0 | Introduction |
| M3.1 | Study Design |
| M3.2 | Study Area |
| M3.3 | Study Population |
| M3.4 | Sample Size Determination |
| M3.5 | Sampling Technique |
| M3.6 | Inclusion Criteria |
| M3.7 | Exclusion Criteria |
| M3.8 | Ethical Considerations |
| M3.9 | Data Collection Procedure |
| M3.10 | Sample Collection and Processing |
| M3.11 | Laboratory Analysis (with sub-sections per test/procedure) |
| M3.12 | Quality Control |
| M3.13 | Statistical Analysis |

**Ethical Considerations Rule:** This section is mandatory for all Medical/Science projects. Missing → **HARD REJECT**.

**Chapter 4 Overrides — "Results":**

Chapter 4 presents results through comparison tables, statistical tests, and data visualisations. Sub-sections are study-specific, not standardised. Common patterns:

| # | Section Pattern |
|---|---|
| 4.0 | Introduction |
| 4.1 | Socio-Demographic Characteristics of Study Participants |
| 4.2–4.N | Comparison tables and statistical results (specific to study) |
| 4.N+1 | Summary of Major Findings |

**Chapter 5 Overrides — "Discussion, Conclusions and Recommendations":**

**Important:** Discussion comes FIRST in Medical/Science Chapter 5, before Conclusion. This is different from generic Template A.

| # | Section |
|---|---|
| 5.0 | Introduction |
| 5.1 | Discussion (of findings) |
| 5.2 | Recommendations |
| 5.3 | Contribution to Knowledge |
| 5.4 | Limitations of the Study |

**Appendices (mandatory for Medical/Science):**

Medical/Science projects must include:
- Ethical Approval document
- Information Sheet
- Informed Consent Form
- Research Questionnaire (if used)

Missing any of these → **REVISION NEEDED**.

**✅ VALIDATED BY PRINCE — from real delivered project TOCs**

---

### 3.10 FINAL YEAR PROPOSAL (All Departments)

**What a proposal is:** A 15–20 page overview of a planned final year report. It follows the same chapter structure as the full report for that department, but each chapter is a summary of what *will* be done rather than a full treatment of what *was* done.

**Structural rules:**

| Attribute | Full Report | Proposal |
|---|---|---|
| Page count | 70–152 (department-dependent) | 15–20 |
| Line spacing | 2.0 | 1.5 |
| Depth | In-depth, evidence-based | Overview, planned approach |
| Chapter 3 | Full methodology with results | Proposed methodology (future tense) |
| Chapter 4 | Actual data and analysis | Expected outcomes / framework |
| Chapter 5 | Actual conclusions | Expected contributions |
| Reference count | 35–50+ | 15–25 (initial sources) |
| Chapter names | Same as department's full report | Same as department's full report |

**The chapter structure of a proposal matches the department's full report template.** An Engineering proposal uses Engineering chapter names. A Nursing proposal uses NMCN chapter names. The difference is depth, not structure.

**Future-tense content is acceptable in Chapters 3–5 of proposals.** Statements like "Data will be collected using..." and "The study is expected to show..." are normal in proposals but would be failures in full reports.

**No data tables or results are required in Chapter 4 of a proposal.** A proposed analytical framework or expected outcomes section is sufficient.

**Project Lineage — Proposal to Full Report:**

When a client who previously ordered a proposal returns for the full report, the system links the two projects via `parentProjectId`. The worker receives the completed proposal and continues from it rather than starting from scratch. This saves significant time and ensures consistency.

```
parentProjectId  → Links FYP-FULL project to its predecessor FYP-PROP project
```

---

### 3.11 PUBLICATION REPORT (All Departments)

**What a publication report is:** A 5–8 page standalone research paper derived from a completed project report, formatted for journal or conference submission.

**Source:** EduCraft Master One-Shot Publication Paper Generation Template (Prince-authored)

**Two client paths:**

| Path | Input | Token Cost | Notes |
|---|---|---|---|
| Path 1 — New client | Client uploads their complete project report | Higher (~30K–50K input tokens) | Full document must be read |
| Path 2 — Returning client | System uses stored project data from database | Lower (~3K–5K tokens) | 85–90% token savings |

For returning clients (who did their FYP with EduCraft), the system automatically detects the existing completed project and links the publication to it. No document upload needed.

**Publication Structure (fixed — all departments):**

| # | Section | Required |
|---|---|---|
| P1 | Title (specific to publication focus) | Yes |
| P2 | Authors and Affiliation(s) | Yes |
| P3 | Corresponding Author | Yes |
| P4 | Abstract (200–270 words) | Yes |
| P5 | Keywords (5–8) | Yes |
| P6 | I. Introduction | Yes |
| P7 | II. Theoretical Analysis | Yes |
| P8 | III. Design Methodology | Yes |
| P9 | IV. Results and Discussion | Yes |
| P10 | V. Conclusion | Yes |
| P11 | References | Yes |

**Publication-Specific Rules:**

- Two-column borderless table layout from Section I onwards
- US Letter page size (8.5 × 11 in), ~0.70 in margins
- Title: 14pt bold centred
- Body: 10pt Times New Roman, justified
- All equations must be native Word equations (OMML), not images
- Three-line tables only (top, header-bottom, bottom borders, 0.5pt)
- Table captions ABOVE tables; figure captions BELOW figures
- Author-date citation style: (Pozar, 2012), Onwuka *et al.* (2018)
- Every *et al.* italicised
- **No report-dependent language:** "Chapter Three," "the project report," "final-year project" are all banned. The publication must read as an independent paper.

**Publication Structural Quality Checks:**

| # | Check | Method |
|---|---|---|
| PQ1 | Title present and specific to focus | AI |
| PQ2 | Authors and affiliation extracted correctly | AI + Human |
| PQ3 | Abstract 200–270 words with problem, method, results, significance | Script (word count) + AI (content) |
| PQ4 | 5–8 keywords present | Script |
| PQ5 | Sections I–V present | Script |
| PQ6 | All equations are native Word equations (not images) | Script |
| PQ7 | All tables are three-line format | Script + AI |
| PQ8 | All figures cited and discussed in text | AI |
| PQ9 | References match citations (every cite has a ref, every ref is cited) | Script |
| PQ10 | No report-dependent language | Script (keyword search for "chapter," "project report," "final year") |
| PQ11 | Two-column layout from Section I onwards | Script |
| PQ12 | Page count 5–8 pages | Script |
| PQ13 | No fabricated data not in the source | AI (cross-reference with source) |
| PQ14 | *et al.* italicised throughout | Script |

**Project Lineage — Full Report to Publication:**

```
parentProjectId  → Links PUB project to its predecessor FYP-FULL project
```

The lineage chain can extend three generations: FYP-PROP → FYP-FULL → PUB.

**✅ PRINCE-AUTHORED (Publication prompt is Prince's original work)**

---

## LEVEL 4 — CLIENT INSTRUCTIONS OVERRIDE

Client instructions always win. When the intake form indicates a supervisor-provided TOC:

1. All Level 2 (Template) and Level 3 (Department) structural rules are **suspended**
2. Only Level 1 (Universal) rules continue to apply
3. The parsed supervisor TOC becomes the ground truth for structural checks
4. Any deviation from the supervisor's TOC in the final report → **REVISION NEEDED**

**Important nuance:** If the supervisor's TOC omits something that Universal Rules require (e.g., no References section), the system flags this to the admin. The client is contacted to confirm the omission is intentional. In practice this almost never happens, but the check exists.

---

## THE ENFORCEMENT SYSTEM — HOW CHECKS ARE ACTUALLY RUN

### Check Pipeline (in order)

When a completed report is submitted, the automated checker runs this pipeline:

**Step 1 — Metadata Load**
- Load project record: department, service tier, template selection, supervisor TOC (if any)
- Determine which precedence level applies (Level 4 if supervisor TOC, otherwise Level 3 → Level 2 → Level 1)

**Step 2 — Document Parsing**
- Open the `.docx` file using python-docx or equivalent
- Extract: page count, section headings (from styles), figures, tables, equations, references list
- Build a structural map of the document

**Step 3 — Universal Rules Check (Level 1)**
- Verify U1–U8 (required sections) are all present → HARD REJECT any missing
- Verify U9–U14 (conditional) based on intake data
- Verify page count within range
- Verify chapter numbering consistency
- Verify References list exists and is populated

**Step 4 — Template Rules Check (Level 2, if not overridden by supervisor TOC)**
- Verify chapter titles match Template A or Template B
- Verify required sub-sections exist per chapter
- For Template A: run objective traceability check
- For Template B: run thematic balance rule (1.75× check)

**Step 5 — Department Rules Check (Level 3, if not overridden)**
- Apply department-specific overrides
- For Nursing: check reference currency (10y books, 5y journals)
- For Engineering: check equation formatting compliance
- For Law: verify 6 chapters instead of 5
- For Medical/Science: verify ethical considerations present, verify appendices (consent form, questionnaire, ethical approval)
- For Publication: run PQ1–PQ14 publication-specific checks

**Step 6 — Supervisor TOC Check (Level 4, if applicable)**
- Parse supervisor's TOC
- Verify every section in the TOC appears in the report
- Flag any TOC section missing → REVISION NEEDED

**Step 7 — Report Generation**
- Generate structural quality report
- List all passes, failures, and warnings
- Assign overall status: PASS / REVISION NEEDED / HARD REJECT
- Route to next quality layer (Voice) if PASS, or return to worker if not

### Failure Actions Defined

| Action | Meaning | Next Step |
|---|---|---|
| **PASS** | All checks passed | Move to Layer 2 (Voice) |
| **REVISION NEEDED** | Fixable issues found | Return to worker with specific list |
| **HARD REJECT** | Required section missing or catastrophic failure | Return to worker with critical alert; senior review |
| **FLAG FOR HUMAN** | Ambiguous case | Junior QA reviewer decides |

---

## SUCCESS METRICS FOR THIS LAYER

Structural Quality is the fastest, cheapest, most reliable layer. Its metrics should be strong:

| Metric | Target |
|---|---|
| Automated check runtime | Under 5 seconds per report |
| False positive rate (flagging good work as bad) | Below 2% |
| False negative rate (missing bad work) | Below 5% |
| Percentage of reports failing on first structural check | Below 20% (higher means workers need retraining) |
| Percentage of hard rejects | Below 1% |

---

## VALIDATION STATUS

| Section | Status | Source |
|---|---|---|
| 1.3 Page Counts | ✅ Validated + corrected | Prince feedback + real project page counts |
| 1.4 Chapter Numbering | ✅ Validated — words only | Prince confirmation |
| 1.5 Reference Counts | ✅ Validated + corrected (35–50 FYP) | Prince direct experience |
| 3.1 Engineering | ✅ Validated | EduCraft Engineering Chapter Guides |
| 3.2 Nursing | ✅ Validated | NMCN 2018 Format |
| 3.3 Law | ✅ Validated | NALT Guidebook 2022 |
| 3.4 Business | ⚠️ Web research — needs validation | Standard Nigerian practice |
| 3.5 Computer Science | ✅ Validated + corrected | Prince delivered CS projects |
| 3.6 Economics | ✅ Partially validated (Ch 2 confirmed) | Prince delivered Economics projects |
| 3.7 Agriculture | ⚠️ Web research — needs validation | Standard Nigerian practice |
| 3.8 Education | ✅ Validated | Prince confirmation |
| 3.9 Medical/Lab Sciences | ✅ Validated | Prince-provided TOC screenshots |
| 3.10 Final Year Proposal | ✅ Validated | Prince direct experience |
| 3.11 Publication Report | ✅ Validated | Prince-authored publication prompt |

**Remaining to validate:** Section 3.4 (Business) and 3.7 (Agriculture) — validate when EduCraft encounters these projects.

---

## APPENDIX A — SOURCES USED

- **Template A base structure:** EduCraft Masterclass Days 2–3 + Engineering Chapter Writing Guides (1–5)
- **Template B base structure:** Prince's provided example TOCs (Igala Women, Social Media on Tertiary Education, Satire as Political Critique) + web research on humanities dissertation structures
- **Engineering (Section 3.1):** EduCraft Engineering Chapter Writing Guides
- **Nursing (Section 3.2):** NMCN Format for Writing and Scoring Research Projects, Revised February 2018
- **Law (Section 3.3):** NALT Guidebook as printed in 2022
- **Computer Science (Section 3.5):** Prince-validated from delivered CS projects
- **Economics (Section 3.6):** Prince-validated Chapter 2; Chapter 3 from web research
- **Education (Section 3.8):** Prince-validated
- **Medical/Lab Sciences (Section 3.9):** Prince-provided real project TOC screenshots (Medical Lab Science, related projects)
- **Final Year Proposal (Section 3.10):** Prince direct experience
- **Publication Report (Section 3.11):** Prince-authored Master One-Shot Publication Paper Generation Template
- **Business (Section 3.4), Agriculture (Section 3.7):** Web research — awaiting validation on encounter

---

*Version 1.1 — Updated with Prince's corrections: reference counts, chapter numbering, Medical/Lab Sciences override, CS corrections, Economics Ch 2 correction, Education validation, Final Year Proposal template, Publication Report template with dual-path logic, and template-aware padding thresholds.*
