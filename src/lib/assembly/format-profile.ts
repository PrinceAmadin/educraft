/**
 * A document's format, as one object: page size, margins, type sizes, spacing, columns, heading
 * case, equation numbering and whether it has preliminary pages. Pure — no docx, no database, no
 * Claude — so the assembly, the quality gate's Layer 1 and `npm run check:publication` all read the
 * same figures (the `src/lib/law/nalt.ts` idiom).
 *
 * Why a profile at all: EduCraft shipped two formats in a week (the FYP standard and NALT law), and
 * both are read back out of Word XML by the gate. A journal paper is the third, and it differs in
 * almost every number — US Letter instead of A4, 0.70in margins instead of 1.0, 10pt single spaced
 * instead of 12pt double, two columns instead of one, and equation numbers that DO carry
 * parentheses, which is the exact opposite of the house rule.
 *
 * The move that makes that safe is to ADD this file rather than change the constants: `FYP_PROFILE`
 * is built FROM the existing exports in styles.ts, so there is one source of truth and nothing to
 * transcribe wrongly, and `check:assembly`'s golden hashes prove an existing report is unmoved.
 *
 * Nothing imports this yet. It is the foundation Appendix A's later steps thread through the
 * assembly, one call site at a time, with the hashes as the gate at every step.
 *
 * Source for the publication numbers: the founder's own
 * `DATA/QUALITY CHECK SYSTEM/EDUCRAFT_STRUCTURAL_QUALITY_v1.1` §3.11, plus his two calls of
 * 26 Nov 2026 — real Word columns (`w:cols`) rather than §3.11's borderless table, so the paper
 * reflows when the client edits it, and author-date citations rather than IEEE numbering.
 */

import { DOUBLE, FONT_NAME, FOOTNOTE_SIZE, PAGE, SINGLE, SIZE, TEXT_WIDTH } from "./styles";

/** Which format a document is built to. The first two are the formats that shipped. */
export const FORMAT_PROFILE_IDS = ["FYP_STANDARD", "ENGINEERING", "PUBLICATION"] as const;
export type FormatProfileId = (typeof FORMAT_PROFILE_IDS)[number];

/** How a heading level is cased. The gate reads each report against its own profile's choice. */
export type HeadingCase = "UPPER" | "TITLE" | "SENTENCE";

export interface FormatProfile {
  id: FormatProfileId;
  font: string;
  /** Half-points, as Word stores them: 24 = 12pt, 20 = 10pt. */
  size: number;
  titleSize: number;
  captionSize: number;
  affiliationSize: number;
  footnoteSize: number;
  spacing: typeof DOUBLE | typeof SINGLE;
  page: { size: { width: number; height: number }; margin: Record<string, number> };
  /** Page width less both margins, in twips: what a full-width table or equation has to fit. */
  textWidth: number;
  /** null = one column. A paper's body runs in two, with `space` twips between them. */
  columns: { count: 2; space: number } | null;
  /** Top, header-rule and bottom borders only (the engineering and journal table style). */
  threeLineTables: boolean;
  headings: { h1: HeadingCase; h2: HeadingCase; h3: HeadingCase };
  /** "none" = 1.1, 1.1.1 numbering; "roman-letter" = I. INTRODUCTION with A. lettered subheads. */
  headingNumbering: "none" | "roman-letter";
  equationNumbers: {
    /** The house rule is NO parentheses (3.1); a publication is the documented exception ((1)). */
    parenthesised: boolean;
    /** Chapter.n restarting each chapter, or one sequence 1..N for the whole document. */
    perChapter: boolean;
    /** How the prose refers to one: "Equation 3.1" or "Eq. (1)". */
    reference: string;
  };
  /** Cover, title page, declaration, certification, dedication, abstract, TOC, the lists. */
  prelims: boolean;
}

/**
 * The format every EduCraft report has been built to. Every value comes from the shipped constants,
 * so this object cannot drift from what the assembly actually does.
 */
export const FYP_PROFILE: FormatProfile = {
  id: "FYP_STANDARD",
  font: FONT_NAME,
  size: SIZE,
  titleSize: SIZE,
  captionSize: SIZE,
  affiliationSize: SIZE,
  footnoteSize: FOOTNOTE_SIZE,
  spacing: DOUBLE,
  page: PAGE,
  textWidth: TEXT_WIDTH,
  columns: null,
  threeLineTables: false,
  headings: { h1: "UPPER", h2: "TITLE", h3: "SENTENCE" },
  headingNumbering: "none",
  equationNumbers: { parenthesised: false, perChapter: true, reference: "Equation" },
  prelims: true,
};

/** The same report with three-line tables, which is what the ENGINEERING section has always had. */
export const ENGINEERING_PROFILE: FormatProfile = { ...FYP_PROFILE, id: "ENGINEERING", threeLineTables: true };

// ─── The journal paper (§3.11) ───────────────────────────────────────────────

/** US Letter, 8.5 x 11in, in twips. */
const LETTER = { width: 12240, height: 15840 } as const;
/** 0.70in, the margin §3.11 sets on all four sides. */
export const PUBLICATION_MARGIN = 1008;
/** 0.25in between the two columns. */
export const COLUMN_GAP = 360;

