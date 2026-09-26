/**
 * Phase D1 — the chapter prompt loader. Reads the prompt library in prompts/ (Word
 * files, read with mammoth, never edited) once per process, then assembles the full
 * instruction prompt for one chapter of one project, in the founder-approved order:
 *
 *   1. MODE INSTRUCTIONS   — this chapter's all-modes rules and its block for the approved mode
 *   2. SHARED              — [SHARED: ALL DEPARTMENTS]
 *   3. DEPARTMENT          — the resolved [DEPARTMENT: X] section(s), then EduCraft's notes
 *   4. TEMPLATE B / CITATION — Template B quality gate (Mode 1) and the citation mode block
 *   5. SHARED RULES        — voice, formatting, anti-AI and reference rules (+ the project's style)
 *   6. IMAGE RULES         — Chapter 2 (Chapters 3 and 4 get the figure placeholder rule only)
 *   7. VERIFIED REFERENCES — the kept references from the project's research job
 *   8. placeholders filled — any {TOKEN} without a value throws before anything reaches Claude
 *
 * In part 3, a Template B block comes before the department section that extends it,
 * because those sections refer to it as "above" (e.g. HUMANITIES in Chapter 3 is written
 * "in addition to TEMPLATE_B_THEMATIC above").
 *
 * Figures: the generator cannot search for, download or embed images. Every instruction
 * to do so is stripped (the image-rules pointers and Template B "Image Intelligence"
 * guidance in Chapter 3, the search_query field of Chapter 3's [FIG] tag, and the search
 * and embedding steps of the Chapter 2 image rules). Figures are placeholders the worker
 * replaces with real images after generation.
 *
 * Project facts the prompt files never carry in some chapters (the title in Chapters 2, 3
 * and 6, "Chapter N of M", the chapter plan, the supervisor's TOC outside Chapter 1) and
 * generated inputs (earlier chapters, uploaded data) are added by the Phase D2 generation
 * call, which wraps this prompt.
 *
 * Deployment: prompts/ must reach the serverless function. The route that calls this
 * (Phase D4) must list prompts/** in next.config's experimental.outputFileTracingIncludes.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import type { Project, Reference, ReferencingStyle } from "@prisma/client";
import { referenceListLines } from "@/lib/research-references-doc";
import {
  MODE_NAMES,
  matchDepartment,
  resolveSection,
  type DepartmentEntry,
  type ResearchModeNumber,
  type SectionKey,
} from "./department-map";

const PROMPTS_ROOT = path.join(process.cwd(), "prompts");

export type ChapterNumber = 1 | 2 | 3 | 4 | 5 | 6;
type FileChapter = 1 | 2 | 3 | 4 | 5;

/** The stored styles plus the ones B2 adds (NALT, NMCN and the two Chicago variants).
 *  Collapse into the Prisma enum once the COO card migration adds them. */
export type ReferencingStyleKey = ReferencingStyle | "NALT" | "NMCN" | "CHICAGO_AUTHOR_DATE" | "CHICAGO_NOTES_BIBLIOGRAPHY";
export type CitationPlacement = "MODE_A" | "MODE_B" | "MODE_C" | "NOT_APPLICABLE";
export type PromptReference = Pick<Reference, "title" | "proposedTitle" | "authors" | "year" | "journal" | "doi">;
/** The intake fields a chapter prompt reads, straight from the Project row. */
export type ProjectPromptFields = Pick<
  Project,
  "projectTitle" | "supervisorName" | "hodName" | "matricNumber" | "projectPartners" | "projectType" | "specialInstructions" | "minimumPages"
>;

export interface ChapterPromptInput {
  chapter: ChapterNumber;
  /** The department the COO confirmed (typed text works too; it is resolved through Table A). */
  department: string;
  /** The COO-approved research mode. */
  mode: ResearchModeNumber;
  /** The COO's section choice on the card; required for departments with no default section. */
  sectionOverride?: SectionKey | null;
  /** Thematic (Mode 1) reports only: 5 by default, 6 when the COO sets it. Law doctrinal is always 6. */
  chapterCount?: 5 | 6 | null;
  project: ProjectPromptFields & {
    /** University.name of the client's university. */
    university: string;
    /** Confirmed on the COO card, pre-filled from the department (B2). */
    referencingStyle: ReferencingStyleKey;
    /** The supervisor's format, when the style is CUSTOM. */
    customStyleText?: string | null;
    supervisorToc?: string | null;
    oralInterviews?: boolean | null;
  };
  /** Standard (Template A) reports only: the COO's override of the placement the rules derive. */
  citationPlacement?: CitationPlacement | null;
  /** Mode 1 chapter titles entered on the COO card (B5). */
  thematicTitles?: { chapter3?: string | null; chapter4?: string | null; chapter5?: string | null };
  /** Values taken from generated chapters: undefined = not extracted yet (throws where needed),
   *  an empty list = the chapter genuinely has none. */
  fromEarlierChapters?: { objectives?: string[]; researchQuestions?: string[]; hypotheses?: string[] };
  /** Reference rows with status KEPT on the project's finished research job. */
  references: PromptReference[];
  /** Per-project override of the department's non-human-samples flag, and what the samples are (A2). */
  samples?: { nonHuman?: boolean | null; description?: string | null };
}

export interface AssembledChapterPrompt {
  text: string;
  /** Rough size (characters ÷ 4) for logging before the Claude call; the API reports the real count. */
  approxTokens: number;
  department: string;
  section: SectionKey;
  template: "A" | "B";
  chapterCount: 5 | 6;
  referencingStyle: string;
  citationPlacement: CitationPlacement;
  /** Everything included, in order, as "chN:WHAT". */
  blocksUsed: string[];
  /** Set when a planned section was missing from a prompt file and the closest one was used instead. */
  fallback: { used: boolean; note: string | null };
  parts: { title: string; chars: number }[];
}

export class PromptAssemblyError extends Error {}

/**
 * Every sentence the loader adds that is not in the prompt files. The first group is the
 * founder's own wording (verbatim); the rest is loader wording for the founder to review.
 */
