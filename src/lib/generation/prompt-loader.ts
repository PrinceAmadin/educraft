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
 * Every report has five chapters at most, in every department (founder, 26 Sept 2026): the
 * prompt files' six-chapter structures (Law doctrinal, some Humanities) are overridden by a
 * note, and a Law report's conclusion instructions (written for "Chapter Six") are read as
 * Chapter Five.
 *
 * Project facts the prompt files never carry in some chapters (the title in Chapters 2 and 3,
 * "Chapter N of 5", the chapter plan, the supervisor's TOC outside Chapter 1) and generated
 * inputs (earlier chapters, uploaded data) are added by the Phase D2 generation call, which
 * wraps this prompt.
 *
 * Deployment: prompts/ must reach the serverless function. The route that calls this
 * (Phase D4) must list prompts/** in next.config's experimental.outputFileTracingIncludes.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import type { Project, Reference } from "@prisma/client";
import { referenceListEntries } from "@/lib/research-references-doc";
import { formatWorkerData, type WorkerData } from "./dynamic-data-form";
import {
  MODE_NAMES,
  matchDepartment,
  resolveSection,
  type DepartmentEntry,
  type ResearchModeNumber,
  type SectionKey,
} from "./department-map";
import { STYLE_LABEL, citationPlacementFor, type CitationPlacement, type ReferencingStyleKey } from "./referencing";

export type { CitationPlacement, ReferencingStyleKey } from "./referencing";

const PROMPTS_ROOT = path.join(process.cwd(), "prompts");

/** Five chapters at most, in every department. */
export type ChapterNumber = 1 | 2 | 3 | 4 | 5;
type FileChapter = ChapterNumber;

export type PromptReference = Pick<Reference, "title" | "proposedTitle" | "authors" | "year" | "journal" | "doi" | "abstract">;
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
  thematicTitles?: { chapter3?: string | null; chapter4?: string | null };
  /** Values taken from generated chapters: undefined = not extracted yet (throws where needed),
   *  an empty list = the chapter genuinely has none. */
  fromEarlierChapters?: { objectives?: string[]; researchQuestions?: string[]; hypotheses?: string[] };
  /** Reference rows with status KEPT on the project's finished research job. */
  references: PromptReference[];
  /** Per-project override of the department's non-human-samples flag, and what the samples are (A2). */
  samples?: { nonHuman?: boolean | null; description?: string | null };
  /**
   * D3b: the cases (Law) or archival sources (History) the COO approved on the mode card, each
   * with the point it supports, and the points left without one. Absent for every other
   * department, where the list-only rule applies as before.
   */
  primarySources?: PromptPrimarySources;
  /**
   * D3c: what EduCraft's worker sent at the pipeline pauses before this chapter (the request, the
   * answers, text read from Word/Excel/CSV files, and the PDFs and images attached to the call).
   */
  workerData?: WorkerData[];
  /**
   * D5: Mode 5 only, Chapters 4 and 5: the dataset fetched from the World Bank and the CBN for
   * Chapter 3's model, with the descriptive statistics and correlations computed from it.
   */
  secondaryData?: PromptSecondaryData;
}

export interface PromptSecondaryData {
  period: { start: number; end: number };
  /** The model equation and estimation technique as Chapter 3 states them. */
  equation: string;
  technique: string;
  /** "27 Sept 2026" */
  fetchedOn: string;
  /** One line per column: what it is, its unit, its source. */
  notes: string[];
  csv: string;
  /** The EViews-layout descriptive statistics and the Pearson correlation matrix, as text tables. */
  statsTable: string;
  correlationTable: string;
  /** Variables or years the dataset lacks, each with its reason. */
  missing: string[];
}

export interface PromptPrimarySource {
  /** The point (legal proposition or historical question) the source supports. */
  point: string;
  title: string;
  court?: string | null;
  decidedOn?: string | null;
  citation?: string | null;
  suitNumber?: string | null;
  holder?: string | null;
  reference?: string | null;
  recordType?: string | null;
}

