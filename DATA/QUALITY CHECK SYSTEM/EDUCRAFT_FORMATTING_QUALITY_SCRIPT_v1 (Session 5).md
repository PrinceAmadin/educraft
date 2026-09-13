# EDUCRAFT FORMATTING QUALITY SCRIPT

## Layer 3 of the EduCraft Quality Standard — Version 1.0

---

## WHAT THIS SYSTEM DOES

The Formatting Quality Script reads a `.docx` file and answers one question: **does this document meet EduCraft's formatting requirements?**

This is the most automatable layer in the quality system. A Python script using the `python-docx` library can verify 90%+ of formatting rules in under 3 seconds per document. No AI needed. No human judgment needed. Pure mechanical verification.

Every formatting rule in this document traces back to Prince's direct instructions, supervisor corrections, or department-specific requirements documented in the EduCraft Masterclass and Engineering Chapter Writing Guides.

---

## WHY THIS MATTERS

Formatting errors are:
- **The most common reason for revision requests** — workers consistently get page numbering, spacing, and heading styles wrong
- **The cheapest to catch** — a script catches them instantly, before a human wastes 20 minutes reviewing
- **The most embarrassing when missed** — a client receiving a report with broken page numbering, wrong fonts, or split tables looks unprofessional regardless of how good the content is

At 15,000 projects/year, even a 5-minute manual formatting check per project = 1,250 hours/year of human time. The script replaces most of that with a 3-second automated check.

---

## THE MASTER FORMATTING STANDARD

These rules apply to **all EduCraft Final Year Project reports** unless overridden by department-specific rules or client instructions. Simpler service tiers (Term Papers, IT Reports) use a subset.

### Font Rules

| Rule ID | Rule | Check Method |
|---|---|---|
| F1 | Font family: Times New Roman throughout | Script: scan all runs, flag any non-TNR font |
| F2 | Body text size: 12pt | Script: scan all paragraph runs with no heading style |
| F3 | Heading size: 12pt (same as body — all report types) | Script: scan heading-styled paragraphs |

**Note:** All EduCraft report types use 12pt for both body and headings. There is no exception for any report type. The only service that uses different sizing is Publication Reports (10pt body, 14pt title, 9pt captions).
| F4 | Bold for all headings (H1, H2, H3) | Script: verify bold property on heading runs |
| F5 | No coloured text (pure black throughout) | Script: scan all runs for non-black font colour |
| F6 | No underline on headings (bold only) | Script: verify no underline on heading-styled runs |

**Exception — Publication Reports:** Publications use 10pt body, 14pt title, 9pt captions. Completely different size rules — handled by a separate formatting profile.

### Spacing Rules

| Rule ID | Rule | Check Method |
|---|---|---|
| S1 | Line spacing: exactly 2.0 for all body paragraphs | Script: check `paragraph_format.line_spacing` |
| S2 | No extra spacing before headings | Script: check `paragraph_format.space_before` = 0 or Pt(0) for H1 |
| S3 | No extra spacing after headings | Script: check `paragraph_format.space_after` = 0 or Pt(0) for H1 |
| S4 | Line spacing 2.0 for headings (same as body) | Script: verify heading paragraphs also use 2.0 |
| S5 | No extra paragraph spacing anywhere in body | Script: flag any paragraph with space_before or space_after > Pt(0) that isn't a structural element |

**This is a strict rule Prince has enforced repeatedly:** "The only spacing that is permitted throughout the document is just 2.0, nothing less, nothing more." AI systems consistently add extra spacing above and below Heading 1. The script must catch this.

**Exception — Proposals:** Use 1.5 line spacing instead of 2.0.

**Exception — Tables:** Tables may use 1.5 or 1.0 line spacing internally to fit on one page (per the table continuity rule). The script should NOT flag reduced spacing inside table cells.

**Exception — Publication Reports:** Publications use compact single-column/double-column layout. Different spacing rules entirely.

### Margin Rules

| Rule ID | Rule | Check Method |
|---|---|---|
| MG1 | Top margin: 1.0 inch (2.54 cm) | Script: check `document.sections[].top_margin` |
| MG2 | Bottom margin: 1.0 inch (2.54 cm) | Script: check `document.sections[].bottom_margin` |
| MG3 | Left margin: 1.0 inch (2.54 cm) | Script: check `document.sections[].left_margin` |
| MG4 | Right margin: 1.0 inch (2.54 cm) | Script: check `document.sections[].right_margin` |

