/**
 * Phase D10: fills the three "Claude-written" placeholders D7 leaves in the
 * assembled report (Acknowledgement, Abstract, List of Abbreviations).
 *
 * Runs by itself before the quality gate scores a full report (D7b, from
 * quality-gate.ts), so the gate checks the pages and the copy sent to QA carries
 * them. On the Report tab the founder or the COO reads them, corrects them by
 * hand (kept by every later automatic run) or writes them again:
 *   GET | POST | PATCH /api/admin/projects/[id]/generation/preliminary-pages
 *
 * Two Claude calls:
 *   A. record_preliminary_sections → { acknowledgement, abstract }.
 *      Retried once if the abstract falls outside 240–320 words. If still
 *      out on the retry, the closest attempt is stored, needsReview flips to
 *      true (shown on the Report tab's Preliminary pages card), and delivery is NOT
 *      blocked.
 *   B. expand_abbreviations → [{ token, expansion|null }, …].
 *      The scanner walks the five chapters for capitalised tokens (2–10
 *      letters), excludes Roman numerals and a small academic set, counts
 *      occurrences and keeps the top 40. Tokens the model cannot expand
 *      confidently return null; the row keeps only the confident ones,
 *      sorted A–Z.
 *
 * Cost: ~₦34 in the good path, ~₦56 with one abstract retry, capped by two
 * calls per run. Never spawns more.
 */

import crypto from "crypto";
import { callClaudeForJson, AnthropicError } from "@/lib/anthropic";
import { db } from "@/lib/db";
import { countWords } from "@/lib/generation/chapter-plan";
import { loadPreliminaryPagesPrompts, PreliminaryPagesPromptError, type PromptValues } from "@/lib/generation/preliminary-pages-loader";
import { parseChapter } from "@/lib/assembly/parse-chapter";
import { writtenBlanks } from "@/lib/assembly/text-rules";
import { ABSTRACT_MAX_WORDS, ABSTRACT_MIN_WORDS, ABSTRACT_TARGET_HI, ABSTRACT_TARGET_LO } from "@/lib/generation/preliminary-pages-rules";
import { isChapterBasedOrder, prelimIntakeGaps } from "@/lib/assembly/assemble";
import { expectedChapters } from "@/lib/deliverables";

const TAG = "[preliminary-pages]";
const SUBSYSTEM = "preliminary_pages";

export { ABSTRACT_MAX_WORDS, ABSTRACT_MIN_WORDS, ABSTRACT_TARGET_HI, ABSTRACT_TARGET_LO };
export const MAX_ABBREVIATIONS = 40;
export const ABBREVIATION_MIN_LEN = 2;
export const ABBREVIATION_MAX_LEN = 10;

/**
 * Roman numerals through ten (plus L, C, D, M for headers). Excluding these
 * keeps a chapter-list like "II. Background" or "Section IV" from becoming a
 * bogus abbreviation entry.
 */