export const LOADER_TEXT = {
  // Founder-approved, verbatim.
  /** C1 — after the mode instructions of every chapter. */
  modePrecedence:
    "Where these mode instructions and the department section disagree on headings, chapter structure, or section titles, follow the department section. The mode instructions govern data handling and generation sequence only.",
  /** A1 — social sciences on the BUSINESS survey section. */
  socialScience: "This project is from a social science discipline. Adapt any business framing to a policy, social, or institutional context as appropriate.",
  /** A2 — pure and lab sciences in Mode 4 on the MEDICAL_SCIENCE section. */
  nonHumanSamples: (samples: string) =>
    `Note: this project's samples are not human participants. Do not generate respondent demographics, ethics approval for human subjects, or a consent section. The study involves ${samples} samples.`,
  /** C3 — figure placeholders. */
  figurePlaceholder:
    "Where a figure is needed, write a placeholder caption in this exact format: [FIGURE PLACEHOLDER: description of figure needed]. The worker will source and insert the actual image.",
  /** Table B defaults. */
  notProvided: "Not provided",
  noPartners: "None (individual project)",
  noInstructions: "None",
  noToc: "Not provided — use department template",
  noMinimumPages: "No school minimum given — use the department page range",
  inTextPlacement: "Not applicable — in-text citations with a References list",
  chapterFourTitleTemplateA: "Not applicable (Template A)",

  // Loader wording, for the founder to review.
  nonHumanDefault: "non-human (for example chemical, material, plant, animal or microbial)",
  combinedResultsCh4:
    "Results and Discussion: in this department Chapter Four presents the results AND discusses them in the same chapter (chapter title: RESULTS AND DISCUSSION). Interpret each result against the literature straight after presenting it, citing only the verified references. This replaces the results-only rule in the department section and the mode instructions, and the Chapter 4 cardinal rules PRESENT FIRST, DISCUSS LATER and NO NEW LITERATURE.",
  combinedResultsCh5:
    "Results and Discussion were combined in Chapter Four for this department. Chapter Five is the Summary, Conclusion and Recommendations (chapter title: SUMMARY, CONCLUSION AND RECOMMENDATIONS). This replaces every discussion section in the department section (5.2 Discussion of Findings) and in the mode instructions (5.1 Discussion of Results and 5.2 Mechanism / Explanation): do not write a separate discussion of findings.",
  borrowedChapterFour:
    "The next block was written for Chapter Four. Apply its structure rules, hard-reject trigger and quality checks to this Chapter Five, reading Chapter Four as Chapter Five, Chapter Three as Chapter Four and Chapter Five as Chapter Six. Its balance rule does not apply.",
  /** Combined Results and Discussion leaves Chapter Five a summary chapter: the range the other standard summary chapters use. */
  combinedResultsCh5Pages: "8–14 pages",
  sixChapterFive:
    "This report has six chapters, so this Chapter Five is a thematic argument, not the conclusion. Rules in this prompt that treat Chapter Five as the closing, summarising chapter (no new arguments, summary of findings, recommendations) apply to Chapter Six instead.",
  noImageSearch: "You cannot search for, download or embed images, and must not invent image sources.",
  inTextCitationBlock:
    "This project cites in the text, in the referencing style below, with one References list at the end of the document. Do not produce endnote or footnote blocks.",
  styleInText: (style: string) => `Use ${style} for every in-text citation and every reference entry.`,
  styleNotes: (style: string) =>
    `Cite with superscript note numbers as set out in the CITATION MODE BLOCK, and format every note and every bibliography entry in ${style}.`,
  styleOverridesApa: (style: string) =>
    `Where the referencing rules above give APA 7th Edition formats or treat APA as the default, use ${style} instead. Their rules on real, relevant and correctly used sources still apply.`,
  referencesIntro: (count: number, style: string) =>
    `These ${count} works are the only sources you may cite. EduCraft's research step found and checked them (OpenAlex); they are listed in APA 7th format so you can identify them. Cite them in ${style}. Do not cite anything that is not on this list.`,
} as const;

// ─── The library (read once per process) ───────────────────────────────────────────────────

type HeaderExtra = { paragraphs: string[]; byMode: Map<ResearchModeNumber, string[]> | null };

type ChapterFile = {
  chapter: FileChapter;
  fileName: string;
  /** Rule groups above the routing header marked "(ALL MODES)" (Chapter 4 and 5 cardinal rules). */
  allModesRules: string[][];
  routingIntro: string[];
  modeBlocks: Map<ResearchModeNumber, string[]>;
  /** Rule groups after the mode blocks; a group split by "Mode n:" lines keeps only the approved mode's part. */
  headerExtras: HeaderExtra[];
  blocks: Map<string, string[]>; // "SHARED: ALL DEPARTMENTS", "DEPARTMENT: X", "TEMPLATE B — X" → paragraphs
};

type PromptLibrary = {
  chapters: Map<FileChapter, ChapterFile>;
  /** The Chapter 2 image rules with the search/download/embed instructions removed. */
  imageRules: string[];
  sharedRules: { title: string; file: string; text: string }[];
};

const SHARED_RULE_FILES = [
  { title: "EDUCRAFT VOICE RULES", file: "voice_rules.md" },
  { title: "FORMATTING RULES", file: "formatting_rules.md" },
  { title: "ANTI-AI RULES — PHRASES THAT ARE NEVER ACCEPTABLE", file: "anti_ai_rules.md" },
  { title: "REFERENCING RULES", file: "reference_rules.md" },
] as const;

let libraryPromise: Promise<PromptLibrary> | null = null;

/** Reads and parses every prompt file on first use; later (and concurrent) calls share the same parse. */
export function loadPromptLibrary(): Promise<PromptLibrary> {
  if (!libraryPromise) {
    libraryPromise = readLibrary().catch((err) => {
      libraryPromise = null; // a failed read is retried next time instead of being cached
      throw err;
    });
  }
  return libraryPromise;
}

async function readLibrary(): Promise<PromptLibrary> {
  const chapters = new Map<FileChapter, ChapterFile>();
  for (const n of [1, 2, 3, 4, 5] as const) {
    const fileName = await findFile(`chapter-${n}`, /Collective_Prompt.*\.docx$/i);
    chapters.set(n, parseChapterFile(n, fileName, await docxParagraphs(`chapter-${n}`, fileName)));
  }
  const imageFile = await findFile("chapter-2", /Image_Intelligence_Rules.*\.docx$/i);
  const imageRules = curateImageRules(await docxParagraphs("chapter-2", imageFile));
  const sharedRules = await Promise.all(
    SHARED_RULE_FILES.map(async ({ title, file }) => ({
      title,
      file,
      text: (await readFile(path.join(PROMPTS_ROOT, "shared", file), "utf8")).replace(/\r\n/g, "\n").trim(),
    })),
  );
  return { chapters, imageRules, sharedRules };
}

async function findFile(folder: string, pattern: RegExp): Promise<string> {
  const names = (await readdir(path.join(PROMPTS_ROOT, folder))).filter((f) => pattern.test(f) && !f.startsWith("~$"));
  if (names.length !== 1) {
    throw new PromptAssemblyError(`prompts/${folder}: expected one file matching ${pattern}, found ${names.length ? names.join(", ") : "none"}`);
  }
  return names[0];
}

