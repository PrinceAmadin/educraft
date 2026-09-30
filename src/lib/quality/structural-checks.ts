/**
 * Phase D8 Layer 3: the 16 structural checks the founder approved (ST1–ST16),
 * over the raw chapters (D7's parser) and the assembled report's preliminary
 * pages. ST9 (objective traceability) takes one Claude call, made by the gate;
 * this module builds its tool and checks what comes back. Pure.
 */

import { parseChapter, type Block } from "@/lib/assembly/parse-chapter";
import { analyseChapterNotes, distinctNoteCount, entryFor } from "@/lib/assembly/endnotes";
import { citesInEndnotes } from "./citation-check";
import { findPlaceholders } from "@/lib/assembly/text-rules";
import { hypothesesOf, researchQuestionsOf } from "@/lib/generation/chapter-one-statements";
import { countWords, missingHeadings } from "@/lib/generation/chapter-plan";
import type { SectionKey } from "@/lib/generation/department-map";
import type { CitationMatch } from "./citation-check";
import { normaliseForMatch, plainText } from "./prose";
import { forbidsDiscussionInChapterFour, requiredSections, type SectionContext } from "./required-sections";
import { result, shortQuote, type CheckResult, type QualityIssue, type Severity } from "./types";
import { ABSTRACT_MAX_WORDS, ABSTRACT_MIN_WORDS } from "@/lib/generation/preliminary-pages-rules";

export interface StructuralChapter {
  number: number;
  text: string;
  /** D2's plan for the chapter (null for text that did not come from the generator). */
  plan: { targetWords: number; sections: { number: string; heading: string }[] } | null;
}

export interface StructuralInput {
  chapters: StructuralChapter[];
  chapterBased: boolean;
  section: SectionKey | null;
  mode: number | null;
  pureScience: boolean;
  template: "A" | "B";
  thematicTitles: { chapter3: string | null; chapter4: string | null };
  /** The approved aim (null only on a report approved before aims were asked for). */
  aim?: string | null;
  objectives: string[];
  /** The order carries the supervisor's table of contents (the department outline): the plan followed it. */
  supervisorToc: boolean;
  prelims: {
    included: boolean;
    hasCover: boolean;
    hasTitlePage: boolean;
    /** Heading 1 texts of the preliminary pages, as assembled. */
    heading1: string[];
    placeholders: string[];
    /** D7b: the Claude-written pages as scored, or null when they were not written. */
    written?: { needsReview: boolean; abstractWords: number; blanks: string[] } | null;
  };
  citations: CitationMatch;
  /** ST9's AI result; null when the gate could not run it. */
  traceability: TraceabilityResult | null;
  /** The chapter gate: one chapter checked on its own (null for the whole report). */
  scope?: ChapterScope | null;
}

/**
 * The chapter gate (30 Sept 2026): one chapter checked on its own, before anyone
 * downloads or approves it. What needs the whole report (the reference count,
 * the other chapters' tables) is left to the report gate; what needs one other
 * chapter is given here (Chapter One's hypotheses and questions, the works the
 * earlier chapters cite).
 */
export interface ChapterScope {
  chapter: number;
  /** The generator's text, or a person's upload read back. */
  subject: "AI_TEXT" | "UPLOAD";
  /** Chapter One's current text, when the chapter under check is a later one. */
  chapterOneText: string | null;
  /** Verified references the chapters before this one cite (Chapter Five adds no new source). */
  earlierCitedIds: string[];
}

export const STRUCTURAL_CHECKS: readonly { id: string; title: string; severity: Severity }[] = [
  { id: "ST1", title: "Preliminary pages", severity: "MAJOR" },
  { id: "ST2", title: "Chapters complete, titled and numbered", severity: "MAJOR" },
  { id: "ST3", title: "Chapter One sections", severity: "MAJOR" },
  { id: "ST4", title: "Chapter Two sections", severity: "MAJOR" },
  { id: "ST5", title: "Chapter Three sections", severity: "MAJOR" },
  { id: "ST6", title: "Chapter Four sections", severity: "MAJOR" },
  { id: "ST7", title: "Chapter Five sections", severity: "MAJOR" },
  { id: "ST8", title: "Aim and objectives word for word", severity: "MAJOR" },
  { id: "ST9", title: "Objective traceability", severity: "MAJOR" },
  { id: "ST10", title: "Research questions and hypotheses answered", severity: "MAJOR" },
  { id: "ST11", title: "Chapter balance", severity: "MAJOR" },
  { id: "ST12", title: "Reference count", severity: "MAJOR" },
  { id: "ST13", title: "Citation placement", severity: "MAJOR" },
  { id: "ST14", title: "Tables and figures referred to", severity: "MAJOR" },
  { id: "ST15", title: "Equations explained", severity: "MAJOR" },
  { id: "ST16", title: "No review placeholders left", severity: "MAJOR" },
];

export const REFERENCE_MINIMUM = { full: 35, chapterBased: 15 } as const;
export const BALANCE_TOLERANCE = 0.2;
export const THEMATIC_BALANCE = 1.75;
const WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

interface Parsed {
  number: number;
  text: string;
  plan: StructuralChapter["plan"];
  title: string | null;
  blocks: Block[];
  headings: { level: 2 | 3; text: string }[];
}

