import type { Prisma, ReferenceClassification } from "@prisma/client";
import { db } from "@/lib/db";
import { callClaudeForJson, AnthropicError } from "@/lib/anthropic";
import { resolveOpenAccessPdf } from "@/lib/unpaywall";
import { searchWorks } from "@/lib/openalex";
// Legacy cleanup only — jobs run before Zotero was dropped from the pipeline
// still have a collection and items that "Run research again" should remove.
import { deleteCollection, deleteItems } from "@/lib/zotero";
import crypto from "crypto";
import { putPrivateFile } from "@/lib/files/storage";
import { buildPrivatePath } from "@/lib/files/paths";
import { deleteReferencePdf } from "@/lib/services/research-files";
import { notifyOperations, notifyUsers } from "@/lib/services/notifications";
import { isStaffRole } from "@/lib/roles";
import { ledgerRunFinished } from "@/lib/services/operations/research-ledger";
import { createPendingBrief } from "@/lib/research/source-stage";
import { claimRun, getRerunState, releaseClaim } from "@/lib/services/research-runs";

export class ResearchError extends Error {}

/*
 * OpenAlex-native pipeline:
 *
 *   1. Claude writes academic search queries for the topic; each is run
 *      against OpenAlex. Every hit is a real published work that arrives with
 *      its DOI, authors, year, journal, abstract and citation count — so there
 *      is no separate "verify it exists" step. (Claude-recalled titles were
 *      tried first and only ~4% of them existed.)
 *   2. Each paper is sorted onto a delivery track. Open-access status decides
 *      how it's delivered, never whether it's kept:
 *        Track A — OPEN_ACCESS: a PDF that really serves PDF bytes, found via
 *                  Unpaywall and OpenAlex's own links. Uploaded to Drive.
 *        Track B — PAYWALLED:   no free PDF. Kept as a reference and listed with
 *                  its DOI in the project's "Paywalled References" Google Doc.
 *      PDF links are always probed rather than trusted: OpenAlex reports a
 *      pdf_url for ~88% of papers but only ~18% actually download, and
 *      Unpaywall finds ~57% more than OpenAlex's links alone.
 *   3. Tier 2 relevance classification on both tracks, before any writing.
 *   4. Outputs: PDFs in Drive, the paywalled-references doc, and a .bib export
 *      generated on demand from the stored metadata (see research-bib.ts).
 *
 * No CrossRef and no Zotero — the references live in our own database.
 */

// ── Tuning constants ─────────────────────────────────────────
/**
 * Candidates fetched in the first round. About 45% pass the relevance check, so
 * 150 lands around 65 keepers, comfortably over the target.
 */
const CANDIDATES_PER_ROUND = 150;
const MAX_REPLACEMENT_ROUNDS = 3;
const MIN_REPLACEMENT_CANDIDATES = 20;
/** The minimum: searching continues (replacement rounds) until this many relevant references are kept. */
export const TARGET_REFERENCES = 50;
/** Never keep more than this; extras are trimmed, CORE and most-cited papers first. */
export const MAX_REFERENCES = 70;
/** Below this many relevant references, once the rounds run out, the job goes to an admin instead of passing. */
const MIN_USABLE_REFERENCES = TARGET_REFERENCES;
/** Fewer CORE papers than this passes, but with a warning to the worker and admins. */
const MIN_CORE_REFERENCES = 10;

const INITIAL_QUERY_COUNT = 10; // queries Claude writes up front
const MORE_QUERY_COUNT = 6; // each later top-up of queries
const MAX_TOTAL_QUERIES = 40;
const SEARCH_QUERIES_PER_STEP = 3; // OpenAlex searches per step, run concurrently
const RESULTS_TAKEN_PER_QUERY = 12; // new works kept from one query, most relevant first
const FOUNDATIONAL_PREFIX = "[foundational] ";

const RESOLVE_BATCH = 8; // Unpaywall lookups per step, run concurrently
const CLASSIFY_BATCH = 20; // references per Tier 2 call
const DRIVE_BATCH = 3; // PDF downloads+writes per step, run concurrently

// ── Ownership / lifecycle ────────────────────────────────────

interface ProjectContext {
  id: string;
  projectId: string;
  topic: string;
  department: string;
  universityName: string | null;
}

