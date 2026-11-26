# The law structure of EduCraft HQ, measured against NALT and a professor-approved benchmark

**Date:** 26 November 2026
**Benchmark:** `FINAL YEAR REPORT JOY (FINAL VERSION).docx` — Ambrose Alli University, 2026 session,
"child soldiers under international law", written before HQ existed, corrected by a professor and re-corrected
to the founder's satisfaction.
**Standard:** `NALT-Guidebook-as-printed-in-2022.docx` — NALT Uniform Format and Citation Guide,
ratified ABUAD 2015, 2021/2022 printing.

Where the guide and the benchmark disagree, the guide is the standard and the disagreement is flagged
for the founder (section 4).

---

## 1. What the benchmark actually is, measured

| Measure | Benchmark |
|---|---|
| Chapters | 5 |
| Body pages | 98 (bibliography 99–116) |
| Total pages | 116 |
| Body words | ~27,050 |
| Words per chapter | Ch1 5,438 · Ch2 6,125 · Ch3 6,826 · Ch4 5,733 · Ch5 2,928 |
| **Real Word footnotes** | **446** (`word/footnotes.xml`) |
| Endnotes | **0** |
| Citation density | one footnote per ~60 words |
| `ibid` | 107 |
| `(n X)` cross-references | 270 |
| Abolished Latin signals (`supra`, `op cit`, `loc cit`, `passim`, `et seq`, `infra`) | **0** |
| `et al.` | **0** — the form used is "and others" |
| Quotation marks of any kind | **0** — every source is paraphrased |
| Bibliography entries | 113, hanging indent, split Primary / Secondary |
| Font | Times New Roman throughout, body and footnotes |
| Footnote size | 10pt |
| Margins | 1.0 inch all round |
| Sections | 3 — lower-roman (title), lower-roman (prelims), decimal from Chapter One |

The citation density is the headline number. HQ's own best law-shaped run (the D11 Mode 1 report) carried
**71 notes over ~22,000 words — one per ~310 words.** The benchmark is five times denser.

---

## 2. The NALT standard, as it applies to an EduCraft order

EduCraft writes **undergraduate long essays**. NALT's rules for that level:

**Shape** — five chapters. 50 pages minimum, 100 maximum. Times New Roman 12, double spaced, A4,
one side only. Footnotes in-text (at the foot of each page) plus a bibliography of everything consulted.
Every chapter starts on a fresh page. Six chapters is **PhD only**.

**Chapters one, two and five are mandatory and identical for every student**, whatever the topic.
Chapters three and four are the student's own.

```
CHAPTER ONE                    CHAPTER TWO                        CHAPTER FIVE
INTRODUCTION                   CONCEPTUAL THEORETICAL             CONCLUSION
                               FRAMEWORKS AND LITERATURE REVIEW
1.1 BACKGROUND TO THE STUDY    2.1 CONCEPTUAL CLARIFICATIONS      5.1 SUMMARY OF FINDINGS
1.2 STATEMENT OF PROBLEM       2.2 THEORETICAL AND HISTORICAL     5.2 RECOMMENDATIONS
    (+ research questions)         FOUNDATION                     5.3 CONTRIBUTIONS TO KNOWLEDGE
1.3 AIM AND OBJECTIVES         2.3 LITERATURE REVIEW              5.4 AREAS FOR FURTHER STUDIES
1.4 SCOPE AND LIMITATIONS                                         5.5 CONCLUSION
1.5 SIGNIFICANCE
1.6 RESEARCH METHODOLOGY
1.7 (literature review —
     undergraduate only)
1.8 CHAPTERS ANALYSIS
```

**Headings** — the chapter title is UPPER CASE with no number. *The next main title under it is also
UPPER CASE* and carries an Arabic numeral. Sub-titles take sub-Arabic numerals. A fourth level is allowed
as a, b, c or i, ii, iii, and those do not appear in the table of contents.

**Preliminaries**, Roman numerals, every title in upper case, in this order:
blank fly leaf · title page (counts as i, shows nothing; items capitalised) · declaration (ii) ·
certification · dedication (optional) · acknowledgements · table of contents · list of cases ·
list of statutes, treaties and international instruments · list of acronyms/abbreviations · **abstract last**.

**Abstract** — one page, un-paragraphed single block, single line spacing, same font as the body.
Written after the work is finished. Contains background, aim and objectives, methodology, findings,
recommendations. *Not* a chapter-by-chapter review.

**Aim and objectives** — the aim is one sentence, a restatement of the title. Three to six objectives,
each with a transitive verb, each open to one meaning. Research questions not more than six,
itemised, and they "must correspond with the number of specific research objectives".