**Note:** Some departments require a left margin of 1.5 inches for binding. This should be captured at intake and the script should use the correct value. Default is 1.0 inch all sides.

**Tolerance:** Allow ±0.05 inch (±0.13 cm) tolerance. Word sometimes rounds internally.

### Alignment Rules

| Rule ID | Rule | Check Method |
|---|---|---|
| AL1 | Body text: Justified alignment | Script: check `paragraph_format.alignment` = WD_ALIGN_PARAGRAPH.JUSTIFY |
| AL2 | Heading 1: Centre alignment, UPPER CASE | Script: check alignment + verify text is uppercase |
| AL3 | Heading 2: Left alignment, Title Case (Capitalise Each Word) | Script: check alignment + verify title case |
| AL4 | Heading 3: Left alignment, Sentence case (only first word capitalised) | Script: check alignment + verify sentence case |

### Heading Style Rules

| Rule ID | Rule | Applies To | Check Method |
|---|---|---|---|
| H1 | Heading 1 = Chapter headings: 12pt, Bold, TNR, Centred, UPPER CASE | "CHAPTER ONE", "INTRODUCTION", etc. | Script: verify style + properties |
| H2 | Heading 2 = Section headings (1.1, 1.2, etc.): 12pt, Bold, TNR, Left-aligned, Title Case | "1.1 Background of the Study" | Script: verify style + properties |
| H3 | Heading 3 = Sub-section headings (1.1.1, 1.1.2, etc.): 12pt, Bold, TNR, Left-aligned, Sentence case | "2.1.1 Overview of antimicrobial resistance" | Script: verify style + properties |
| H4 | No heading level beyond H3 | Any "1.1.1.1" style numbering | Script: flag any H4+ or four-level numbering |

### Paragraph Rules

| Rule ID | Rule | Check Method |
|---|---|---|
| P1 | No paragraph indentation (first-line indent = 0) | Script: check `paragraph_format.first_line_indent` = 0 |
| P2 | No hyphens used as sentence separators (em-dash, en-dash) | Script: scan text for — and – characters (Unicode U+2014, U+2013) |
| P3 | Inline hyphens permitted (co-operator, self-contained, real-time) | Script: only flag hyphens that are surrounded by spaces or follow a comma/period |
| P4 | All *et al.* must be italicised | Script: find all occurrences of "et al" in text, verify the run containing it has italic=True |
| P5 | No coloured text, highlighting, or background shading | Script: scan all runs for non-default colour/highlight |

### Page Numbering Rules

| Rule ID | Rule | Check Method |
|---|---|---|
| PN1 | Preliminary pages: Roman numerals (i, ii, iii, iv, etc.) | Script: check page number format in the first section's footer |
| PN2 | Main body (from Chapter One): Arabic numerals (1, 2, 3, etc.) | Script: check page number format in the main section's footer |
| PN3 | Page numbering restarts at 1 for the main body | Script: verify section break + page numbering restart |
| PN4 | Page numbers appear in footer, centre-aligned | Script: verify footer content and alignment |

**Centre-aligned is the only acceptable position.** Right-aligned page numbers are not permitted in any EduCraft report.

**This is one of the most common formatting failures.** AI systems consistently fail to set up the two-section page numbering correctly. The script must specifically verify that:
1. A section break exists between preliminary pages and Chapter One
2. The first section uses Roman numeral formatting
3. The second section uses Arabic numeral formatting starting from 1
4. The second section's footer is NOT linked to the first section's footer

### Table Rules

| Rule ID | Rule | Check Method |
|---|---|---|
| T1 | Tables must not break across pages unnecessarily | Script: check if table rows have `allow_break_across_pages` = False |
| T2 | Engineering tables: three-line format only (top border, header-bottom border, bottom border — 0.5pt) | Script: check table border properties for engineering projects |
| T3 | No vertical borders on tables (engineering standard) | Script: verify no left/right/internal vertical borders on tables |
| T4 | No shading, colours, or background fills on table cells | Script: check cell shading properties |
| T5 | Table captions must exist for every table | Script: count tables, count table caption styles, verify counts match |
| T6 | Table captions placed ABOVE the table, centre-aligned | Script: verify caption paragraph appears before the table element and is centre-aligned |
| T7 | Table caption style must use the designated "Table Caption" style | Script: verify style name on caption paragraphs |
| T8 | All tables must appear in the List of Tables (preliminary pages) with correct page numbers | Script: verify every table caption has a corresponding entry in the List of Tables |