/** `workerId` null = the founder or the COO, who may act on any project (D9). */
async function loadProjectContext(workerId: string | null, idOrCode: string): Promise<ProjectContext> {
  const project = await db.project.findFirst({
    where: { ...(workerId ? { workerId } : {}), OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: {
      id: true,
      projectId: true,
      projectTitle: true,
      client: { select: { department: true, university: { select: { name: true } } } },
    },
  });
  if (!project) throw new ResearchError(workerId ? "Assignment not found" : "Project not found");
  if (!project.projectTitle) throw new ResearchError("This project needs a title before research can run");

  return {
    id: project.id,
    projectId: project.projectId,
    topic: project.projectTitle,
    department: project.client.department,
    universityName: project.client.university?.name ?? null,
  };
}

/**
 * Starts a project's first research job. If one exists already it's returned
 * as-is (nothing is spent). If none exists but the project has run before —
 * the job was deleted — this counts as a re-run and is rationed like one.
 */
export async function startResearchJob(
  workerId: string,
  idOrCode: string,
  userId: string,
  targetCount = TARGET_REFERENCES
) {
  const project = await loadProjectContext(workerId, idOrCode);

  const existing = await db.researchJob.findUnique({ where: { projectId: project.id } });
  if (existing) return existing;

  const claim = await claimRun(project.id, userId);
  try {
    return await db.researchJob.create({
      data: { projectId: project.id, requestedById: userId, targetCount },
    });
  } catch (error) {
    await releaseClaim(claim);
    throw error;
  }
}

/**
 * Throws the current job away and starts a fresh one. Rationed: the first
 * re-run on a project is free, later ones need an approved request (see
 * research-runs.ts). The allowance is claimed before anything is deleted, so
 * a refused re-run leaves the existing results untouched.
 */
export async function rerunResearchJob(workerId: string, idOrCode: string, userId: string, targetCount = TARGET_REFERENCES) {
  const project = await loadProjectContext(workerId, idOrCode);

  const claim = await claimRun(project.id, userId);
  try {
    await resetResearchJob(workerId, idOrCode);
    return await db.researchJob.create({
      data: { projectId: project.id, requestedById: userId, targetCount },
    });
  } catch (error) {
    await releaseClaim(claim);
    throw error;
  }
}

/**
 * D9: the founder or the COO re-runs a project's research from its Report tab.
 * They are the approvers, so no request is needed; the claim still refuses once
 * a chapter exists, and the run is logged and shown in the research ledger like
 * any other.
 */
export async function rerunResearchAsAdmin(idOrCode: string, userId: string, targetCount = TARGET_REFERENCES) {
  const project = await loadProjectContext(null, idOrCode);

  const claim = await claimRun(project.id, userId, { approver: true });
  try {
    await resetResearchJob(null, project.id);
    return await db.researchJob.create({
      data: { projectId: project.id, requestedById: userId, targetCount },
    });
  } catch (error) {
    await releaseClaim(claim);
    throw error;
  }
}

export async function getResearchJob(workerId: string, idOrCode: string) {
  const project = await db.project.findFirst({
    where: { workerId, OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true },
  });
  if (!project) throw new ResearchError("Assignment not found");

  return db.researchJob.findUnique({
    where: { projectId: project.id },
    include: { references: { orderBy: [{ round: "asc" }, { createdAt: "asc" }] } },
  });
}

/** The job plus where this project stands on re-runs — everything the worker's panel needs. */
export async function getResearchOverview(workerId: string, idOrCode: string) {
  const project = await db.project.findFirst({
    where: { workerId, OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true },
  });
  if (!project) throw new ResearchError("Assignment not found");

  const [job, rerun] = await Promise.all([
    db.researchJob.findUnique({
      where: { projectId: project.id },
      include: { references: { orderBy: [{ round: "asc" }, { createdAt: "asc" }] } },
    }),
    getRerunState(project.id),
  ]);
  return { job, rerun };
}

/**
 * Throws away a project's research job so it can be run again from scratch —
 * e.g. a job produced under the old open-access-only rules. Cleans up the
 * per-reference PDFs (private Blob store, or legacy Drive files) and any
 * Zotero items from older jobs first (best effort: a cleanup failure is logged
 * and never blocks the reset).
 */
export async function resetResearchJob(workerId: string | null, idOrCode: string): Promise<void> {
  const project = await db.project.findFirst({
    where: { ...(workerId ? { workerId } : {}), OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true },
  });
  if (!project) throw new ResearchError(workerId ? "Assignment not found" : "Project not found");

  const job = await db.researchJob.findUnique({
    where: { projectId: project.id },
    include: { references: { select: { zoteroItemKey: true, driveFileId: true, pdfBlobPath: true } } },
  });
  if (!job) return;

  const itemKeys = job.references.map((r) => r.zoteroItemKey).filter((k): k is string => Boolean(k));
  try {
    if (itemKeys.length > 0) await deleteItems(itemKeys);
    if (job.zoteroCollectionKey) await deleteCollection(job.zoteroCollectionKey);
  } catch (error) {
    console.error("[research reset] Zotero cleanup failed", job.id, error);
  }

  await Promise.allSettled(job.references.map((r) => deleteReferencePdf(r)));

  await db.researchJob.delete({ where: { id: job.id } });
}

// ── Claude calls ─────────────────────────────────────────────

function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Reads the project title like a supervisor would: what is the student
 * actually building or investigating; what are its parts; what specific
 * problems does each part have to solve; and what would a naive keyword
 * search wrongly pull in? Runs once per job (persisted on
 * `ResearchJob.projectAnalysis`) and is fed into every query-generation and
 * relevance-classification call, so the whole pipeline judges each paper
 * against the SYSTEM the student is building, not the words in the title.
 */
async function analyseProject(ctx: ProjectContext): Promise<ProjectAnalysis> {
  const system = `You read a student's project title like a supervisor would — not by the keywords in it, but by what the student is actually building or investigating. You are writing a short analysis that will guide every literature search and every relevance check for this project. The analysis has to be specific to THIS system, not generic to the field.

Produce four things:
- goal: one sentence naming what the finished project produces or proves. Do not restate the title.
- components: the specific parts of the system or study the student must build or execute (3–8 words each, 2–5 components). Name the parts of THIS system.
- subproblems: the specific research problems each component has to solve (5–15 words each, 3–6 subproblems). Think of these as the questions a literature review needs to answer for this project.
- offTopicGuards: 2–4 phrases that a naive keyword search would pull in but that would NOT support this project, each with a one-line reason. For example: "BERT for IoT security — shares 'BERT' but applies it to a completely different domain." Include the traps you see in the title itself. If the title contains "similarity detection", say plainly whether that means plagiarism detection or something else, and guard against the wrong reading.

Reason like a supervisor about the whole title, then write the four fields concretely.`;

  const user = [
    `PROJECT TITLE: ${ctx.topic}`,
    `DEPARTMENT: ${ctx.department}`,
    ctx.universityName ? `UNIVERSITY: ${ctx.universityName}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await callClaudeForJson<ProjectAnalysis>({
      system,
      user,
      toolName: "record_project_analysis",
      toolDescription: "Record the goal-first analysis of the project.",
      inputSchema: {
        type: "object",
        properties: {
          goal: { type: "string" },
          components: { type: "array", items: { type: "string" } },
          subproblems: { type: "array", items: { type: "string" } },
          offTopicGuards: { type: "array", items: { type: "string" } },
        },
        required: ["goal", "components", "subproblems", "offTopicGuards"],
      },
      maxTokens: 1024,
      usage: { projectId: ctx.id, subsystem: "research_pipeline", step: "analyse_project" },
    });
    return {
      goal: (result.goal ?? "").trim(),
      components: (result.components ?? []).map((s) => s.trim()).filter(Boolean),
      subproblems: (result.subproblems ?? []).map((s) => s.trim()).filter(Boolean),
      offTopicGuards: (result.offTopicGuards ?? []).map((s) => s.trim()).filter(Boolean),
    };
  } catch (error) {
    if (error instanceof AnthropicError) throw new ResearchError(error.message);
    throw error;
  }
}

/** Renders the stored analysis into the user block sent to Claude. */
function analysisBlock(a: ProjectAnalysis): string {
  const bullets = (items: string[]) => items.map((x) => `- ${x}`).join("\n");
  return [
    "PROJECT ANALYSIS",
    `Goal: ${a.goal}`,
    a.components.length ? `Components (the parts this system must build/execute):\n${bullets(a.components)}` : null,
    a.subproblems.length ? `Subproblems (the specific research problems the literature must speak to):\n${bullets(a.subproblems)}` : null,
    a.offTopicGuards.length ? `Off-topic guards (traps a keyword search pulls in that must NOT count):\n${bullets(a.offTopicGuards)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Claude writes the search queries; OpenAlex does the finding. Queries are
 * targeted at the components and subproblems named in the PROJECT ANALYSIS
 * (goal-first), not at each keyword in the title in isolation. Returns only
 * queries not already used by this job, each prefixed with
 * FOUNDATIONAL_PREFIX when it's meant to surface older landmark papers.
 */
async function generateSearchQueries(ctx: ProjectContext, analysis: ProjectAnalysis, previous: string[], count: number): Promise<string[]> {
  const system = `You write search queries for an academic database (OpenAlex) to find literature for a specific student project — read the PROJECT ANALYSIS below carefully and target its components and subproblems, not the general field. Each query is run as a keyword search over paper titles and abstracts.

Write short queries of 3–7 words, the way a researcher types into Google Scholar — no quotes, no boolean operators, no full sentences.

Every query must target one specific component or subproblem in the analysis. Before you write a query, name in your head which one. Do NOT write queries that only match a shared keyword with the title — the OFF-TOPIC GUARDS in the analysis list the traps to avoid. A query like "similarity detection" is dangerous when the project's subproblem is "semantic similarity of short project titles" and the guards flag plagiarism-detection as a wrong reading; write "short text semantic similarity" or "sentence embedding similarity" instead.

Cover every component and subproblem across the batch. If the project has an application domain, local context (Nigeria, developing economies) or standards, cover those too — but only when the analysis has named them.

Mark a query "foundational" when it should find older, highly-cited landmark papers (seminal models, original frameworks) rather than recent work — about 1 in 5 queries. Never write queries so generic they'd match any paper in the field. Never repeat or trivially reword a query listed as already used.`;

  const user = [
    `PROJECT TITLE: ${ctx.topic}`,
    `DEPARTMENT: ${ctx.department}`,
    ctx.universityName ? `UNIVERSITY: ${ctx.universityName}` : null,
    "",
    analysisBlock(analysis),
    "",
    `Write ${count} search queries.`,
    previous.length ? `\nALREADY USED (write different angles):\n${previous.map((q) => `- ${q}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  let queries: { query: string; foundational?: boolean }[];
  try {
    const result = await callClaudeForJson<{ queries: { query: string; foundational?: boolean }[] }>({
      system,
      user,
      toolName: "write_search_queries",
      toolDescription: "Write academic database search queries for the project topic.",
      inputSchema: {
        type: "object",
        properties: {
          queries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                query: { type: "string" },
                foundational: { type: "boolean" },
              },
              required: ["query"],
            },
          },
        },
        required: ["queries"],
      },
      maxTokens: 1024,
      usage: { projectId: ctx.id, subsystem: "research_pipeline", step: "write_search_queries" },
    });
    queries = result.queries ?? [];
  } catch (error) {
    if (error instanceof AnthropicError) throw new ResearchError(error.message);
    throw error;
  }

  const used = new Set(previous.map((q) => titleKey(q.replace(FOUNDATIONAL_PREFIX, ""))));
  const fresh: string[] = [];
  for (const q of queries) {
    const text = q.query?.trim();
    if (!text) continue;
    const key = titleKey(text);
    if (!key || used.has(key)) continue;
    used.add(key);
    fresh.push(q.foundational ? `${FOUNDATIONAL_PREFIX}${text}` : text);
  }
  return fresh;
}

interface ClassificationResult {
  referenceId: string;
  classification: ReferenceClassification;
  reason?: string;
}

async function classifyBatch(
  ctx: ProjectContext,
  analysis: ProjectAnalysis | null,
  batch: { id: string; title: string | null; year: number | null; abstract: string | null }[]
): Promise<ClassificationResult[]> {
  const system = `You are the Tier 2 relevance gate for an EduCraft student project report, BEFORE any writing begins. Be strict: irrelevant references contaminate the literature review and are the single most common cause of supervisor rejection.

Read the PROJECT ANALYSIS below carefully. It names the goal of THIS project, its components, its subproblems and the off-topic guards. Judge each reference against the analysis, not against the keywords in the title.

For every reference, ask: does this paper address one of the listed components or subproblems, or does it merely share a keyword with the title?

- CORE — directly about the same component or subproblem, using a comparable approach. Would be cited as a base reference by a supervisor.
- CLOSELY_RELATED — clearly supports one of the components or subproblems as background or method foundation.
- TANGENTIAL — shares only a broad field or a keyword with the topic; not about the same problem. A paper that applies a shared method (e.g. BERT) to a completely different problem is TANGENTIAL, not CLOSELY_RELATED, unless the analysis explicitly says the project needs that other application.
- IRRELEVANT — not connected to any component or subproblem, or specifically named by an off-topic guard.

Match each off-topic guard strictly: if a paper matches a guard, it is TANGENTIAL at best and IRRELEVANT if the guard is decisive.

Classify every reference listed, using its exact id.`;

  const user = [
    `PROJECT TITLE: ${ctx.topic}`,
    `DEPARTMENT: ${ctx.department}`,
    "",
    analysis ? analysisBlock(analysis) : "PROJECT ANALYSIS: (not available — judge the topic directly, be strict about keyword collisions)",
    "",
    "REFERENCES TO CLASSIFY:",
    ...batch.map(
      (r) =>
        `[${r.id}] "${r.title}" (${r.year ?? "n.d."}) — ${
          r.abstract ? r.abstract.slice(0, 600) : "No abstract available."
        }`
    ),
  ].join("\n");

  try {
    const result = await callClaudeForJson<{ classifications: ClassificationResult[] }>({
      system,
      user,
      toolName: "classify_references",
      toolDescription: "Classify each reference's relevance to the project topic.",
      inputSchema: {
        type: "object",
        properties: {
          classifications: {
            type: "array",
            items: {
              type: "object",
              properties: {
                referenceId: { type: "string" },
                classification: {
                  type: "string",
                  enum: ["CORE", "CLOSELY_RELATED", "TANGENTIAL", "IRRELEVANT"],
                },
                reason: { type: "string" },
              },
              required: ["referenceId", "classification"],
            },
          },
        },
        required: ["classifications"],
      },
      maxTokens: 4096,
      usage: { projectId: ctx.id, subsystem: "research_pipeline", step: "classify_references" },
    });
    return result.classifications ?? [];
  } catch (error) {
    if (error instanceof AnthropicError) throw new ResearchError(error.message);
    throw error;
  }
}

// ── Helpers ───────────────────────────────────────────────────

async function candidatesFetchedThisRound(jobId: string, round: number): Promise<number> {
  return db.reference.count({ where: { researchJobId: jobId, round } });
}

// ── The state machine ────────────────────────────────────────

export interface AdvanceResult {
  job: Awaited<ReturnType<typeof db.researchJob.findUniqueOrThrow>>;
  done: boolean;
}

/**
 * Advances a research job by exactly one bounded unit of work and returns.
 * Designed to be called repeatedly (by the worker's browser) rather than run
 * to completion in one request — Vercel Hobby's short function timeout has
 * no room for a pipeline that can take minutes end to end.
 */
export async function advanceResearchJob(jobId: string): Promise<AdvanceResult> {
  const job = await db.researchJob.findUnique({ where: { id: jobId } });
  if (!job) throw new ResearchError("Research job not found");
  if (job.status === "PASSED" || job.status === "FAILED_NEEDS_REVIEW") {
    return { job, done: true };
  }

  const project = await db.project.findUnique({
    where: { id: job.projectId },
    select: {
      projectId: true,
      projectTitle: true,
      client: { select: { department: true, university: { select: { name: true } } } },
    },
  });
  if (!project?.projectTitle) throw new ResearchError("Project is missing a title");
  const ctx: ProjectContext = {
    id: job.projectId,
    projectId: project.projectId,
    topic: project.projectTitle,
    department: project.client.department,
    universityName: project.client.university?.name ?? null,
  };

  switch (job.status) {
    case "FINDING_CANDIDATES":
      return advanceFindingCandidates(job, ctx);
    // VERIFYING_DOIS and IMPORTING_ZOTERO are legacy steps; a job left in one
    // of them by an older run just carries on from the PDF-resolving step.
    case "VERIFYING_DOIS":
    case "RESOLVING_PDFS":
    case "IMPORTING_ZOTERO":
      return advanceResolvingAccess(job);
    case "CLASSIFYING":
      return advanceClassifying(job, ctx);
    case "REPLACING":
      // REPLACING is a marker status only — the actual replacement work
      // happens by looping back through FINDING_CANDIDATES.
      return { job: await db.researchJob.update({ where: { id: job.id }, data: { status: "FINDING_CANDIDATES" } }), done: false };
    case "CURATING":
      return advanceCurating(job, ctx);
    case "UPLOADING_DRIVE":
      return advanceUploadingDrive(job, ctx);
    default:
      return { job, done: true };
  }
}

type Job = NonNullable<Awaited<ReturnType<typeof db.researchJob.findUnique>>>;

async function moveTo(job: Job, status: Job["status"]): Promise<AdvanceResult> {
  const next = await db.researchJob.update({ where: { id: job.id }, data: { status } });
  return { job: next, done: false };
}

/**
 * A goal-first read of the project. Written once, at the very top of the
 * research run, and then reused by every downstream Claude call (query
 * generation, Tier 2 relevance). Before this existed, both calls reasoned
 * from the WORDS in the title, so "similarity detection" pulled plagiarism
 * papers and "BERT" pulled IoT-security-BERT papers; grounding every call in
 * one shared understanding of what the student is actually building fixes it.
 */
export interface ProjectAnalysis {
  /** One sentence: what the finished project produces or proves. */
  goal: string;
  /** The specific parts of the system or study the student must build/execute. */
  components: string[];
  /** The specific research problems each component has to solve. */
  subproblems: string[];
  /**
   * Phrases a naive keyword search would pull in that would NOT support the
   * project, each with a one-line reason. Fed straight into the relevance
   * classifier so it flags them as TANGENTIAL / IRRELEVANT.
   */
  offTopicGuards: string[];
}

function readAnalysis(job: Job): ProjectAnalysis | null {
  const raw = job.projectAnalysis;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const a = raw as Record<string, unknown>;
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []);
  const goal = typeof a.goal === "string" ? a.goal.trim() : "";
  if (!goal) return null;
  return {
    goal,
    components: strArr(a.components),
    subproblems: strArr(a.subproblems),
    offTopicGuards: strArr(a.offTopicGuards),
  };
}

async function advanceFindingCandidates(job: Job, ctx: ProjectContext): Promise<AdvanceResult> {
  // Very top of the run: if we have not yet written the goal-first project
  // analysis, do it now and reload the row so downstream calls read it.
  if (readAnalysis(job) === null) {
    const analysis = await analyseProject(ctx);
    job = await db.researchJob.update({
      where: { id: job.id },
      data: { projectAnalysis: analysis as unknown as Prisma.InputJsonValue },
    });
  }
  const fetchedSoFar = await candidatesFetchedThisRound(job.id, job.replacementRound);

  let roundTarget: number;
  if (job.replacementRound > 0) {
    // Replacement round: aim for enough to cover the remaining shortfall,
    // allowing for papers the relevance check will drop.
    const kept = await db.reference.count({ where: { researchJobId: job.id, status: "KEPT" } });
    const shortfall = Math.max(job.targetCount - kept, 0);
    roundTarget =
      shortfall === 0 ? 0 : Math.min(CANDIDATES_PER_ROUND, Math.max(MIN_REPLACEMENT_CANDIDATES, shortfall * 3));
  } else {
    roundTarget = CANDIDATES_PER_ROUND;
  }

  if (fetchedSoFar >= roundTarget || roundTarget === 0) {
    return moveTo(job, "RESOLVING_PDFS");
  }

  // 1. Run the next unrun search queries.
  if (job.searchCursor < job.searchQueries.length) {
    return runSearchQueries(job, roundTarget - fetchedSoFar);
  }

  // 2. Out of queries — have Claude write more (bounded).
  if (!job.queriesExhausted && job.searchQueries.length < MAX_TOTAL_QUERIES) {
    const count = job.searchQueries.length === 0 ? INITIAL_QUERY_COUNT : MORE_QUERY_COUNT;
    // Analysis is written on the first entry to this step and stored on the
    // job, so it's always available by the time we reach query generation.
    // The fallback protects a job upgraded mid-run (readAnalysis returns null
    // only if the stored blob is malformed).
    const analysis = readAnalysis(job) ?? (await analyseProject(ctx));
    const fresh = await generateSearchQueries(ctx, analysis, job.searchQueries, count);
    const next = await db.researchJob.update({
      where: { id: job.id },
      data: fresh.length > 0 ? { searchQueries: { push: fresh } } : { queriesExhausted: true },
    });
    return { job: next, done: false };
  }

  // 3. Nothing left to search with — carry on with what was found.
  return moveTo(job, "RESOLVING_PDFS");
}

/**
 * Runs up to SEARCH_QUERIES_PER_STEP queries against OpenAlex and inserts the
 * new works as candidates. Each already carries its real DOI and full
 * metadata straight from the index.
 */
async function runSearchQueries(job: Job, needed: number): Promise<AdvanceResult> {
  const batch = job.searchQueries.slice(job.searchCursor, job.searchCursor + SEARCH_QUERIES_PER_STEP);
  const results = await Promise.all(
    batch.map((q) =>
      q.startsWith(FOUNDATIONAL_PREFIX)
        ? searchWorks(q.slice(FOUNDATIONAL_PREFIX.length), { foundational: true })
        : searchWorks(q)
    )
  );

  const existing = await db.reference.findMany({
    where: { researchJobId: job.id, doi: { not: null } },
    select: { doi: true },
  });
  const seen = new Set(existing.map((r) => (r.doi as string).toLowerCase()));

  // Round-robin across this step's queries so one broad query can't crowd out the rest.
  const picked: (typeof results)[number] = [];
  const takenPerQuery = batch.map(() => 0);
  for (let rank = 0; picked.length < needed; rank++) {
    let anyLeft = false;
    for (let qi = 0; qi < results.length && picked.length < needed; qi++) {
      const work = results[qi][rank];
      if (!work) continue;
      anyLeft = true;
      if (takenPerQuery[qi] >= RESULTS_TAKEN_PER_QUERY || seen.has(work.doi)) continue;
      seen.add(work.doi);
      takenPerQuery[qi]++;
      picked.push(work);
    }
    if (!anyLeft) break;
  }

  await db.$transaction([
    ...(picked.length > 0
      ? [
          db.reference.createMany({
            data: picked.map((w) => ({
              researchJobId: job.id,
              projectId: job.projectId,
              proposedTitle: w.title,
              proposedYear: w.year,
              doi: w.doi,
              title: w.title,
              authors: w.authors,
              year: w.year,
              journal: w.journal,
              abstract: w.abstract,
              citedByCount: w.citedByCount,
              // A hint only — RESOLVING_PDFS probes it before anything relies on it.
              pdfUrl: w.pdfUrl,
              round: job.replacementRound,
            })),
          }),
        ]
      : []),
    db.researchJob.update({
      where: { id: job.id },
      data: {
        searchCursor: job.searchCursor + batch.length,
        ...(picked.length > 0 ? { triedTitles: { push: picked.map((w) => w.title) } } : {}),
      },
    }),
  ]);

  const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
  return { job: updated, done: false };
}

/**
 * Sorts each reference into Track A (open access) or Track B (paywalled) —
 * nothing is dropped here. When none are left to sort, the round's candidates
 * are recorded and move on to the relevance check.
 */
async function advanceResolvingAccess(job: Job): Promise<AdvanceResult> {
  const pending = await db.reference.findMany({
    where: { researchJobId: job.id, status: "CANDIDATE", doi: { not: null }, access: null },
    take: RESOLVE_BATCH,
  });

  if (pending.length === 0) {
    const recorded = await db.reference.updateMany({
      where: { researchJobId: job.id, status: "CANDIDATE", doi: { not: null }, access: { not: null } },
      data: { status: "IMPORTED" },
    });
    const total = await db.reference.count({ where: { researchJobId: job.id, status: { in: ["IMPORTED", "KEPT"] } } });
    if (recorded.count === 0 && total === 0) {
      const next = await db.researchJob.update({
        where: { id: job.id },
        data: { status: "FAILED_NEEDS_REVIEW", errorMessage: "The search returned no papers for this topic." },
      });
      await ledgerRunFinished(job.projectId, job.id, "FAILED");
      await notifyOperations({
        title: "Research pipeline needs review",
        message: `${job.projectId}: the literature search returned no papers.`,
        type: "urgent",
        link: `/admin/research-requests`,
      });
      return { job: next, done: true };
    }
    return moveTo(job, "CLASSIFYING");
  }

  // ref.pdfUrl here is OpenAlex's unverified hint — probed like any other location.
  const results = await Promise.all(pending.map((ref) => resolveOpenAccessPdf(ref.doi as string, [ref.pdfUrl])));

  await db.$transaction(
    pending.map((ref, i) =>
      db.reference.update({
        where: { id: ref.id },
        data: {
          access: results[i].isOpenAccess && results[i].pdfUrl ? "OPEN_ACCESS" : "PAYWALLED",
          pdfUrl: results[i].isOpenAccess ? results[i].pdfUrl : null,
        },
      })
    )
  );

  const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
  return { job: updated, done: false };
}

async function advanceClassifying(job: Job, ctx: ProjectContext): Promise<AdvanceResult> {
  const pending = await db.reference.findMany({
    where: { researchJobId: job.id, status: "IMPORTED", classification: null },
    take: CLASSIFY_BATCH,
  });

  if (pending.length > 0) {
    // Same stored analysis Query generation used — one shared understanding
    // of what the project is for. Old jobs (pre-30 Sept 2026) run with a null
    // analysis; the classifier's prompt handles that path.
    const analysis = readAnalysis(job);
    const results = await classifyBatch(
      ctx,
      analysis,
      pending.map((r) => ({ id: r.id, title: r.title, year: r.year, abstract: r.abstract }))
    );
    const byId = new Map(results.map((r) => [r.referenceId, r]));
    const writes = pending
      .filter((ref) => byId.has(ref.id))
      .map((ref) => {
        const result = byId.get(ref.id)!;
        return db.reference.update({
          where: { id: ref.id },
          data: { classification: result.classification, classificationReason: result.reason ?? null },
        });
      });
    if (writes.length === 0) {
      throw new ResearchError("The relevance check returned no results — press Resume to try again.");
    }
    await db.$transaction(writes);
    const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    return { job: updated, done: false };
  }

  // Everything this attempt imported is classified — decide.
  const active = await db.reference.findMany({
    where: { researchJobId: job.id, status: { in: ["IMPORTED", "KEPT"] } },
    select: { id: true, status: true, classification: true, citedByCount: true },
  });

  const isKeeper = (c: ReferenceClassification | null) => c === "CORE" || c === "CLOSELY_RELATED";
  const allKeepers = active.filter((r) => isKeeper(r.classification));
  // Over the cap: keep CORE papers first, then the most cited.
  const ranked = [...allKeepers].sort(
    (a, b) =>
      Number(b.classification === "CORE") - Number(a.classification === "CORE") ||
      (b.citedByCount ?? 0) - (a.citedByCount ?? 0)
  );
  const keeperIds = ranked.slice(0, MAX_REFERENCES).map((r) => r.id);
  const trimmedIds = ranked.slice(MAX_REFERENCES).map((r) => r.id);
  // TANGENTIAL and IRRELEVANT are never kept — so the final set is always
  // 100% CORE + CLOSELY_RELATED with zero IRRELEVANT, comfortably inside the
  // Tier 2 rule (≥75% CORE + CLOSELY_RELATED, zero IRRELEVANT).
  const offenderIds = [...active.filter((r) => !isKeeper(r.classification)).map((r) => r.id), ...trimmedIds];

  const keeperRows = ranked.slice(0, MAX_REFERENCES);
  const core = keeperRows.filter((r) => r.classification === "CORE").length;
  const closelyRelated = keeperRows.length - core;
  const pct = (n: number) => (keeperRows.length > 0 ? Math.round((n / keeperRows.length) * 1000) / 10 : 0);

  const settle = [
    db.reference.updateMany({ where: { id: { in: offenderIds } }, data: { status: "REPLACED" } }),
    db.reference.updateMany({ where: { id: { in: keeperIds } }, data: { status: "KEPT" } }),
  ];

  const enough = keeperIds.length >= job.targetCount;
  const outOfRounds = job.replacementRound >= MAX_REPLACEMENT_ROUNDS;

  if (!enough && !outOfRounds) {
    await db.$transaction([
      ...settle,
      db.researchJob.update({
        where: { id: job.id },
        data: {
          status: "REPLACING",
          replacementRound: job.replacementRound + 1,
          corePercent: pct(core),
          closelyRelatedPercent: pct(closelyRelated),
        },
      }),
    ]);
    const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    return { job: updated, done: false };
  }

  if (keeperIds.length < MIN_USABLE_REFERENCES) {
    await db.$transaction([
      ...settle,
      db.researchJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED_NEEDS_REVIEW",
          corePercent: pct(core),
          closelyRelatedPercent: pct(closelyRelated),
          errorMessage: `Only ${keeperIds.length} relevant reference(s) found after ${MAX_REPLACEMENT_ROUNDS} replacement rounds — needs manual review.`,
        },
      }),
    ]);
    await ledgerRunFinished(job.projectId, job.id, "FAILED");
    await notifyOperations({
      title: "Research pipeline needs review",
      message: `${ctx.projectId}: only ${keeperIds.length} relevant references after ${MAX_REPLACEMENT_ROUNDS} replacement rounds.`,
      type: "urgent",
      link: `/admin/research-requests`,
    });
    const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    return { job: updated, done: true };
  }

  const warnings: string[] = [];
  if (core < MIN_CORE_REFERENCES) warnings.push(`only ${core} are CORE papers (aim for at least ${MIN_CORE_REFERENCES})`);
  const note = warnings.length ? `${warnings.join("; ")}.`.replace(/^./, (c) => c.toUpperCase()) : null;

  await db.$transaction([
    ...settle,
    db.researchJob.update({
      where: { id: job.id },
      data: {
        // The final kept set now runs through one global-reasoning curation
        // call (advanceCurating) before Track A uploads — plagiarism-cluster,
        // generic-methodology and broad-survey filler get demoted with the
        // whole list in view. Pre-30-Sept jobs skip curation (no analysis).
        status: "CURATING",
        corePercent: pct(core),
        closelyRelatedPercent: pct(closelyRelated),
        errorMessage: note,
      },
    }),
  ]);
  if (note) {
    await notifyOperations({
      title: "Research finished below target",
      message: `${ctx.projectId}: ${note}`,
      type: "warning",
      link: `/admin/projects/${ctx.projectId}`,
    });
  }
  const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
  return { job: updated, done: false };
}