export interface PromptPrimarySources {
  kind: "case" | "archive";
  items: PromptPrimarySource[];
  unsupportedPoints: string[];
}

export interface AssembledChapterPrompt {
  text: string;
  /** Rough size (characters ÷ 4) for logging before the Claude call; the API reports the real count. */
  approxTokens: number;
  department: string;
  section: SectionKey;
  template: "A" | "B";
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
  /** Q3 — a kept reference with no abstract is listed, never dropped. */
  abstractUnavailable: "abstract unavailable",

  // Loader wording, for the founder to review.
  nonHumanDefault: "non-human (for example chemical, material, plant, animal or microbial)",
  combinedResultsCh4:
    "Results and Discussion: in this department Chapter Four presents the results AND discusses them in the same chapter (chapter title: RESULTS AND DISCUSSION). Interpret each result against the literature straight after presenting it, citing only the verified references. This replaces the results-only rule in the department section and the mode instructions, and the Chapter 4 cardinal rules PRESENT FIRST, DISCUSS LATER and NO NEW LITERATURE.",
  combinedResultsCh5:
    "Results and Discussion were combined in Chapter Four for this department. Chapter Five is the Summary, Conclusion and Recommendations (chapter title: SUMMARY, CONCLUSION AND RECOMMENDATIONS). This replaces every discussion section in the department section (5.2 Discussion of Findings) and in the mode instructions (5.1 Discussion of Results and 5.2 Mechanism / Explanation): do not write a separate discussion of findings.",
  /** A Chapter Five with no discussion in it is a summary chapter: the range the other standard summary chapters use. */
  conclusionChapterPages: "8–14 pages",
  /** Non-doctrinal Law (founder, 26 Sept): the discussion is in Chapter Four only. */
  lawNonDoctrinalCh4:
    "In this report the Discussion of Findings is written in this Chapter Four, together with the results (4.5 Discussion of Findings in the Law section). This replaces the Chapter 4 cardinal rules PRESENT FIRST, DISCUSS LATER and NO NEW LITERATURE: interpret each finding against the literature and the legal framework here.",
  lawNonDoctrinalCh5:
    "In this report the Discussion of Findings was written in Chapter Four. This Chapter Five is the conclusion only (summary of findings, conclusion, recommendations, limitations and suggestions for further research): do not write a discussion of findings here. This replaces the Discussion requirements in the department section and the mode instructions.",
  /** Added wherever the loaded text mentions a sixth chapter (Q1/Q2: five chapters at most, everywhere). */
  fiveChapters:
    "This report has exactly five chapters, and Chapter Five is the last one. Ignore every mention of a sixth chapter or a six-chapter structure in this prompt: any outline of chapters lists five, and anything meant for a sixth chapter belongs in Chapter Five.",
  lawConclusionAsFive:
    "The Law section below was written for the conclusion chapter of a six-chapter report. In this five-chapter report it applies to this Chapter Five: read Chapter Six as Chapter Five and 6.1 to 6.5 as 5.1 to 5.5, and use its numbered structure rather than the unnumbered Template B conclusion above.",
  noImageSearch: "You cannot search for, download or embed images, and must not invent image sources.",
  inTextCitationBlock:
    "This project cites in the text, in the referencing style below, with one References list at the end of the document. Do not produce endnote or footnote blocks.",
  styleInText: (style: string) => `Use ${style} for every in-text citation and every reference entry.`,
  styleNotes: (style: string) =>
    `Cite with superscript note numbers as set out in the CITATION MODE BLOCK, and format every note and every bibliography entry in ${style}.`,
  styleOverridesApa: (style: string) =>
    `Where the referencing rules above give APA 7th Edition formats or treat APA as the default, use ${style} instead. Their rules on real, relevant and correctly used sources still apply.`,
  /** Q6 — no direct quotations anywhere; page pinpoints are left for the worker. */
  noDirectQuotes:
    "Do not quote any source directly anywhere in this chapter; paraphrase and cite instead. Where a citation needs a page number (a pinpoint), write p. [page] and the worker will fill it in.",
  referencesIntro: (count: number, style: string, primary?: "case" | "archive") =>
    `These ${count} works are the only sources you may cite, apart from statutes and the Constitution, which you may cite by name${
      primary ? `, and the ${primary === "case" ? "court decisions in the APPROVED CASES" : "records in the APPROVED ARCHIVAL SOURCES"} list that follows` : ""
    }. EduCraft's research step found and checked them (OpenAlex); they are listed in APA 7th format so you can identify them, each followed by its abstract. Cite them in ${style}. ` +
    `Report a study's methods and findings only as far as its abstract states them; where the abstract is unavailable, cite the work only for what its title states. Never add volume, issue, page or publisher details that are not listed. Do not cite anything that is not on this list.`,
  /** Law and Humanities: court cases and archival sources come only from the list (Q4). */
  primarySourcesRule: (kind: "case" | "archive") =>
    kind === "case"
      ? "Cite a court case only if it is on this list. If a point needs a case and none on the list supports it, write [CASE TO BE SUPPLIED] instead of naming one; never invent a case name or citation."
      : "Cite an archival source (a newspaper report, gazette, official record or manuscript) only if it is on this list. If a point needs one and none on the list supports it, write [ARCHIVE TO BE SUPPLIED] instead of naming one; never invent an archival source.",
  /** D3b: the approved list (Law: cases; History: archival sources), each with the point it supports. */
  approvedCasesIntro: (n: number) =>
    n
      ? `These ${n} court decisions were found for this project and approved by EduCraft; each is listed with the point it supports. Cite a case only from this list, for its point or one it plainly covers, and exactly as listed (the parties, year, court and citation). Never add a citation, report volume, page or holding that is not listed, and say what a case decided only as far as its point states it.`
      : "No court decision was approved for this project.",
  approvedArchivesIntro: (n: number) =>
    n
      ? `These ${n} archival sources were found for this project and approved by EduCraft; each is listed with the question it bears on. Cite one only from this list, for its question, and exactly as listed (title, date, holder and reference). Never add a file number, page or detail that is not listed, and say what a record shows only as far as its listing states it. A thesis is a secondary study: cite it as a thesis, not as a primary record.`
      : "No archival source was approved for this project.",
  unsupportedPoints: (kind: "case" | "archive", points: string[]) =>
    `No ${kind === "case" ? "court decision" : "archival source"} was found for these points. Where the chapter needs one for them, write ${kind === "case" ? "[CASE TO BE SUPPLIED]" : "[ARCHIVE TO BE SUPPLIED]"} instead of naming one: ${points.map((p, i) => `${i + 1}. ${p}`).join("; ")}.`,
  approvedOnlyRule: (kind: "case" | "archive") =>
    kind === "case"
      ? "For any other point that needs a court decision, write [CASE TO BE SUPPLIED]; never invent a case name or citation."
      : "For any other point that needs an archival source, write [ARCHIVE TO BE SUPPLIED]; never invent an archival source.",
  /** D5: the fetched Mode 5 dataset (Chapters 4 and 5). */
  secondaryDataIntro: (start: number, end: number, fetchedOn: string) =>
    `This is the project's dataset: annual data for Nigeria, ${start}–${end}, fetched on ${fetchedOn} from the sources named in the notes, for the model and period Chapter Three specifies. The values are levels, in the units the notes give; any logarithms or differences the model uses are taken during estimation.`,
  secondaryDataModel: (equation: string, technique: string) =>
    `The model (Chapter Three): ${equation || "as specified in Chapter Three"}. Estimation technique: ${technique || "as stated in Chapter Three"}.`,
  secondaryDataComputed:
    "EduCraft computed the descriptive statistics and the correlation matrix below from this dataset. Use them exactly, figure for figure, in the descriptive statistics and correlation tables (Sections 4.1 and 4.2), and interpret them; do not recompute them or round them differently.",
  secondaryDataPlaceholder:
    "The unit root, cointegration, lag selection, estimation (regression), diagnostic, stability and Granger causality results are produced by EduCraft's specialist in EViews or Stata from this dataset, and they are not available yet. Write each of those tables with its full title, rows and columns, and put [DATA NOT PROVIDED — COO TO REVIEW] in every cell that would hold a result. Write the text around each table in general terms, and write [DATA NOT PROVIDED — COO TO REVIEW] in place of any sentence that would state a result. Never invent a statistic, coefficient, p-value or test outcome.",
  secondaryDataChapterFive:
    "Chapter Four's estimation results are not available yet: their tables carry [DATA NOT PROVIDED — COO TO REVIEW]. Do not state any estimated relationship, coefficient, significance level or test outcome; wherever a finding, conclusion or recommendation depends on one, write [DATA NOT PROVIDED — COO TO REVIEW] in its place. What the dataset itself shows (its period, levels and trends, and the descriptive statistics) may be stated.",
  secondaryDataMissing: (lines: string[]) =>
    `These variables or years are not in the dataset. Leave their cells empty in any data table and write [DATA NOT PROVIDED — COO TO REVIEW] where a result needs them. ${lines.join(" ")}`,
  secondaryDataCitation:
    "Name the data source under every table and figure built from this dataset (for example: Source: World Bank, World Development Indicators, 2026; or Source: Central Bank of Nigeria, 2026). These data sources are not works in the reference list.",
} as const;

