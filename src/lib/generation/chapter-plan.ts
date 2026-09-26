/**
 * Phase D2 — the pure half of chapter generation (no database, no network):
 * the project brief sent around the D1 prompt, the planning tool, how the
 * planned sections are packed into parts (one part per Claude call), the
 * instruction for each call, progress, and the output checks.
 * `npm run check:generation` tests all of it.
 *
 * Why parts: a chapter is 3,000–8,000 words. One call per part keeps every
 * call well inside a Vercel function's 5 minutes, lets a failed call be
 * retried without losing the rest, and gives real progress. Each call sends
 * the same prompt (cached) plus the parts already written, so the chapter
 * reads as one piece.
 */
import { z } from "zod";
import type { ChapterNumber } from "./prompt-loader";

export const REPORT_CHAPTERS = 5;
/** Double-spaced Times New Roman 12pt, 1-inch margins. */
export const WORDS_PER_PAGE = 250;
/** Words written per Claude call: about 60–120 seconds of output. A section longer than this is split across parts by its sub-sections. */
export const PART_WORD_LIMIT = 2000;
/** A section with no sub-sections to split it by may run this long in one call; a longer one sends the plan back. */
export const MAX_UNSPLIT_SECTION_WORDS = 2500;
export const MAX_PARTS = 16;
/** Sonnet 5 counts roughly 1.6 tokens per English word; 2.5 leaves room, and thinking gets its own allowance on top. */
const TOKENS_PER_WORD_CAP = 2.5;
const THINKING_ALLOWANCE = 16_000;
const MAX_OUTPUT_TOKENS = 64_000;

export const PLAN_TOOL_NAME = "record_chapter_plan";

/** Every call of one chapter run sends this same tool, so the cached prefix (tools render first) is shared. */
export const PLAN_TOOL = {
  name: PLAN_TOOL_NAME,
  description:
    "Record the plan for this chapter before it is written: every numbered section in order, the numbered sub-sections planned inside it, and a word target for each section.",
  input_schema: {
    type: "object",
    properties: {
      sections: {
        type: "array",
        description: "The chapter's numbered sections, in order.",
        items: {
          type: "object",
          properties: {
            number: { type: "string", description: 'The section number as it will appear, e.g. "1.1".' },
            heading: { type: "string", description: 'The heading without its number, e.g. "Background of the Study".' },
            subsections: {
              type: "array",
              items: { type: "string" },
              description: 'Numbered sub-section headings planned inside this section, e.g. "2.1.1 Concept of mobile money". Empty when there are none.',
            },
            targetWords: { type: "integer", description: "How many words this section should have, sub-sections included." },
          },
          required: ["number", "heading", "subsections", "targetWords"],
        },
      },
    },
    required: ["sections"],
  },
} as const;

export interface PlanSection {
  number: string;
  heading: string;
  subsections: string[];
  targetWords: number;
}

/**
 * What one part writes of one section: the whole section, or (for a section
 * over PART_WORD_LIMIT) a run of its planned sub-sections, subFrom to subTo
 * (end exclusive, indexes into PlanSection.subsections). The first run also
 * writes the section's heading and opening.
 */
export interface PartUnit {
  section: string;
  subFrom?: number;
  subTo?: number;
  targetWords: number;
}

export interface PlanPart {
  index: number;
  /** Section numbers this part writes (all or some of), in order. */
  sections: string[];
  /** What it writes of each (absent on plans made before sections could be split: whole sections). */
  units?: PartUnit[];
  targetWords: number;
  /** Filled in once the part is written. */
  done?: boolean;
  words?: number;
  /** Length of this part's text inside partialOutput (parts are joined with a blank line). */
  chars?: number;
  outputTokens?: number;
  /** Planned headings that were not found in the text, and similar notes for the quality gate. */
  warnings?: string[];
}

export interface ChapterPlan {
  sections: PlanSection[];
  parts: PlanPart[];
  targetWords: number;
  /** The end-of-chapter report the chapter prompt asks for (Chapters 4–5), split off the last part; never part of the text. */
  agentReport?: string;
}

const REPLY_WITH_TEXT =
  "Reply with the chapter text only, starting with that heading. Do not reply with a plan, a question, or a note about these instructions or the sources: where the material given cannot meet a requirement, write the best text it allows and name the gap in the [AGENT REPORT] of the last part.";

/**
 * Every sentence this module sends to Claude besides the D1 prompt, in one
 * place for the founder to review (as LOADER_TEXT is for the loader).
 */