// ── Curation (global-reasoning demote pass over the final kept set) ─────────

type CurationCategory = "cluster" | "guard" | "generic" | "broad";
interface CurationDemote {
  referenceId: string;
  reason: string;
  category: CurationCategory;
}
interface CurationResult {
  demote: CurationDemote[];
  gaps: string[];
}

const CATEGORY_PRIORITY: Record<CurationCategory, number> = { guard: 0, broad: 1, generic: 2, cluster: 3 };

/**
 * Global-reasoning pass over the whole kept set. Tier 2 classifies each
 * paper in isolation, so keyword-adjacent clusters (six plagiarism papers on
 * a topic-similarity project, three near-identical evaluation-metric
 * surveys, one broad "AI in Education" review) all survive — each is
 * defensibly CLOSELY_RELATED alone. Curation reads the whole list plus the
 * project analysis and demotes redundant / over-represented /
 * weakly-adjacent papers to REPLACED. Returns any subproblems no kept paper
 * addresses (logged, not acted on).
 */
async function curateReferences(
  ctx: ProjectContext,
  analysis: ProjectAnalysis,
  kept: { id: string; title: string | null; year: number | null; journal: string | null; abstract: string | null; classification: ReferenceClassification | null; classificationReason: string | null }[],
): Promise<CurationResult> {
  const system = `You are the FINAL curator of the reference list for a student project report at EduCraft. Tier 2 has already dropped clearly off-topic papers. Your job is to decide what a supervisor would actually accept, reading the whole set at once — the batch classifier judged each paper alone and cannot see cluster over-representation or redundancy.

Read the PROJECT ANALYSIS carefully. Then read every kept reference below.

Demote a paper to REPLACED when any of these apply. Give a one-line reason and the matching category.

- cluster — 4+ kept papers cover the same narrow sub-technique. Keep the strongest 2–3 (the survey, the most cited, the most recent authoritative). Demote the rest.
- guard — the paper matches one of the analysis's off-topic guards even weakly. Example, for a topic-similarity project: plagiarism-detection papers are adjacent method literature at best. Two or three are enough for context; more are redundant.
- generic — a general evaluation-metrics, text-preprocessing, or classification-algorithm paper with no connection to a named component or subproblem. Keep one representative; demote the rest.
- broad — a wide-field survey (e.g. "AI in Education 2010–2020") that doesn't address a named component or subproblem.

Do NOT demote a paper only because it is not CORE — CLOSELY_RELATED papers that address a real subproblem are still valuable background.

Also list any coverage gaps: subproblems from the analysis that NO kept paper addresses. These are logged for the operations team, not acted on this run.

Be strict but conservative. Aim to demote maybe 5–15% of the set on a typical run; more when a specific cluster (e.g. 6 plagiarism papers) obviously needs trimming.`;

  const user = [
    `PROJECT TITLE: ${ctx.topic}`,
    `DEPARTMENT: ${ctx.department}`,
    "",
    analysisBlock(analysis),
    "",
    `KEPT REFERENCES (${kept.length}):`,
    ...kept.map((r) => {
      const classifier = r.classification ? `[${r.classification}]` : "[?]";
      const reason = r.classificationReason ? ` — Tier 2 said: ${r.classificationReason.slice(0, 200)}` : "";
      return `[${r.id}] ${classifier} "${r.title ?? "(untitled)"}" (${r.year ?? "n.d."}${r.journal ? `, ${r.journal}` : ""})${reason}\n  Abstract: ${r.abstract ? r.abstract.slice(0, 500) : "No abstract available."}`;
    }),
  ].join("\n\n");

  try {
    const result = await callClaudeForJson<CurationResult>({
      system,
      user,
      toolName: "curate_kept_references",
      toolDescription: "List references to demote from the final kept set and subproblems left uncovered.",
      inputSchema: {
        type: "object",
        properties: {
          demote: {
            type: "array",
            items: {
              type: "object",
              properties: {
                referenceId: { type: "string" },
                reason: { type: "string" },
                category: { type: "string", enum: ["cluster", "guard", "generic", "broad"] },
              },
              required: ["referenceId", "reason", "category"],
            },
          },
          gaps: { type: "array", items: { type: "string" } },
        },
        required: ["demote", "gaps"],
      },
      maxTokens: 2048,
      usage: { projectId: ctx.id, subsystem: "research_pipeline", step: "curate_references" },
    });
    return {
      demote: (result.demote ?? []).filter((d) => d.referenceId && d.reason && d.category),
      gaps: (result.gaps ?? []).map((g) => g.trim()).filter(Boolean),
    };
  } catch (error) {
    if (error instanceof AnthropicError) throw new ResearchError(error.message);
    throw error;
  }
}

