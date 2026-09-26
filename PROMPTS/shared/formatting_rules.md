# EDUCRAFT FORMATTING RULES
## Shared Rules — Appended to Every Chapter Generation Prompt
## Source: EDUCRAFT_FORMATTING_QUALITY_SCRIPT_v1 (Session 5)

---

## PURPOSE

These rules define the exact formatting requirements for every EduCraft Final Year Project report. When you generate a chapter as a `.docx` file, every property below must be applied. Deviations are caught by the automated Formatting Quality Script (Layer 3) before the document reaches QA.

The default profile is **FYP_STANDARD** unless the project specifies otherwise.

---

## FONT RULES (F1–F6)

| Rule | Requirement |
|---|---|
| F1 | Font family: **Times New Roman** throughout — no exceptions |
| F2 | Body text size: **12pt** |
| F3 | Heading size: **12pt** (same as body — applies to ALL report types) |
| F4 | All headings (H1, H2, H3): **Bold** |
| F5 | No coloured text — **pure black throughout** |
| F6 | No underline on headings — bold only |

> **Critical note:** All EduCraft report types use 12pt for both body and headings. There is no exception. The only service that uses different sizing is Publication Reports (10pt body, 14pt title, 9pt captions) — handled by a separate profile.

---

## SPACING RULES (S1–S5)

| Rule | Requirement |
|---|---|
| S1 | Line spacing: **exactly 2.0** for all body paragraphs |
| S2 | **No extra spacing before headings** — space_before = 0pt on all headings |
| S3 | **No extra spacing after headings** — space_after = 0pt on all headings |
| S4 | Line spacing 2.0 for headings (same as body) |
| S5 | No extra paragraph spacing anywhere in body — space_before and space_after = 0pt for all paragraphs |

> **Strictly enforced:** "The only spacing that is permitted throughout the document is 2.0, nothing less, nothing more." AI systems consistently add extra spacing above and below Heading 1. This is a MAJOR failure.

> **Exceptions:**
> - Proposals: use 1.5 line spacing instead of 2.0
> - Tables: may use 1.5 or 1.0 line spacing internally to fit on one page. Do NOT apply 2.0 inside table cells.
> - Publication Reports: compact single or 1.15 spacing — different profile entirely.

---

## MARGIN RULES (MG1–MG4)

| Rule | Requirement |
|---|---|
| MG1 | Top margin: **1.0 inch (2.54 cm)** |
| MG2 | Bottom margin: **1.0 inch (2.54 cm)** |
| MG3 | Left margin: **1.0 inch (2.54 cm)** |
| MG4 | Right margin: **1.0 inch (2.54 cm)** |

> Tolerance: ±0.05 inch (±0.13 cm). Note: some departments require 1.5 inch left margin for binding — captured at intake. Default is 1.0 inch all sides.

---

## ALIGNMENT RULES (AL1–AL4)

| Rule | Element | Alignment | Case |
|---|---|---|---|
| AL1 | Body text | **Justified** | n/a |
| AL2 | Heading 1 | **Centre** | **UPPER CASE** |
| AL3 | Heading 2 | **Left** | **Title Case** (Capitalise Each Word) |
| AL4 | Heading 3 | **Left** | **Sentence case** (only first word capitalised) |

---

## HEADING STYLE RULES (H1–H4)

| Rule | Level | Properties | Example |
|---|---|---|---|
| H1 | Chapter headings | 12pt, Bold, TNR, Centred, UPPER CASE | "CHAPTER ONE", "INTRODUCTION" |
| H2 | Section headings (1.1, 1.2) | 12pt, Bold, TNR, Left, Title Case | "1.1 Background of the Study" |
| H3 | Sub-section headings (1.1.1) | 12pt, Bold, TNR, Left, Sentence case | "2.1.1 Overview of antimicrobial resistance" |
| H4 | **NOT PERMITTED** | No heading level beyond H3 | Flag any "1.1.1.1" style numbering |

---

## PARAGRAPH RULES (P1–P5)

| Rule | Requirement |
|---|---|
| P1 | **No paragraph indentation** — first-line indent = 0 |
| P2 | **No em-dashes (—) or en-dashes (–) as sentence separators** — use commas |
| P3 | Inline word hyphens are permitted (co-operator, self-contained, real-time) |
| P4 | All *et al.* must be **italicised** — every occurrence, no exceptions |
| P5 | No coloured text, highlighting, or background shading |

---

## PAGE NUMBERING RULES (PN1–PN4)

| Rule | Requirement |
|---|---|
| PN1 | Preliminary pages: **Roman numerals** (i, ii, iii, iv...) |
| PN2 | Main body (from Chapter One): **Arabic numerals** (1, 2, 3...) |
| PN3 | Page numbering **restarts at 1** for the main body — requires a section break before Chapter One |
| PN4 | Page numbers appear in the **footer, centre-aligned** |

> **Centre-aligned is the only acceptable position.** Right-aligned page numbers are not permitted.

> **Critical:** This is the most common formatting failure. The document must have:
> 1. A section break between preliminary pages and Chapter One
> 2. First section using Roman numeral formatting
> 3. Second section using Arabic formatting starting from 1
> 4. Second section's footer NOT linked to the first section's footer

---

## TABLE RULES (T1–T8)

