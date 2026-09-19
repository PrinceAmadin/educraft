import type { Reference, ReferenceClassification } from "@prisma/client";
import { db } from "@/lib/db";
import { callClaudeForJson, AnthropicError } from "@/lib/anthropic";
import { resolveOpenAccessPdf } from "@/lib/unpaywall";
import { searchWorks } from "@/lib/openalex";
// Legacy cleanup only — jobs run before Zotero was dropped from the pipeline
// still have a collection and items that "Run research again" should remove.
import { deleteCollection, deleteItems } from "@/lib/zotero";
import {
  createDocInFolder,
  deleteFile,
  ensureProjectFolder,
  uploadPdfToFolder,
  GoogleDriveError,
} from "@/lib/google-drive";
import { notifyAdmins, notifyUsers } from "@/lib/services/notifications";
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
const CANDIDATES_PER_ROUND = 100;
const MAX_REPLACEMENT_ROUNDS = 3;
const MIN_REPLACEMENT_CANDIDATES = 20;
/** Below this many relevant references the job goes to an admin instead of passing. */
const MIN_USABLE_REFERENCES = 10;
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
const DRIVE_BATCH = 3; // PDF downloads+uploads per step, run concurrently

const PAYWALLED_DOC_TITLE = "Paywalled References — Access via your university library";

// ── Ownership / lifecycle ────────────────────────────────────

interface ProjectContext {
  id: string;
  projectId: string;
  topic: string;
  department: string;
  universityName: string | null;
}