/**
 * One-shot global curation over the final kept set. Runs once per job (never
 * per round). Old jobs without a stored `projectAnalysis` skip curation and
 * go straight to Track A.
 */
async function advanceCurating(job: Job, ctx: ProjectContext): Promise<AdvanceResult> {
  const analysis = readAnalysis(job);
  if (!analysis) {
    const next = await db.researchJob.update({ where: { id: job.id }, data: { status: "UPLOADING_DRIVE" } });
    return { job: next, done: false };
  }

  const kept = await db.reference.findMany({
    where: { researchJobId: job.id, status: "KEPT" },
    select: { id: true, title: true, year: true, journal: true, abstract: true, classification: true, classificationReason: true },
  });
  if (kept.length === 0) {
    const next = await db.researchJob.update({ where: { id: job.id }, data: { status: "UPLOADING_DRIVE" } });
    return { job: next, done: false };
  }

  const result = await curateReferences(ctx, analysis, kept);

  const validIds = new Set(kept.map((r) => r.id));
  const flagged = result.demote.filter((d) => validIds.has(d.referenceId));

  // Safety cap: never drop below MIN_USABLE_REFERENCES. Demote greedily by
  // category priority (guard > broad > generic > cluster) until the floor.
  const room = Math.max(kept.length - MIN_USABLE_REFERENCES, 0);
  const ordered = [...flagged].sort((a, b) => (CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category]));
  const toDemote = ordered.slice(0, room);
  const skipped = ordered.slice(room);

  if (toDemote.length > 0) {
    await db.$transaction(
      toDemote.map((d) =>
        db.reference.update({
          where: { id: d.referenceId },
          data: { status: "REPLACED", classificationReason: `Curation (${d.category}): ${d.reason}`.slice(0, 500) },
        })
      )
    );
  }

  // Recompute the CORE / CLOSELY_RELATED percentages after demotions.
  const remaining = await db.reference.findMany({
    where: { researchJobId: job.id, status: "KEPT" },
    select: { classification: true },
  });
  const core = remaining.filter((r) => r.classification === "CORE").length;
  const closelyRelated = remaining.length - core;
  const pct = (n: number) => (remaining.length > 0 ? Math.round((n / remaining.length) * 1000) / 10 : 0);

  const notes: string[] = [];
  if (toDemote.length > 0) notes.push(`Curation demoted ${toDemote.length} reference(s) as redundant or weakly related.`);
  if (skipped.length > 0) notes.push(`${skipped.length} further flag(s) held back to keep the set at the ${MIN_USABLE_REFERENCES}-reference floor.`);
  if (result.gaps.length > 0) notes.push(`Coverage gaps: ${result.gaps.slice(0, 4).join("; ")}.`);
  const existing = job.errorMessage ? job.errorMessage.trim() : "";
  const combined = [existing, notes.join(" ")].filter(Boolean).join(" ") || null;

  const next = await db.researchJob.update({
    where: { id: job.id },
    data: {
      status: "UPLOADING_DRIVE",
      corePercent: pct(core),
      closelyRelatedPercent: pct(closelyRelated),
      errorMessage: combined,
    },
  });

  if (toDemote.length > 0) {
    console.info(`[research] curation on ${ctx.projectId}: demoted ${toDemote.length}, held back ${skipped.length}, gaps ${result.gaps.length}`);
  }
  if (result.gaps.length > 0) {
    // Non-blocking heads-up — the COO can see the gaps on the research
    // request card and decide whether to re-run for more coverage.
    await notifyOperations({
      title: "Research curation flagged coverage gaps",
      message: `${ctx.projectId}: subproblems left uncovered — ${result.gaps.slice(0, 3).join("; ")}`,
      type: "info",
      link: `/admin/projects/${ctx.projectId}`,
    }).catch((error) => console.error("[research] notifyOperations gaps failed", error));
  }
  return { job: next, done: false };
}