**For table page-break detection (T1):**

The script cannot directly tell if a table visually breaks across pages (that requires rendering). But it can:
1. Check the `allow_break_across_pages` property on rows
2. Estimate table height from row count × approximate row height
3. Flag tables likely to overflow a page based on their position and estimated size
4. Mark this as a WARNING rather than FAIL (human verifies the actual render)

### Figure / Image Rules

| Rule ID | Rule | Check Method |
|---|---|---|
| FG1 | Figure captions must exist for every figure | Script: count inline images, count figure caption styles, verify counts match |
| FG2 | Figure captions placed BELOW the figure, centre-aligned | Script: verify caption paragraph appears after the image element and is centre-aligned |
| FG3 | Figure caption style must use the designated "Figure Caption" or equivalent style | Script: verify style name |
| FG4 | All figures from external sources must have a citation in the caption | Script + AI: check caption text for citation pattern "(Author, Year)" |
| FG5 | Author-generated figures must be marked "(Author, Year)" | Script + AI: verify presence |
| FG6 | All figures must appear in the List of Figures (preliminary pages) with correct page numbers | Script: verify every figure caption has a corresponding entry in the List of Figures |

### Equation Rules

| Rule ID | Rule | Check Method |
|---|---|---|
| EQ1 | Every equation must be on its own line (not inline with body text) | Script: detect equation objects, verify they are in their own paragraph |
| EQ2 | Equations must be in borderless two-column tables (equation left, number right) | Script: check if equation paragraphs are inside a 2-column table with no borders |
| EQ3 | Equation numbering in Chapter.Number format: 3.1, 3.2 (NO parentheses) | Script: scan for equation number in right column of equation tables, verify format is plain decimal not parenthesised |
| EQ4 | Sequential equation numbering within each chapter | Script: verify numbers are sequential and restart each chapter |

**Important — No parentheses on equation numbers.** This was a specific supervisor correction. The equation number format is `3.1` not `(3.1)`.

**Exception — Publication Reports:** Publication equation numbering uses parentheses: `(1)`, `(2)`, `(3)`. This is the only exception.
| EQ5 | Equations must be native Word equation objects (OMML), not images | Script: check for equation XML elements vs inline images of equations |

**Note on EQ2:** This is a rule Prince has flagged repeatedly — AI systems consistently fail to place equations in the borderless two-column table format. The script should specifically look for:
- A table with exactly 2 columns
- All borders set to none/zero
- Left column containing an equation element
- Right column containing the equation number in parentheses

If equations exist outside of two-column tables, FLAG.

### Table of Contents Rules

| Rule ID | Rule | Check Method |
|---|---|---|
| TOC1 | Table of Contents must be populated (not empty) | Script: check TOC field exists and has entries |
| TOC2 | TOC entries must match actual heading text in the document | Script: extract TOC entries, extract headings, compare |
| TOC3 | TOC page numbers must be updatable (field codes, not manually typed) | Script: verify TOC is a Word field, not hardcoded text |
| TOC4 | TOC must include Heading 1, Heading 2, AND Heading 3 levels | Script: verify TOC field instruction includes levels 1–3 and that H3 entries appear in the TOC |
| TOC5 | TOC must NOT have dotted tab leaders (no dotted lines connecting entries to page numbers) | Script: check TOC tab leader style — must be none/blank, not dot |

**No dotted lines in TOC.** The Table of Contents must use clean spacing between the heading text and the page number — no dotted leader lines. This applies equally to the List of Figures, List of Tables, and List of Appendices.

**Note on TOC accuracy:** The script cannot verify that TOC page numbers are correct (that requires rendering). But it CAN verify that the TOC was generated from heading styles (which means a simple "Update Fields" in Word will correct the page numbers). If the TOC is manually typed, it will go stale after any edit — this is a critical failure.

### List of Figures / List of Tables / List of Appendices Rules

