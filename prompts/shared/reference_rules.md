# EDUCRAFT REFERENCE RULES
## Shared Rules — Appended to Every Chapter Generation Prompt
## Source: EDUCRAFT_REFERENCE_VERIFICATION_SYSTEM_v1 (Session 4) + EDUCRAFT_VOICE_v1.1 (Session 2)

---

## PURPOSE

Every reference in an EduCraft report must be:
1. **Real** — verified via Zotero DOI/metadata pipeline (Tier 1 — already solved)
2. **Relevant** — topically connected to the project (Tier 2 — automated AI check)
3. **Correctly used** — the specific citation must support the specific claim (Tier 3 — selective AI check)

These rules govern how you generate citations within chapter content. The verification system runs automatically after submission and will flag violations.

---

## CITATION FORMAT — APA 7TH EDITION

**APA 7th edition is the default** for all EduCraft reports unless the department specifies otherwise.

Exceptions by department:
- Some Law programmes: MLA or Chicago
- Some Nursing programmes: APA 7th (NMCN standard) or professional-body format
- Specified at intake — the prompt will carry the correct citation format if it differs

---

## HARD RULES — APPLY TO EVERY CHAPTER

### Rule 1 — Every Citation Must Support the Specific Claim

Every citation must actually support the **specific claim in the sentence it accompanies**. Do not use references as decoration.

- **Weak:** "Solar energy is important (Smith, 2020)."
- **Strong:** "Global installed solar capacity increased from 40 GW in 2010 to 942 GW in 2021 (IEA, 2022)."

The second version uses the citation to support a specific factual claim with specific values. The first uses it as ornament. The first fails Tier 3 verification.

### Rule 2 — *et al.* Is Always Italicised

The abbreviation *et al.* must always appear in italics. Every occurrence. In the body text and in the References list. This is a hard rule with zero exceptions.

### Rule 3 — Distribute References Across the Chapter

Do not cluster references in the first few pages. Citations should follow the argument throughout the chapter.

A chapter with references clustered in the first 5 pages and then nothing signals that the writer front-loaded background and then drifted into unsupported claims. This is an AI writing pattern and a Tier 3 flag.

### Rule 4 — All Cited Visual Sources Must Appear in the References List

Every table, figure, image, plate, chart, graph, diagram, or schematic from an external source must:
1. Have a citation directly beneath its caption in `(Author, Year)` format
2. Have a full reference entry in the References list at the end of the report

This is the most commonly missed citation rule. Writers cite figures below the caption but forget to add the source to the References list. That is an incomplete citation and a verification failure.

---

## TIER 2 RELEVANCE REQUIREMENTS

When generating a chapter, every reference you cite will be automatically classified as:

| Classification | Definition |
|---|---|
| **CORE** | Directly addresses the project's central topic, methodology, or research question |
| **CLOSELY_RELATED** | Adjacent field, foundational theory, methodology source, or comparison benchmark that supports the project's argument |
| **TANGENTIAL** | Shares keywords with the project but addresses a different actual subject |
| **IRRELEVANT** | No substantive connection to the project topic |

**A chapter PASSES Tier 2 only if ALL three conditions are met:**

| Rule | Threshold |
|---|---|
| Rule 1 | ≥75% of references classified as CORE or CLOSELY_RELATED |
| Rule 2 | Zero references classified as IRRELEVANT |
| Rule 3 | TANGENTIAL references ≤15% of total |

**Exception — Chapter 1:** The Introduction may have a slightly higher proportion of contextual (TANGENTIAL) references. The relaxed threshold for Chapter 1 is ≥60% CORE or CLOSELY_RELATED (instead of 75%).

**What this means for generation:** Every reference you cite must have a substantive connection to the project topic, methodology, or argument. Citing papers that share a keyword but address a different subject (e.g., citing a "5G network planning" paper in an antenna hardware design project) causes a Tier 2 SOFT FAIL or HARD FAIL.

Even one IRRELEVANT reference triggers a HARD FAIL. The entire chapter is returned to the worker for revision.

---

## TIER 3 COHERENCE REQUIREMENTS

The system also checks (on flagged and sampled chapters) whether each specific citation actually supports the specific sentence it accompanies. Each citation is classified as:

| Classification | Meaning |
|---|---|
| **SUPPORTS** | The source substantively supports the claim |
| **PARTIALLY_SUPPORTS** | The source is related but does not fully support the specific claim |
| **DOES_NOT_SUPPORT** | The source does not support this specific claim |
| **CANNOT_DETERMINE** | Insufficient information to judge (abstract unavailable) |

**Pass threshold:** ≥85% of citations must be classified as SUPPORTS.

A citation that is topically relevant (CORE in Tier 2) can still fail Tier 3 if the specific claim it accompanies is not supported by what that paper actually reports.

**Common Tier 3 failures to avoid:**
- Citing a methods paper for a specific numerical value that paper does not report
- Citing a general textbook for a specific measured claim that requires a primary source
- Citing a paper for a claim that contradicts what the paper actually found

---

## REFERENCE LIST FORMATTING (APA 7TH EDITION)

**In the References section at the end of the document:**

1. **Alphabetical order** by first author surname
2. **Hanging indent** format (first line flush, subsequent lines indented ~0.5 inch)
3. **Journal names italicised**
4. **Volume numbers italicised**
5. **All *et al.* italicised**
6. **No duplicate entries**

**APA 7th general formats:**

Journal article:
```
Author, A. A., & Author, B. B. (Year). Title of article. *Journal Name*, *volume*(issue), pages. https://doi.org/xxxxx
```

Book:
```
Author, A. A. (Year). *Title of book* (edition if not first). Publisher.
```

Chapter in edited book:
```
Author, A. A. (Year). Title of chapter. In E. E. Editor (Ed.), *Title of book* (pp. pages). Publisher.
```

Conference paper:
```
Author, A. A. (Year). Title of paper. *Proceedings of the Conference Name*, pages.
```

Website:
```
Author, A. A. (Year, Month Day). Title of page. Website Name. URL
```

---

## IN-TEXT CITATION FORMAT (APA 7TH)

- **One or two authors:** (Smith, 2020) or (Smith & Jones, 2020)
- **Three or more authors:** (Smith *et al.*, 2020) — *et al.* always italicised
- **Multiple citations in one bracket:** (Adams, 2019; Smith, 2020) — alphabetical order, separated by semicolons
- **Direct quote:** include page number — (Smith, 2020, p. 45)
- **Paraphrase:** no page number required

---

## WHAT MAKES A STRONG REFERENCE SET FOR EACH CHAPTER

**Chapter 1 — Introduction:**
- Contextual background sources (broad field — CLOSELY_RELATED acceptable)
- Sources that confirm the problem exists and matters
- Sources that define the research gap
- Relaxed threshold: ≥60% CORE/CLOSELY_RELATED

**Chapter 2 — Literature Review:**
- Primarily CORE references — directly related to the project topic
- Papers whose results (numerical values, methodologies, findings) are being reviewed and critiqued
- Foundational and seminal works in the specific field
- Methodology comparison benchmarks
- Strictest threshold: ≥75% CORE/CLOSELY_RELATED, zero IRRELEVANT, ≤15% TANGENTIAL

**Chapter 3 — Methodology:**
- Sources that justify each method choice
- Standards, protocols, or validated procedures that were followed
- Software or tool documentation where needed
- Materials characterisation sources

**Chapter 4 — Data Analysis / Results:**
- Benchmark sources for comparison (studies that reported similar measurements)
- Standards that define acceptable performance ranges
- Statistical method sources if advanced analysis was used

**Chapter 5 — Summary, Conclusion, Recommendations:**
- Generally no new references in Chapter 5
- If a reference is introduced here, it must be essential to the conclusion — not background material

---

## REFERENCE QUALITY CHECK

Before finalising any chapter, verify:

- [ ] Every in-text citation has a corresponding entry in the References list
- [ ] Every entry in the References list is cited at least once in the text
- [ ] Every table, figure, image, or plate from an external source has a caption citation AND a References list entry
- [ ] *et al.* is italicised in every occurrence — body text and References list
- [ ] References are in alphabetical order
- [ ] References have hanging indent format
- [ ] Journal names and volumes are italicised in References
- [ ] No duplicate references
- [ ] At least 75% of references are CORE or CLOSELY_RELATED to the project topic (60% for Chapter 1)
- [ ] Zero IRRELEVANT references
- [ ] Citations are distributed across the chapter — not front-loaded
- [ ] Each citation supports the specific claim in the sentence where it appears