/** mammoth ends every Word paragraph with a blank line, so paragraphs split on "\n\n". */
async function docxParagraphs(folder: string, fileName: string): Promise<string[]> {
  const { value } = await mammoth.extractRawText({ path: path.join(PROMPTS_ROOT, folder, fileName) });
  return value.replace(/\r\n/g, "\n").split("\n\n").map((p) => p.replace(/\s+$/, ""));
}

const ROUTING_HEADING = /^CHAPTER \d+ — MODE-(?:SPECIFIC|BY-MODE)\b/;
const MODE_HEADING = /^MODE ([1-5]) — /;
const RULE_LINE = /^─{10,}/;
const DEPARTMENT_BANNER = /^═+\s*DEPARTMENT-SPECIFIC PROMPTS/;
const OPEN_TAG = /^\[(SHARED: ALL DEPARTMENTS|DEPARTMENT: [A-Z0-9_]+|TEMPLATE B — [^\]]+)\]$/;
const CLOSE_TAG = /^\[END (.+)\]$/;
const CHECKLIST_MODE = /^\s*Mode ([1-5]):\s*$/;

function splitByRules(paragraphs: string[]): string[][] {
  const groups: string[][] = [[]];
  for (const p of paragraphs) {
    if (RULE_LINE.test(p)) groups.push([]);
    else groups[groups.length - 1].push(p);
  }
  return groups.map(trimBlank).filter((g) => g.length > 0);
}

function parseChapterFile(chapter: FileChapter, fileName: string, paragraphs: string[]): ChapterFile {
  const fail = (why: string) => new PromptAssemblyError(`${fileName}: ${why}`);
  const start = paragraphs.findIndex((p) => ROUTING_HEADING.test(p));
  const banner = paragraphs.findIndex((p) => DEPARTMENT_BANNER.test(p));
  if (start === -1 || banner === -1 || banner < start) throw fail("mode routing header or department banner not found");

  // Above the routing header: pipeline tables and the COO card (never sent), and rule groups
  // that apply to every mode, marked "(ALL MODES)" — Chapter 4's no-fabrication rules, Chapter 5's cardinal rules.
  const allModesRules = splitByRules(paragraphs.slice(0, start)).filter((g) => /\(ALL MODES\)/.test(g[0]));

  // The routing header: an optional intro, the five MODE blocks, then groups separated by rule
  // lines that apply to every mode (e.g. Chapter 4's data input checklist).
  const routingIntro: string[] = [];
  const modeBlocks = new Map<ResearchModeNumber, string[]>();
  const after: string[] = [];
  let mode: ResearchModeNumber | null = null;
  let afterModes = false;
  for (const p of paragraphs.slice(start + 1, banner)) {
    const heading = MODE_HEADING.exec(p);
    if (!afterModes && heading) {
      mode = Number(heading[1]) as ResearchModeNumber;
      if (modeBlocks.has(mode)) throw fail(`MODE ${mode} appears twice in the routing header`);
      modeBlocks.set(mode, [p]);
    } else if (afterModes) {
      after.push(p);
    } else if (RULE_LINE.test(p)) {
      if (mode !== null) {
        afterModes = true;
        after.push(p);
      }
    } else if (mode !== null) {
      modeBlocks.get(mode)!.push(p);
    } else {
      routingIntro.push(p);
    }
  }
  for (const m of [1, 2, 3, 4, 5] as const) if (!modeBlocks.has(m)) throw fail(`no MODE ${m} block in the routing header`);
  const headerExtras = splitByRules(after).map(splitChecklistByMode);

  // Tagged blocks. Text outside a tag (preambles, version notes, trailers) is never loaded.
  const blocks = new Map<string, string[]>();
  let open: string | null = null;
  let body: string[] = [];
  for (const p of paragraphs.slice(banner)) {
    const opening = OPEN_TAG.exec(p.trim());
    const closing = CLOSE_TAG.exec(p.trim());
    if (opening) {
      if (open) throw fail(`[${opening[1]}] opens before [${open}] is closed`);
      open = opening[1];
      body = [];
    } else if (closing) {
      if (closing[1] !== open) throw fail(`[END ${closing[1]}] does not close [${open ?? "nothing"}]`);
      if (blocks.has(open)) throw fail(`[${open}] appears twice`);
      blocks.set(open, trimBlank(body));
      open = null;
    } else if (open) {
      body.push(p);
    }
  }
  if (open) throw fail(`[${open}] is never closed`);
  if (!blocks.has("SHARED: ALL DEPARTMENTS")) throw fail("no [SHARED: ALL DEPARTMENTS] block");
  return { chapter, fileName, allModesRules, routingIntro: trimBlank(routingIntro), modeBlocks, headerExtras, blocks };
}

function splitChecklistByMode(group: string[]): HeaderExtra {
  const first = group.findIndex((p) => CHECKLIST_MODE.test(p));
  if (first === -1) return { paragraphs: group, byMode: null };
  const byMode = new Map<ResearchModeNumber, string[]>();
  let current: ResearchModeNumber | null = null;
  for (const p of group.slice(first)) {
    const m = CHECKLIST_MODE.exec(p);
    if (m) {
      current = Number(m[1]) as ResearchModeNumber;
      byMode.set(current, [p]);
    } else if (current) byMode.get(current)!.push(p);
  }
  return { paragraphs: group.slice(0, first), byMode };
}

function trimBlank(ps: string[]): string[] {
  let a = 0;
  let b = ps.length;
  while (a < b && !ps[a].trim()) a++;
  while (b > a && !ps[b - 1].trim()) b--;
  return ps.slice(a, b);
}

const IMAGE_ACTION = /\b(search\w*|download\w*|embed\w*|placeholder\w*)\b/i;

/**
 * The image rules are written for an agent that searches for, downloads and embeds images,
 * and they forbid placeholders. The generator can do none of that, so only the judgement
 * about WHEN a figure helps and WHERE it goes is kept (sections 1, 3 and 4, up to the
 * embedding example). The search process (2), the List of Figures (5, the assembler's job)
 * and the embedded-image checks (6) are dropped. In what is kept, a clause or bracket that
 * mentions searching, downloading, embedding or placeholders is cut, and a line that is
 * nothing but such an instruction is dropped.
 */