export const GENERATION_TEXT = {
  briefHeading: "PROJECT BRIEF",
  chapterOf: (chapter: number) => `This is Chapter ${chapter} of ${REPORT_CHAPTERS}. Write Chapter ${chapter} only.`,
  objectivesRule:
    "Use exactly these objectives, in this order. Chapter 1 states them word for word; every later chapter follows them in the same order. Do not add, drop, merge or reword an objective.",
  questionsRule: "Use exactly these research questions, in this order.",
  hypothesesRule: "Use exactly these hypotheses, in this order.",
  noToc: "None given: follow the chapter instructions above.",
  noInstructions: "None.",
  outputFormat: [
    "OUTPUT FORMAT (read by EduCraft's document assembly)",
    `Mark every heading as the AI AGENT OUTPUT FORMAT in the chapter instructions does, on its own line: "[H1] CHAPTER TWO" and "[H1] LITERATURE REVIEW" for the chapter lines (the first part only), "[H2] 2.1 Introduction" for sections, "[H3] 2.1.1 Concept of mobile money" for sub-sections. Nothing below [H3].`,
    "The chapter is written in parts (see the instruction at the end). Write the chapter text only, never a summary of the chapter's structure, and give any end-of-chapter report that format asks for after the last section of the last part, under a line [AGENT REPORT]. It is kept for EduCraft's checks and never reaches the document.",
    "Where that format says nothing: paragraphs separated by one blank line, no indentation; single asterisks for italics (*et al.* and the titles your referencing style italicises) and no other Markdown (no bold, no \"#\", no bullet symbols; lists as plain lines numbered i., ii., iii. or 1., 2., 3.).",
    'Tables: the caption on its own line above the table ("Table 4.1: …"), the table as pipe-separated rows (| a | b |) with a header row and a |---| line under it, and the source line below. Figures: the [FIGURE PLACEHOLDER: …] line, with its caption and source as the figure rules say.',
    "Do not write the report's References list: it is assembled from the verified references. Where the citation instructions require footnotes or endnotes, follow them.",
  ].join("\n"),
  replyWithText: REPLY_WITH_TEXT,
  planIntro: "CHAPTER PLAN (from the planning step; write to it)",
  writtenSoFar: (chapter: number) => `CHAPTER ${chapter} TEXT WRITTEN SO FAR`,
  outlineInstruction: (chapter: number) =>
    [
      `PLAN CHAPTER ${chapter}`,
      `Before any writing, plan Chapter ${chapter} of this project by calling ${PLAN_TOOL_NAME} once.`,
      `- List every numbered section the instructions above require in Chapter ${chapter}, in order, with its number and heading, and the numbered sub-sections you will write inside each.`,
      "- Where the brief gives the supervisor's table of contents, follow it.",
      `- Give each section a word target. The targets together should match the page length the instructions set for this chapter, at about ${WORDS_PER_PAGE} words per double-spaced page (aim for the middle of the range).`,
      `- Give every section longer than ${PART_WORD_LIMIT.toLocaleString("en-US")} words numbered sub-sections.`,
      "- Plan the chapter body only: the chapter title lines are added at assembly.",
      "Call the tool and write nothing else.",
    ].join("\n"),
  /** `stopAt` is "section 1.3" or, when a long section is split across parts, "sub-section 2.4.2". */
  partInstruction: (p: { chapter: number; part: number; parts: number; lines: string[]; firstHeading: string; stopAt: string; continuing: boolean; last: boolean }) =>
    [
      `WRITE PART ${p.part} OF ${p.parts}`,
      `Write these sections of Chapter ${p.chapter}, complete and in order:`,
      ...p.lines,
      p.continuing
        ? `Begin with the heading "${p.firstHeading}". Continue from the text already written above: do not repeat, summarise or re-introduce any of it, and do not repeat the [H1] chapter lines.`
        : `Begin with the two [H1] chapter lines, then the heading "${p.firstHeading}".`,
      p.last
        ? `This is the last part of the chapter. Stop when ${p.stopAt} is complete, then add the [AGENT REPORT] if the chapter instructions ask for an end-of-chapter report.`
        : `Stop when ${p.stopAt} is complete. Do not begin anything later in the plan, and do not add a closing summary or transition that the plan does not have.`,
      REPLY_WITH_TEXT,
      "Follow every instruction above, and the output format in the brief.",
    ].join("\n"),
} as const;