const ROMAN_NUMERALS = new Set(["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "L", "C", "D", "M"]);

/**
 * Fixed academic tokens that turn up in almost every project (referencing styles,
 * common headings) and don't belong in the report's Abbreviations page.
 */
const FIXED_ACADEMIC = new Set(["APA", "MLA", "IEEE", "NALT", "NMCN", "CH", "PDF", "URL", "HTML"]);

/** EduCraft's own roles and terms: never offered for a client's List of Abbreviations (founder, D11). */
export const INTERNAL_TERMS = new Set(["COO", "CFO", "CEO", "MD", "QA", "HQ"]);

/**
 * D10 result. The chapter texts and the founder's prompt already exist; this
 * shape just carries what the service returned in-memory (the caller decides
 * whether to persist).
 */
export interface PreliminaryPagesResult {
  acknowledgement: string;
  abstract: string;
  abstractWordCount: number;
  abstractRetries: number;
  abbreviations: { token: string; expansion: string }[];
  needsReview: boolean;
  promptHash: string;
}

/** One row per token, sorted A–Z, with the model's expansion. Only confident entries are kept. */
export interface Abbreviation {
  token: string;
  expansion: string;
}

/** All the context D10 needs from a project to run the agent. Kept small on purpose. */
export interface PreliminaryPagesContext {
  projectDbId: string;
  values: PromptValues;
  /** Chapter texts (only completed chapters). Used for the scanner and to derive extracted_* values. */
  chapters: { number: number; text: string }[];
}

// ── Initialism scanner ──────────────────────────────────────────

/**
 * Finds every capitalised token 2–10 letters long in the given text. Roman
 * numerals and the fixed academic set are excluded. Punctuation adjacent to
 * the token is trimmed. Case matters: only ALL-CAPS matches (with optional
 * hyphens and digits inside, e.g. "COVID-19", "SPSS-25").
 */
export function scanForInitialisms(text: string): string[] {
  const found: string[] = [];
  const re = /\b([A-Z][A-Z0-9-]{1,9})\b/g;
  for (const m of text.matchAll(re)) {
    const token = m[1].replace(/^[-0-9]+|[-0-9]+$/g, "").trim();
    if (!token) continue;
    if (token.length < ABBREVIATION_MIN_LEN || token.length > ABBREVIATION_MAX_LEN) continue;
    if (ROMAN_NUMERALS.has(token)) continue;
    if (FIXED_ACADEMIC.has(token)) continue;
    if (INTERNAL_TERMS.has(token)) continue;
    if (!/[A-Z]/.test(token)) continue; // pure numbers can't be initialisms
    found.push(token);
  }
  return found;
}

/**
 * A chapter's text as it reads outside its headings: the paragraphs, lists,
 * tables, captions and notes the assembly sets as body text, with the chapter
 * title and every Heading 1–3 left out (an all-caps word only there is a
 * heading word, not an abbreviation), and with square-bracketed markup removed
 * ([EQ], note markers, [DATA NOT PROVIDED — COO TO REVIEW] and the like).
 */
export function chapterBodyText(text: string, chapter: number): string {
  const parts: string[] = [];
  for (const b of parseChapter(text, chapter).blocks) {
    if (b.kind === "paragraph") parts.push(b.text);
    else if (b.kind === "list") parts.push(...b.items.map((i) => i.text));
    else if (b.kind === "table") parts.push(b.caption ?? "", ...b.header, ...b.rows.flat(), b.source ?? "");
    else if (b.kind === "figure") parts.push(b.caption ?? "", b.source ?? "");
    else if (b.kind === "endnotes") parts.push(...b.lines);
  }
  return parts.join("\n").replace(/\[[^\]\n]*\]/g, " ");
}

/**
 * Scans every chapter's body text, counts occurrences of each token across the
 * whole report, and returns the MAX_ABBREVIATIONS most-frequent (sorted by
 * frequency descending; ties broken alphabetically).
 */
export function topInitialisms(chapters: { number: number; text: string }[]): { token: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of chapters) for (const token of scanForInitialisms(chapterBodyText(c.text, c.number))) counts.set(token, (counts.get(token) ?? 0) + 1);
  return [...counts.entries()]
    .map(([token, count]) => ({ token, count }))
    .sort((a, b) => b.count - a.count || a.token.localeCompare(b.token))
    .slice(0, MAX_ABBREVIATIONS);
}

// ── Extractors from finished chapter texts ─────────────────────

/** Returns the first N words of a plain text, trimmed. */
function firstWords(text: string, n: number): string {
  const words = text.replace(/\[H[123]\]/g, " ").replace(/\s+/g, " ").trim().split(" ");
  return words.slice(0, n).join(" ");
}