function curateImageRules(paragraphs: string[]): string[] {
  const open = paragraphs.findIndex((p) => p.trim() === "[SHARED — IMAGE INTELLIGENCE RULES]");
  const close = paragraphs.findIndex((p) => p.trim() === "[END SHARED — IMAGE INTELLIGENCE RULES]");
  if (open === -1 || close < open) throw new PromptAssemblyError("Image Intelligence Rules: tagged block not found");
  const KEEP_SECTIONS = new Set([1, 3, 4]);
  const out: string[] = [];
  let section = 0; // text before the first numbered heading is the block's title
  let stopped = false;
  for (const raw of paragraphs.slice(open + 1, close)) {
    const heading = /^(\d+)\. [A-Z]/.exec(raw);
    if (heading) {
      section = Number(heading[1]);
      stopped = false;
    }
    if (section !== 0 && !KEEP_SECTIONS.has(section)) continue;
    if (/^Example structure:/i.test(raw)) stopped = true;
    if (stopped) continue;
    let p = raw.replace(/→\s*search for:/gi, "→ a suitable figure would be:").replace(/\s*\([^)]*\b(search|download|embed)\w*[^)]*\)/gi, "");
    if (IMAGE_ACTION.test(p)) {
      // "If yes — the agent determines what image would be most useful, searches for it, …" keeps its first clause.
      const cut = p.slice(0, p.search(IMAGE_ACTION)).replace(/[,;:\s]+$/, "");
      if (cut.length < 30) continue;
      p = `${cut}.`;
    }
    out.push(p);
  }
  return trimBlank(out);
}

// ─── Section planning ──────────────────────────────────────────────────────────────────────

type BlockRef = { file: FileChapter; tag: string; part?: "LAW_CHAPTER_FIVE" | "AS_CHAPTER_FIVE" };

const dept = (tag: string) => `DEPARTMENT: ${tag}`;

/** When a planned section is missing from a prompt file, the closest available one is used. */
const CLOSEST: Record<string, string[]> = {
  LAW_DOCTRINAL: ["LAW_DOCTRINAL_CH3", "HUMANITIES"],
  LAW_DOCTRINAL_CH3: ["LAW_DOCTRINAL", "HUMANITIES"],
  LAW_NON_DOCTRINAL: ["BUSINESS"],
  HUMANITIES: ["TEMPLATE_B_THEMATIC"],
  NURSING: ["MEDICAL_SCIENCE"],
  MEDICAL_SCIENCE: ["NURSING", "AGRICULTURE"],
  AGRICULTURE: ["MEDICAL_SCIENCE"],
  COMPUTER_SCIENCE: ["ENGINEERING"],
  ENGINEERING: ["COMPUTER_SCIENCE"],
  ECONOMICS: ["BUSINESS"],
  EDUCATION: ["BUSINESS"],
  BUSINESS: ["EDUCATION"],
};

/**
 * The [DEPARTMENT: X] blocks one chapter loads, in order. Template A: the one resolved
 * section, plus the section it defers to. Template B (Mode 1): the approved thematic chain.
 */
function planBlocks(chapter: ChapterNumber, template: "A" | "B", section: SectionKey, chapterCount: 5 | 6): BlockRef[] {
  if (template === "A") {
    if (chapter === 6) throw new PromptAssemblyError("Standard (Template A) reports have five chapters; there is no Chapter 6 to generate.");
    const file = chapter;
    const plan: BlockRef[] = [{ file, tag: section }];
    // Non-doctrinal Law defers to other sections for these two chapters ("Refer to [DEPARTMENT: …]").
    if (section === "LAW_NON_DOCTRINAL" && chapter === 4) plan.push({ file, tag: "BUSINESS" });
    if (section === "LAW_NON_DOCTRINAL" && chapter === 5) plan.push({ file, tag: "MEDICAL_SCIENCE" });
    return plan;
  }

  if (section !== "LAW_DOCTRINAL" && section !== "HUMANITIES") {
    throw new PromptAssemblyError(`Mode 1 (thematic) uses the HUMANITIES or LAW_DOCTRINAL section, not ${section}.`);
  }
  const law = section === "LAW_DOCTRINAL";
  switch (chapter) {
    case 1:
    case 2:
      // No thematic block exists for Chapters 1 and 2: the department section handles thematic framing (C2).
      return [{ file: chapter, tag: section }];
    case 3:
      return [{ file: 3, tag: "TEMPLATE_B_THEMATIC" }, { file: 3, tag: law ? "LAW_DOCTRINAL_CH3" : "HUMANITIES" }];
    case 4:
      return [{ file: 4, tag: "TEMPLATE_B_THEMATIC_CH4" }, { file: 4, tag: section }];
    case 5:
      if (chapterCount === 5) return [{ file: 5, tag: "TEMPLATE_B_CONCLUSION" }, { file: 5, tag: "HUMANITIES" }];
      // Six chapters: Chapter 5 is the last thematic argument. Its block says "Same structure rules as
      // TEMPLATE_B_THEMATIC_CH4", so that block follows, read as Chapter Five and without its title line
      // (the Chapter 4 title must never reach a Chapter 5 prompt). The Law section's Chapter Six part is cut off.
      return [
        { file: 5, tag: "TEMPLATE_B_THEMATIC_CH5" },
        { file: 4, tag: "TEMPLATE_B_THEMATIC_CH4", part: "AS_CHAPTER_FIVE" },
        ...(law ? [{ file: 5 as const, tag: "LAW_DOCTRINAL", part: "LAW_CHAPTER_FIVE" as const }] : []),
      ];
    case 6:
      if (chapterCount !== 6) throw new PromptAssemblyError("This thematic report has five chapters; there is no Chapter 6 to generate.");
      // Decision 7d: Chapter 6 comes from the TEMPLATE_B_CONCLUSION section of the Chapter 5 file only.
      return [{ file: 5, tag: "TEMPLATE_B_CONCLUSION" }];
  }
}

type ResolvedBlock = { ref: BlockRef; label: string; paragraphs: string[]; lead?: string };

function resolveBlocks(lib: PromptLibrary, plan: BlockRef[]): { blocks: ResolvedBlock[]; fallbackNotes: string[] } {
  const fallbackNotes: string[] = [];
  const blocks = plan.map((ref) => {
    const file = lib.chapters.get(ref.file)!;
    let tag = ref.tag;
    if (!file.blocks.has(dept(tag))) {
      const closest = (CLOSEST[tag] ?? []).find((t) => file.blocks.has(dept(t)));
      if (!closest) throw new PromptAssemblyError(`${file.fileName} has no [DEPARTMENT: ${tag}] section and no close substitute.`);
      const note = `${file.fileName} has no [DEPARTMENT: ${tag}] section; used [DEPARTMENT: ${closest}] instead.`;
      console.warn(`[prompt-loader] fallback: ${note}`);
      fallbackNotes.push(note);
      tag = closest;
    }
    let paragraphs = file.blocks.get(dept(tag))!;
    let label = `ch${ref.file}:${tag}`;
    let lead: string | undefined;
    if (ref.part === "AS_CHAPTER_FIVE") {
      paragraphs = paragraphs.filter((p) => !p.includes("{CHAPTER_FOUR_TITLE}"));
      label += " (read as Chapter Five)";
      lead = LOADER_TEXT.borrowedChapterFour;
    }
    if (ref.part === "LAW_CHAPTER_FIVE") {
      // Chapter 5's Law section covers Chapter Five and Chapter Six; a Chapter 5 run loads only the first part.
      const six = paragraphs.findIndex((p) => /^Chapter Six\b/.test(p.trim()));
      if (six !== -1) {
        paragraphs = trimBlank(paragraphs.slice(0, six));
        label += " (Chapter Five part)";
      }
    }
    return { ref: { ...ref, tag }, label, paragraphs: stripImageGuidance(paragraphs), lead };
  });
  return { blocks, fallbackNotes };
}