// ─── The brief ──────────────────────────────────────────────────────────────

export interface BriefInput {
  chapter: ChapterNumber;
  projectTitle: string;
  university: string;
  department: string;
  template: "A" | "B";
  thematicTitles?: { chapter3?: string | null; chapter4?: string | null };
  objectives: string[];
  researchQuestions?: string[];
  hypotheses?: string[];
  specialInstructions?: string | null;
  supervisorToc?: string | null;
}

const numbered = (items: string[]) => items.map((item, i) => `${i + 1}. ${item.trim()}`).join("\n");

/** Project facts every call of the run sends, after the prompt: stable for the whole run, so it is cached with it. */
export function buildChapterBrief(b: BriefInput): string {
  const lines: string[] = [
    GENERATION_TEXT.briefHeading,
    `Project title: ${b.projectTitle.trim()}`,
    `University: ${b.university.trim()}`,
    `Department: ${b.department.trim()}`,
    GENERATION_TEXT.chapterOf(b.chapter),
  ];
  if (b.template === "B") {
    const t3 = b.thematicTitles?.chapter3?.trim();
    const t4 = b.thematicTitles?.chapter4?.trim();
    if (t3) lines.push(`Chapter 3 title: ${t3}`);
    if (t4) lines.push(`Chapter 4 title: ${t4}`);
  }
  lines.push("", "Objectives of the study:", numbered(b.objectives), GENERATION_TEXT.objectivesRule);
  if (b.researchQuestions?.length) lines.push("", "Research questions:", numbered(b.researchQuestions), GENERATION_TEXT.questionsRule);
  if (b.hypotheses?.length) lines.push("", "Hypotheses:", numbered(b.hypotheses), GENERATION_TEXT.hypothesesRule);
  lines.push("", "Supervisor's table of contents:", b.supervisorToc?.trim() || GENERATION_TEXT.noToc);
  lines.push("", "Special instructions from the client:", b.specialInstructions?.trim() || GENERATION_TEXT.noInstructions);
  lines.push("", GENERATION_TEXT.outputFormat);
  return lines.join("\n");
}

// ─── The plan ───────────────────────────────────────────────────────────────

const sectionSchema = z.object({
  number: z.string().trim().min(1),
  heading: z.string().trim().min(2),
  subsections: z.array(z.string().trim().min(1)).default([]),
  targetWords: z.coerce.number().int().min(40).max(9000),
});
const planSchema = z.object({ sections: z.array(sectionSchema).min(1).max(40) });

export class PlanError extends Error {}

/** A sub-section heading's number ("2.4.3 Studies on adoption" -> "2.4.3"), or null. */
export function subsectionNumber(heading: string): string | null {
  return /^(\d+(?:\.\d+)+)\b/.exec(heading.trim())?.[1] ?? null;
}

/**
 * Checks the planning tool's input. Throws PlanError (worth a retry) when the
 * plan is unusable. Sub-sections given without a number are numbered in order.
 */
export function parsePlanInput(input: unknown, chapter: number): PlanSection[] {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) throw new PlanError(`The chapter plan was not valid: ${parsed.error.issues[0]?.message ?? "unknown problem"}`);
  const sections = parsed.data.sections;
  const wrongChapter = sections.filter((s) => !new RegExp(`^${chapter}\\.\\d+$`).test(s.number));
  if (wrongChapter.length) {
    throw new PlanError(`The chapter plan numbers sections outside Chapter ${chapter}: ${wrongChapter.map((s) => s.number).join(", ")}`);
  }
  const seen = new Set<string>();
  for (const s of sections) {
    if (seen.has(s.number)) throw new PlanError(`The chapter plan lists section ${s.number} twice`);
    seen.add(s.number);
  }
  const total = sections.reduce((n, s) => n + s.targetWords, 0);
  if (total < 800 || total > 20_000) throw new PlanError(`The chapter plan adds up to ${total} words, outside 800–20,000`);
  const tooLong = sections.find((s) => s.targetWords > MAX_UNSPLIT_SECTION_WORDS && s.subsections.length < 2);
  if (tooLong) {
    throw new PlanError(
      `Section ${tooLong.number} is planned at ${tooLong.targetWords} words with fewer than two sub-sections; a section over ${PART_WORD_LIMIT} words needs numbered sub-sections`,
    );
  }
  return sections.map((s) => ({
    ...s,
    heading: s.heading.replace(new RegExp(`^${escapeRegExp(s.number)}\\s+`), ""),
    subsections: s.subsections.map((sub, i) => (subsectionNumber(sub) ? sub : `${s.number}.${i + 1} ${sub}`)),
  }));
}