/** D5: the dataset part of a Mode 5 Chapter 4 or 5 prompt. */
function secondaryDataPart(data: PromptSecondaryData, chapter: ChapterNumber): string[] {
  const clean = (s: string) => neutralize(s.trim());
  return [
    LOADER_TEXT.secondaryDataIntro(data.period.start, data.period.end, clean(data.fetchedOn)),
    LOADER_TEXT.secondaryDataModel(clean(data.equation), clean(data.technique)),
    `Notes on the data:\n${data.notes.map(clean).join("\n")}`,
    `The dataset (CSV):\n${clean(data.csv)}`,
    LOADER_TEXT.secondaryDataComputed,
    `Descriptive statistics:\n${clean(data.statsTable)}`,
    `Correlation matrix (Pearson):\n${clean(data.correlationTable)}`,
    chapter === 4 ? LOADER_TEXT.secondaryDataPlaceholder : LOADER_TEXT.secondaryDataChapterFive,
    ...(data.missing.length ? [LOADER_TEXT.secondaryDataMissing(data.missing.map(clean))] : []),
    LOADER_TEXT.secondaryDataCitation,
  ];
}

/** One line of the approved list. */
export function formatPrimarySource(kind: "case" | "archive", s: PromptPrimarySource): string {
  const clean = (v: string | null | undefined) => (v?.trim() ? neutralize(v.replace(/\s+/g, " ").trim()) : null);
  if (kind === "case") {
    const year = /\b(1[89]\d\d|20\d\d)\b/.exec(s.decidedOn ?? "")?.[1] ?? null;
    const citation = clean(s.citation);
    const suit = clean(s.suitNumber);
    const parts = [`${clean(s.title)}${year ? ` (${year})` : ""}`, citation, clean(s.court), suit && !citation?.includes(suit) ? `suit no. ${suit}` : null].filter(Boolean);
    return `${parts.join(", ")}. Supports: ${clean(s.point)}`;
  }
  const kindLabel = s.recordType === "Thesis" ? "thesis" : "primary record";
  const parts = [clean(s.title), clean(s.decidedOn), clean(s.holder), clean(s.reference)].filter(Boolean);
  return `${parts.join(", ")} (${kindLabel}). Bears on: ${clean(s.point)}`;
}

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