function parse(chapters: StructuralChapter[]): Parsed[] {
  return chapters.map((c) => {
    const p = parseChapter(c.text, c.number);
    return {
      number: c.number,
      text: c.text,
      plan: c.plan,
      title: p.title,
      blocks: p.blocks,
      headings: p.blocks.filter((b): b is Extract<Block, { kind: "heading" }> => b.kind === "heading").map((b) => ({ level: b.level, text: b.text })),
    };
  });
}

/** Text of a chapter's prose, lists and captions (what a reader reads as the chapter's words). */
function readable(blocks: Block[]): string {
  return blocks
    .map((b) => (b.kind === "paragraph" ? b.text : b.kind === "list" ? b.items.map((i) => i.text).join(" ") : b.kind === "heading" ? b.text : ""))
    .join("\n");
}

const sameWords = (a: string, b: string) => normaliseForMatch(a).replace(/[^a-z0-9 ]/g, "") === normaliseForMatch(b).replace(/[^a-z0-9 ]/g, "");

/** An objective as it may be written in a list: no numbering, no leading "To", no end punctuation. */
function objectiveKey(s: string): string {
  return normaliseForMatch(s)
    .replace(/^(?:[ivx]+|\d+|[a-z])[.)]\s*/, "")
    .replace(/^to\s+/, "")
    .replace(/[;:.,]+$/, "")
    .trim();
}