/** A section as units of at most about `limit` words: whole, or split into runs of its sub-sections. */
function sectionUnits(s: PlanSection, limit: number): PartUnit[] {
  const n = s.subsections.length;
  if (s.targetWords <= limit || n < 2) return [{ section: s.number, targetWords: s.targetWords }];
  const pieces = Math.min(n, Math.ceil(s.targetWords / limit));
  const units: PartUnit[] = [];
  for (let i = 0; i < pieces; i++) {
    const subFrom = Math.round((i * n) / pieces);
    const subTo = Math.round(((i + 1) * n) / pieces);
    units.push({ section: s.number, subFrom, subTo, targetWords: Math.round((s.targetWords * (subTo - subFrom)) / n) });
  }
  return units;
}

/**
 * Consecutive units packed into parts of at most `limit` words. A long section
 * is split across parts by its sub-sections, so no call has to write much more
 * than `limit` words (a section with no sub-sections is capped at
 * MAX_UNSPLIT_SECTION_WORDS by parsePlanInput).
 */
export function packParts(sections: PlanSection[], limit = PART_WORD_LIMIT): PlanPart[] {
  const parts: PlanPart[] = [];
  let current: PlanPart | null = null;
  for (const unit of sections.flatMap((s) => sectionUnits(s, limit))) {
    if (current && current.targetWords + unit.targetWords > limit) {
      parts.push(current);
      current = null;
    }
    if (!current) current = { index: parts.length, sections: [], units: [], targetWords: 0 };
    current.units!.push(unit);
    if (!current.sections.includes(unit.section)) current.sections.push(unit.section);
    current.targetWords += unit.targetWords;
  }
  if (current) parts.push(current);
  return parts;
}

export function buildPlan(sections: PlanSection[]): ChapterPlan {
  const parts = packParts(sections);
  if (parts.length > MAX_PARTS) throw new PlanError(`The chapter plan needs ${parts.length} parts, more than ${MAX_PARTS}`);
  return { sections, parts, targetWords: sections.reduce((n, s) => n + s.targetWords, 0) };
}

/** The part's units; a plan made before sections could be split lists whole sections only. */
export function partUnits(plan: ChapterPlan, part: PlanPart): PartUnit[] {
  return (
    part.units ??
    part.sections.map((n) => ({ section: n, targetWords: plan.sections.find((s) => s.number === n)?.targetWords ?? 0 }))
  );
}

function isWhole(unit: PartUnit, s: PlanSection): boolean {
  return unit.subFrom === undefined || unit.subTo === undefined || (unit.subFrom === 0 && unit.subTo >= s.subsections.length);
}

/** The number of the first heading each unit starts with: the section's own, or a continued section's first sub-section. */
export function unitHeadingNumber(plan: ChapterPlan, unit: PartUnit): string {
  const s = plan.sections.find((x) => x.number === unit.section)!;
  if (!unit.subFrom) return s.number;
  return subsectionNumber(s.subsections[unit.subFrom]) ?? s.number;
}

/** The plan as Claude reads it in the writing calls. */
export function planText(plan: ChapterPlan): string {
  const lines = plan.sections.flatMap((s) => [
    `${s.number} ${s.heading}, about ${s.targetWords} words`,
    ...s.subsections.map((sub) => `    ${sub}`),
  ]);
  return [GENERATION_TEXT.planIntro, ...lines, `Total: about ${plan.targetWords.toLocaleString("en-US")} words.`].join("\n");
}