/**
 * Downloads a kept reference's open-access PDF and stores it in the private
 * Blob store. Returns the stored path, or null if the download failed or the
 * bytes weren't a real PDF — a failed row falls into the paywalled list and
 * doesn't stop the run. Same 25 s timeout and `%PDF-` sniff the Drive
 * uploader used.
 */
async function savePdfToBlob(projectDbId: string, referenceId: string, fileUrl: string): Promise<string | null> {
  let bytes: Buffer;
  try {
    const res = await fetch(fileUrl, { headers: { Accept: "application/pdf" }, signal: AbortSignal.timeout(25_000) });
    if (!res.ok) {
      console.error("[research] PDF fetch not ok", fileUrl, res.status);
      return null;
    }
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (error) {
    console.error("[research] PDF fetch threw", fileUrl, error);
    return null;
  }
  // Judge by the bytes, not the header — some hosts serve real PDFs as
  // application/octet-stream, others serve an HTML login page labelled PDF.
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    console.error("[research] URL did not serve a PDF", fileUrl);
    return null;
  }
  const path = buildPrivatePath({
    projectDbId,
    purpose: "research",
    targetId: referenceId,
    random: crypto.randomBytes(12).toString("hex"),
    ext: "pdf",
  });
  try {
    await putPrivateFile(path, new Uint8Array(bytes), "application/pdf");
    return path;
  } catch (error) {
    console.error("[research] Blob write failed", fileUrl, error);
    return null;
  }
}

