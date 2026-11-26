/**
 * The NALT standard for law reports: one pure module the founder can read.
 *
 * Source: the NALT Uniform Format and Citation Guide for Legal Research Writing
 * in Nigeria (ratified ABUAD 2015, 2021/2022 printing), measured against a
 * professor-corrected benchmark long essay (`docs/law/NALT_LAW_AUDIT_2026-11-26.md`).
 *
 * EduCraft writes undergraduate long essays, so this module carries NALT's
 * undergraduate rules: five chapters, chapters one, two and five structured the
 * same way for every student, page footnotes, and a bibliography of everything
 * consulted.
 *
 * Every sentence the system writes about NALT is in NALT_TEXT, so the founder
 * reviews the wording in one place. Pure: no database, no docx, no Claude.
 * `npm run check:nalt` holds it to the guide.
 */

import type { SectionKey } from "@/lib/generation/department-map";

/** The two law sections of Table A. */
export const LAW_SECTIONS = ["LAW_DOCTRINAL", "LAW_NON_DOCTRINAL"] as const;
export type LawSection = (typeof LAW_SECTIONS)[number];

export function isLawSection(section: SectionKey | null | undefined): section is LawSection {
  return section === "LAW_DOCTRINAL" || section === "LAW_NON_DOCTRINAL";
}

/**
 * A report follows NALT when it is in a law section or its approved referencing
 * style is NALT. A non-law department whose supervisor asks for NALT gets NALT's
 * citations and headings; the chapter structure stays its own department's.
 */
export function followsNalt(input: { section?: SectionKey | null; referencingStyle?: string | null }): boolean {
  return isLawSection(input.section) || input.referencingStyle === "NALT";
}

// ─── Headings ────────────────────────────────────────────────────────────────

export type HeadingCase = "upper" | "title" | "sentence";
export interface HeadingProfile {
  h1: HeadingCase;
  h2: HeadingCase;
  h3: HeadingCase;
}

/** formatting_rules.md AL2–AL4: the house profile for every other department. */
export const HOUSE_HEADINGS: HeadingProfile = { h1: "upper", h2: "title", h3: "sentence" };

/**
 * NALT: "There must be a chapter's title for each chapter from chapters one to
 * five. Each chapter's title is presented in upper case with no number assigned.
 * The next main title under the chapter's title is also in upper case but must be
 * assigned number in Arabic numeral, while the sub-titles and sub-sub-titles are
 * assigned a sub-Arabic numeral."
 *
 * So H2 is UPPER CASE, not Title Case. NALT does not fix the case of the
 * sub-titles; the benchmark writes them in Title Case ("2.1.1 Definition of a
 * Child"), which is what a Nigerian law supervisor expects, so H3 is Title Case.
 */
export const NALT_HEADINGS: HeadingProfile = { h1: "upper", h2: "upper", h3: "title" };

export function headingProfileFor(input: { section?: SectionKey | null; referencingStyle?: string | null }): HeadingProfile {
  return followsNalt(input) ? NALT_HEADINGS : HOUSE_HEADINGS;
}

// ─── The five chapters ───────────────────────────────────────────────────────

/**
 * NALT: "chapters one, two and five (or six in case of PhD thesis) are mandatory
 * for all candidates to structure their project topics the same way to attract
 * uniformity", and chapters three and four are "left at the discretion of the
 * candidates". Six chapters is PhD only; an undergraduate long essay and a
 * master's dissertation have five.
 */
export const NALT_CHAPTERS = 5;

/** The heading each mandatory chapter carries under "CHAPTER ONE" and so on. */
export const NALT_CHAPTER_TITLES: Record<1 | 2 | 5, Record<LawSection, string>> = {
  1: { LAW_DOCTRINAL: "INTRODUCTION", LAW_NON_DOCTRINAL: "INTRODUCTION" },
  2: {
    LAW_DOCTRINAL: "CONCEPTUAL, THEORETICAL FRAMEWORKS AND LITERATURE REVIEW",
    LAW_NON_DOCTRINAL: "CONCEPTUAL AND THEORETICAL FRAMEWORK AND LITERATURE REVIEW",
  },
  5: { LAW_DOCTRINAL: "CONCLUSION", LAW_NON_DOCTRINAL: "CONCLUSION" },
};