export function runStructuralChecks(input: StructuralInput): CheckResult[] {
  const chapters = parse(input.chapters);
  const byNumber = new Map(chapters.map((c) => [c.number, c]));
  const out: CheckResult[] = [];
  const base = (id: string) => {
    const def = STRUCTURAL_CHECKS.find((c) => c.id === id)!;
    return { id, layer: "structural" as const, title: def.title, severity: def.severity };
  };
  const push = (id: string, issues: QualityIssue[], summary: { pass: string; fail?: string; na?: string } | string, opts: { na?: boolean } = {}) =>
    out.push(result(base(id), opts.na ? [] : issues, summary, opts));
  const sectionCtx: SectionContext = { mode: input.mode, pureScience: input.pureScience, hasHypotheses: false, hasAim: Boolean(input.aim?.trim()) };

  // ── ST1 preliminary pages ────────────────────────────────────────────────
  {
    const p = input.prelims;
    const issues: QualityIssue[] = [];
    const has = (t: string) => p.heading1.some((h) => h.trim().toUpperCase() === t);
    const critical: [boolean, string][] = [
      [p.hasCover, "cover page"],
      [p.hasTitlePage, "title page"],
      [has("DECLARATION"), "declaration"],
      [has("CERTIFICATION"), "certification"],
      [has("ABSTRACT"), "abstract"],
      [has("TABLE OF CONTENTS"), "table of contents"],
    ];
    for (const [ok, what] of critical) if (!ok) issues.push({ level: "FAIL", severity: "CRITICAL", message: `The ${what} is missing.`, fix: `Add the ${what}.` });
    for (const what of ["DEDICATION", "ACKNOWLEDGEMENT"]) if (!has(what)) issues.push({ level: "FAIL", message: `The ${what.toLowerCase()} page is missing.`, fix: `Add the ${what.toLowerCase()}.` });
    const later = p.placeholders.filter((x) => /ABSTRACT|ACKNOWLEDGEMENT|ABBREVIATIONS/.test(x));
    const fillIn = p.placeholders.filter((x) => !later.includes(x));
    const w = p.written ?? null;
    if (later.length) issues.push({ level: "WARN", message: `Not written: ${later.join(", ")}.`, fix: "Write them again, or type them in, on the Preliminary pages card (Report tab)." });
    if (w?.needsReview) issues.push({ level: "WARN", message: `The abstract is ${w.abstractWords} words; it should be ${ABSTRACT_MIN_WORDS}–${ABSTRACT_MAX_WORDS}.`, fix: "Shorten or lengthen it on the Preliminary pages card, or write it again." });
    if (w?.blanks.length) issues.push({ level: "WARN", message: `The acknowledgement or abstract still has blanks: ${w.blanks.join(", ")}.`, fix: "Add the missing details on Edit intake and write the pages again, or fill the blanks in by hand on the Preliminary pages card." });
    if (fillIn.length) issues.push({ level: "WARN", message: `Not collected at intake: ${fillIn.join(", ")}.`, fix: "Add them on the project's Edit intake page before delivery." });
    push("ST1", issues, { pass: "Cover, title page, declaration, certification, dedication, acknowledgement, abstract and contents are all there.", na: "A chapter-based order has no preliminary pages." }, { na: !p.included });
  }

  // ── ST2 chapters complete, titled, numbered ──────────────────────────────
  {
    const issues: QualityIssue[] = [];
    const numbers = chapters.map((c) => c.number);
    if (!numbers.length) issues.push({ level: "FAIL", severity: "CRITICAL", message: "The report has no chapters." });
    if (!input.chapterBased) for (let n = 1; n <= 5; n++) if (!numbers.includes(n)) issues.push({ level: "FAIL", severity: "CRITICAL", message: `Chapter ${WORDS[n]} is missing.`, chapter: n });
    if (numbers.some((n) => n > 5)) issues.push({ level: "FAIL", message: "The report has more than five chapters.", fix: "Every report has five chapters at most." });
    const combined = input.pureScience && input.section === "MEDICAL_SCIENCE" && input.mode === 4;
    for (const c of chapters) {
      const title = c.title ?? "";
      const approved = c.number === 3 ? input.thematicTitles.chapter3 : c.number === 4 ? input.thematicTitles.chapter4 : null;
      if (input.template === "B" && approved && title && !sameWords(title, approved)) {
        issues.push({ level: "FAIL", message: `Chapter ${WORDS[c.number]} is titled "${title}", not the approved "${approved}".`, chapter: c.number, fix: "Use the approved thematic title." });
      }
      if (combined && c.number === 4 && title && !/results and discussion/i.test(title)) issues.push({ level: "FAIL", message: `Chapter Four should be titled RESULTS AND DISCUSSION for this department, not "${title}".`, chapter: 4 });
      // Section numbering: N.1, N.2 … (N.0 allowed first), each N.x.y under its N.x, no gaps or repeats.
      let lastSection = -1;
      let lastSub = 0;
      for (const h of c.headings) {
        const m = /^(\d+)\.(\d+)(?:\.(\d+))?\.?\s/.exec(h.text);
        if (!m) {
          issues.push({ level: "WARN", message: "A section heading has no number.", chapter: c.number, quote: h.text, fix: `Number it (${c.number}.x).` });
          continue;
        }
        const [ch, sec, sub] = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null];
        if (ch !== c.number) issues.push({ level: "FAIL", message: `Heading "${h.text}" is numbered for Chapter ${ch}.`, chapter: c.number, quote: h.text, fix: `Number it ${c.number}.x.` });
        if (sub === null) {
          const okStart = lastSection === -1 && (sec === 0 || sec === 1);
          if (!okStart && sec !== lastSection + 1) issues.push({ level: "FAIL", message: `Section numbering jumps to ${m[1]}.${m[2]}.`, chapter: c.number, quote: h.text, fix: "Number the sections in order with no gaps or repeats." });
          lastSection = sec;
          lastSub = 0;
        } else {
          if (sec !== lastSection) issues.push({ level: "FAIL", message: `Sub-section ${m[1]}.${m[2]}.${m[3]} sits under section ${c.number}.${lastSection}.`, chapter: c.number, quote: h.text, fix: "Put each sub-section under its own section." });
          else if (sub !== lastSub + 1) issues.push({ level: "FAIL", message: `Sub-section numbering jumps to ${m[1]}.${m[2]}.${m[3]}.`, chapter: c.number, quote: h.text, fix: "Number the sub-sections in order." });
          lastSub = sub;
        }
      }
    }
    push("ST2", issues, `${chapters.length} chapter${chapters.length === 1 ? "" : "s"} in order, numbered in words, sections numbered without gaps.`);
  }

  // ── ST3–ST7 required sections ────────────────────────────────────────────
  // A chapter checked on its own reads Chapter One's statements from Chapter One's own text.
  const chapterOne = byNumber.get(1) ?? (input.scope?.chapterOneText ? parse([{ number: 1, text: input.scope.chapterOneText, plan: null }])[0] : undefined);
  const hypothesesInCh1 = hypothesesOf(chapterOne);
  sectionCtx.hasHypotheses = hypothesesInCh1.length > 0;
  for (let n = 1; n <= 5; n++) {
    const id = `ST${n + 2}`;
    const c = byNumber.get(n);
    if (!c) {
      push(id, [], { pass: "", na: input.scope ? `Chapter ${WORDS[n]} is checked on its own.` : `Chapter ${WORDS[n]} is not part of this order.` }, { na: true });
      continue;
    }
    const issues: QualityIssue[] = [];
    const headingTexts = c.headings.map((h) => h.text);
    if (input.supervisorToc && c.plan) {
      const missing = missingHeadings(c.text, c.plan.sections.map((s) => s.number));
      for (const num of missing) {
        const s = c.plan.sections.find((x) => x.number === num);
        issues.push({ level: "FAIL", message: `Section ${num} ${s?.heading ?? ""} from the supervisor's table of contents is missing.`.replace(/\s+\./, "."), chapter: n, fix: "Write the missing section." });
      }
      push(id, issues, { pass: `Every section the supervisor's table of contents gives Chapter ${WORDS[n]} is there.` });
      continue;
    }
    if (!input.section) {
      push(id, [], { pass: "", na: "No prompt section is approved for this department." }, { na: true });
      continue;
    }
    const req = requiredSections(input.section, n, sectionCtx);
    if (req === "THEMATIC") {
      const approved = n === 3 ? input.thematicTitles.chapter3 : input.thematicTitles.chapter4;
      const h2 = c.headings.filter((h) => h.level === 2).length;
      if (h2 < 3) issues.push({ level: "FAIL", message: `Thematic Chapter ${WORDS[n]} has ${h2} section${h2 === 1 ? "" : "s"}; it needs at least three.`, chapter: n, fix: "Develop the theme in at least three sections." });
      if (approved && c.title && !sameWords(c.title, approved)) issues.push({ level: "FAIL", message: `Chapter ${WORDS[n]} is not titled with the approved theme "${approved}".`, chapter: n });
      push(id, issues, `Thematic chapter with ${h2} sections${approved ? ` under the approved title "${approved}"` : ""}.`);
      continue;
    }
    if (!req) {
      push(id, [], { pass: "", na: "The prompt sets no section list for this chapter." }, { na: true });
      continue;
    }
    for (const r of req) {
      if (!headingTexts.some((h) => r.match.test(h))) {
        issues.push({ level: "FAIL", severity: r.critical ? "CRITICAL" : undefined, message: `Chapter ${WORDS[n]} has no "${r.label}" section.`, chapter: n, fix: `Add the ${r.label} section the chapter instructions require.` });
      }
    }
    if (n === 4 && forbidsDiscussionInChapterFour(input.section, sectionCtx)) {
      const d = c.headings.find((h) => h.level === 2 && /discussion/i.test(h.text));
      if (d) issues.push({ level: "FAIL", message: "Chapter Four has a Discussion section; in this department the discussion belongs to Chapter Five.", chapter: 4, quote: d.text, fix: "Move the discussion to Chapter Five." });
    }
    push(id, issues, `All ${req.length} sections the chapter instructions require are there.`);
  }

  // ── ST8 aim and objectives word for word ─────────────────────────────────
  {
    const c1 = byNumber.get(1);
    const issues: QualityIssue[] = [];
    const aim = input.aim?.trim() || null;
    if (c1 && input.objectives.length) {
      const body = normaliseForMatch(readable(c1.blocks));
      if (aim && !body.includes(normaliseForMatch(aim).replace(/[.!?]+$/, ""))) {
        issues.push({ level: "FAIL", message: `The aim is not stated word for word: "${shortQuote(aim, 200)}".`, chapter: 1, fix: "State the approved aim exactly as approved, as one sentence in the aim section (Aim and Objectives of the Study)." });
      }
      let last = -1;
      input.objectives.forEach((o, i) => {
        const key = objectiveKey(o);
        const at = body.indexOf(key);
        if (at === -1) issues.push({ level: "FAIL", message: `Objective ${i + 1} is not stated word for word: "${shortQuote(o, 140)}".`, chapter: 1, fix: "State the approved objectives exactly as approved, in order." });
        else if (at < last) issues.push({ level: "FAIL", message: `Objective ${i + 1} is out of order.`, chapter: 1, fix: "State the objectives in the approved order." });
        else last = at;
      });
    }
    push(
      "ST8",
      issues,
      { pass: `Chapter One states ${aim ? "the approved aim and " : ""}all ${input.objectives.length} approved objectives word for word, in order.`, na: "Chapter One is not part of this order." },
      { na: !c1 || !input.objectives.length },
    );
  }

  // ── ST9 objective traceability (AI) ──────────────────────────────────────
  {
    const need = input.template === "B" ? [3, 4, 5] : [4, 5];
    const na = need.some((n) => !byNumber.has(n)) || !input.objectives.length;
    const issues: QualityIssue[] = [];
    const t = input.traceability;
    if (!na && !t) issues.push({ level: "WARN", message: "The traceability review could not run this time; check by hand that every objective is reported and judged.", fix: "Run the quality check again." });
    if (!na && t) {
      for (const o of t.objectives) {
        const label = `Objective ${o.index}`;
        const where4 = input.template === "B" ? "the thematic chapters" : "Chapter Four";
        if (!o.reported) issues.push({ level: "FAIL", message: `${label} is not reported in ${where4}.`, chapter: input.template === "B" ? 3 : 4, fix: `Report the findings for ${label.toLowerCase()} in ${where4}.` });
        else if (!o.reportQuoteFound) issues.push({ level: "WARN", message: `${label}: the review's evidence from ${where4} was not found word for word; check it by hand.`, chapter: 4, quote: o.reportQuote });
        if (o.verdict === "NOT_STATED") issues.push({ level: "FAIL", message: `Chapter Five does not say whether ${label.toLowerCase()} was achieved.`, chapter: 5, fix: "State in Chapter Five whether each objective was achieved or not achieved." });
        else if (!o.verdictQuoteFound) issues.push({ level: "WARN", message: `${label}: the review's evidence from Chapter Five was not found word for word; check it by hand.`, chapter: 5, quote: o.verdictQuote });
      }
    }
    push("ST9", issues, { pass: `Every objective is reported${input.template === "B" ? "" : " in Chapter Four"} and judged in Chapter Five.`, na: "Traceability needs Chapters Four and Five." }, { na });
  }

  // ── ST10 research questions and hypotheses answered ──────────────────────
  {
    const c1 = chapterOne;
    const c4 = byNumber.get(4);
    const questions = researchQuestionsOf(c1);
    const hypotheses = hypothesesInCh1;
    const na = !c1 || !c4 || input.template === "B" || (questions.length === 0 && hypotheses.length === 0);
    const issues: QualityIssue[] = [];
    if (!na && c4) {
      const text4 = normaliseForMatch(readable(c4.blocks));
      questions.forEach((q, i) => {
        if (!answered(text4, q, i + 1, "question")) issues.push({ level: "FAIL", message: `Research question ${i + 1} is not answered in Chapter Four: "${shortQuote(q, 120)}".`, chapter: 4, fix: "Answer each research question in Chapter Four, by number." });
      });
      hypotheses.forEach((h, i) => {
        if (!answered(text4, h, i + 1, "hypothesis")) issues.push({ level: "FAIL", message: `Hypothesis ${i + 1} is not tested in Chapter Four: "${shortQuote(h, 120)}".`, chapter: 4, fix: "Test each hypothesis in Chapter Four and state the decision." });
      });
    }
    push("ST10", issues, { pass: `Chapter Four answers all ${questions.length} research question(s) and tests all ${hypotheses.length} hypothesis(es).`, na: "No research questions or hypotheses to trace (or Chapter One or Four is not part of this order)." }, { na });
  }

  // ── ST11 chapter balance ─────────────────────────────────────────────────
  {
    const issues: QualityIssue[] = [];
    let judged = 0;
    for (const c of chapters) {
      if (!c.plan?.targetWords) continue;
      judged++;
      const words = countWords(c.text);
      const ratio = words / c.plan.targetWords;
      if (ratio < 1 - BALANCE_TOLERANCE || ratio > 1 + BALANCE_TOLERANCE) {
        // The plan is the generator's own target: a person's upload is told, not held to it.
        issues.push({ level: input.scope?.subject === "UPLOAD" ? "WARN" : "FAIL", message: `Chapter ${WORDS[c.number]} has ${words.toLocaleString("en-US")} words against a plan of ${c.plan.targetWords.toLocaleString("en-US")} (${Math.round(ratio * 100)}%).`, chapter: c.number, fix: ratio < 1 ? "Develop the thin sections to the planned length." : "Cut repetition and padding back to the planned length." });
      }
    }
    if (input.template === "B") {
      const thematic = [3, 4].map((n) => byNumber.get(n)).filter((c): c is Parsed => !!c).map((c) => ({ n: c.number, words: countWords(c.text) }));
      if (thematic.length === 2) {
        const [a, b] = thematic.sort((x, y) => x.words - y.words);
        if (a.words > 0 && b.words / a.words > THEMATIC_BALANCE) issues.push({ level: "FAIL", message: `Chapter ${WORDS[b.n]} is ${(b.words / a.words).toFixed(2)} times the length of Chapter ${WORDS[a.n]} (1.75 at most).`, chapter: b.n, fix: "Balance the two thematic chapters." });
      }
    }
    const unplanned = chapters.length - judged;
    if (unplanned) issues.push({ level: "WARN", message: `${unplanned} chapter${unplanned === 1 ? " has" : "s have"} no generation plan to measure against.` });
    push("ST11", issues, `Each chapter is within ${BALANCE_TOLERANCE * 100}% of its planned length.`);
  }

  // ── ST12 reference count ─────────────────────────────────────────────────
  //
  // Standard (Template A) reports are counted by the number of DISTINCT verified references cited
  // in (Author, Year) form across the chapters. Note-style reports (Template B and any MODE_A/B/C
  // placement) have no author-date markers, so their count is the total number of endnote entries
  // across the chapters. Both are held to REFERENCE_MINIMUM.
  {
    const min = input.chapterBased ? REFERENCE_MINIMUM.chapterBased : REFERENCE_MINIMUM.full;
    let n: number;
    let howCounted: string;
    const placement = input.citations.placement;
    if (citesInEndnotes(placement)) {
      // Endnote styles: the distinct notes the chapters carry (MODE_B: the joined list, identical notes counted once).
      n = distinctNoteCount(chapters, placement);
      howCounted = "distinct endnotes";
    } else if (input.citations.noteStyle) {
      n = chapters.reduce((total, c) => {
        const block = c.blocks.find((b): b is Extract<Block, { kind: "endnotes" }> => b.kind === "endnotes");
        return total + (block?.lines.filter((line) => /^\s*\**\s*\d{1,3}[.)]\s+\S/.test(line)).length ?? 0);
      }, 0);
      howCounted = "endnote entries";
    } else {
      n = input.citations.cited.length;
      howCounted = "verified references cited";
    }
    push(
      "ST12",
      input.scope ? [] : n >= min ? [] : [{ level: "FAIL", message: `The chapters carry ${n} ${howCounted}; ${input.chapterBased ? "a chapter-based order" : "a full report"} needs at least ${min}.`, fix: input.citations.noteStyle ? "Add more endnote entries where sources are used." : "Cite more of the verified references where they support the text." }],
      { pass: `${n} ${howCounted} (at least ${min}).`, na: "The reference count is judged on the whole report." },
      { na: Boolean(input.scope) },
    );
  }

  // ── ST13 citation placement ──────────────────────────────────────────────
  //
  // Standard (Template A) reports cite (Author, Year) in the text. Chapters 1 and 2 must cite at
  // least one verified reference, and Chapter 5 introduces no new source.
  //
  // Thematic reports (Template B, Humanities and doctrinal Law) and any other note-style placement
  // cite by superscript number and list the notes at the end of each chapter. The (Author, Year) rule
  // does not apply, so this branch checks the note structure instead: at least one note marker in the
  // body, an endnote list at the chapter's end, and no more markers than there are entries in the
  // list. This was known from the D9 test: Project A's Chapter One read as "cites no verified
  // reference" against the inline rule although it was written in endnote style.
  {
    const issues: QualityIssue[] = [];
    const refsIn = (n: number) => new Set(input.citations.matched.filter((m) => m.use.chapter === n).flatMap((m) => m.refs.map((r) => r.id)));
    if (citesInEndnotes(input.citations.placement)) {
      // Endnote styles: every part ends with an [ENDNOTES] block, and each marker must have its note in the
      // block after it (endnotes.ts, the rule the assembly numbers them by).
      for (const n of [1, 2]) {
        const c = byNumber.get(n);
        if (!c) continue;
        const notes = analyseChapterNotes(c.text);
        const dangling = notes.markers.filter((m) => !entryFor(notes, m));
        if (notes.markers.length === 0 && notes.entries.length === 0) {
          issues.push({ level: "FAIL", message: `Chapter ${WORDS[n]} carries no note references or endnotes, so it cites nothing.`, chapter: n, fix: "Add note markers (^1, ^2 …) where sources are used, and end each part with an [ENDNOTES] list." });
        } else if (notes.markers.length > 0 && notes.entries.length === 0) {
          issues.push({ level: "FAIL", message: `Chapter ${WORDS[n]} has ${notes.markers.length} note reference${notes.markers.length === 1 ? "" : "s"} in the text but no [ENDNOTES] list.`, chapter: n, fix: "End each part with an [ENDNOTES] block, one entry per marker." });
        } else if (dangling.length) {
          const which = [...new Set(dangling.map((m) => m.local))].slice(0, 8).join(", ");
          issues.push({ level: "FAIL", message: `Chapter ${WORDS[n]} has ${dangling.length} note reference${dangling.length === 1 ? "" : "s"} with no entry in the [ENDNOTES] list after ${dangling.length === 1 ? "it" : "them"} (note ${which}).`, chapter: n, fix: "Add the missing entries to the [ENDNOTES] block that follows the markers, or drop the markers." });
        }
      }
    } else if (input.citations.noteStyle) {
      const noteMarkerCount = (c: Parsed): number => {
        // ^3, ^{12}, ^[3] and a trailing "[3]" after a word or punctuation: the same set the assembly
        // renders as superscripts.
        const bare = readable(c.blocks.filter((b) => b.kind !== "endnotes"));
        const matches = bare.match(/\^\{?\[?\d{1,3}\]?\}?|(?<=[\p{L}.,;:!?)"'’”])\[\d{1,3}\](?![\p{L}\d])/gu) ?? [];
        return matches.length;
      };
      const endnoteCount = (c: Parsed): number => {
        const block = c.blocks.find((b): b is Extract<Block, { kind: "endnotes" }> => b.kind === "endnotes");
        if (!block) return 0;
        return block.lines.filter((line) => /^\s*\**\s*\d{1,3}[.)]\s+\S/.test(line)).length;
      };
      for (const n of [1, 2]) {
        const c = byNumber.get(n);
        if (!c) continue;
        const markers = noteMarkerCount(c);
        const notes = endnoteCount(c);
        if (markers === 0 && notes === 0) {
          issues.push({ level: "FAIL", message: `Chapter ${WORDS[n]} carries no note references or endnote list, so it cites nothing.`, chapter: n, fix: "Add note markers (^1, ^2 …) where sources are used and list the notes at the chapter's end." });
        } else if (markers > 0 && notes === 0) {
          issues.push({ level: "FAIL", message: `Chapter ${WORDS[n]} has ${markers} note reference${markers === 1 ? "" : "s"} in the text but no numbered [ENDNOTES] list at the end.`, chapter: n, fix: "Add an [ENDNOTES] block at the chapter's end with one entry per marker." });
        } else if (markers > notes) {
          issues.push({ level: "FAIL", message: `Chapter ${WORDS[n]} has ${markers} note references but only ${notes} entries in its endnote list.`, chapter: n, fix: "Add the missing endnote entries, or drop the extra markers." });
        }
      }
    } else {
      for (const n of [1, 2]) if (byNumber.has(n) && refsIn(n).size === 0) issues.push({ level: "FAIL", message: `Chapter ${WORDS[n]} cites no verified reference.`, chapter: n, fix: "Support the chapter's claims with the verified references." });
    }
    if (input.template === "A" && byNumber.has(2)) {
      const two = refsIn(2).size;
      const most = chapters.filter((c) => c.number !== 2).map((c) => ({ n: c.number, k: refsIn(c.number).size })).sort((a, b) => b.k - a.k)[0];
      if (most && most.k > two) issues.push({ level: "FAIL", message: `Chapter ${WORDS[most.n]} cites more works (${most.k}) than the literature review (${two}).`, chapter: 2, fix: "The literature review should carry the most sources." });
    }
    if (byNumber.has(5)) {
      const earlier = new Set([...[1, 2, 3, 4].flatMap((n) => [...refsIn(n)]), ...(input.scope?.earlierCitedIds ?? [])]);
      const fresh = input.citations.matched.filter((m) => m.use.chapter === 5 && m.refs.some((r) => !earlier.has(r.id)));
      if (fresh.length && ([1, 2, 3, 4].some((n) => byNumber.has(n)) || (input.scope?.earlierCitedIds.length ?? 0) > 0)) {
        for (const m of fresh.slice(0, 5)) issues.push({ level: "FAIL", message: "Chapter Five cites a source the earlier chapters never used.", chapter: 5, paragraph: m.use.paragraph, quote: shortQuote(m.use.sentence, 160), fix: "Chapter Five introduces no new sources: move the point to the review or drop the citation." });
      }
    }
    push("ST13", issues, "Citations sit where they should: the review carries the most, the conclusion adds no new sources.");
  }

  // ── ST14 tables and figures referred to ──────────────────────────────────
  {
    const issues: QualityIssue[] = [];
    const captions = new Set<string>();
    const items: { kind: "Table" | "Figure"; num: string; chapter: number; caption: string }[] = [];
    for (const c of chapters) {
      for (const b of c.blocks) {
        const caption = b.kind === "table" || b.kind === "figure" ? b.caption : null;
        const kind = b.kind === "table" ? "Table" : b.kind === "figure" ? "Figure" : null;
        if (!kind || !caption) continue;
        const num = new RegExp(`^\\**\\s*${kind === "Table" ? "Table" : "Fig(?:ure|\\.)?"}\\s+(\\d+\\.\\d+)`, "i").exec(caption)?.[1];
        if (!num) continue;
        captions.add(`${kind} ${num}`);
        items.push({ kind, num, chapter: c.number, caption });
      }
    }
    const prose = chapters.map((c) => ({ n: c.number, text: plainText(readable(c.blocks.filter((b) => b.kind !== "heading"))) }));
    const all = prose.map((p) => p.text).join("\n");
    for (const it of items) {
      const re = new RegExp(`\\b${it.kind === "Table" ? "Tables?" : "(?:Figures?|Figs?\\.)"}\\s+(?:\\d+\\.\\d+\\s*(?:,|and|&|to|-|–)\\s*)*${it.num.replace(".", "\\.")}\\b`, "i");
      if (!re.test(all)) issues.push({ level: "FAIL", message: `${it.kind} ${it.num} is never referred to in the text.`, chapter: it.chapter, quote: shortQuote(it.caption, 120), fix: `Introduce ${it.kind} ${it.num} in the text before it ("${it.kind} ${it.num} shows …").` });
    }
    for (const p of prose) {
      for (const m of p.text.matchAll(/\b(Table|Figure|Fig\.)\s+(\d+\.\d+)\b/g)) {
        const key = `${m[1] === "Table" ? "Table" : "Figure"} ${m[2]}`;
        // Checked on its own, a chapter may point to another chapter's table ("as Table 4.1 showed").
        if (input.scope && Number(m[2].split(".")[0]) !== input.scope.chapter) continue;
        if (!captions.has(key)) issues.push({ level: "FAIL", message: `The text refers to ${key}, which does not exist.`, chapter: p.n, fix: `Add ${key} or correct the reference.` });
      }
    }
    push("ST14", dedupe(issues), { pass: `All ${items.length} tables and figures are introduced in the text, and every reference points to one that exists.` });
  }

  // ── ST15 equations explained ─────────────────────────────────────────────
  {
    const issues: QualityIssue[] = [];
    let equations = 0;
    for (const c of chapters) {
      const blocks = c.blocks;
      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].kind !== "equation") continue;
        equations++;
        const eq = blocks[i] as Extract<Block, { kind: "equation" }>;
        let j = i + 1;
        while (j < blocks.length && blocks[j].kind === "equation") j++;
        const next = blocks[j];
        const defines =
          next &&
          ((next.kind === "paragraph" && /^\s*(?:where|in which|here)\b|\bdenotes?\b|\brepresents?\b|\bis the\b.*\b(?:of|in)\b/i.test(plainText(next.text).slice(0, 200))) ||
            (next.kind === "list" && next.items.some((it) => /=|\bdenotes?\b|\bis the\b/i.test(it.text))));
        const prev = blocks[i - 1];
        const introduced = prev && (prev.kind === "paragraph" || prev.kind === "equation");
        if (blocks[i - 1]?.kind === "equation") continue; // a run of equations shares its introduction and definitions
        if (!introduced) issues.push({ level: "FAIL", message: "An equation is not introduced by a sentence before it.", chapter: c.number, quote: eq.text, fix: "Introduce the equation with a sentence saying what relationship it describes." });
        if (!defines) issues.push({ level: "FAIL", message: "An equation's symbols are not defined after it.", chapter: c.number, quote: eq.text, fix: 'Follow the equation with "where …" defining every symbol with its unit.' });
      }
    }
    push("ST15", issues, { pass: `Every equation (${equations}) is introduced and its symbols defined.`, na: "The report has no equations." }, { na: equations === 0 });
  }

  // ── ST16 no review placeholders left ─────────────────────────────────────
  {
    const issues: QualityIssue[] = [];
    for (const c of chapters) {
      const found = findPlaceholders(c.text);
      const review = found.filter((p) => /COO TO REVIEW|CASE TO BE SUPPLIED|ARCHIVE TO BE SUPPLIED|REFERENCE TO BE SUPPLIED|OBJECTIVE NOT MET|N_DISTRIBUTED|N_RETURNED|N_USABLE|RESPONSE_RATE|POPULATION_SIZE|SAMPLE_SIZE|FIELDWORK_PERIOD/.test(p));
      const tasks = found.filter((p) => !review.includes(p));
      const count = (list: string[]) => [...new Set(list)].map((p) => `${p}${list.filter((x) => x === p).length > 1 ? ` (${list.filter((x) => x === p).length})` : ""}`).join(", ");
      // In the generator's own text these are left on purpose (the figures come after a data pause, a source
      // or case nobody could find): only a person can fill them, so the chapter gate tells the specialist.
      if (review.length) {
        const aiText = input.scope?.subject === "AI_TEXT";
        issues.push({
          level: aiText ? "WARN" : "FAIL",
          message: `Chapter ${WORDS[c.number]} ${aiText ? "carries" : "still carries"} ${count(review)}.`,
          chapter: c.number,
          fix: aiText ? "Fill these in your version before you upload it." : "Resolve every review placeholder: supply the data, case or source, or rewrite the passage.",
        });
      }
      if (tasks.length) issues.push({ level: "WARN", message: `Chapter ${WORDS[c.number]} has specialist tasks: ${count(tasks)}.`, chapter: c.number, fix: "Insert the figures and page numbers before delivery." });
    }
    push("ST16", issues, "No review placeholder is left in the chapters.");
  }

  if (out.length !== STRUCTURAL_CHECKS.length) throw new Error(`Structural layer returned ${out.length} checks`);
  return STRUCTURAL_CHECKS.map((c) => out.find((o) => o.id === c.id)!);
}