/**
 * Very small heuristics: pull the "aim" from Chapter 1's introduction, the
 * three-line objectives from any "Objectives" section, one paragraph after
 * "Methodology" from Chapter 3, the AGENT REPORT (if D2 saved one) or the
 * first result paragraphs from Chapter 4, and the conclusion from Chapter 5.
 *
 * Good enough for the abstract: the model reads the same text as fallback.
 */
export function extractChapterInputs(chapters: { number: number; text: string }[]): {
  aim: string;
  objectives: string;
  method: string;
  findings: string;
  conclusion: string;
} {
  const byNumber = new Map(chapters.map((c) => [c.number, c.text]));

  const aimBlock = byNumber.get(1) ?? "";
  const aim = firstWords(aimBlock.split(/\[H2\][^\n]*Aim/i)[1] ?? aimBlock, 100);

  const objectivesSource = (byNumber.get(1) ?? "").split(/\[H[23]\][^\n]*Objectives?/i)[1] ?? "";
  const objectivesLines = objectivesSource
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^(\d+\.|\(?[ivx]+\)?\.?|[-*])\s+/i.test(l))
    .slice(0, 5);
  const objectives = objectivesLines.join("\n") || firstWords(objectivesSource, 120);

  const chapter3 = byNumber.get(3) ?? "";
  const methodBlock =
    chapter3.split(/\[H2\][^\n]*(?:Methodology|Method|Data Collection|Research Design)/i)[1] ?? chapter3;
  const method = firstWords(methodBlock, 120);

  const chapter4 = byNumber.get(4) ?? "";
  const agentReportBlock = chapter4.split(/\[AGENT REPORT\]/i)[1];
  const findingsBlock = agentReportBlock ?? chapter4.split(/\[H2\][^\n]*(?:Findings|Results|Discussion)/i)[1] ?? chapter4;
  const findings = firstWords(findingsBlock, 200);

  const chapter5 = byNumber.get(5) ?? "";
  const conclusionBlock = chapter5.split(/\[H2\][^\n]*(?:Conclusion|Summary)/i)[1] ?? chapter5;
  const conclusion = firstWords(conclusionBlock, 150);

  return { aim, objectives, method, findings, conclusion };
}

// ── Call A: Acknowledgement + Abstract ─────────────────────────

const PRELIMINARY_TOOL_NAME = "record_preliminary_sections";

const PRELIMINARY_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    acknowledgement: { type: "string", description: "The full Acknowledgement page body, 150–250 words." },
    abstract: { type: "string", description: "The full Abstract body, aiming for 260–290 words, hard limits 240–320." },
  },
  required: ["acknowledgement", "abstract"],
};

interface PreliminarySectionsPayload {
  acknowledgement: string;
  abstract: string;
}

async function callAckAndAbstract(
  system: string,
  user: string,
  projectDbId: string,
  step: string,
): Promise<PreliminarySectionsPayload> {
  return callClaudeForJson<PreliminarySectionsPayload>({
    system,
    user,
    toolName: PRELIMINARY_TOOL_NAME,
    toolDescription: "Record the Acknowledgement page and the Abstract page for one final-year project.",
    inputSchema: PRELIMINARY_TOOL_SCHEMA,
    maxTokens: 2000,
    cacheSystem: false,
    usage: { subsystem: SUBSYSTEM, step, projectId: projectDbId },
  });
}

// ── Call B: Abbreviations expansion ────────────────────────────

const EXPAND_TOOL_NAME = "expand_abbreviations";

const EXPAND_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          token: { type: "string", description: "Exactly the token given in the input list." },
          expansion: {
            type: ["string", "null"],
            description: "The full expansion, e.g. 'Statistical Package for the Social Sciences'. Use null when unsure.",
          },
        },
        required: ["token", "expansion"],
      },
    },
  },
  required: ["entries"],
};

interface ExpandPayload {
  entries: { token: string; expansion: string | null }[];
}