export function partInstruction(plan: ChapterPlan, index: number, chapter: number): string {
  const part = plan.parts[index];
  const units = partUnits(plan, part);
  const lines = units.map((u) => {
    const s = plan.sections.find((x) => x.number === u.section)!;
    if (isWhole(u, s)) {
      const subs = s.subsections.length ? `; sub-sections: ${s.subsections.join("; ")}` : "";
      return `${s.number} ${s.heading} (about ${s.targetWords} words${subs})`;
    }
    const subs = s.subsections.slice(u.subFrom, u.subTo).join("; ");
    const ends = u.subTo! >= s.subsections.length;
    const rest = ends ? ", which end the section" : `; the rest of ${s.number} comes in the next part`;
    return u.subFrom === 0
      ? `${s.number} ${s.heading}: its opening and sub-sections ${subs} (about ${u.targetWords} words)${rest}`
      : `${s.number} ${s.heading}, continued: sub-sections ${subs} (about ${u.targetWords} words)${rest}`;
  });

  const first = units[0];
  const firstSection = plan.sections.find((x) => x.number === first.section)!;
  const firstHeading = first.subFrom ? `[H3] ${firstSection.subsections[first.subFrom]}` : `[H2] ${firstSection.number} ${firstSection.heading}`;
  const lastUnit = units[units.length - 1];
  const lastSection = plan.sections.find((x) => x.number === lastUnit.section)!;
  const stopAt = isWhole(lastUnit, lastSection) || lastUnit.subTo! >= lastSection.subsections.length
    ? `section ${lastSection.number}`
    : `sub-section ${subsectionNumber(lastSection.subsections[lastUnit.subTo! - 1]) ?? lastSection.number}`;

  return GENERATION_TEXT.partInstruction({
    chapter,
    part: index + 1,
    parts: plan.parts.length,
    lines,
    firstHeading,
    stopAt,
    continuing: index > 0,
    last: index === plan.parts.length - 1,
  });
}

/**
 * About how long a step takes, so a slice never starts one it cannot finish
 * before its deadline (measured: planning ~5–15 s; a part ~50–110 s for
 * ~1,800 words, of which up to a minute can be thinking before any text).
 */
export function stepEstimateMs(step: { kind: "plan" } | { kind: "part"; targetWords: number }): number {
  return step.kind === "plan" ? 60_000 : 40_000 + step.targetWords * 60;
}


// ─── Request layout (prompt caching) ────────────────────────────────────────

/** Same shape as anthropic.ts's ClaudeTextBlock (kept here so this module stays free of the database). */
export interface UserBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}
const CACHED = { type: "ephemeral" } as const;

/**
 * The planning call: the brief (cached with the prompt before it), then the
 * instruction. Every call of a run sends the prompt as the system block with
 * its own breakpoint.
 */
export function outlineUserBlocks(briefText: string, chapter: number): UserBlock[] {
  return [
    { type: "text", text: briefText, cache_control: CACHED },
    { type: "text", text: GENERATION_TEXT.outlineInstruction(chapter) },
  ];
}

/**
 * A writing call: the brief, the plan (breakpoint), each written part as its
 * own block (breakpoint on the last, so the next part reads this call's cache
 * entry), then the instruction, which is never cached. With the system
 * block's breakpoint that is at most 3 of the 4 allowed.
 */
export function partUserBlocks(p: { briefText: string; plan: ChapterPlan; partialOutput: string | null; chapter: number; partIndex: number }): UserBlock[] {
  const written = p.plan.parts.slice(0, p.partIndex);
  const texts = p.partialOutput ? (splitParts(p.partialOutput, written.map((w) => w.chars ?? 0)) ?? [p.partialOutput]) : [];
  return [
    { type: "text", text: p.briefText },
    { type: "text", text: planText(p.plan), cache_control: CACHED },
    ...texts.map(
      (t, i): UserBlock => ({
        type: "text",
        text: i === 0 ? `${GENERATION_TEXT.writtenSoFar(p.chapter)}\n\n${t}` : t,
        ...(i === texts.length - 1 ? { cache_control: CACHED } : {}),
      }),
    ),
    { type: "text", text: partInstruction(p.plan, p.partIndex, p.chapter) },
  ];
}

/** Output room for a part: its words at a generous token rate, plus room for thinking; raised on each retry after a cut-off. */
export function partMaxTokens(targetWords: number, retry = 0): number {
  const base = THINKING_ALLOWANCE + Math.ceil(targetWords * TOKENS_PER_WORD_CAP);
  return Math.min(MAX_OUTPUT_TOKENS, Math.round(base * (1 + 0.5 * retry)));
}

// ─── Output ─────────────────────────────────────────────────────────────────

export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu);
  return m ? m.length : 0;
}

const CHAPTER_WORDS = ["ONE", "TWO", "THREE", "FOUR", "FIVE"];

export const AGENT_REPORT_MARKER = "[AGENT REPORT]";

/** Splits the end-of-chapter report (written under [AGENT REPORT]) off a part's text. */
export function splitAgentReport(text: string): { body: string; report: string | null } {
  const at = text.search(/(^|\n)\s*\[AGENT REPORT\]/);
  if (at === -1) return { body: text, report: null };
  const report = text.slice(at).replace(/^\s*\[AGENT REPORT\]\s*/, "").trim();
  return { body: text.slice(0, at), report: report || null };
}