/**
 * The numbered sections of each mandatory chapter, in NALT's order.
 *
 * Chapter One (doctrinal) follows the benchmark: the research questions are a
 * sub-section of the statement of the problem ("The statement of the problem is
 * followed by research questions"), and 1.7 is the synopsis. NALT's explanatory
 * note adds a brief literature review for undergraduates, which would make it
 * 1.7 and push the synopsis to 1.8; the founder's call (26 Nov 2026) is to
 * follow the benchmark and keep the review in Chapter Two at 2.3, so the
 * literature is reviewed once and properly.
 */
export const NALT_SECTIONS: Record<LawSection, Record<1 | 2 | 5, readonly string[]>> = {
  LAW_DOCTRINAL: {
    1: [
      "BACKGROUND TO THE STUDY",
      "STATEMENT OF THE PROBLEM",
      "AIM AND OBJECTIVES OF THE STUDY",
      "SCOPE AND LIMITATIONS OF THE STUDY",
      "SIGNIFICANCE OF THE STUDY",
      "RESEARCH METHODOLOGY",
      "SYNOPSIS OF THE CHAPTERS",
    ],
    2: ["CONCEPTUAL CLARIFICATIONS", "THEORETICAL AND HISTORICAL FOUNDATION", "LITERATURE REVIEW"],
    5: ["SUMMARY OF FINDINGS", "RECOMMENDATIONS", "CONTRIBUTIONS TO KNOWLEDGE", "AREAS FOR FURTHER STUDIES", "CONCLUSION"],
  },
  LAW_NON_DOCTRINAL: {
    1: [
      "BACKGROUND TO THE STUDY",
      "STATEMENT OF THE PROBLEM",
      "AIM AND OBJECTIVES OF THE STUDY",
      "RESEARCH QUESTIONS AND HYPOTHESES",
      "SCOPE AND LIMITATIONS OF THE STUDY",
      "SIGNIFICANCE OF THE STUDY",
      "SYNOPSIS OF THE CHAPTERS",
    ],
    2: ["CONCEPTUAL CLARIFICATIONS", "THEORETICAL AND HISTORICAL FOUNDATION", "LITERATURE REVIEW"],
    // "the final chapters (five for master or six for PhD) either under doctrinal
    // or non-doctrinal approaches are prepared in similar manner".
    5: ["SUMMARY OF FINDINGS", "RECOMMENDATIONS", "CONTRIBUTIONS TO KNOWLEDGE", "AREAS FOR FURTHER STUDIES", "CONCLUSION"],
  },
};

/** The research questions sit under the statement of the problem, not in a section of their own. */
export const NALT_RQ_SUBSECTION = "Research Questions";

/** Chapters three and four are the student's own, "usually the largest" of the five. */
export function isThematicChapter(section: LawSection, chapter: number): boolean {
  if (section === "LAW_DOCTRINAL") return chapter === 3 || chapter === 4;
  return false;
}

// ─── Aim, objectives and research questions ──────────────────────────────────

/**
 * NALT: "Three to six objectives are adequate" (doctrinal), "Four to six"
 * (non-doctrinal), each with a transitive verb and open to one meaning. The aim
 * is "one sentence statement of the purpose", a restatement of the title.
 * Research questions "should not be more than six, must be itemised and must
 * also correspond with the number of specific research objectives raised".
 */
export const NALT_OBJECTIVES = { min: 4, max: 6 } as const;
export const NALT_RESEARCH_QUESTIONS_MAX = 6;

/**
 * The benchmark carries six research questions against five objectives and a
 * professor passed it, so unequal counts are a warning for the COO, never a
 * refusal. Only more than six questions, or fewer questions than objectives,
 * is a real fault.
 */
export function checkQuestionsAgainstObjectives(questions: number, objectives: number): { level: "pass" | "warn" | "fail"; message: string } {
  if (questions > NALT_RESEARCH_QUESTIONS_MAX) {
    return { level: "fail", message: NALT_TEXT.tooManyQuestions(questions) };
  }
  if (questions < objectives) return { level: "fail", message: NALT_TEXT.fewerQuestions(questions, objectives) };
  if (questions !== objectives) return { level: "warn", message: NALT_TEXT.questionsDiffer(questions, objectives) };
  return { level: "pass", message: NALT_TEXT.questionsMatch(questions) };
}