**Citations** — footnotes, superscript Arabic numerals, every source at the foot of its own page.
Minimal punctuation: no full stops in abbreviations (LFN, FWLR, NWLR). `v` with no full stop.
Case names italic. Semi-colons between citations in one footnote. Comma between author and title.
Colon between title and subtitle. Statutes by short title with capitals for major words.
CFRN 1999 (as amended) in full first, then CFRN 1999. `s/ss`, `sub-s`, `para/paras`, `sch/schs`,
`pt/pts` — in footnotes only. Online sources end `<address> accessed DD Month YYYY`.
Footnotes reproduce the author's name as printed in the source; **the bibliography inverts it to
surname then initials**, no comma between them, comma after the final initial.

`ibid` — lower case, not italic, only for the immediately preceding footnote.
`(n X)` — cross-reference to the footnote where a source first appeared, used whenever anything
intervenes. **`supra`, `infra`, `ante`, `contra`, `id`, `op cit`, `loc cit`, `passim`, `et seq` are abolished.**

**Quotations** — three lines or fewer: inline, single quotation marks. Longer: indented both sides,
no quotation marks, a blank line before and after. `(sic)` for errors in the original.
`(emphasis added)` where emphasis is ours.

**Bibliography** — titled BIBLIOGRAPHY, fresh page, everything consulted whether cited or not,
alphabetical by surname, page numbers generally omitted, repeated authors replaced by a double em-dash,
unattributed works first.

---

## 3. What HQ does today, and where it breaks

### 3.1 The footnotes do not exist — this alone blocks every law order

`citationPlacementFor` in `src/lib/generation/referencing.ts` correctly routes NALT and doctrinal Law to
`MODE_C` (page footnotes). Nothing then implements it:

- **`src/lib/generation/prompt-loader.ts:917`** — the note-marker instruction is pushed only
  `if (placement === "MODE_A" || placement === "MODE_B")`. A MODE_C chapter is never told to write
  `^N` markers or an `[ENDNOTES]` block, so it falls back to the prompt files' `¹` `²` examples.
- **`src/lib/assembly/assemble.ts:1042`** — the MODE_C branch only records a note:
  *"the footnote text is not produced yet, so the specialist adds the notes."*
- **`src/lib/assembly/assemble.ts:1052`** — notes are resolved against the verified reference list only
  for MODE_A and MODE_B, so a law report's bibliography is built from nothing.
- **`src/lib/quality/structural-checks.ts:363`** — ST12 counts a note-style report's references from
  `[ENDNOTES]` entries. A MODE_C report has none, so **ST12 reads 0 and fails every law report.**

The Word *reader* already handles real footnotes (`readWordNotes` in `read-chapter-docx.ts` reads
`word/footnotes.xml`), so the chapter-review loop can take a specialist's footnoted file back in.
Only the writing side is missing.

Net effect: a doctrinal law order today produces five chapters with no footnotes, an empty
bibliography, and a quality gate that fails it on reference count. The benchmark needs 446 footnotes.

### 3.2 Chapter One is the wrong shape

`required-sections.ts:165` requires, for LAW_DOCTRINAL Chapter One:
`BACKGROUND, PROBLEM, OBJECTIVES, RQ, SIGNIFICANCE, SCOPE, METHODOLOGY_BRIEF, LITERATURE_BRIEF`.
The Chapter 1 prompt block numbers them 1.1–1.8 in that order.

| | NALT / benchmark | HQ |
|---|---|---|
| Research questions | sub-section **1.2.1** under the problem | numbered section **1.4** |
| 1.4 | SCOPE AND LIMITATIONS | Research Questions |
| 1.5 | SIGNIFICANCE | Significance |
| 1.6 | RESEARCH METHODOLOGY | Scope of the Study |
| 1.7 | **SYNOPSIS OF THE CHAPTERS** | Research Methodology |
| 1.8 | — | Literature Review |
| Synopsis / chapters analysis | **mandatory** | **absent — not required, not checked** |
| Scope | scope **and limitations** | "Scope of the Study" only |

The synopsis is the gap that matters: NALT calls it "a very critical area of a research project" and the
benchmark gives it 1.7 with a paragraph per chapter. HQ never asks for it and never checks for it.

### 3.3 Chapter Five is missing three of its five mandatory sections

`required-sections.ts:259` requires only `[CONCLUSION, RECOMMENDATIONS]`.

The Chapter 5 prompt's Law block gives 6.1 Introduction · 6.2 Summary of Findings · 6.3 Conclusion ·
6.4 Recommendations · 6.5 Suggestions for Further Research. `LOADER_TEXT.lawConclusion` maps 6.x onto 5.x,
producing:

| NALT / benchmark | HQ produces |
|---|---|
| 5.1 SUMMARY OF FINDINGS | 5.1 Introduction |
| 5.2 RECOMMENDATIONS | 5.2 Summary of Findings |
| 5.3 CONTRIBUTIONS TO KNOWLEDGE | 5.3 Conclusion |
| 5.4 AREAS FOR FURTHER STUDIES | 5.4 Recommendations |
| 5.5 CONCLUSION | 5.5 Suggestions for Further Research |

**Contributions to Knowledge is absent entirely.** The conclusion sits in the middle instead of last.
An Introduction section is added that NALT does not have. And `TEMPLATE_B_CONCLUSION`, loaded above it,
says the final chapter "does NOT have numbered sub-sections" — contradicting both NALT and the Law
block in the same file.

### 3.4 Chapter Two has five sub-sections where NALT mandates three

The prompt gives 2.1 Introduction · 2.2 Conceptual Framework · 2.3 Theoretical Framework ·
2.4 Review of Related Empirical Works · 2.5 Summary of Literature Reviewed and Research Gap.

NALT and the benchmark: 2.1 CONCEPTUAL CLARIFICATIONS · 2.2 THEORETICAL **AND HISTORICAL** FOUNDATION ·
2.3 LITERATURE REVIEW. No Introduction section, and the **historical foundation is dropped by HQ** though
NALT names it explicitly ("not only the historical background but the theoretical framework").

Chapter title: HQ "CONCEPTUAL AND THEORETICAL FRAMEWORK AND LITERATURE REVIEW";
benchmark "CONCEPTUAL, THEORETICAL FRAMEWORKS AND LITERATURE REVIEW".

### 3.5 The heading case is wrong for law, and the assembly actively corrupts it

`formatting_rules.md` AL3/H2 require Title Case for H2 and sentence case for H3, in every department.
NALT requires H2 in **UPPER CASE**. The benchmark uses UPPER CASE H2 and **Title Case** H3.

Two consequences:

1. `titleCase()` and `sentenceCase()` in `src/lib/assembly/text-rules.ts` would **rewrite** a correct
   NALT heading: `1.1 BACKGROUND TO THE STUDY` → `1.1 Background to the Study`, and
   `2.1.1 Definition of a Child` → `2.1.1 Definition of a child`.
2. The gate would then fail the benchmark itself: H2 and H3 are MAJOR, AL3 and AL4 MINOR.

**If HQ produced a perfect NALT law report today, its own quality gate would reject it.**

### 3.6 The prompt library's NALT footnote example teaches the wrong citation

The Chapter 1 Law block gives:

```
First appearance: ¹ Author Surname, 'Title' (Year) Volume(Issue) Journal/Publisher Page.
Example: ¹ Falola, 'Understanding Colonial Nigeria' (1996) Carolina Academic Press 45.
```

That is a **book** cited in journal-article shape — title in single quotation marks instead of italics,
publisher where the journal name goes, and surname only. NALT for a book is
`Toyin Falola, *Culture and Customs of Nigeria* (Greenwood Press 2001) 45.` — name **as printed in the
source**, comma, italic title, (publisher year), pinpoint. Surname-first is the bibliography form, not
the footnote form. The benchmark's 446 footnotes all follow the correct shape:

```
David M Rosen, Armies of the Young: Child Soldiers in War and Terrorism (Rutgers University Press 2005) 8-14.
Child's Rights Act 2003 (Nigeria), s 34.
Constitution of the Federal Republic of Nigeria 1999 (as amended), s 12(1).
Prosecutor v Thomas Lubanga Dyilo (Judgment Pursuant to Article 74 of the Statute) ICC01/0401/062842 (14 March 2012).
Drumbl (n 24) 96-102.
ibid, art 1.
```

One bad example in a cached system prompt shapes every footnote in every law report.

### 3.7 Six chapters is still written throughout the law prompts

Every law block says `Chapter count: SIX`. The Chapter 1 block carries an explicit
"SIX-CHAPTER RULE" naming Ch.3/4/5 as three thematic arguments and Ch.6 as the conclusion.
`MAX_REPORT_CHAPTERS = 5` and `LOADER_TEXT.fiveChapters` override it with a note, but the model still
reads the six-chapter instruction first, and Ch.4's block tells it recommendations come in "Chapter Five"
while Ch.5's block says Chapter Five is a third thematic chapter. NALT: six chapters is PhD only.

### 3.8 Smaller conflicts