/** Chapter 3's Template B "Image Intelligence" guidance tells the model to find photographs; figures are placeholders only. */
function stripImageGuidance(paragraphs: string[]): string[] {
  const start = paragraphs.findIndex((p) => /^Image Intelligence in Template B\b/.test(p.trim()));
  if (start === -1) return paragraphs;
  const end = paragraphs.findIndex((p, i) => i > start && /^Citation in Template B\b/.test(p.trim()));
  return [...paragraphs.slice(0, start), ...(end === -1 ? paragraphs.slice(start + 1) : paragraphs.slice(end))];
}

// ─── Value rules ───────────────────────────────────────────────────────────────────────────

const STYLE_LABEL: Record<Exclude<ReferencingStyleKey, "CUSTOM" | "CHICAGO">, string> = {
  APA_7TH: "APA 7th Edition",
  APA_6TH: "APA 6th Edition",
  HARVARD: "Harvard",
  IEEE: "IEEE",
  MLA: "MLA 9th Edition",
  CHICAGO_AUTHOR_DATE: "Chicago 17th (Author-Date)",
  CHICAGO_NOTES_BIBLIOGRAPHY: "Chicago 17th (Notes-Bibliography)",
  NALT: "NALT",
  NMCN: "NMCN Style",
};

/** The wording Chapter 1 uses for each style, so comparisons like "= NALT" read correctly. */
function styleLabel(style: ReferencingStyleKey, customText?: string | null): string {
  if (style === "CUSTOM") {
    if (!customText?.trim()) throw new PromptAssemblyError("Referencing style is Custom but the supervisor's format has not been entered.");
    return `Custom: ${neutralize(customText.trim())}`;
  }
  if (style === "CHICAGO") {
    throw new PromptAssemblyError("Referencing style is Chicago without a variant. Confirm Chicago author-date or notes-bibliography on the card.");
  }
  return STYLE_LABEL[style];
}

const PLACEMENT_LABEL: Record<CitationPlacement, string> = {
  MODE_A: "MODE A (chapter endnotes)",
  MODE_B: "MODE B (document endnotes)",
  MODE_C: "MODE C (page footnotes)",
  NOT_APPLICABLE: LOADER_TEXT.inTextPlacement,
};

/**
 * Where citations go. NALT always uses page footnotes (MODE C), and so does doctrinal Law.
 * B3: every other thematic (Template B) report uses MODE B, document endnotes, in every
 * chapter. Chapter 1 would default Humanities to MODE A, but Chapters 3–5 hard-code
 * MODE B, and one mode for the whole report beats following Chapter 1 alone. Thematic
 * placement is fixed; the COO may override it on standard (Template A) reports only.
 * Standard reports cite in the text, except Chicago notes-bibliography, which is a notes style (MODE C).
 */
function resolveCitationPlacement(style: ReferencingStyleKey, template: "A" | "B", section: SectionKey, override?: CitationPlacement | null): CitationPlacement {
  if (style === "NALT") {
    if (override && override !== "MODE_C") throw new PromptAssemblyError("NALT always uses page footnotes (MODE C); it cannot be overridden.");
    return "MODE_C";
  }
  if (template === "B") {
    const fixed = section === "LAW_DOCTRINAL" ? "MODE_C" : "MODE_B";
    if (override && override !== fixed) {
      throw new PromptAssemblyError(`Thematic reports use ${PLACEMENT_LABEL[fixed]} in every chapter; the placement cannot be changed.`);
    }
    return fixed;
  }
  if (style === "CHICAGO_NOTES_BIBLIOGRAPHY" && override === "NOT_APPLICABLE") {
    throw new PromptAssemblyError("Chicago notes-bibliography is a notes style; its citations cannot be switched to in-text.");
  }
  if (override) return override;
  return style === "CHICAGO_NOTES_BIBLIOGRAPHY" ? "MODE_C" : "NOT_APPLICABLE";
}

const PROJECT_TYPE_LABEL: Record<Project["projectType"], string> = {
  THEORETICAL: "Theoretical",
  PRACTICAL: "Practical",
  DESIGN_BASED: "Design-based",
  SURVEY_BASED: "Survey-based",
  NOT_APPLICABLE: "Not specified",
};

const DATA_REQUIREMENTS: Record<ResearchModeNumber, string> = { 1: "None", 2: "Primary", 3: "Primary", 4: "Primary", 5: "Secondary" };

const TOKEN = /\{([A-Z][A-Z0-9_]*)\}/g;

/** Text from the client, the COO or the database never carries a {TOKEN} into the prompt. */
function neutralize(s: string): string {
  return s.replace(TOKEN, "($1)");
}

const orDefault = (v: string | null | undefined, fallback: string) => (v?.trim() ? neutralize(v.trim()) : fallback);