| Rule | Requirement |
|---|---|
| T1 | Tables must **not break across pages unnecessarily** — rows must have allow_break_across_pages = False |
| T2 | **Engineering tables: three-line format only** — top border, header-bottom border, bottom border (0.5pt) |
| T3 | **No vertical borders** on tables (engineering standard) |
| T4 | No shading, colours, or background fills on table cells |
| T5 | Table caption must exist for every table |
| T6 | Table captions placed **ABOVE the table**, centre-aligned |
| T7 | Table caption style must use the designated "Table Caption" style |
| T8 | All tables must appear in the List of Tables with correct page numbers |

> **Table continuity rule:** Evaluate in this order: (1) fits on current page → leave it. (2) fits with reduced table spacing (1.5 or 1.0 within table) → apply. (3) fits if moved to next page → move it. A slightly short page is better than a broken table. (4) Only if genuinely too long (40+ rows) may it break — then header row must repeat on second page.

---

## FIGURE AND IMAGE RULES (FG1–FG6)

| Rule | Requirement |
|---|---|
| FG1 | Figure caption must exist for every figure |
| FG2 | Figure captions placed **BELOW the figure**, centre-aligned |
| FG3 | Figure caption style must use the designated "Figure Caption" style |
| FG4 | All figures from external sources must have a citation in the caption: `(Author, Year)` |
| FG5 | Author-generated figures must be marked `(Author, Year)` |
| FG6 | All figures must appear in the List of Figures with correct page numbers |

> Caption note for Engineering: Table captions go ABOVE. Figure captions go BELOW.

---

## EQUATION RULES (EQ1–EQ5)

| Rule | Requirement |
|---|---|
| EQ1 | Every equation must be **on its own line** — not inline with body text |
| EQ2 | Equations must be in **borderless two-column tables**: equation in the left column, equation number in the right column, no borders |
| EQ3 | Equation numbering in **Chapter.Number format: 3.1, 3.2** — **NO parentheses** — format is `3.1` not `(3.1)` |
| EQ4 | Sequential equation numbering within each chapter — restarts each chapter |
| EQ5 | Equations must be native Word equation objects (OMML), not images |

> **Exception — Publication Reports only:** Use parenthesised numbering: `(1)`, `(2)`, `(3)`.

> AI systems consistently fail to place equations in the borderless two-column table format. This is a MAJOR failure that AI generates repeatedly and the script specifically checks for it.

---

## TABLE OF CONTENTS RULES (TOC1–TOC5)

| Rule | Requirement |
|---|---|
| TOC1 | TOC must be populated (not empty) |
| TOC2 | TOC entries must match actual heading text in the document |
| TOC3 | TOC page numbers must be field codes (updatable), not manually typed |
| TOC4 | TOC must include **Heading 1, Heading 2, AND Heading 3** levels |
| TOC5 | TOC must **NOT have dotted tab leaders** — no dotted lines connecting entries to page numbers |

> **No dotted lines in TOC.** Clean spacing only. This applies equally to the List of Figures, List of Tables, and List of Appendices.

---

## LIST OF FIGURES / TABLES / APPENDICES RULES (LF, LT, LA)

| Rule | Requirement |
|---|---|
| LF1 | If report contains ANY figures (even one), List of Figures must exist |
| LF2 | List of Figures entries must match actual figure captions with correct page numbers |
| LF3 | List of Figures must **NOT have dotted tab leaders** |
| LT1 | If report contains ANY tables (even one), List of Tables must exist |
| LT2 | List of Tables entries must match actual table captions with correct page numbers |
| LT3 | List of Tables must **NOT have dotted tab leaders** |
| LA1 | If report contains ANY appendices, List of Appendices must exist in preliminary pages |
| LA2 | List of Appendices entries must match actual appendix titles with correct page numbers |
| LA3 | List of Appendices must **NOT have dotted tab leaders** |

---

## REFERENCE SECTION RULES (R1–R6)

| Rule | Requirement |
|---|---|
| R1 | References section must exist |
| R2 | References must be in **alphabetical order** by first author surname |
| R3 | References must have **hanging indent** (APA standard) |
| R4 | Journal names in references must be **italicised** |
| R5 | All *et al.* in references must be **italicised** |
| R6 | No duplicate references |

---

## FORMATTING PROFILES

The generation system applies the correct profile at runtime. The prompt loader injects the profile name into the prompt context.

| Profile | Key Differences from FYP_STANDARD |
|---|---|
| **FYP_STANDARD** | Default. All rules above apply as written. |
| **FYP_PROPOSAL** | Line spacing 1.5 (not 2.0). Page count 15–20. |
| **TERM_PAPER** | TOC optional under 30 pages. Equation two-column table not required. |
| **ENGINEERING** | Three-line tables strictly enforced. Equation table strictly enforced. Diagrams black and white only. |
| **NURSING_NMCN** | Block-style paragraphing. Quotations over 40 words: free-standing block, single spacing, no quotation marks. APA 7th. |
| **PUBLICATION** | 10pt body, 14pt title, 9pt captions. Two-column layout. US Letter. Compact spacing. Equation numbers in parentheses: `(1)`, `(2)`. |

---

## SEVERITY LEVELS

| Severity | Examples | Action |
|---|---|---|
| **CRITICAL** | Wrong font, wrong page numbering, wrong margins | Must fix before delivery. Report blocked. |
| **MAJOR** | Extra heading spacing, equation format wrong, table breaks | Must fix before delivery. |
| **MINOR** | Slight spacing variation, one caption style mismatch | Warning. QA reviewer decides. |