| | NALT / benchmark | HQ |
|---|---|---|
| Three or more authors | "and others" (0 uses of *et al.* in the benchmark) | `reference_rules.md` Rule 2: *et al.* italicised, "zero exceptions" |
| Objectives | 3–6 (doctrinal), 4–6 (non-doctrinal) | `MIN_OBJECTIVES = 4`, `MAX_OBJECTIVES = 5` — cannot reach 6 |
| Research questions | not more than 6, itemised | not checked for count |
| Abstract | un-paragraphed single block, single spaced, last preliminary page | 240–320 words; the preliminary template puts the **table of contents last**, NALT puts the **abstract last** |
| List of cases / statutes | mandatory preliminaries for law | HQ's preliminaries build List of Tables / List of Figures instead |
| Non-doctrinal | "applicable only to master and PhD candidates" | Mode 2 offered to any Law order |
| Chapter start | "every chapter starts on a fresh page" | met |
| Direct quotations | benchmark has none; HQ already bans them | met — keep it |

---

## 4. Where the benchmark departs from NALT — founder's call

These are the points where the professor-approved project does not match the printed guide.

1. **Literature review in Chapter One.** NALT's explanatory note says Chapter One contains
   "(Literature Review inclusive for undergraduate only)", and its Chapter One skeleton runs 1.1–1.6 then
   jumps to "1.8 CHAPTERS ANALYSIS", implying 1.7 is the literature review. The benchmark has **no**
   literature review in Chapter One and uses 1.7 for the synopsis. NALT also describes the Chapter Two
   literature review as belonging to "both master dissertation and PhD thesis", omitting undergraduates —
   so the guide can be read as moving the review from Chapter Two to Chapter One at undergraduate level.
   The benchmark keeps it in Chapter Two (2.3) and does both chapters properly.

2. **Abstract length.** NALT contradicts itself: the long-essay guidelines say "not more than 200-350",
   the abstract guidelines say "not more 300-400 words for undergraduate". The benchmark is **283 words**.
   HQ currently writes 240–320.

3. **Bibliography shape.** NALT Part Three describes one alphabetical list by surname with double em-dashes
   for repeated authors. The benchmark splits it: PRIMARY SOURCES (Treaties and International Instruments ·
   United Nations Resolutions · Cases · Nigerian Legislation) then SECONDARY SOURCES (Books ·
   Journal Articles · United Nations Reports and Documents · Soft Law Instruments). HQ's own Chapter 1
   Law block already asks for the split.

4. **Research questions against objectives.** NALT: the questions "must correspond with the number of
   specific research objectives". The benchmark has **6 questions and 5 objectives**, and the professor
   passed it.

5. **Page count.** NALT: 50–100 pages for a long essay. The benchmark is 98 pages of body plus 18 of
   bibliography, 116 in all — at the ceiling if the bibliography is excluded, over it if not.

6. **12pt everywhere.** NALT says font size 12. The benchmark's title page and contents field carry
   7.5–14pt runs. The body is 12pt.

---

## 5. What I propose to build

**A. Real Word footnotes (MODE_C).** The model writes `^N` markers and a `[FOOTNOTES]` block per part;
the assembly emits `word/footnotes.xml` with superscript references, Times New Roman 10pt, single spaced,
numbered continuously across the whole document. Notes resolve against the verified reference list so the
bibliography is built from what was actually cited. ST12 counts footnotes.

**B. A NALT heading profile.** H2 upper case, H3 Title Case, for `LAW_DOCTRINAL`, `LAW_NON_DOCTRINAL` and
any report whose style is NALT. `titleCase`/`sentenceCase` are not applied to those headings; AL3/AL4/H2/H3
judge them against the law profile instead.

**C. Rewrite the law blocks in the five prompt files** — five chapters, NALT's section lists in NALT's order,
the synopsis as 1.7, the correct footnote examples per source type, "and others", `ibid` and `(n X)`
discipline, the abolished-Latin ban, and a footnote-density instruction anchored on the benchmark.

**D. NALT preliminaries** — list of cases, list of statutes/treaties/international instruments,
list of abbreviations, abstract last, no list of tables or figures unless the report has any.

**E. Gate rules for law** — Chapter One's seven sections including the synopsis; Chapter Five's five sections
in order; Chapter Two's three sub-sections including the historical foundation; footnote density;
no abolished Latin signals; `ibid` only after an immediately preceding note; every `(n X)` resolving to a
real earlier footnote; case names italic; `v` unpunctuated.

**F. Route Law undergraduate orders to doctrinal** unless the supervisor's own brief demands empirical work.