/** The system writes "Chapter-based order: …" into specialInstructions itself; it is not a client instruction. */
function clientInstructions(raw: string | null | undefined): string {
  const text = (raw ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .filter((p) => !/^Chapter-based order:/i.test(p.trim()))
    .join("\n\n")
    .trim();
  return text ? neutralize(text) : LOADER_TEXT.noInstructions;
}

function numbered(items: string[]): string {
  return items.map((s, i) => `${i + 1}. ${neutralize(s.trim())}`).join("; ");
}

/** "Template: A | Page count: 18–28 pages | …" → "18–28 pages". */
function pageRange(paragraphs: string[]): string | null {
  for (const p of paragraphs) {
    const m = /Page count:\s*([^|]+?)\s*(?:\||$)/.exec(p);
    if (m) return m[1].trim();
  }
  return null;
}

/** The standard Chapter 3 title from the section header ("Title: METHODOLOGY (or …)" → "METHODOLOGY"). */
function chapterThreeDefaultTitle(paragraphs: string[]): string | null {
  for (const p of paragraphs.slice(0, 4)) {
    const m = /Title:\s*([A-Z][A-Z ,&'-]*[A-Z])/.exec(p) ?? /Chapter Three is ([A-Z][A-Z ,&'-]*[A-Z])/.exec(p);
    if (m) return m[1].trim();
  }
  return null;
}

// ─── Assembly ──────────────────────────────────────────────────────────────────────────────

const IMAGE_POINTER = /IMAGE INTELLIGENCE RULES/;

function render(title: string, paragraphs: string[]): string {
  return `═══ ${title} ═══\n\n${paragraphs.join("\n\n")}`;
}

export async function loadChapterPrompt(input: ChapterPromptInput): Promise<AssembledChapterPrompt> {
  const chapter = input.chapter;
  if (![1, 2, 3, 4, 5, 6].includes(chapter)) throw new PromptAssemblyError(`Chapter ${String(chapter)} does not exist; chapters run from 1 to 6.`);
  if (![1, 2, 3, 4, 5].includes(input.mode)) throw new PromptAssemblyError(`Mode ${String(input.mode)} does not exist; research modes run from 1 to 5.`);
  // The types stop these at compile time; a JSON body from the COO card is checked here too.
  if (input.chapterCount != null && input.chapterCount !== 5 && input.chapterCount !== 6) {
    throw new PromptAssemblyError(`A report has 5 or 6 chapters, not ${String(input.chapterCount)}.`);
  }
  const knownStyle = ["CUSTOM", "CHICAGO", ...Object.keys(STYLE_LABEL)].includes(input.project.referencingStyle);
  if (!knownStyle) throw new PromptAssemblyError(`Unknown referencing style "${String(input.project.referencingStyle)}".`);
  if (!(input.project.projectType in PROJECT_TYPE_LABEL)) throw new PromptAssemblyError(`Unknown project type "${String(input.project.projectType)}".`);

  const lib = await loadPromptLibrary();
  const match = matchDepartment(input.department);
  if (!match) {
    throw new PromptAssemblyError(`Department "${input.department}" is not in the department table. The COO must record the department on the card.`);
  }
  const entry: DepartmentEntry = match.entry;
  const section = resolveSection(entry, input.mode, input.sectionOverride);
  const template: "A" | "B" = input.mode === 1 ? "B" : "A";
  const chapterCount: 5 | 6 = template === "A" ? 5 : section === "LAW_DOCTRINAL" ? 6 : (input.chapterCount ?? 5);

  // B5: a thematic report is blocked until every thematic title is on the card, whichever chapter is asked for.
  if (template === "B") {
    const titles = input.thematicTitles ?? {};
    const missing = [
      !titles.chapter3?.trim() && "Chapter 3",
      !titles.chapter4?.trim() && "Chapter 4",
      chapterCount === 6 && !titles.chapter5?.trim() && "Chapter 5",
    ].filter(Boolean);
    if (missing.length) throw new PromptAssemblyError(`Enter the thematic chapter titles on the COO card first (missing: ${missing.join(", ")}).`);
  }

  const fileChapter: FileChapter = chapter === 6 ? 5 : chapter;
  const file = lib.chapters.get(fileChapter)!;
  const style = styleLabel(input.project.referencingStyle, input.project.customStyleText);
  const placement = resolveCitationPlacement(input.project.referencingStyle, template, section, input.citationPlacement);
  const { blocks: deptBlocks, fallbackNotes } = resolveBlocks(lib, planBlocks(chapter, template, section, chapterCount));
  const combinedResults = Boolean(entry.pureScience) && section === "MEDICAL_SCIENCE" && input.mode === 4;
  const parts: { title: string; text: string }[] = [];
  const used: string[] = [];

  // 1. Mode instructions: the chapter's all-modes rules, then its block for the approved mode.
  //    Two all-modes groups are moved or left out because they contradict the chapter they would land in:
  //    - a thematic Chapter 4 skips the Chapter 4 cardinal rules, which govern data chapters (results per
  //      objective, tables first) while its thematic block makes a "Table 4.1" a hard reject;
  //    - in a six-chapter thematic report the Chapter 5 file's closing rules (the cardinal rules and the
  //      recommendation standards) go to Chapter 6, the conclusion, not to Chapter 5, the last argument.
  //    No prompt file has a Chapter 6 header, so Chapter 6 carries those closing rules and the C1 sentence.
  const modeTitle = `MODE INSTRUCTIONS — CHAPTER ${chapter}, MODE ${input.mode} (${MODE_NAMES[input.mode].toUpperCase()})`;
  const closingRulesToSix = template === "B" && chapterCount === 6;
  const closingRules = [...file.allModesRules.flat(), ...file.headerExtras.filter((g) => !g.byMode).map((g) => g.paragraphs.join("\n\n"))];
  if (chapter !== 6) {
    const skipAllModes = (chapter === 4 && template === "B") || (chapter === 5 && closingRulesToSix);
    const allModes = skipAllModes ? [] : file.allModesRules.flat();
    const extras = file.headerExtras.flatMap((g) => {
      if (!g.byMode) return chapter === 5 && closingRulesToSix ? [] : [g.paragraphs.join("\n\n")];
      const forMode = g.byMode.get(input.mode);
      return forMode ? [[...g.paragraphs, ...forMode].join("\n\n")] : [];
    });
    if (allModes.length) used.push(`ch${fileChapter}:(ALL MODES) rules`);
    used.push(`ch${fileChapter}:MODE ${input.mode}`);
    if (extras.length) used.push(`ch${fileChapter}:header extras`);
    parts.push({
      title: modeTitle,
      text: render(modeTitle, [...allModes, ...file.routingIntro, ...file.modeBlocks.get(input.mode)!, ...extras, LOADER_TEXT.modePrecedence]),
    });
  } else {
    if (closingRules.length) used.push("ch5:closing rules (ALL MODES)");
    parts.push({ title: modeTitle, text: render(modeTitle, [...closingRules, LOADER_TEXT.modePrecedence]) });
  }

  // 2. Shared section of this chapter's file (Chapter 6 takes its one section only, per decision 7d).
  if (chapter !== 6) {
    used.push(`ch${fileChapter}:SHARED`);
    parts.push({ title: "SHARED INSTRUCTIONS", text: render("SHARED INSTRUCTIONS", ["[SHARED: ALL DEPARTMENTS]", ...file.blocks.get("SHARED: ALL DEPARTMENTS")!, "[END SHARED: ALL DEPARTMENTS]"]) });
  }

  // 3. Department section(s), kept inside their original tags so "see [DEPARTMENT: X] above" still reads.
  used.push(...deptBlocks.map((b) => b.label));
  parts.push({
    title: `DEPARTMENT INSTRUCTIONS — ${section}`,
    text: render(
      `DEPARTMENT INSTRUCTIONS — ${section}`,
      deptBlocks.flatMap((b) => [...(b.lead ? [b.lead] : []), `[DEPARTMENT: ${b.ref.tag}]`, ...b.paragraphs, `[END DEPARTMENT: ${b.ref.tag}]`]),
    ),
  });

  const notes: string[] = [];
  if (entry.socialScience && section === "BUSINESS") notes.push(LOADER_TEXT.socialScience);
  const nonHuman = input.samples?.nonHuman ?? (Boolean(entry.pureScience) && input.mode === 4);
  if (nonHuman && section === "MEDICAL_SCIENCE") notes.push(LOADER_TEXT.nonHumanSamples(orDefault(input.samples?.description, LOADER_TEXT.nonHumanDefault)));
  if (combinedResults && chapter === 4) notes.push(LOADER_TEXT.combinedResultsCh4);
  if (combinedResults && chapter === 5) notes.push(LOADER_TEXT.combinedResultsCh5);
  if (template === "B" && chapterCount === 6 && chapter === 5) notes.push(LOADER_TEXT.sixChapterFive);
  if (notes.length) {
    used.push("loader:notes");
    parts.push({ title: "NOTES FOR THIS PROJECT", text: render("NOTES FOR THIS PROJECT", notes) });
  }

  // 4. Template B quality gate and the citation mode block (both live in the Chapter 1 file).
  const ch1 = lib.chapters.get(1)!;
  if (template === "B") {
    const gate = ch1.blocks.get("TEMPLATE B — QUALITY GATE RULES");
    if (!gate) throw new PromptAssemblyError(`${ch1.fileName}: no [TEMPLATE B — QUALITY GATE RULES] block`);
    used.push("ch1:TEMPLATE B — QUALITY GATE RULES");
    parts.push({ title: "TEMPLATE B QUALITY GATE", text: render("TEMPLATE B QUALITY GATE", gate) });
  }
  if (chapter === 1 || placement !== "NOT_APPLICABLE") {
    used.push(placement === "NOT_APPLICABLE" ? "loader:in-text citation rule" : `ch1:CITATION MODE BLOCKS (${placement})`);
    parts.push({ title: "CITATION MODE BLOCK", text: render("CITATION MODE BLOCK", citationModeBlock(ch1, placement, input.project.referencingStyle)) });
  }

  // 5. The four shared rules files, then the project's style, which overrides reference_rules.md's APA default.
  for (const rule of lib.sharedRules) parts.push({ title: rule.title, text: render(rule.title, [rule.text]) });
  used.push("shared:voice, formatting, anti-AI, reference rules");
  parts.push({ title: "REFERENCING STYLE FOR THIS PROJECT", text: render("REFERENCING STYLE FOR THIS PROJECT", styleStatement(input.project.referencingStyle, style, placement, ch1)) });

  // 6. Image rules: Chapter 2 (C3). Chapters 3 and 4, which ask for diagrams, charts and screenshots, get the placeholder rule.
  if (chapter === 2) {
    used.push("ch2:IMAGE RULES (curated)");
    parts.push({ title: "IMAGE RULES", text: render("IMAGE RULES", [...lib.imageRules, LOADER_TEXT.figurePlaceholder, LOADER_TEXT.noImageSearch]) });
  } else if (chapter === 3 || chapter === 4) {
    used.push("loader:figure placeholder rule");
    parts.push({ title: "FIGURES", text: render("FIGURES", [LOADER_TEXT.figurePlaceholder, LOADER_TEXT.noImageSearch]) });
  }

  // 7. Verified references: the KEPT rows of the project's finished research job.
  if (input.references.length === 0) {
    throw new PromptAssemblyError("No verified references. The project's research must finish before chapters are generated.");
  }
  const refLines = referenceListLines(input.references).map(neutralize);
  used.push(`research:${refLines.length} verified references`);
  parts.push({ title: "VERIFIED REFERENCES", text: render("VERIFIED REFERENCES", [LOADER_TEXT.referencesIntro(refLines.length, style), refLines.join("\n")]) });

  // Strip pointers to the image rules: they send the model to a file it cannot see
  // ("chapter_2_literature_review.docx") and to the search/download/embed process.
  // Chapter 3's [FIG] tag carried a search query; it now carries the placeholder.
  let text = parts
    .map((p) => p.text.split("\n\n").filter((para) => !IMAGE_POINTER.test(para) || p.title === "IMAGE RULES").join("\n\n"))
    .join("\n\n\n")
    .replace(/\[FIG\] search_query \|/g, "[FIG] [FIGURE PLACEHOLDER: description of figure needed] |");

  // 8. Placeholders. Every {TOKEN} in the assembled instructions must have a value, or nothing is sent.
  const values = placeholderValues(input, { departmentName: neutralize(match.displayName), template, chapterCount, style, placement, deptBlocks, combinedResults });
  const missing = new Set<string>();
  text = text.replace(TOKEN, (_m, token: string) => {
    const resolve = values[token];
    if (!resolve) {
      missing.add(`${token} (unknown placeholder)`);
      return `{${token}}`;
    }
    try {
      return resolve();
    } catch (err) {
      missing.add(`${token}: ${(err as Error).message}`);
      return `{${token}}`;
    }
  });
  if (missing.size > 0) {
    throw new PromptAssemblyError(`Chapter ${chapter} prompt has unfilled placeholders — ${[...missing].join("; ")}`);
  }
  const leftover = text.match(TOKEN);
  if (leftover) throw new PromptAssemblyError(`Chapter ${chapter} prompt still contains ${[...new Set(leftover)].join(", ")} after filling.`);
  text = text.replace(/\n{4,}/g, "\n\n\n").trim();

  return {
    text,
    approxTokens: Math.ceil(text.length / 4),
    department: match.displayName,
    section,
    template,
    chapterCount,
    referencingStyle: style,
    citationPlacement: placement,
    blocksUsed: used,
    fallback: { used: fallbackNotes.length > 0, note: fallbackNotes.join(" ") || null },
    parts: parts.map((p) => ({ title: p.title, chars: p.text.length })),
  };
}

/** The Chapter 1 citation block for the placement: MODE A, B or C (plus MLA entry templates), or the in-text rule. */
function citationModeBlock(ch1: ChapterFile, placement: CitationPlacement, style: ReferencingStyleKey): string[] {
  if (placement === "NOT_APPLICABLE") return [LOADER_TEXT.inTextCitationBlock];
  const block = ch1.blocks.get("TEMPLATE B — CITATION MODE BLOCKS");
  if (!block) throw new PromptAssemblyError(`${ch1.fileName}: no [TEMPLATE B — CITATION MODE BLOCKS] block`);
  const sub = new Map<string, string[]>();
  let current: string | null = null;
  for (const p of block) {
    const mode = /^MODE ([ABC]) — /.exec(p);
    if (mode) current = `MODE_${mode[1]}`;
    else if (/^MLA 9th Entry Templates/.test(p)) current = "MLA";
    if (current) sub.set(current, [...(sub.get(current) ?? []), p]);
  }
  const chosen = sub.get(placement);
  if (!chosen) throw new PromptAssemblyError(`${ch1.fileName}: no ${placement.replace("_", " ")} citation block`);
  // MODE B's own block states only the numbering; its entry formats are MODE A's (first appearance, repeat).
  const entryFormats = placement === "MODE_B" ? (sub.get("MODE_A") ?? []).filter((p) => /^Entry format/.test(p)) : [];
  return [...chosen, ...entryFormats, ...(style === "MLA" ? (sub.get("MLA") ?? []) : [])];
}

/** B2: the chosen style, stated explicitly, overriding reference_rules.md's APA default where needed. */
function styleStatement(style: ReferencingStyleKey, label: string, placement: CitationPlacement, ch1: ChapterFile): string[] {
  const out = [placement === "NOT_APPLICABLE" ? LOADER_TEXT.styleInText(label) : LOADER_TEXT.styleNotes(label)];
  if (style === "NALT" || style === "NMCN") {
    // Chapter 1 is the only file that says what these two are; every chapter gets its line.
    const definition = ch1.blocks.get("SHARED: ALL DEPARTMENTS")!.find((p) => p.trim().startsWith(`${label} — `));
    if (definition) out.push(definition.trim());
  }
  if (style !== "APA_7TH" && style !== "NMCN") out.push(LOADER_TEXT.styleOverridesApa(label)); // NMCN follows APA
  return out;
}

function placeholderValues(
  input: ChapterPromptInput,
  ctx: {
    departmentName: string;
    template: "A" | "B";
    chapterCount: 5 | 6;
    style: string;
    placement: CitationPlacement;
    deptBlocks: ResolvedBlock[];
    combinedResults: boolean;
  },
): Record<string, () => string> {
  const p = input.project;
  const earlier = input.fromEarlierChapters ?? {};
  const titles = input.thematicTitles ?? {};
  const required = (v: string | null | undefined, what: string) => {
    if (!v?.trim()) throw new Error(`${what} is required`);
    return neutralize(v.trim());
  };
  const fromChapter = (list: string[] | undefined, what: string, none: string) => {
    if (list === undefined) throw new Error(`${what} have not been extracted from the earlier chapters yet`);
    return list.length ? numbered(list) : none;
  };
  const primary = ctx.deptBlocks[0]?.paragraphs ?? [];
  const headers = ctx.deptBlocks.flatMap((b) => b.paragraphs.slice(0, 4));

  return {
    PROJECT_TITLE: () => required(p.projectTitle, "The project title"),
    DEPARTMENT: () => ctx.departmentName,
    UNIVERSITY: () => required(p.university, "The university"),
    PROJECT_TYPE: () => PROJECT_TYPE_LABEL[p.projectType],
    TEMPLATE: () => ctx.template,
    CHAPTER_COUNT: () => String(ctx.chapterCount),
    DATA_REQUIREMENTS: () => DATA_REQUIREMENTS[input.mode],
    // B1: declared in Chapter 1's variable list but never used in the chapter text — defaults, never a block.
    SUPERVISOR: () => orDefault(p.supervisorName, LOADER_TEXT.notProvided),
    HOD: () => orDefault(p.hodName, LOADER_TEXT.notProvided),
    MATRIC_NUMBER: () => orDefault(p.matricNumber, LOADER_TEXT.notProvided),
    PROJECT_PARTNERS: () => orDefault(p.projectPartners, LOADER_TEXT.noPartners),
    SPECIAL_INSTRUCTIONS: () => clientInstructions(p.specialInstructions),
    SUPERVISOR_TOC: () => orDefault(p.supervisorToc, LOADER_TEXT.noToc),
    ORAL_INTERVIEWS: () => (p.oralInterviews ? "Yes" : "No"),
    REFERENCING_STYLE: () => ctx.style,
    CITATION_PLACEMENT: () => PLACEMENT_LABEL[ctx.placement],
    CITATION_MODE_BLOCK: () => "the CITATION MODE BLOCK in this prompt",
    VERIFIED_REFERENCES: () => "the VERIFIED REFERENCES list at the end of this prompt",
    // B4: Chapter 1 gets the whole-report target; Chapters 4 and 5 get their section's per-chapter range.
    MINIMUM_PAGES: () => {
      if (input.chapter === 1) {
        const total = p.minimumPages?.trim();
        if (!total) return LOADER_TEXT.noMinimumPages;
        return /^\d+$/.test(total) ? `${total} pages` : neutralize(total);
      }
      if (ctx.combinedResults && input.chapter === 5) return LOADER_TEXT.combinedResultsCh5Pages;
      return pageRange(headers) ?? LOADER_TEXT.noMinimumPages;
    },
    OBJECTIVES: () => {
      if (earlier.objectives?.length === 0) throw new Error("Chapter One states no objectives; every report needs them");
      return fromChapter(earlier.objectives, "Chapter One's objectives", "");
    },
    RESEARCH_QUESTIONS: () => fromChapter(earlier.researchQuestions, "Chapter One's research questions", "None"),
    HYPOTHESES: () => fromChapter(earlier.hypotheses, "The hypotheses", "None — no hypotheses stated"),
    CHAPTER_THREE_TITLE: () => {
      if (ctx.template === "B") return neutralize(required(titles.chapter3, "The Chapter 3 title (entered on the COO card)").toUpperCase());
      const title = chapterThreeDefaultTitle(primary);
      if (!title) throw new Error("the department section gives no Chapter 3 title");
      return title;
    },
    CHAPTER_FOUR_TITLE: () =>
      ctx.template === "B"
        ? neutralize(required(titles.chapter4, "The Chapter 4 title (entered on the COO card)").toUpperCase())
        : LOADER_TEXT.chapterFourTitleTemplateA,
    CHAPTER_FIVE_TITLE: () => neutralize(required(titles.chapter5, "The Chapter 5 title (entered on the COO card)").toUpperCase()),
  };
}

// ─── Inspection helpers (tests and the COO card) ───────────────────────────────────────────

/** This chapter's routing block for a mode, as written in the prompt file header. */
export async function getModeInstructions(chapter: FileChapter, mode: ResearchModeNumber): Promise<string> {
  const lib = await loadPromptLibrary();
  return lib.chapters.get(chapter)!.modeBlocks.get(mode)!.join("\n\n");
}

/** The body of one [DEPARTMENT: X] block, or null when the file has no such block. */
export async function extractDepartmentSection(chapter: FileChapter, tag: string): Promise<string | null> {
  const lib = await loadPromptLibrary();
  return lib.chapters.get(chapter)!.blocks.get(dept(tag))?.join("\n\n") ?? null;
}

/** File names and section tags per chapter file, for the checks. */
export async function describePromptLibrary(): Promise<{ chapter: FileChapter; fileName: string; blocks: string[]; allModesRules: number }[]> {
  const lib = await loadPromptLibrary();
  return [...lib.chapters.values()].map((c) => ({ chapter: c.chapter, fileName: c.fileName, blocks: [...c.blocks.keys()], allModesRules: c.allModesRules.length }));
}