function dedupe(issues: QualityIssue[]): QualityIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.chapter}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Chapter One's research questions and hypotheses are read by src/lib/generation/chapter-one-statements.ts,
// the same reader the chapter orchestrator uses, so ST10 traces exactly what Chapters Four and Five were given.
export { extractStatements } from "@/lib/generation/chapter-one-statements";

const STOP = new Set("the a an of in on to and or for is are was were be by with at from that this there any no not its their between among what how which does do has have will significant relationship effect influence".split(" "));
const content = (s: string) => normaliseForMatch(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/** Chapter Four refers to statement `n` by label, or carries most of its words. */
function answered(text4: string, statement: string, n: number, kind: "question" | "hypothesis"): boolean {
  const word = WORDS[n]?.toLowerCase() ?? String(n);
  const labels =
    kind === "question"
      ? [`research question ${word}`, `research question ${n}`, `rq${n}`, `rq ${n}`, `question ${word}`]
      : [`hypothesis ${word}`, `hypothesis ${n}`, `h0${n}`, `ho${n}`, `h0 ${n}`, `ho ${n}`, `h${n}`, `h₀${n}`, `hypothesis ${n} (h`];
  if (labels.some((l) => new RegExp(`\\b${l.replace(/[()]/g, "\\$&")}\\b`).test(text4))) return true;
  const words = content(statement);
  if (words.length < 3) return false;
  const have = new Set(text4.replace(/[^a-z0-9 ]/g, " ").split(/\s+/));
  return words.filter((w) => have.has(w)).length / words.length >= 0.8;
}

// ─── ST9's AI review ─────────────────────────────────────────────────────────

export interface TraceObjective {
  index: number;
  reported: boolean;
  reportQuote: string | null;
  reportQuoteFound: boolean;
  verdict: "ACHIEVED" | "PARTLY_ACHIEVED" | "NOT_ACHIEVED" | "NOT_STATED";
  verdictQuote: string | null;
  verdictQuoteFound: boolean;
}

export interface TraceabilityResult {
  objectives: TraceObjective[];
}

export const TRACE_TOOL_NAME = "record_objective_trace";

export const TRACE_TOOL = {
  name: TRACE_TOOL_NAME,
  description: "Record, for every numbered objective, where the results chapter reports it and what the conclusion says about it.",
  input_schema: {
    type: "object",
    properties: {
      objectives: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            reported: { type: "boolean", description: "The results chapter(s) present findings for this objective." },
            reportQuote: { type: "string", description: "Exact words (at most 25) from the results chapter that report it; empty if not reported." },
            verdict: { type: "string", enum: ["ACHIEVED", "PARTLY_ACHIEVED", "NOT_ACHIEVED", "NOT_STATED"] },
            verdictQuote: { type: "string", description: "Exact words (at most 25) from Chapter Five that judge it; empty if not stated." },
          },
          required: ["index", "reported", "reportQuote", "verdict", "verdictQuote"],
        },
      },
    },
    required: ["objectives"],
  },
} as const;