| Rule ID | Rule | Check Method |
|---|---|---|
| LF1 | If report contains ANY figures (even one), List of Figures must exist | Script: count figures, check for LoF |
| LF2 | List of Figures entries must match actual figure captions with exact page numbers | Script: compare LoF entries to figure captions |
| LF3 | List of Figures must NOT have dotted tab leaders | Script: check tab leader style |
| LT1 | If report contains ANY tables (even one), List of Tables must exist | Script: count tables, check for LoT |
| LT2 | List of Tables entries must match actual table captions with exact page numbers | Script: compare LoT entries to table captions |
| LT3 | List of Tables must NOT have dotted tab leaders | Script: check tab leader style |
| LA1 | If report contains ANY appendices, List of Appendices must exist in preliminary pages | Script: check for appendices section, check for LoA |
| LA2 | List of Appendices entries must match actual appendix titles with exact page numbers | Script: compare LoA entries to appendix headings |
| LA3 | List of Appendices must NOT have dotted tab leaders | Script: check tab leader style |

**No dotted lines.** This rule applies to the Table of Contents, List of Figures, List of Tables, and List of Appendices equally. Clean spacing only — no dotted leader lines connecting entries to page numbers.

### Reference Section Rules

| Rule ID | Rule | Check Method |
|---|---|---|
| R1 | References section must exist | Script: search for "References" or "Bibliography" heading |
| R2 | References must be in alphabetical order by first author surname | Script: extract reference entries, compare sort order |
| R3 | References must have hanging indent (APA standard) | Script: check paragraph format for hanging indent on reference entries |
| R4 | Journal names in references must be italicised | Script: scan reference paragraphs for journal-name patterns, verify italic |
| R5 | All *et al.* in references must be italicised | Script: same as P4 but specifically within reference section |
| R6 | No duplicate references | Script: detect near-duplicate entries (same authors + year + similar title) |

---

## FORMATTING PROFILES

Different service tiers and departments use different formatting rules. The script loads the correct profile before running.

### Profile: FYP_STANDARD (Default)

All rules above apply as written. This is the default for Final Year Projects across all departments unless overridden.

| Setting | Value |
|---|---|
| Font | Times New Roman |
| Body size | 12pt |
| Heading size | 12pt |
| Line spacing | 2.0 |
| Margins | 1.0 inch all sides |
| Page numbering | Roman (prelims) + Arabic (body) |
| Equation format | Borderless 2-column table |
| Table format | Three-line (Engineering) or standard (others) |

### Profile: FYP_PROPOSAL

Same as FYP_STANDARD except:

| Setting | Override |
|---|---|
| Line spacing | 1.5 (not 2.0) |
| Page count | 15–20 pages |
| S1 rule threshold | 1.5 instead of 2.0 |

### Profile: TERM_PAPER

| Setting | Value |
|---|---|
| Font | Times New Roman |
| Body size | 12pt |
| Heading size | 12pt (same as all other reports) |
| Line spacing | 2.0 |
| Margins | 1.0 inch all sides |
| Equation format | Standard (no two-column table required) |
| Table format | Standard (bottom border only required) |
| TOC | Optional (not required for term papers under 30 pages) |
| List of Figures/Tables | Required if any figures/tables exist |

### Profile: PUBLICATION

Completely different formatting from project reports:

| Setting | Value |
|---|---|
| Font | Times New Roman |
| Title size | 14pt bold centred |
| Author size | 10pt centred |
| Affiliation size | 9pt italic centred |
| Body size | 10pt |
| Caption size | 9pt bold centred |
| Layout | Two-column borderless table from Section I onwards |
| Page size | US Letter (8.5 × 11 in) |
| Margins | ~0.70 inch left/right |
| Line spacing | Compact (single or 1.15) |
| Table format | Three-line only |
| Equation format | Native Word equations (OMML) |

### Profile: NURSING_NMCN

Same as FYP_STANDARD plus:

| Setting | Override |
|---|---|
| Block-style paragraphing | No first-line indent (same as standard) |
| Quotations over 40 words | Free-standing block, no quotation marks, single spacing |
| Reference format | APA 7th, alphabetical |

### Profile: ENGINEERING

Same as FYP_STANDARD plus:

| Setting | Override |
|---|---|
| Table format | Three-line ONLY (T2, T3 rules enforced strictly) |
| Diagram style | Black and white only, no decorative colours |
| Equation format | Borderless two-column table (strictly enforced) |
| Table description | Before the table, left-aligned |
| Figure description | After the figure, centre-aligned |

### Profile Selection Logic

```
if service_type == "PUBLICATION":
    profile = PUBLICATION
elif service_type == "FYP_PROPOSAL":
    profile = FYP_PROPOSAL
elif service_type in ["TERM_PAPER", "ASSIGNMENT", "MINI_PROJECT"]:
    profile = TERM_PAPER
elif department == "Engineering":
    profile = ENGINEERING
elif department in ["Nursing", "Midwifery"]:
    profile = NURSING_NMCN
else:
    profile = FYP_STANDARD
```