/**
 * Tidies a written part: normalises line ends and trims it. The chapter's
 * [H1] lines belong to the first part only; a later part that repeats them (or
 * a plain "CHAPTER TWO" line and the title under it) has them dropped.
 */
export function cleanPartText(text: string, chapter: number, opts: { first: boolean } = { first: true }): string {
  let out = text.replace(/\r\n/g, "\n").trim();
  if (!opts.first) {
    out = out.replace(/^(\s*\[H1\][^\n]*\n+)+/, "");
    const titleLine = new RegExp(`^\\**\\s*CHAPTER\\s+(${chapter}|${CHAPTER_WORDS[chapter - 1]})\\b[^\\n]*\\n+`, "i");
    if (titleLine.test(out)) {
      out = out.replace(titleLine, "");
      // The title under it, when it is a short all-capitals line ("LITERATURE REVIEW").
      out = out.replace(/^([A-Z][A-Z ,&'’-]{2,80})\n+/, "");
    }
  }
  return out.trim();
}

const headingPattern = (n: string) => new RegExp(`(^|\\n)\\s*(?:\\[H[23]\\]\\s*)?\\**\\s*${escapeRegExp(n)}\\.?\\s+\\S`);

/** Planned section headings that do not start a line in the part's text (with or without their [H2]/[H3] marker). */
export function missingHeadings(text: string, sectionNumbers: string[]): string[] {
  return sectionNumbers.filter((n) => !headingPattern(n).test(text));
}

/**
 * Why a reply is not the part it was asked for, or null when it is: it must
 * contain the part's first planned heading and at least a quarter of its word
 * target. A short note, a question or a plan fails here and is retried; it is
 * never stored as chapter text.
 */
export function nonAnswerReason(text: string, expect: { firstHeading: string; targetWords: number }): string | null {
  const words = countWords(text);
  const minimum = Math.max(50, Math.round(expect.targetWords * 0.25));
  if (words < minimum) return `the reply has ${words} words, fewer than the ${minimum} expected at least`;
  if (!headingPattern(expect.firstHeading).test(text)) return `the reply does not contain the heading ${expect.firstHeading}`;
  return null;
}

/** Parts are joined with one blank line; this is the join, so splitParts can undo it. */
export const PART_SEPARATOR = "\n\n";

export function joinParts(texts: string[]): string {
  return texts.join(PART_SEPARATOR);
}

/**
 * Recovers each written part from partialOutput using the lengths recorded
 * in the plan, so every part can be sent as its own block (the cache
 * breakpoint sits on the last). Returns null when the lengths do not add up
 * (the caller then sends the text as one block: a cache miss, nothing worse).
 */
export function splitParts(partialOutput: string, lengths: number[]): string[] | null {
  const expected = lengths.reduce((n, l) => n + l, 0) + PART_SEPARATOR.length * Math.max(0, lengths.length - 1);
  if (expected !== partialOutput.length) return null;
  const out: string[] = [];
  let at = 0;
  for (let i = 0; i < lengths.length; i++) {
    out.push(partialOutput.slice(at, at + lengths[i]));
    at += lengths[i] + (i < lengths.length - 1 ? PART_SEPARATOR.length : 0);
  }
  return out;
}

// ─── Progress ───────────────────────────────────────────────────────────────

export type GenerationStatusName = "PENDING" | "OUTLINING" | "WRITING" | "COMPLETED" | "FAILED";

/**
 * 0 before the first step, 2 while planning, 5 once planned, then up to 95
 * with the words written against the plan's target (the part being streamed
 * counts), 100 when complete. Never goes backwards: a retried part does not
 * lower it.
 */
export function computeProgress(p: { status: GenerationStatusName; previous: number; targetWords?: number; wordsWritten?: number }): number {
  let value: number;
  switch (p.status) {
    case "PENDING":
      value = 0;
      break;
    case "OUTLINING":
      value = 2;
      break;
    case "WRITING": {
      const target = p.targetWords && p.targetWords > 0 ? p.targetWords : 1;
      value = Math.min(95, 5 + Math.floor((90 * Math.min(1, (p.wordsWritten ?? 0) / target))));
      break;
    }
    case "COMPLETED":
      return 100;
    case "FAILED":
      return p.previous;
  }
  return Math.max(p.previous, value);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