async function callExpandAbbreviations(
  system: string,
  user: string,
  projectDbId: string,
): Promise<{ token: string; expansion: string }[]> {
  const result = await callClaudeForJson<ExpandPayload>({
    system,
    user,
    toolName: EXPAND_TOOL_NAME,
    toolDescription: "Expand each abbreviation, or return null when the meaning is not clear from the context.",
    inputSchema: EXPAND_TOOL_SCHEMA,
    maxTokens: 1500,
    cacheSystem: false,
    usage: { subsystem: SUBSYSTEM, step: "abbreviations", projectId: projectDbId },
  });
  const list = Array.isArray(result?.entries) ? result.entries : [];
  const seen = new Set<string>();
  const out: { token: string; expansion: string }[] = [];
  for (const entry of list) {
    if (!entry?.token || typeof entry.token !== "string") continue;
    if (typeof entry.expansion !== "string") continue;
    const token = entry.token.trim();
    const expansion = entry.expansion.trim();
    if (!token || !expansion || seen.has(token)) continue;
    seen.add(token);
    out.push({ token, expansion });
  }
  out.sort((a, b) => a.token.localeCompare(b.token));
  return out;
}

// ── The service entry point ─────────────────────────────────────

/** Loads a project's context from the database. Returns null when the project has no completed chapters yet. */
export async function readContext(projectDbId: string): Promise<PreliminaryPagesContext | null> {
  const project = await db.project.findUnique({
    where: { id: projectDbId },
    select: {
      id: true,
      projectId: true,
      projectTitle: true,
      matricNumber: true,
      supervisorName: true,
      hodName: true,
      dedicationDetails: true,
      acknowledgmentDetails: true,
      client: {
        select: {
          fullName: true,
          faculty: true,
          department: true,
          university: { select: { name: true } },
        },
      },
      researchMode: { select: { modeNumber: true } },
      generationCheckpoints: {
        where: { status: "COMPLETED" },
        select: { chapterNumber: true, fullOutput: true },
        orderBy: { chapterNumber: "asc" },
      },
    },
  });
  if (!project) return null;
  const chapters = project.generationCheckpoints
    .map((c) => ({ number: c.chapterNumber, text: c.fullOutput ?? "" }))
    .filter((c) => c.text);
  if (chapters.length === 0) return null;
  const extracted = extractChapterInputs(chapters);
  const parentReference = readParentReference(project.dedicationDetails) ?? "family and friends";
  const acknowledgmentNote = readAcknowledgmentNote(project.acknowledgmentDetails) ?? "";
  const supervisor = project.supervisorName?.trim() || "";
  const hod = project.hodName?.trim() || "";
  const now = new Date();
  const values: PromptValues = {
    project_id: project.projectId,
    student_full_name: project.client?.fullName ?? "[STUDENT_NAME]",
    matric_number: project.matricNumber ?? "[MATRIC_NUMBER]",
    department: project.client?.department ?? "[DEPARTMENT]",
    faculty: project.client?.faculty ?? "[FACULTY]",
    university: project.client?.university?.name ?? "[UNIVERSITY]",
    project_title: project.projectTitle ?? "[PROJECT_TITLE]",
    supervisor_name: stripTitle(supervisor) || "[SUPERVISOR_NAME]",
    supervisor_title: extractTitle(supervisor) ?? "Dr.",
    hod_name: stripTitle(hod) || "[HOD_NAME]",
    hod_title: extractTitle(hod) ?? "Dr.",
    parent_reference: parentReference,
    degree_programme: "Bachelor of Science",
    submission_year: String(now.getFullYear()),
    submission_month: monthName(now.getMonth() + 1),
    research_mode: `Mode ${project.researchMode?.modeNumber ?? 1}`,
    dedication_note: "",
    acknowledgment_note: acknowledgmentNote,
    extracted_aim: extracted.aim,
    extracted_objectives: extracted.objectives,
    extracted_findings: extracted.findings,
    extracted_method: extracted.method,
    extracted_conclusion: extracted.conclusion,
  };
  return { projectDbId: project.id, values, chapters };
}