---

## THE SCRIPT ARCHITECTURE

### Technology

| Component | Technology |
|---|---|
| Language | Python 3.10+ |
| Document parsing | `python-docx` library |
| XML access | `lxml` (for accessing raw OOXML when python-docx can't reach a property) |
| Output | JSON report + human-readable summary |
| Integration | Called via API endpoint or CLI |

### Script Structure

```python
# formatting_checker/
#
# __init__.py
# checker.py          — Main entry point
# profiles.py         — Formatting profiles (FYP_STANDARD, TERM_PAPER, etc.)
# rules/
#   __init__.py
#   font_rules.py     — F1–F6
#   spacing_rules.py  — S1–S5
#   margin_rules.py   — MG1–MG4
#   alignment_rules.py — AL1–AL4
#   heading_rules.py  — H1–H4
#   paragraph_rules.py — P1–P5
#   page_number_rules.py — PN1–PN4
#   table_rules.py    — T1–T7
#   figure_rules.py   — FG1–FG5
#   equation_rules.py — EQ1–EQ5
#   toc_rules.py      — TOC1–TOC3
#   list_rules.py     — LF1–LF2, LT1–LT2
#   reference_rules.py — R1–R6
# report.py           — Generate results report
# utils.py            — Helper functions (unit conversion, style extraction)
```

### Main Entry Point

```python
# checker.py (pseudocode)

from docx import Document
from profiles import get_profile
from rules import ALL_RULES
from report import generate_report

def check_formatting(docx_path: str, service_type: str, department: str) -> dict:
    """
    Main function. Opens a .docx file, applies the correct 
    formatting profile, runs all applicable rules, and returns 
    a structured result.
    """
    # 1. Load document
    doc = Document(docx_path)
    
    # 2. Select formatting profile
    profile = get_profile(service_type, department)
    
    # 3. Run each rule against the document
    results = []
    for rule in ALL_RULES:
        if rule.applies_to(profile):
            result = rule.check(doc, profile)
            results.append(result)
    
    # 4. Aggregate results
    passes = [r for r in results if r.status == "PASS"]
    warnings = [r for r in results if r.status == "WARNING"]
    failures = [r for r in results if r.status == "FAIL"]
    
    # 5. Determine overall status
    if any(r.severity == "CRITICAL" for r in failures):
        overall = "HARD_FAIL"
    elif len(failures) > 0:
        overall = "REVISION_NEEDED"
    elif len(warnings) > 3:
        overall = "REVISION_NEEDED"
    else:
        overall = "PASS"
    
    # 6. Generate report
    return generate_report(
        overall_status=overall,
        passes=passes,
        warnings=warnings,
        failures=failures,
        profile=profile
    )
```

### Rule Implementation Pattern

Each rule follows this pattern:

```python
# Example: font_rules.py

class FontFamilyRule:
    id = "F1"
    name = "Font Family: Times New Roman"
    severity = "CRITICAL"  # or "MAJOR" or "MINOR"
    
    def applies_to(self, profile):
        return True  # Applies to all profiles
    
    def check(self, doc, profile):
        violations = []
        
        for para_idx, paragraph in enumerate(doc.paragraphs):
            for run_idx, run in enumerate(paragraph.runs):
                if run.text.strip() == "":
                    continue
                font_name = run.font.name
                if font_name and font_name != "Times New Roman":
                    violations.append({
                        "paragraph": para_idx,
                        "run": run_idx,
                        "text_preview": run.text[:50],
                        "found": font_name,
                        "expected": "Times New Roman"
                    })
        
        if len(violations) == 0:
            return RuleResult(
                rule_id="F1",
                status="PASS",
                message="All text uses Times New Roman."
            )
        else:
            return RuleResult(
                rule_id="F1",
                status="FAIL",
                severity="CRITICAL",
                message=f"{len(violations)} text runs use incorrect font.",
                violations=violations
            )
```

### Handling python-docx Limitations

`python-docx` cannot access everything in a `.docx` file. For properties it can't reach, we access the raw OOXML:

| Property | python-docx Access | Fallback |
|---|---|---|
| Font name, size, bold, italic | `run.font.*` | Direct |
| Paragraph spacing | `paragraph_format.*` | Direct |
| Margins | `section.left_margin` etc. | Direct |
| Table borders | Not fully exposed | Parse XML: `w:tblBorders`, `w:tcBorders` |
| Page number format | Not exposed | Parse XML: `w:pgNumType` in section properties |
| Section breaks | Not fully exposed | Parse XML: `w:sectPr` elements |
| Equation objects | Not exposed | Parse XML: `m:oMath` elements |
| TOC fields | Not exposed | Parse XML: `w:fldSimple` or `w:fldChar` with TOC instruction |
| Cell shading | `cell.shading` (partial) | Parse XML: `w:shd` elements |

For XML access:

```python
from lxml import etree

def get_table_borders(table):
    """Extract border info from table XML."""
    tbl_element = table._tbl
    borders = tbl_element.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tblBorders')
    # Parse border elements...
    
def check_page_number_format(section):
    """Check if section uses Roman or Arabic page numbers."""
    sect_pr = section._sectPr
    pg_num_type = sect_pr.find('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}pgNumType')
    if pg_num_type is not None:
        fmt = pg_num_type.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}fmt')
        start = pg_num_type.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}start')
        return {"format": fmt, "start": start}
    return None
```

---

## OUTPUT FORMAT

The script produces a structured JSON report plus a human-readable summary.

### JSON Output

```json
{
  "overall_status": "REVISION_NEEDED",
  "profile": "ENGINEERING",
  "total_rules_checked": 42,
  "passed": 37,
  "warnings": 2,
  "failures": 3,
  "details": {
    "passes": [
      {"rule_id": "F1", "message": "All text uses Times New Roman."},
      {"rule_id": "F2", "message": "Body text is 12pt throughout."},
      ...
    ],
    "warnings": [
      {
        "rule_id": "T1",
        "message": "Table on estimated page 34 may break across pages (28 rows). Verify manually.",
        "severity": "MINOR"
      }
    ],
    "failures": [
      {
        "rule_id": "S2",
        "message": "Extra spacing before Heading 1 detected in 4 locations.",
        "severity": "MAJOR",
        "violations": [
          {"paragraph": 45, "text": "CHAPTER TWO", "found": "12pt before", "expected": "0pt before"},
          {"paragraph": 89, "text": "CHAPTER THREE", "found": "12pt before", "expected": "0pt before"},
          ...
        ]
      },
      {
        "rule_id": "PN1",
        "message": "Preliminary pages do not use Roman numeral page numbering.",
        "severity": "CRITICAL",
        "details": "First section page number format: 'decimal'. Expected: 'lowerRoman'."
      },
      {
        "rule_id": "EQ2",
        "message": "3 equations found outside of borderless two-column tables.",
        "severity": "MAJOR",
        "violations": [
          {"paragraph": 112, "text_preview": "V = IR", "issue": "Equation in plain paragraph, not in table"},
          ...
        ]
      }
    ]
  }
}
```

### Human-Readable Summary

```
FORMATTING CHECK — EC-00234
Profile: ENGINEERING
Status: REVISION NEEDED

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ PASSED (37/42 rules)
  Font family, size, bold, italic ✓
  Body text justified ✓
  Margins 1.0 inch all sides ✓
  No paragraph indentation ✓
  No hyphens as sentence separators ✓
  All et al. italicised ✓
  Table captions present ✓
  Figure captions present ✓
  References in alphabetical order ✓
  ... and 28 more

⚠️ WARNINGS (2)
  T1: Table at ~page 34 may break across pages (28 rows) 
      → Verify manually in rendered document
  
  TOC2: 1 TOC entry text doesn't exactly match heading 
        text (minor wording difference)
        → Heading says "Background of the Study"
        → TOC says "Background to the Study"

❌ FAILURES (3)

  🔴 CRITICAL — PN1: Page Numbering
     Preliminary pages use Arabic numerals instead of Roman.
     First section format: 'decimal'. Expected: 'lowerRoman'.
     → Fix: Insert section break before Chapter One. Set 
       first section footer to Roman numerals. Set second 
       section footer to Arabic starting at 1.

  🟠 MAJOR — S2: Extra Heading Spacing
     Extra spacing detected before Heading 1 in 4 locations:
     • "CHAPTER TWO" (paragraph 45): 12pt spacing before
     • "CHAPTER THREE" (paragraph 89): 12pt spacing before
     • "CHAPTER FOUR" (paragraph 134): 12pt spacing before
     • "CHAPTER FIVE" (paragraph 178): 12pt spacing before
     → Fix: Select each heading, set Space Before to 0pt.

  🟠 MAJOR — EQ2: Equation Table Format
     3 equations found outside of borderless two-column tables:
     • Paragraph 112: "V = IR"
     • Paragraph 156: "P = IV"
     • Paragraph 189: "η = Pout/Pin"
     → Fix: Place each equation in a 2-column borderless 
       table. Equation in left column, number in right.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FIX PRIORITY:
1. Page numbering (CRITICAL — affects every page)
2. Equation tables (MAJOR — affects academic presentation)
3. Heading spacing (MAJOR — affects visual consistency)

After fixing, resubmit for re-verification.
```

---

## SEVERITY LEVELS

| Severity | Meaning | Action |
|---|---|---|
| **CRITICAL** | Fundamental formatting failure visible on every page (wrong font, wrong page numbering, wrong margins) | Must fix before delivery. Report cannot proceed to QA. |
| **MAJOR** | Significant formatting error in specific locations (heading spacing, equation format, table breaks) | Must fix before delivery. Listed in revision feedback. |
| **MINOR** | Small inconsistency unlikely to be noticed by supervisor (slight spacing variation, one caption style mismatch) | Warning only. QA reviewer decides. |

### Overall Status Logic

```
if any CRITICAL failure → HARD_FAIL (report blocked)
elif count(MAJOR failures) > 0 → REVISION_NEEDED
elif count(MINOR warnings) > 5 → REVISION_NEEDED (too many small issues)
else → PASS
```

---

## INTEGRATION WITH WORKBASE

### When the Script Runs

```
Worker submits completed document
        ↓
System runs Formatting Quality Script (automatic, <3 seconds)
        ↓
    ┌── PASS → Document enters Reference Verification (Tier 2)
    │          Then enters QA queue if Tier 2 passes
    │
    ├── REVISION_NEEDED → Document returned to worker
    │                     Worker sees human-readable summary
    │                     Worker fixes and resubmits
    │                     Script runs again on resubmission
    │
    └── HARD_FAIL → Document returned with critical alert
                    Specific critical failures listed
                    Worker must fix before any further checks
```

**Key design decision:** Formatting check runs BEFORE Reference Verification and BEFORE QA. Why? Because formatting errors are the cheapest to fix and the fastest to check. Don't waste AI tokens on reference verification or human time on QA review for a document that has the wrong font or broken page numbering. Fix the cheap stuff first.

### The Full Quality Pipeline Order

```
1. FORMATTING CHECK (Layer 3 — this script)     ← Cheapest, fastest
   ↓ PASS
2. STRUCTURAL CHECK (Layer 1 — automated)        ← Second cheapest
   ↓ PASS
3. REFERENCE VERIFICATION (Layer 2b — AI)        ← Costs AI tokens
   ↓ PASS
4. VOICE CHECK (Layer 2a — AI + human)           ← Costs AI tokens + human time
   ↓ PASS
5. QA REVIEW (Layer 4 — human)                   ← Most expensive
   ↓ PASS
6. DELIVERY
```

Each layer acts as a gate. If a document fails any layer, it goes back to the worker. The worker fixes and resubmits. The pipeline restarts from the layer that failed (not from the beginning — no need to re-check formatting if only the reference verification failed on resubmission).

### API Endpoint

```
POST /api/quality/formatting-check
  Body: { projectId: string, documentPath: string }
  Returns: {
    status: "PASS" | "REVISION_NEEDED" | "HARD_FAIL",
    summary: string (human-readable),
    details: object (full JSON report),
    fixPriority: string[] (ordered list of what to fix first)
  }
```

### Worker Dashboard View

When a formatting check fails, the worker's project view shows:

```
PROJECT EC-00234 — Formatting Check Failed

Status: REVISION NEEDED
3 issues found (1 critical, 2 major)

[View Full Report]  [Download Annotated Document]

FIX PRIORITY:
1. 🔴 Page numbering — prelims use wrong format
2. 🟠 Equations — 3 equations need borderless tables  
3. 🟠 Heading spacing — extra spacing before 4 headings

[Upload Corrected Document]
```

---

## BUILDING WITH CLAUDE CODE

### Implementation Order

**Phase 1 — Core Rules (Week 1):**
- Font rules (F1–F6)
- Spacing rules (S1–S5)
- Margin rules (MG1–MG4)
- Alignment rules (AL1–AL4)
- Paragraph rules (P1–P5)
- Integration with one test document

**Phase 2 — Document Structure Rules (Week 2):**
- Heading rules (H1–H4)
- Page numbering rules (PN1–PN4)
- TOC rules (TOC1–TOC3)
- List of Figures/Tables rules (LF1–LF2, LT1–LT2)
- Reference section rules (R1–R6)

**Phase 3 — Advanced Element Rules (Week 3):**
- Table rules (T1–T7) including XML border parsing
- Figure rules (FG1–FG5)
- Equation rules (EQ1–EQ5) including OMML detection
- Formatting profiles (all service tiers)

**Phase 4 — Integration (Week 4):**
- API endpoint
- WorkBase pipeline integration
- Worker dashboard feedback display
- Admin dashboard formatting stats

### Claude Code Prompt (Phase 1)

```
Build a Python formatting checker for Word (.docx) documents.

Use python-docx and lxml. The checker should:

1. Open a .docx file
2. Load a formatting profile (start with FYP_STANDARD)
3. Check these rules:
   - F1: All text must be Times New Roman
   - F2: Body text must be 12pt
   - S1: Line spacing must be exactly 2.0
   - S2-S3: No extra spacing before/after headings
   - MG1-MG4: Margins must be 1.0 inch (±0.05)
   - AL1: Body text must be justified
   - P1: No first-line paragraph indentation
   - P2: No em-dashes or en-dashes as sentence separators
   - P4: All "et al." must be italicised

4. Output a JSON report with:
   - overall_status (PASS/REVISION_NEEDED/HARD_FAIL)
   - list of passes, warnings, failures
   - for each failure: rule_id, message, severity, 
     specific violation locations

5. Also output a human-readable summary

Test against a real .docx file. Show me the output.

Reference the full spec for exact rule definitions, 
severity levels, and output format.
```

---

## TESTING

### Test Documents Needed

| Test Document | Purpose | Expected Result |
|---|---|---|
| Perfect FYP document | Baseline — should pass all checks | PASS |
| Document with wrong font (Arial) | Tests F1 | FAIL — CRITICAL |
| Document with 1.5 spacing | Tests S1 | FAIL — CRITICAL |
| Document with extra heading spacing | Tests S2/S3 | FAIL — MAJOR |
| Document with wrong page numbering | Tests PN1/PN2 | FAIL — CRITICAL |
| Document with inline equations | Tests EQ1/EQ2 | FAIL — MAJOR |
| Document with broken tables | Tests T1 | WARNING |
| Document with un-italicised et al. | Tests P4 | FAIL — MINOR |
| Document with hyphens as dashes | Tests P2 | FAIL — MAJOR |
| Term paper (different profile) | Tests profile switching | Uses TERM_PAPER rules |
| Publication paper | Tests publication profile | Uses PUBLICATION rules |

Prince should provide one "gold standard" document that passes all checks. This becomes the reference for calibration.

---

## SUCCESS METRICS

| Metric | Target |
|---|---|
| Script runtime | Under 3 seconds per document |
| False positive rate | Below 3% (good formatting incorrectly flagged) |
| False negative rate | Below 1% (bad formatting missed) |
| Most common failure caught | Page numbering (PN1/PN2) — currently the #1 worker error |
| Worker resubmission rate after formatting check | Below 25% (higher means workers need formatting training) |

---

## FUTURE ENHANCEMENTS

1. **Annotated document output:** Instead of just a text report, produce a copy of the .docx with comments inserted at each violation location. The worker opens the annotated document and sees exactly where each issue is.

2. **Auto-fix for simple violations:** For rules like P4 (italicise et al.) and S2/S3 (remove extra heading spacing), the script could fix the issue automatically and save a corrected version. Worker reviews the fix rather than making it manually.

3. **Visual rendering check:** Use a headless LibreOffice to render the .docx to PDF, then analyse the PDF for visual issues (table breaks, page overflow, margin violations) that XML analysis can't catch.

4. **Style template enforcement:** Provide workers with a pre-configured Word template (.dotx) that has the correct styles built in. The formatting checker then only needs to verify that the worker used the template styles rather than checking every property individually.

---

*Version 1.0 — Session 5 output. Ready for Claude Code implementation in the order specified: Core Rules → Structure Rules → Advanced Rules → Integration.*