async function advanceUploadingDrive(job: Job, ctx: ProjectContext): Promise<AdvanceResult> {
  // Track A: open-access PDFs into the private Blob store. Since 29 Sept 2026
  // this replaces the Google Drive uploader — no Google account, no refresh
  // token. Old jobs' `driveFileId` rows stay readable via a fallback.
  const pending = await db.reference.findMany({
    where: { researchJobId: job.id, status: "KEPT", access: "OPEN_ACCESS", pdfUrl: { not: null }, pdfBlobPath: null, driveFileId: null },
    take: DRIVE_BATCH,
  });

  if (pending.length > 0) {
    const results = await Promise.all(
      pending.map((ref) => savePdfToBlob(job.projectId, ref.id, ref.pdfUrl as string))
    );
    // A failed download isn't fatal — the row stays without a PDF and shows in
    // the paywalled reference list generated on demand.
    await db.$transaction(
      pending.map((ref, i) =>
        db.reference.update({ where: { id: ref.id }, data: results[i] ? { pdfBlobPath: results[i] } : { driveFileId: "SKIPPED" } })
      )
    );
    const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    return { job: updated, done: false };
  }

  // Track B (the paywalled reference list) is no longer stored: the worker's
  // Research panel offers a "Paywalled references (N).docx" download that
  // renders from the DB on demand, always up to date.

  const next = await db.researchJob.update({ where: { id: job.id }, data: { status: "PASSED" } });
  await ledgerRunFinished(job.projectId, job.id, "COMPLETE");
  // D3b: a report project's objectives (and Law/History sources) come next; the next browser request starts them.
  await createPendingBrief(job.projectId).catch((error) => console.error("[research] could not queue the objectives stage", error));
  if (job.requestedById) {
    const [total, withPdf] = await Promise.all([
      db.reference.count({ where: { researchJobId: job.id, status: "KEPT" } }),
      db.reference.count({
        where: {
          researchJobId: job.id,
          status: "KEPT",
          OR: [
            { pdfBlobPath: { not: null } },
            { AND: [{ driveFileId: { not: null } }, { NOT: { driveFileId: "SKIPPED" } }] },
          ],
        },
      }),
    ]);
    const message = `${ctx.projectId}: ${total} verified references ready (${withPdf} with PDFs, ${total - withPdf} reference-only).`;
    // D9: a run the founder or the COO started opens their own page; the assigned specialist is told as well.
    const [starter, assigned] = await Promise.all([
      db.user.findUnique({ where: { id: job.requestedById }, select: { role: true } }),
      db.project.findUnique({ where: { id: job.projectId }, select: { worker: { select: { userId: true } } } }),
    ]);
    const byStaff = isStaffRole(starter?.role);
    await notifyUsers([job.requestedById], {
      title: "Research complete",
      message,
      type: "success",
      link: byStaff ? `/admin/projects/${ctx.projectId}?tab=report` : `/worker/projects/${ctx.projectId}`,
    });
    const specialist = assigned?.worker?.userId;
    if (byStaff && specialist && specialist !== job.requestedById) {
      await notifyUsers([specialist], { title: "Research complete", message, type: "success", link: `/worker/projects/${ctx.projectId}` });
    }
  }
  return { job: next, done: true };
}