async function loadProjectContext(workerId: string, idOrCode: string): Promise<ProjectContext> {
  const project = await db.project.findFirst({
    where: { workerId, OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: {
      id: true,
      projectId: true,
      projectTitle: true,
      client: { select: { department: true, university: { select: { name: true } } } },
    },
  });
  if (!project) throw new ResearchError("Assignment not found");
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
  targetCount = 40
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
export async function rerunResearchJob(workerId: string, idOrCode: string, userId: string, targetCount = 40) {
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
 * e.g. a job produced under the old open-access-only rules. Cleans up what it
 * created in Zotero and Drive first (best effort: a cleanup failure is logged
 * and never blocks the reset). The project's Drive folder itself is kept and
 * reused by the next run.
 */
export async function resetResearchJob(workerId: string, idOrCode: string): Promise<void> {
  const project = await db.project.findFirst({
    where: { workerId, OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true },
  });
  if (!project) throw new ResearchError("Assignment not found");

  const job = await db.researchJob.findUnique({
    where: { projectId: project.id },
    include: { references: { select: { zoteroItemKey: true, driveFileId: true } } },
  });
  if (!job) return;

  const itemKeys = job.references.map((r) => r.zoteroItemKey).filter((k): k is string => Boolean(k));
  try {
    if (itemKeys.length > 0) await deleteItems(itemKeys);
    if (job.zoteroCollectionKey) await deleteCollection(job.zoteroCollectionKey);
  } catch (error) {
    console.error("[research reset] Zotero cleanup failed", job.id, error);
  }

  const driveIds = [
    ...job.references.map((r) => r.driveFileId).filter((id): id is string => Boolean(id) && id !== "SKIPPED"),
    ...(job.paywalledDocId ? [job.paywalledDocId] : []),
  ];
  const results = await Promise.allSettled(driveIds.map((id) => deleteFile(id)));
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) console.error(`[research reset] ${failed} Drive file(s) could not be deleted`, job.id);

  await db.researchJob.delete({ where: { id: job.id } });
}

// ── Claude calls ─────────────────────────────────────────────

function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Claude writes the search queries; OpenAlex does the finding. Returns only
 * queries not already used by this job, each prefixed with
 * FOUNDATIONAL_PREFIX when it's meant to surface older landmark papers.
 */
async function generateSearchQueries(ctx: ProjectContext, previous: string[], count: number): Promise<string[]> {
  const system = `You write search queries for an academic database (OpenAlex) to find literature for a student's project report at EduCraft, a Nigerian academic writing service. Each query is run as a keyword search over paper titles and abstracts.

Write short queries of 3–7 words, the way a researcher types into Google Scholar — no quotes, no boolean operators, no full sentences.

Cover the report's whole scope across different queries:
- the core topic itself
- key concepts and definitions the literature review needs
- methods, techniques, models, or tools the project would use
- the application domain or industry
- the local context (country, region, developing economies) where the topic has one
- relevant standards, frameworks, or regulations

Mark a query "foundational" when it should find older, highly-cited landmark papers (seminal models, original frameworks) rather than recent work — about 1 in 5 queries. Avoid queries so generic they'd match any paper in the field. Never repeat or trivially reword a query listed as already used.`;

  const user = [
    `PROJECT TOPIC: ${ctx.topic}`,
    `DEPARTMENT: ${ctx.department}`,
    ctx.universityName ? `UNIVERSITY: ${ctx.universityName}` : null,
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
  batch: { id: string; title: string | null; year: number | null; abstract: string | null }[]
): Promise<ClassificationResult[]> {
  const system = `You are performing a relevance check on academic references gathered for an EduCraft student project report, BEFORE any writing begins. For each reference, classify how relevant it is to the exact project topic — be strict, since irrelevant references contaminate the literature review and are the single most common cause of supervisor rejection at EduCraft.

Classifications:
- CORE: directly about this exact topic/problem — a base paper the report should build on.
- CLOSELY_RELATED: same general subject area or closely adjacent method/application — clearly useful supporting literature.
- TANGENTIAL: shares only a broad field or a keyword with the topic — not something this report should cite as a base reference.
- IRRELEVANT: not meaningfully connected to the topic at all.

Classify every reference listed, using its exact id.`;

  const user = [
    `PROJECT TOPIC: ${ctx.topic}`,
    `DEPARTMENT: ${ctx.department}`,
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Client-facing — deliberately says nothing about how the references were found. */
function paywalledDocHtml(ctx: ProjectContext, refs: Reference[]): string {
  const sorted = [...refs].sort(
    (a, b) => (a.authors ?? "").localeCompare(b.authors ?? "") || (a.year ?? 0) - (b.year ?? 0)
  );
  const items = sorted
    .map((r) => {
      const doiUrl = `https://doi.org/${r.doi}`;
      const parts = [
        `${escapeHtml(r.authors || "Unknown author")} (${r.year ?? "n.d."}).`,
        `<i>${escapeHtml(r.title ?? r.proposedTitle)}</i>.`,
        r.journal ? `${escapeHtml(r.journal)}.` : "",
        `<a href="${escapeHtml(doiUrl)}">${escapeHtml(doiUrl)}</a>`,
      ];
      return `<li>${parts.filter(Boolean).join(" ")}</li>`;
    })
    .join("\n");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<h1>${escapeHtml(PAYWALLED_DOC_TITLE)}</h1>
<p><b>Project:</b> ${escapeHtml(ctx.projectId)} — ${escapeHtml(ctx.topic)}</p>
<p>These ${refs.length} references are part of your project's reference list, but we couldn't save a PDF of them for you. Some are free to read straight from the DOI link. For the rest, open the link while signed in to your university library portal (or connected to campus Wi-Fi) — your library's journal subscriptions usually give full access. The papers we could download are saved as PDFs in this same folder.</p>
<ol>
${items}
</ol>
<p>EduCraft — Providing Affordable Academic Services</p>
</body></html>`;
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

async function advanceFindingCandidates(job: Job, ctx: ProjectContext): Promise<AdvanceResult> {
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
    const fresh = await generateSearchQueries(ctx, job.searchQueries, count);
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
      await notifyAdmins({
        title: "Research pipeline needs review",
        message: `${job.projectId}: the literature search returned no papers.`,
        type: "urgent",
        link: `/admin/projects/${job.projectId}`,
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
    const results = await classifyBatch(
      ctx,
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
    select: { id: true, status: true, classification: true },
  });

  const isKeeper = (c: ReferenceClassification | null) => c === "CORE" || c === "CLOSELY_RELATED";
  const keeperIds = active.filter((r) => isKeeper(r.classification)).map((r) => r.id);
  // TANGENTIAL and IRRELEVANT are never kept — so the final set is always
  // 100% CORE + CLOSELY_RELATED with zero IRRELEVANT, comfortably inside the
  // Tier 2 rule (≥75% CORE + CLOSELY_RELATED, zero IRRELEVANT).
  const offenderIds = active.filter((r) => !isKeeper(r.classification)).map((r) => r.id);

  const keeperRows = active.filter((r) => isKeeper(r.classification));
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
    await notifyAdmins({
      title: "Research pipeline needs review",
      message: `${ctx.projectId}: only ${keeperIds.length} relevant references after ${MAX_REPLACEMENT_ROUNDS} replacement rounds.`,
      type: "urgent",
      link: `/admin/projects/${ctx.projectId}`,
    });
    const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    return { job: updated, done: true };
  }

  const warnings: string[] = [];
  if (!enough) warnings.push(`${keeperIds.length} of the ${job.targetCount} references requested were found`);
  if (core < MIN_CORE_REFERENCES) warnings.push(`only ${core} are CORE papers (aim for at least ${MIN_CORE_REFERENCES})`);
  const note = warnings.length ? `${warnings.join("; ")}.`.replace(/^./, (c) => c.toUpperCase()) : null;

  await db.$transaction([
    ...settle,
    db.researchJob.update({
      where: { id: job.id },
      data: {
        status: "UPLOADING_DRIVE",
        corePercent: pct(core),
        closelyRelatedPercent: pct(closelyRelated),
        errorMessage: note,
      },
    }),
  ]);
  if (note) {
    await notifyAdmins({
      title: "Research finished below target",
      message: `${ctx.projectId}: ${note}`,
      type: "warning",
      link: `/admin/projects/${ctx.projectId}`,
    });
  }
  const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
  return { job: updated, done: false };
}

async function advanceUploadingDrive(job: Job, ctx: ProjectContext): Promise<AdvanceResult> {
  let folder: { folderId: string; webViewLink: string };
  try {
    folder = await ensureProjectFolder(ctx.projectId);
  } catch (error) {
    if (error instanceof GoogleDriveError) throw new ResearchError(error.message);
    throw error;
  }
  if (!job.driveFolderLink) {
    await db.researchJob.update({ where: { id: job.id }, data: { driveFolderLink: folder.webViewLink } });
  }

  // Track A: open-access PDFs into the project's Drive folder.
  const pending = await db.reference.findMany({
    where: { researchJobId: job.id, status: "KEPT", access: "OPEN_ACCESS", pdfUrl: { not: null }, driveFileId: null },
    take: DRIVE_BATCH,
  });

  if (pending.length > 0) {
    const fileIds = await Promise.all(
      pending.map((ref) => {
        const fileName = `${(ref.title ?? ref.proposedTitle).slice(0, 80).replace(/[\\/:*?"<>|]/g, "-")}.pdf`;
        return uploadPdfToFolder(folder.folderId, fileName, ref.pdfUrl as string);
      })
    );
    // A failed download isn't fatal — it's listed in the paywalled-references doc instead.
    await db.$transaction(
      pending.map((ref, i) =>
        db.reference.update({ where: { id: ref.id }, data: { driveFileId: fileIds[i] ?? "SKIPPED" } })
      )
    );
    const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    return { job: updated, done: false };
  }

  // Track B: every kept reference with no PDF in Drive, as one Google Doc of DOI links.
  if (!job.paywalledDocId) {
    const linkOnly = await db.reference.findMany({
      where: {
        researchJobId: job.id,
        status: "KEPT",
        OR: [{ access: { not: "OPEN_ACCESS" } }, { driveFileId: "SKIPPED" }, { driveFileId: null }],
      },
    });
    if (linkOnly.length > 0) {
      try {
        const doc = await createDocInFolder(folder.folderId, PAYWALLED_DOC_TITLE, paywalledDocHtml(ctx, linkOnly));
        await db.researchJob.update({
          where: { id: job.id },
          data: { paywalledDocId: doc.id, paywalledDocLink: doc.webViewLink },
        });
      } catch (error) {
        if (error instanceof GoogleDriveError) throw new ResearchError(error.message);
        throw error;
      }
    }
  }

  const next = await db.researchJob.update({ where: { id: job.id }, data: { status: "PASSED" } });
  if (job.requestedById) {
    const [total, withPdf] = await Promise.all([
      db.reference.count({ where: { researchJobId: job.id, status: "KEPT" } }),
      db.reference.count({
        where: { researchJobId: job.id, status: "KEPT", driveFileId: { not: null }, NOT: { driveFileId: "SKIPPED" } },
      }),
    ]);
    await notifyUsers([job.requestedById], {
      title: "Research complete",
      message: `${ctx.projectId}: ${total} verified references ready (${withPdf} with PDFs, ${total - withPdf} reference-only).`,
      type: "success",
      link: `/worker/projects/${ctx.projectId}`,
    });
  }
  return { job: next, done: true };
}