/** Reads acknowledgment names from Project.acknowledgmentDetails, when present. */
function readAcknowledgmentNote(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const raw = rec.note ?? rec.names ?? rec.text ?? null;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/** Reads the parent reference from Project.dedicationDetails JSON, when present. */
function readParentReference(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const raw = rec.parentReference ?? rec.parent_reference ?? rec.dedication ?? rec.note ?? rec.text ?? null;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/** "Dr. Jane Adeyemi" → "Dr.", "Engr. Musa Ibrahim" → "Engr.", or null. */
function extractTitle(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const m = /^(Dr|Prof|Engr|Mrs|Mr|Ms|Rev)\.?\s+/i.exec(fullName.trim());
  return m ? `${m[1]}.` : null;
}

/** "Dr. Jane Adeyemi" → "Jane Adeyemi". */
function stripTitle(fullName: string): string {
  return fullName.replace(/^(Dr|Prof|Engr|Mrs|Mr|Ms|Rev)\.?\s+/i, "").trim();
}

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
function monthName(index: number): string {
  const i = Math.max(1, Math.min(12, index));
  return MONTHS[i - 1] ?? "OCTOBER";
}

/** Hashes the input the model saw, so a repeat run with unchanged input skips the Claude calls. */
export function promptHashFor(values: PromptValues, tokens: string[]): string {
  const material = JSON.stringify({ ...values, tokens });
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 16);
}

/** Runs the two Claude calls and returns what the model produced. Never writes to the database. */
export async function runPreliminaryPages(context: PreliminaryPagesContext): Promise<PreliminaryPagesResult> {
  const tokens = topInitialisms(context.chapters).map((t) => t.token);
  const promptHash = promptHashFor(context.values, tokens);

  let prompts;
  try {
    prompts = await loadPreliminaryPagesPrompts(context.values);
  } catch (error) {
    if (error instanceof PreliminaryPagesPromptError) throw error;
    throw new PreliminaryPagesPromptError(error instanceof Error ? error.message : String(error));
  }

  // Call A + one retry when the abstract is out of band.
  let first = await callAckAndAbstract(prompts.callASystem, prompts.callAUser, context.projectDbId, "ack_abstract");
  let abstractCount = countWords(first.abstract ?? "");
  let closest = { attempt: first, count: abstractCount };
  let retries = 0;
  if (abstractCount < ABSTRACT_MIN_WORDS || abstractCount > ABSTRACT_MAX_WORDS) {
    retries = 1;
    console.info(`${TAG} ${context.projectDbId}: abstract ${abstractCount} words; retrying inside ${ABSTRACT_TARGET_LO}–${ABSTRACT_TARGET_HI}.`);
    try {
      const second = await callAckAndAbstract(prompts.callASystem, prompts.callARetryUser, context.projectDbId, "ack_abstract_retry");
      const secondCount = countWords(second.abstract ?? "");
      if (distanceFromBand(secondCount) < distanceFromBand(closest.count)) closest = { attempt: second, count: secondCount };
    } catch (error) {
      console.warn(`${TAG} abstract retry threw`, error instanceof Error ? error.message : error);
    }
    first = closest.attempt;
    abstractCount = closest.count;
  }
  const needsReview = abstractCount < ABSTRACT_MIN_WORDS || abstractCount > ABSTRACT_MAX_WORDS;

  // Call B, only when there is something to expand.
  let abbreviations: Abbreviation[] = [];
  if (tokens.length > 0) {
    try {
      abbreviations = await callExpandAbbreviations(prompts.callBSystem, prompts.callBUser(tokens), context.projectDbId);
    } catch (error) {
      console.warn(`${TAG} abbreviations expansion failed; leaving the list empty`, error instanceof Error ? error.message : error);
    }
  }

  return {
    acknowledgement: (first.acknowledgement ?? "").trim(),
    abstract: (first.abstract ?? "").trim(),
    abstractWordCount: abstractCount,
    abstractRetries: retries,
    abbreviations,
    needsReview,
    promptHash,
  };
}

/** Distance from the accepted band; used to pick "closest" between the first and retry. */
function distanceFromBand(count: number): number {
  if (count >= ABSTRACT_MIN_WORDS && count <= ABSTRACT_MAX_WORDS) return 0;
  return count < ABSTRACT_MIN_WORDS ? ABSTRACT_MIN_WORDS - count : count - ABSTRACT_MAX_WORDS;
}

/**
 * The chapters and order details the pages are written from, without the
 * submission date (which moves every month): what "the report changed since
 * these pages were written" means on the Report tab.
 */
export function sourceHashFor(values: PromptValues, tokens: string[]): string {
  const { submission_month: _month, submission_year: _year, ...rest } = values as Record<string, string>;
  return crypto.createHash("sha256").update(JSON.stringify({ ...rest, tokens })).digest("hex").slice(0, 16);
}

/**
 * Whether an automatic run keeps the stored pages instead of calling Claude:
 * they exist and either the input is unchanged or someone edited them by hand.
 * "Write again" (force) always rewrites. Pure.
 */
export function keepStoredPages(existing: { promptHash: string | null; editedByHand: boolean } | null, promptHash: string, force = false): boolean {
  return !force && existing !== null && (existing.editedByHand || existing.promptHash === promptHash);
}

function storedResult(stored: {
  acknowledgement: string;
  abstract: string;
  abstractWordCount: number;
  abstractRetries: number;
  abbreviations: unknown;
  needsReview: boolean;
  promptHash: string | null;
}, fallbackHash: string): PreliminaryPagesResult {
  return {
    acknowledgement: stored.acknowledgement,
    abstract: stored.abstract,
    abstractWordCount: stored.abstractWordCount,
    abstractRetries: stored.abstractRetries,
    abbreviations: Array.isArray(stored.abbreviations) ? (stored.abbreviations as Abbreviation[]) : [],
    needsReview: stored.needsReview,
    promptHash: stored.promptHash ?? fallbackHash,
  };
}

/**
 * The entry point the quality gate calls before it scores a full report (D7b),
 * and the admin route calls for "Write again". Returns the stored row without
 * calling Claude when the input is unchanged (same promptHash) or when the
 * founder or the COO edited the pages by hand; `force` rewrites them either
 * way and clears the hand edit. Never throws: a failure logs and returns null,
 * and the report keeps the D7 placeholders.
 */
export async function runPreliminaryPagesAgent(projectDbId: string, opts: { force?: boolean } = {}): Promise<PreliminaryPagesResult | null> {
  try {
    const context = await readContext(projectDbId);
    if (!context) {
      console.warn(`${TAG} ${projectDbId}: no completed chapters, skipping`);
      return null;
    }
    const tokens = topInitialisms(context.chapters).map((t) => t.token);
    const promptHash = promptHashFor(context.values, tokens);
    const existing = await db.preliminaryPages.findUnique({ where: { projectId: projectDbId } });
    if (existing && keepStoredPages(existing, promptHash, opts.force)) {
      console.info(`${TAG} ${projectDbId}: ${existing.editedByHand ? "edited by hand; keeping it" : `unchanged since last run (hash ${promptHash})`}; skipping`);
      return storedResult(existing, promptHash);
    }

    const result = await runPreliminaryPages(context);
    const written = {
      acknowledgement: result.acknowledgement,
      abstract: result.abstract,
      abstractWordCount: result.abstractWordCount,
      abstractRetries: result.abstractRetries,
      abbreviations: result.abbreviations,
      needsReview: result.needsReview,
      promptHash: result.promptHash,
      sourceHash: sourceHashFor(context.values, tokens),
      editedByHand: false,
      editedAt: null,
      editedById: null,
    };
    await db.preliminaryPages.upsert({
      where: { projectId: projectDbId },
      create: { projectId: projectDbId, ...written },
      update: written,
    });
    console.info(
      `${TAG} ${projectDbId}: stored (abstract ${result.abstractWordCount} words${result.abstractRetries ? `, ${result.abstractRetries} retry` : ""}${result.needsReview ? ", needsReview" : ""}, ${result.abbreviations.length} abbreviations)`,
    );
    return result;
  } catch (error) {
    console.error(`${TAG} ${projectDbId}: run failed`, error instanceof AnthropicError ? error.message : error);
    return null;
  }
}

// ── D7b: the Report tab's card ─────────────────────────────────

export class PreliminaryPagesError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export interface PreliminaryPagesView {
  /** A full report: a chapter-based order has no preliminary pages. */
  applies: boolean;
  /** Every chapter the order needs is written, so the pages can be written. */
  chaptersReady: boolean;
  band: { min: number; max: number };
  pages: {
    acknowledgement: string;
    abstract: string;
    abstractWords: number;
    needsReview: boolean;
    abbreviations: Abbreviation[];
    generatedAt: string;
    updatedAt: string;
    editedByHand: boolean;
    editedAt: string | null;
    editedBy: string | null;
    /** The chapters or the order details changed after the pages were last written by the agent. */
    changedSince: boolean;
  } | null;
  /** Details the order did not supply ("Supervisor's name"), fixed on Edit intake. */
  intakeGaps: string[];
  /** [BRACKETED] blanks left in the acknowledgement or abstract. */
  blanks: string[];
  /** The copy already in QA was built before the pages last changed (ISO time of that copy), else null. */
  qaCopyOlder: string | null;
}

/** Everything the Preliminary pages card shows. Reads only; never calls Claude. */
export async function getPreliminaryPagesView(projectDbId: string): Promise<PreliminaryPagesView> {
  const project = await db.project.findUnique({
    where: { id: projectDbId },
    select: {
      matricNumber: true,
      supervisorName: true,
      hodName: true,
      dedicationType: true,
      dedicationDetails: true,
      additionalData: true,
      chapterCount: true,
      service: { select: { serviceCode: true } },
    },
  });
  if (!project) throw new PreliminaryPagesError("Project not found", 404, "NOT_FOUND");
  const band = { min: ABSTRACT_MIN_WORDS, max: ABSTRACT_MAX_WORDS };
  if (isChapterBasedOrder(project.service.serviceCode, project.additionalData)) {
    return { applies: false, chaptersReady: false, band, pages: null, intakeGaps: [], blanks: [], qaCopyOlder: null };
  }
  const expected = expectedChapters({ serviceCode: project.service.serviceCode, additionalData: project.additionalData, chapterCount: project.chapterCount });
  const dedication = (project.dedicationDetails ?? null) as { type?: string | null; details?: string | null } | null;
  const [done, row, qaCopy] = await Promise.all([
    db.generationCheckpoint.count({ where: { projectId: projectDbId, chapterNumber: { in: expected }, status: "COMPLETED" } }),
    db.preliminaryPages.findUnique({ where: { projectId: projectDbId } }),
    db.deliverableVersion.findFirst({
      where: { submittedByRole: "SYSTEM", deliverable: { projectId: projectDbId, kind: "FINAL" } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  const intakeGaps = prelimIntakeGaps({
    student: { name: "", matric: project.matricNumber },
    supervisor: project.supervisorName,
    hod: project.hodName,
    dedication: { type: project.dedicationType ?? dedication?.type ?? null, details: dedication?.details ?? null },
  });
  let pages: PreliminaryPagesView["pages"] = null;
  if (row) {
    let changedSince = false;
    if (row.sourceHash) {
      const context = await readContext(projectDbId);
      if (context) changedSince = sourceHashFor(context.values, topInitialisms(context.chapters).map((t) => t.token)) !== row.sourceHash;
    }
    const editor = row.editedById
      ? await db.user.findUnique({ where: { id: row.editedById }, select: { displayName: true, email: true, execProfile: { select: { fullName: true } } } })
      : null;
    pages = {
      acknowledgement: row.acknowledgement,
      abstract: row.abstract,
      abstractWords: row.abstractWordCount,
      needsReview: row.needsReview,
      abbreviations: Array.isArray(row.abbreviations) ? (row.abbreviations as unknown as Abbreviation[]) : [],
      generatedAt: row.generatedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      editedByHand: row.editedByHand,
      editedAt: row.editedAt?.toISOString() ?? null,
      editedBy: editor ? (editor.execProfile?.fullName ?? editor.displayName ?? editor.email) : null,
      changedSince,
    };
  }
  return {
    applies: true,
    chaptersReady: expected.length > 0 && done === expected.length,
    band,
    pages,
    intakeGaps,
    blanks: row ? writtenBlanks(row.acknowledgement, row.abstract) : [],
    qaCopyOlder: row && qaCopy && qaCopy.createdAt < row.updatedAt ? qaCopy.createdAt.toISOString() : null,
  };
}

/**
 * Abbreviations as the founder or the COO typed them: trimmed, sorted A–Z, a
 * token listed twice refused. Pure.
 */
export function cleanAbbreviations(rows: { token: string; expansion: string }[]): Abbreviation[] {
  const seen = new Set<string>();
  const out: Abbreviation[] = [];
  for (const r of rows) {
    const token = r.token.trim();
    const expansion = r.expansion.replace(/\s+/g, " ").trim();
    if (seen.has(token.toUpperCase())) throw new PreliminaryPagesError(`${token} is listed twice.`, 400, "DUPLICATE_ABBREVIATION");
    seen.add(token.toUpperCase());
    out.push({ token, expansion });
  }
  return out.sort((a, b) => a.token.localeCompare(b.token));
}

/**
 * Saves the founder's or the COO's corrections. The pages must exist (they are
 * written first) and must not have been rewritten since the card loaded them.
 * A hand edit counts as the review, so the word-count flag is cleared; the
 * quality gate and every later automatic run keep the text until "Write again".
 */
export async function savePreliminaryPagesByHand(
  projectDbId: string,
  actorUserId: string,
  edit: { acknowledgement: string; abstract: string; abbreviations: { token: string; expansion: string }[]; loadedAt: string },
): Promise<PreliminaryPagesView> {
  const abbreviations = cleanAbbreviations(edit.abbreviations);
  const acknowledgement = edit.acknowledgement.replace(/\r\n/g, "\n").trim();
  const abstract = edit.abstract.replace(/\r\n/g, "\n").trim();
  const saved = await db.preliminaryPages.updateMany({
    where: { projectId: projectDbId, updatedAt: new Date(edit.loadedAt) },
    data: {
      acknowledgement,
      abstract,
      abstractWordCount: countWords(abstract),
      abbreviations: abbreviations.map((a) => ({ token: a.token, expansion: a.expansion })),
      needsReview: false,
      editedByHand: true,
      editedAt: new Date(),
      editedById: actorUserId,
    },
  });
  if (saved.count === 0) {
    const exists = await db.preliminaryPages.count({ where: { projectId: projectDbId } });
    throw exists
      ? new PreliminaryPagesError("These pages were rewritten since you opened them. Reload to see the new text, then make your change again.", 409, "CHANGED_SINCE_LOADED")
      : new PreliminaryPagesError("The pages have not been written yet. Write them first, then correct them.", 409, "NOT_WRITTEN");
  }
  console.info(`${TAG} ${projectDbId}: edited by hand (abstract ${countWords(abstract)} words, ${abbreviations.length} abbreviations)`);
  return getPreliminaryPagesView(projectDbId);
}