// ─── The abstract ────────────────────────────────────────────────────────────

/**
 * NALT contradicts itself on length: its long-essay guidelines say "not more
 * than 200-350", its abstract guidelines "not more 300-400 words for
 * undergraduate". The benchmark is 283 words. The founder's call (26 Nov 2026):
 * 250 to 350 words for a law report, which holds the benchmark and stays inside
 * the long-essay band.
 */
export const NALT_ABSTRACT = { min: 250, max: 350 } as const;

/** One un-paragraphed block, single line spacing, the last preliminary page. */
export const NALT_ABSTRACT_SINGLE_BLOCK = true;

// ─── The preliminaries ───────────────────────────────────────────────────────

/**
 * NALT's order, Roman numerals, every title in upper case. The title page counts
 * as i and shows no number; numbering shows from the declaration. A law report
 * carries a list of cases and a list of statutes, treaties and international
 * instruments, and the abstract is the LAST preliminary page — not the table of
 * contents, which comes before the lists.
 */
export const NALT_PRELIMINARIES = [
  "TITLE PAGE",
  "DECLARATION",
  "CERTIFICATION",
  "DEDICATION",
  "ACKNOWLEDGEMENTS",
  "TABLE OF CONTENTS",
  "LIST OF CASES",
  "LIST OF STATUTES, TREATIES AND INTERNATIONAL INSTRUMENTS",
  "LIST OF ABBREVIATIONS",
  "ABSTRACT",
] as const;

/** Dedication is "optional" in NALT; everything else on the list is required. */
export const NALT_OPTIONAL_PRELIMINARIES = ["DEDICATION", "LIST OF CASES", "LIST OF STATUTES, TREATIES AND INTERNATIONAL INSTRUMENTS", "LIST OF ABBREVIATIONS"] as const;

// ─── The bibliography ────────────────────────────────────────────────────────

/**
 * Titled BIBLIOGRAPHY on a fresh page, "whereby all materials consulted whether
 * expressly cited in the main body or not". NALT Part Three describes one
 * alphabetical list by surname; the benchmark splits it into primary and
 * secondary sources, which is what a law supervisor expects and what HQ's own
 * law prompt already asks for. The founder's call (26 Nov 2026) is the split,
 * with NALT's surname ordering applied inside each part.
 */
export const NALT_BIBLIOGRAPHY_TITLE = "BIBLIOGRAPHY";

export const NALT_BIBLIOGRAPHY_PARTS = [
  {
    title: "PRIMARY SOURCES",
    groups: ["Treaties and International Instruments", "Statutes and Subsidiary Legislation", "Cases", "Resolutions and Official Documents"],
  },
  { title: "SECONDARY SOURCES", groups: ["Books", "Chapters in Edited Books", "Journal Articles", "Theses and Dissertations", "Reports and Soft Law Instruments", "Newspapers and Magazines", "Internet Sources"] },
] as const;

// ─── Citation signals ────────────────────────────────────────────────────────

/**
 * NALT: "the following Latin expressions have been abolished or jettisoned in
 * NALT citation style: supra, infra, ante, contra, id, op cit, loc cit, passim,
 * et seq. But 'ibid' has survived this policy." The benchmark uses none of them.
 */
export const ABOLISHED_SIGNALS = ["supra", "infra", "ante", "contra", "id", "op cit", "op. cit.", "loc cit", "loc. cit.", "passim", "et seq", "et seq."] as const;