/** The AI's trace, with each quote checked word for word against its chapter; an objective the reply skipped counts as not reported. */
export function readTraceability(raw: unknown, objectives: string[], reportText: string, conclusionText: string): TraceabilityResult {
  let list: unknown = (raw as { objectives?: unknown } | null)?.objectives;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = [];
    }
  }
  const got = new Map<number, Record<string, unknown>>();
  for (const o of (Array.isArray(list) ? list : []) as Record<string, unknown>[]) if (Number.isInteger(Number(o?.index))) got.set(Number(o.index), o);
  const r = normaliseForMatch(reportText);
  const c = normaliseForMatch(conclusionText);
  const found = (hay: string, q: unknown) => typeof q === "string" && normaliseForMatch(q).length >= 3 && hay.includes(normaliseForMatch(q));
  const verdicts = new Set(["ACHIEVED", "PARTLY_ACHIEVED", "NOT_ACHIEVED", "NOT_STATED"]);
  return {
    objectives: objectives.map((_, i) => {
      const o = got.get(i + 1) ?? {};
      const verdict = verdicts.has(String(o.verdict)) ? (o.verdict as TraceObjective["verdict"]) : "NOT_STATED";
      return {
        index: i + 1,
        reported: o.reported === true,
        reportQuote: typeof o.reportQuote === "string" ? o.reportQuote || null : null,
        reportQuoteFound: o.reported !== true || found(r, o.reportQuote),
        verdict,
        verdictQuote: typeof o.verdictQuote === "string" ? o.verdictQuote || null : null,
        verdictQuoteFound: verdict === "NOT_STATED" || found(c, o.verdictQuote),
      };
    }),
  };
}