/**
 * D3c: the data a chapter file's own "DATA INPUT CHECKLIST" asks for in one mode (Chapter 4 by
 * default), so the data request at a pause asks for exactly what that chapter checks before writing.
 */
export async function dataInputChecklist(mode: ResearchModeNumber, chapter: ChapterNumber = 4): Promise<string[]> {
  const lib = await loadPromptLibrary();
  const file = lib.chapters.get(chapter);
  if (!file) return [];
  const out: string[] = [];
  for (const g of file.headerExtras) {
    if (!g.byMode || !g.paragraphs.some((p) => /DATA INPUT CHECKLIST/i.test(p))) continue;
    for (const p of g.byMode.get(mode)?.slice(1) ?? []) {
      const line = p.replace(/^[\s\u2610\u25a1\u25a2*-]+/, "").trim();
      if (line) out.push(line);
    }
  }
  return out;
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

type BlockRef = { file: FileChapter; tag: string; part?: "LAW_CONCLUSION" };

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
function planBlocks(chapter: ChapterNumber, template: "A" | "B", section: SectionKey): BlockRef[] {
  if (template === "A") {
    const file = chapter;
    const plan: BlockRef[] = [{ file, tag: section }];
    // Non-doctrinal Law: its Chapter 4 refers to BUSINESS (results and discussion combined). Its Chapter 5
    // would load MEDICAL_SCIENCE for a second discussion; the founder put the discussion in Chapter 4 only,
    // so Chapter 5 is the conclusion alone (see the notes).
    if (section === "LAW_NON_DOCTRINAL" && chapter === 4) plan.push({ file, tag: "BUSINESS" });
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
      // Five chapters at most: Chapter 5 is always the conclusion. Law takes the conclusion part of its
      // Chapter 5 section (written as "Chapter Six"); the part for a third argument chapter is not used.
      return [
        { file: 5, tag: "TEMPLATE_B_CONCLUSION" },
        law ? { file: 5, tag: "LAW_DOCTRINAL", part: "LAW_CONCLUSION" } : { file: 5, tag: "HUMANITIES" },
      ];
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
    if (ref.part === "LAW_CONCLUSION") {
      // Chapter 5's Law section covers a third argument ("Chapter Five") and the conclusion ("Chapter Six").
      // In a five-chapter report only the conclusion part is used, read as Chapter Five.
      const six = paragraphs.findIndex((p) => /^Chapter Six\b/.test(p.trim()));
      if (six === -1) throw new PromptAssemblyError(`${file.fileName}: the Law section has no "Chapter Six" conclusion part.`);
      paragraphs = trimBlank(paragraphs.slice(six));
      label += " (conclusion part, read as Chapter Five)";
      lead = LOADER_TEXT.lawConclusionAsFive;
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

/** Where citations go: the rule is citationPlacementFor in referencing.ts (B3 and the NALT rule are documented there). */
function resolveCitationPlacement(style: ReferencingStyleKey, template: "A" | "B", section: SectionKey, override?: CitationPlacement | null): CitationPlacement {
  const result = citationPlacementFor(style, template, section, override);
  if ("refused" in result) throw new PromptAssemblyError(result.refused);
  return result.placement;
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

/** An abstract on one line; a runaway one (a mis-parsed full text) is cut at 4,000 characters. */
function abstractText(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  return s.length > 4000 ? `${s.slice(0, 4000).replace(/\s+\S*$/, "")} …` : s;
}

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
/** "SIX-CHAPTER RULE", "6-chapter structure", "Chapter count: SIX", "Chapter Six", "Ch.6", "Law: 6 chapters", "FIVE or SIX". */
const SIX_CHAPTERS = /\b(six|6)[- ]chapter|\bchapter (six|6)\b|\bch\.\s?6\b|\b6 chapters\b|chapter count:\s*(five or )?six/i;

function render(title: string, paragraphs: string[]): string {
  return `═══ ${title} ═══\n\n${paragraphs.join("\n\n")}`;
}

export async function loadChapterPrompt(input: ChapterPromptInput): Promise<AssembledChapterPrompt> {
  const chapter = input.chapter;
  // The types stop bad values at compile time; a JSON body from the COO card is checked here too.
  if (![1, 2, 3, 4, 5].includes(chapter)) throw new PromptAssemblyError(`Chapter ${String(chapter)} does not exist; reports have five chapters at most.`);
  if (![1, 2, 3, 4, 5].includes(input.mode)) throw new PromptAssemblyError(`Mode ${String(input.mode)} does not exist; research modes run from 1 to 5.`);
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

  // B5: a thematic report is blocked until both thematic titles are on the card, whichever chapter is asked for.
  if (template === "B") {
    const titles = input.thematicTitles ?? {};
    const missing = [!titles.chapter3?.trim() && "Chapter 3", !titles.chapter4?.trim() && "Chapter 4"].filter(Boolean);
    if (missing.length) throw new PromptAssemblyError(`Enter the thematic chapter titles on the COO card first (missing: ${missing.join(", ")}).`);
  }

  const fileChapter: FileChapter = chapter;
  const file = lib.chapters.get(fileChapter)!;
  const style = styleLabel(input.project.referencingStyle, input.project.customStyleText);
  const placement = resolveCitationPlacement(input.project.referencingStyle, template, section, input.citationPlacement);
  const { blocks: deptBlocks, fallbackNotes } = resolveBlocks(lib, planBlocks(chapter, template, section));
  const combinedResults = Boolean(entry.pureScience) && section === "MEDICAL_SCIENCE" && input.mode === 4;
  const parts: { title: string; text: string }[] = [];
  const used: string[] = [];

  // 1. Mode instructions: the chapter's all-modes rules, then its block for the approved mode.
  //    A thematic Chapter 4 skips the Chapter 4 cardinal rules (founder-confirmed): they govern data chapters
  //    (results per objective, tables first), while its thematic block makes a "Table 4.1" a hard reject.
  const modeTitle = `MODE INSTRUCTIONS — CHAPTER ${chapter}, MODE ${input.mode} (${MODE_NAMES[input.mode].toUpperCase()})`;
  const allModes = chapter === 4 && template === "B" ? [] : file.allModesRules.flat();
  const extras = file.headerExtras.flatMap((g) => {
    if (!g.byMode) return [g.paragraphs.join("\n\n")];
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

  // 2. Shared section of this chapter's file.
  used.push(`ch${fileChapter}:SHARED`);
  parts.push({ title: "SHARED INSTRUCTIONS", text: render("SHARED INSTRUCTIONS", ["[SHARED: ALL DEPARTMENTS]", ...file.blocks.get("SHARED: ALL DEPARTMENTS")!, "[END SHARED: ALL DEPARTMENTS]"]) });

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
  if (section === "LAW_NON_DOCTRINAL" && chapter === 4) notes.push(LOADER_TEXT.lawNonDoctrinalCh4);
  if (section === "LAW_NON_DOCTRINAL" && chapter === 5) notes.push(LOADER_TEXT.lawNonDoctrinalCh5);
  // Q1/Q2: five chapters at most. Wherever the loaded text plans a sixth chapter, the note overrides it.
  if (parts.some((p) => SIX_CHAPTERS.test(p.text))) notes.push(LOADER_TEXT.fiveChapters);
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
  parts.push({
    title: "REFERENCING STYLE FOR THIS PROJECT",
    text: render("REFERENCING STYLE FOR THIS PROJECT", [...styleStatement(input.project.referencingStyle, style, placement, ch1), LOADER_TEXT.noDirectQuotes]),
  });

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
  // Q3: every kept reference with its OpenAlex abstract, or "abstract unavailable" (never dropped).
  const entries = referenceListEntries(input.references).map(
    ({ text: line, ref }) => `${neutralize(line)}\nAbstract: ${ref.abstract?.trim() ? neutralize(abstractText(ref.abstract)) : LOADER_TEXT.abstractUnavailable}`,
  );
  // Q4: cases and archival sources come only from the list; a point with none gets the last-resort placeholder.
  // D3b: Law and the History department carry the list the COO approved, after the references.
  const lawSection = section === "LAW_DOCTRINAL" || section === "LAW_NON_DOCTRINAL";
  const approved = input.primarySources ?? null;
  if (approved?.kind === "case" && !lawSection) throw new PromptAssemblyError("Approved cases were given for a project that is not in a Law section.");
  if (approved?.kind === "archive" && entry.name !== "History") throw new PromptAssemblyError("Approved archival sources were given for a project outside the History department.");
  const primarySources = approved ? [] : lawSection ? [LOADER_TEXT.primarySourcesRule("case")] : section === "HUMANITIES" ? [LOADER_TEXT.primarySourcesRule("archive")] : [];
  used.push(`research:${entries.length} verified references with abstracts`);
  parts.push({ title: "VERIFIED REFERENCES", text: render("VERIFIED REFERENCES", [LOADER_TEXT.referencesIntro(entries.length, style, approved?.kind), ...primarySources, entries.join("\n\n")]) });
  if (approved) {
    const title = approved.kind === "case" ? "APPROVED CASES" : "APPROVED ARCHIVAL SOURCES";
    const intro = approved.kind === "case" ? LOADER_TEXT.approvedCasesIntro(approved.items.length) : LOADER_TEXT.approvedArchivesIntro(approved.items.length);
    const lines = approved.items.map((s, i) => `${i + 1}. ${formatPrimarySource(approved.kind, s)}`);
    const unsupported = approved.unsupportedPoints.map((p) => neutralize(p.replace(/\s+/g, " ").trim())).filter(Boolean);
    parts.push({
      title,
      text: render(title, [
        intro,
        ...(lines.length ? [lines.join("\n")] : []),
        ...(unsupported.length ? [LOADER_TEXT.unsupportedPoints(approved.kind, unsupported)] : []),
        LOADER_TEXT.approvedOnlyRule(approved.kind),
      ]),
    });
    used.push(`d3b:${approved.items.length} approved ${approved.kind === "case" ? "cases" : "archival sources"}, ${unsupported.length} points without one`);
  }

  // D3c: the worker's data from the pauses before this chapter (the files themselves ride with the call).
  if (input.workerData?.length) {
    const title = "THE PROJECT'S DATA";
    parts.push({ title, text: render(title, [neutralize(formatWorkerData(input.workerData))]) });
    used.push(`d3c:data from ${input.workerData.length} pause${input.workerData.length === 1 ? "" : "s"}`);
  }

  // D5: the fetched dataset, Mode 5 Chapters 4 and 5 only.
  if (input.secondaryData) {
    if (input.mode !== 5 || (chapter !== 4 && chapter !== 5)) {
      throw new PromptAssemblyError("Secondary data goes into Chapters 4 and 5 of Mode 5 projects only.");
    }
    const title = "THE PROJECT'S SECONDARY DATA";
    parts.push({ title, text: render(title, secondaryDataPart(input.secondaryData, chapter)) });
    used.push(`d5:dataset ${input.secondaryData.period.start}-${input.secondaryData.period.end}`);
  }

  // Strip pointers to the image rules: they send the model to a file it cannot see
  // ("chapter_2_literature_review.docx") and to the search/download/embed process.
  // Chapter 3's [FIG] tag carried a search query; it now carries the placeholder.
  let text = parts
    .map((p) => p.text.split("\n\n").filter((para) => !IMAGE_POINTER.test(para) || p.title === "IMAGE RULES").join("\n\n"))
    .join("\n\n\n")
    .replace(/\[FIG\] search_query \|/g, "[FIG] [FIGURE PLACEHOLDER: description of figure needed] |");

  // 8. Placeholders. Every {TOKEN} in the assembled instructions must have a value, or nothing is sent.
  const conclusionOnlyFive = combinedResults || section === "LAW_NON_DOCTRINAL";
  const values = placeholderValues(input, { departmentName: neutralize(match.displayName), template, style, placement, deptBlocks, conclusionOnlyFive });
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
    style: string;
    placement: CitationPlacement;
    deptBlocks: ResolvedBlock[];
    /** Chapter Five carries no discussion (pure sciences with combined results; non-doctrinal Law). */
    conclusionOnlyFive: boolean;
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
    CHAPTER_COUNT: () => "5", // five chapters at most, in every department
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
      if (ctx.conclusionOnlyFive && input.chapter === 5) return LOADER_TEXT.conclusionChapterPages;
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