/** Word-boundary patterns for the abolished signals, with the multi-word ones tolerant of stops and spacing. */
const ABOLISHED_PATTERNS: { signal: string; re: RegExp }[] = [
  { signal: "supra", re: /\bsupra\b/i },
  { signal: "infra", re: /\binfra\b/i },
  { signal: "ante", re: /\bante\b/i },
  { signal: "contra", re: /\bcontra\b(?!ct)/i },
  { signal: "id", re: /(?:^|[\s(])id\.(?=\s|$|,)/i },
  { signal: "op cit", re: /\bop\.?\s*cit\b/i },
  { signal: "loc cit", re: /\bloc\.?\s*cit\b/i },
  { signal: "passim", re: /\bpassim\b/i },
  { signal: "et seq", re: /\bet\s*seq\b/i },
];

/**
 * Three or more authors: NALT and OSCOLA write "and others". The benchmark uses
 * it 0 times for "et al." and names three authors in full. The house rule that
 * italicises *et al.* does not apply to a NALT report.
 */
export const NALT_MANY_AUTHORS = "and others";

/** "ibid" — lower case, never italicised, never capitalised. */
export const IBID_FORM = "ibid";

export interface FootnoteLine {
  /** Its number in the document, 1-based. */
  number: number;
  text: string;
}

export interface SignalProblem {
  number: number;
  level: "fail" | "warn";
  message: string;
}

/**
 * The citation-signal discipline of a law report's footnotes, in document order:
 * no abolished Latin signal, "ibid" only where the note before it exists, every
 * "(n X)" pointing back to a real earlier footnote, and "et al." replaced by
 * "and others".
 */
export function checkCitationSignals(notes: readonly FootnoteLine[]): SignalProblem[] {
  const problems: SignalProblem[] = [];
  const numbers = new Set(notes.map((n) => n.number));
  for (const note of notes) {
    const text = note.text;
    for (const { signal, re } of ABOLISHED_PATTERNS) {
      if (re.test(text)) problems.push({ number: note.number, level: "fail", message: NALT_TEXT.abolishedSignal(signal) });
    }
    if (/\bibid\b/i.test(text)) {
      if (note.number <= 1) problems.push({ number: note.number, level: "fail", message: NALT_TEXT.ibidFirst });
      if (/\bIbid\b/.test(text) || /\*ibid\*/i.test(text)) problems.push({ number: note.number, level: "warn", message: NALT_TEXT.ibidForm });
    }
    for (const m of text.matchAll(/\(n\s*(\d{1,3})\)/g)) {
      const target = Number(m[1]);
      if (target >= note.number) problems.push({ number: note.number, level: "fail", message: NALT_TEXT.crossRefForward(target) });
      else if (!numbers.has(target)) problems.push({ number: note.number, level: "fail", message: NALT_TEXT.crossRefMissing(target) });
    }
    if (/\bet\.?\s*al\b/i.test(text)) problems.push({ number: note.number, level: "fail", message: NALT_TEXT.etAl });
  }
  return problems;
}

// ─── Footnote density ────────────────────────────────────────────────────────

/**
 * The benchmark carries 446 footnotes over about 27,000 words of body — one per
 * 60 words. HQ's own best law-shaped run managed one per 310. The model is asked
 * for the benchmark's density; the gate fails a chapter below one per 200 words
 * and warns below one per 120, so an honest chapter passes and a thinly-sourced
 * one does not.
 */
export const FOOTNOTE_DENSITY = { target: 70, warnAbove: 120, failAbove: 200 } as const;

export function checkFootnoteDensity(words: number, footnotes: number): { level: "pass" | "warn" | "fail"; message: string; wordsPerNote: number | null } {
  if (words < 200) return { level: "pass", message: NALT_TEXT.densityTooShort, wordsPerNote: null };
  if (footnotes === 0) return { level: "fail", message: NALT_TEXT.densityNone(words), wordsPerNote: null };
  const per = Math.round(words / footnotes);
  if (per > FOOTNOTE_DENSITY.failAbove) return { level: "fail", message: NALT_TEXT.densityFail(footnotes, words, per), wordsPerNote: per };
  if (per > FOOTNOTE_DENSITY.warnAbove) return { level: "warn", message: NALT_TEXT.densityWarn(footnotes, words, per), wordsPerNote: per };
  return { level: "pass", message: NALT_TEXT.densityPass(footnotes, words, per), wordsPerNote: per };
}

/** The number of footnotes a chapter of this length should carry. */
export function footnotesExpected(words: number): number {
  return Math.max(1, Math.round(words / FOOTNOTE_DENSITY.target));
}

// ─── Length ──────────────────────────────────────────────────────────────────

/**
 * NALT: "50 pages minimum and 100 maximums" for a long essay, double spaced on
 * A4. The benchmark runs 98 pages of body. A double-spaced A4 page of Times New
 * Roman 12 holds about 275 words, so the body target is the benchmark's profile.
 */
export const NALT_PAGES = { min: 50, max: 100 } as const;
export const NALT_CHAPTER_WORDS: Record<1 | 2 | 3 | 4 | 5, { min: number; target: number }> = {
  1: { min: 4000, target: 5400 },
  2: { min: 4500, target: 6100 },
  3: { min: 5000, target: 6800 },
  4: { min: 4500, target: 5700 },
  5: { min: 2200, target: 2900 },
};

// ─── Quotations ──────────────────────────────────────────────────────────────

/**
 * NALT allows quotations: three lines or fewer inline in single quotation marks,
 * longer ones indented on both sides without quotation marks. The benchmark
 * carries NONE — every source is paraphrased and footnoted — which is also
 * EduCraft's own rule, so the reports keep paraphrasing and the rule stands.
 */
export const NALT_QUOTATION_LINES = 3;

// ─── The wording ─────────────────────────────────────────────────────────────

/** Every sentence the system writes about NALT, for the founder to review in one place. */
export const NALT_TEXT = {
  // Citation signals
  abolishedSignal: (signal: string) => `This footnote uses "${signal}". NALT has abolished supra, infra, ante, contra, id, op cit, loc cit, passim and et seq; use "ibid" for the footnote immediately before, or "(n X)" for the footnote where the source first appeared.`,
  ibidFirst: 'The first footnote cannot be "ibid": there is no footnote before it for it to repeat.',
  ibidForm: '"ibid" is written in lower case and is never italicised.',
  crossRefForward: (target: number) => `This footnote cross-refers to "(n ${String(target)})", which is not an earlier footnote. A cross-reference points back to the footnote where the source first appeared.`,
  crossRefMissing: (target: number) => `This footnote cross-refers to "(n ${String(target)})", and there is no footnote ${String(target)}.`,
  etAl: 'This footnote uses "et al.". NALT writes "and others" for three or more authors.',

  // Density
  densityTooShort: "The chapter is too short to judge its citation density.",
  densityNone: (words: number) => `The chapter has ${String(words)} words and no footnotes. A law chapter cites its authority at the foot of every page.`,
  densityPass: (notes: number, words: number, per: number) => `${String(notes)} footnotes over ${String(words)} words (one per ${String(per)} words).`,
  densityWarn: (notes: number, words: number, per: number) => `${String(notes)} footnotes over ${String(words)} words is one per ${String(per)} words. A law chapter should cite about one source per ${String(FOOTNOTE_DENSITY.target)} words; this chapter is thinly sourced.`,
  densityFail: (notes: number, words: number, per: number) => `${String(notes)} footnotes over ${String(words)} words is one per ${String(per)} words. A law chapter must cite its authority far more closely than that: about one source per ${String(FOOTNOTE_DENSITY.target)} words.`,

  // Questions and objectives
  questionsMatch: (n: number) => `${String(n)} research questions against ${String(n)} objectives.`,
  questionsDiffer: (q: number, o: number) => `There are ${String(q)} research questions against ${String(o)} objectives. NALT asks that they correspond in number; a supervisor may ask for one more objective.`,
  fewerQuestions: (q: number, o: number) => `There are only ${String(q)} research questions against ${String(o)} objectives. Every objective needs a question that answers it.`,
  tooManyQuestions: (q: number) => `There are ${String(q)} research questions. NALT allows no more than ${String(NALT_RESEARCH_QUESTIONS_MAX)}.`,

  // The specialist's and the COO's reading
  footnotesBuilt: (n: number) => `${String(n)} footnotes were set at the foot of their pages, numbered 1 to ${String(n)} across the report.`,
  footnoteDangling: (n: number) => `${String(n)} footnote marker(s) had no footnote text and were taken out.`,
  footnoteUnused: (n: number) => `${String(n)} footnote(s) had no marker in the text and were left out.`,
  headingsNalt: "The headings follow NALT: the chapter title and every numbered section heading in upper case, sub-headings in Title Case.",
} as const;