export const PUBLICATION_TEXT_WIDTH = LETTER.width - 2 * PUBLICATION_MARGIN;
/** Each equal column. A table or equation in the body has to fit THIS, not the text width. */
export const PUBLICATION_COLUMN_WIDTH = (PUBLICATION_TEXT_WIDTH - COLUMN_GAP) / 2;

export const PUBLICATION_PROFILE: FormatProfile = {
  id: "PUBLICATION",
  font: FONT_NAME,
  size: 20, // 10pt body
  titleSize: 28, // 14pt bold centred title
  captionSize: 18, // 9pt bold centred captions
  affiliationSize: 18, // 9pt italic centred affiliation
  footnoteSize: FOOTNOTE_SIZE,
  spacing: SINGLE,
  page: {
    size: LETTER,
    margin: {
      top: PUBLICATION_MARGIN,
      bottom: PUBLICATION_MARGIN,
      left: PUBLICATION_MARGIN,
      right: PUBLICATION_MARGIN,
      header: 720,
      footer: 720,
      gutter: 0,
    },
  },
  textWidth: PUBLICATION_TEXT_WIDTH,
  columns: { count: 2, space: COLUMN_GAP },
  threeLineTables: true,
  // "I. INTRODUCTION" is centred, bold and upper case; "A. Theoretical basis" is left, bold italic.
  headings: { h1: "UPPER", h2: "UPPER", h3: "TITLE" },
  headingNumbering: "roman-letter",
  equationNumbers: { parenthesised: true, perChapter: false, reference: "Eq." },
  prelims: false,
};

export const FORMAT_PROFILES: Record<FormatProfileId, FormatProfile> = {
  FYP_STANDARD: FYP_PROFILE,
  ENGINEERING: ENGINEERING_PROFILE,
  PUBLICATION: PUBLICATION_PROFILE,
};

/**
 * Which profile a document is built to. The section decides between the two report formats, as it
 * always has; `documentFormat` is a second axis, because a publication exists in every department
 * and so cannot be derived from the section at all.
 */
export function formatProfileFor(input: { section?: string | null; documentFormat?: "REPORT" | "PUBLICATION" | null }): FormatProfile {
  if (input.documentFormat === "PUBLICATION") return PUBLICATION_PROFILE;
  return input.section === "ENGINEERING" ? ENGINEERING_PROFILE : FYP_PROFILE;
}

// ─── Derived figures, as functions of the profile ────────────────────────────
//
// These were module-level constants computed from TEXT_WIDTH at load time, which is why they could
// not vary by format. As functions they return the identical integers for FYP_PROFILE, which is
// what the golden hashes check.

/** The equation column of the borderless two-column equation table: 85% of the width it sits in. */
export function equationCellWidth(p: FormatProfile): number {
  const within = p.columns ? PUBLICATION_COLUMN_WIDTH : p.textWidth;
  return Math.round(within * 0.85);
}

/** The number column beside it. */
export function equationNumberCellWidth(p: FormatProfile): number {
  const within = p.columns ? PUBLICATION_COLUMN_WIDTH : p.textWidth;
  return within - equationCellWidth(p);
}

/** How an equation number is written in the number cell: "3.1" or "(1)". */
export function equationNumberText(p: FormatProfile, chapter: number, n: number): string {
  if (p.equationNumbers.perChapter) return `${chapter}.${n}`;
  return p.equationNumbers.parenthesised ? `(${n})` : String(n);
}

/** How the prose refers to it: "Equation 3.1" or "Eq. (1)". */
export function equationReference(p: FormatProfile, chapter: number, n: number): string {
  return `${p.equationNumbers.reference} ${equationNumberText(p, chapter, n)}`;
}

/** Every type size a document of this format may legally use, for the gate's F3 allow-set. */
export function allowedSizes(p: FormatProfile, opts: { footnotes?: boolean } = {}): number[] {
  const sizes = new Set<number>([p.size, p.titleSize, p.captionSize, p.affiliationSize]);
  if (opts.footnotes) sizes.add(p.footnoteSize);
  return [...sizes].sort((a, b) => a - b);
}

/** Every sentence this module writes about a format, for the founder to read in one place. */
export const FORMAT_PROFILE_TEXT = {
  publicationSummary:
    "A journal paper: US Letter, 0.70 inch margins, Times New Roman 10pt single spaced and justified, in two columns from Section I onwards, with a 14pt bold centred title. It has no preliminary pages and no page numbering: a journal supplies its own.",
  /** Why a publication's equation numbers break the house rule. */
  equationException:
    "A publication numbers its equations (1), (2), (3) with parentheses and in one sequence for the whole paper. That is the documented exception to EduCraft's rule that equation numbers never carry parentheses, which applies to reports.",
  /** The trap that made this a profile rather than a branch. */
  pageInheritance:
    "Page size and margins do NOT inherit between Word sections: a section whose properties leave them out comes out A4 with 1 inch margins, whatever the section before it said. Every section of a publication must therefore carry the same page settings, or the paper changes size halfway through and the margin checks read a mixture.",
} as const;
