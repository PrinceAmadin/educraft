import type { Reference, ReferenceClassification } from "@prisma/client";
import { db } from "@/lib/db";
import { callClaudeForJson, AnthropicError } from "@/lib/anthropic";
import { CrossRefUnavailableError, findWorkByTitle } from "@/lib/crossref";
import { resolveOpenAccessPdf } from "@/lib/unpaywall";
import { fetchAbstractByDoi, searchWorks } from "@/lib/openalex";
import {
  createCollection,
  deleteCollection,
  deleteItems,
  importItems,
  addLinkedPdfAttachment,
  ZoteroError,
} from "@/lib/zotero";
import {
  createDocInFolder,
  deleteFile,
  ensureProjectFolder,
  uploadPdfToFolder,
  GoogleDriveError,
} from "@/lib/google-drive";
import { notifyAdmins, notifyUsers } from "@/lib/services/notifications";

export class ResearchError extends Error {}

/*
 * Where candidates come from — search first, recall as a fallback:
 *
 *   1. Claude writes academic search queries for the topic, and each query is
 *      run against OpenAlex (a real index). Every hit is a real, published
 *      work with a DOI before it ever becomes a candidate — nothing to verify
 *      against fabrication.
 *   2. Only if searching runs dry does Claude recall specific paper titles,
 *      and each of those must then match a real CrossRef record (fuzzy title
 *      match, author/year cross-checked) or it's discarded. On a live test
 *      only ~4% of recalled titles existed, which is why recall is no longer
 *      the primary source.
 *
 * After that, a paper's open-access status only decides how it's delivered,
 * not whether it's kept:
 *
 *   Track A — OPEN_ACCESS: Unpaywall found a PDF that really serves PDF bytes.
 *             Imported to Zotero with a linked PDF, uploaded to Drive.
 *   Track B — PAYWALLED:   verified but no free PDF. Imported to Zotero as
 *             metadata + abstract, listed with its DOI link in the project's
 *             "Paywalled References" Google Doc.
 *
 * Both tracks go through Tier 2 relevance classification and appear in the
 * reference list identically.
 */

// ── Tuning constants ─────────────────────────────────────────
const CANDIDATES_PER_ROUND = 100;
/** Round 0 may top itself up to this many rounds' worth of candidates (300) when verification attrition is high. */
const MAX_CANDIDATE_ROUNDS = 3;
const MAX_REPLACEMENT_ROUNDS = 3;
/** Aim to import a little over target so Tier 2 drop-outs don't leave the job short. */
const IMPORT_TARGET_MULTIPLIER = 1.25;
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

const CANDIDATE_FETCH_BATCH = 25; // recalled titles per Claude call (fallback path)
const VERIFY_BATCH = 6; // CrossRef lookups per step…
const VERIFY_CONCURRENCY = 3; // …at most 3 at once (CrossRef's polite-pool limit)
const RESOLVE_BATCH = 8; // Unpaywall + OpenAlex lookups per step, run concurrently
const IMPORT_BATCH = 25; // Zotero items per step
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

export async function startResearchJob(
  workerId: string,
  idOrCode: string,
  userId: string,
  targetCount = 40
) {
  const project = await loadProjectContext(workerId, idOrCode);

  const existing = await db.researchJob.findUnique({ where: { projectId: project.id } });
  if (existing) return existing;

  return db.researchJob.create({
    data: { projectId: project.id, requestedById: userId, targetCount },
  });
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

interface CandidatePaper {
  title: string;
  authors?: string;
  year?: number;
}

function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchCandidates(
  ctx: ProjectContext,
  count: number,
  triedTitles: string[]
): Promise<CandidatePaper[]> {
  const system = `You are helping EduCraft, a Nigerian academic writing service, find real candidate academic references for a student's project report. Every candidate you propose is independently verified against CrossRef (the real DOI registry) before it is used — anything that doesn't match a real CrossRef record is discarded automatically, before it ever reaches a student's reference list.

Because of that downstream check, it is far better to propose real papers you are only moderately confident about than to invent plausible-sounding details to fill a quota — an invented paper is simply discarded, while a real paper gets a fair chance to verify. Never fabricate a DOI.

Rules:
- Propose only papers you believe actually exist, with reasonably specific bibliographic details.
- Prefer base/foundational papers and closely related recent work over marginally-related ones.
- Prefer well-cited papers in reputable journals and conference proceedings. Paywalled papers are fine — being open access is a bonus, not a requirement.
- Published within roughly the last 5 years where possible; genuinely foundational older papers are fine.
- Do not repeat any title already listed as "already tried."
- Give the title as close to verbatim as you can recall — this is what gets matched against the real record.
- Give authors as "Surname, Initial; Surname, Initial" with the first author first, and the publication year — they're used to confirm the match when the title is recalled imperfectly.`;

  const user = [
    `PROJECT TOPIC: ${ctx.topic}`,
    `DEPARTMENT: ${ctx.department}`,
    ctx.universityName ? `UNIVERSITY: ${ctx.universityName}` : null,
    "",
    `Propose ${count} candidate academic references on this topic.`,
    triedTitles.length
      ? `\nALREADY TRIED (do not repeat):\n${triedTitles.map((t) => `- ${t}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  let papers: CandidatePaper[];
  try {
    const result = await callClaudeForJson<{ papers: CandidatePaper[] }>({
      system,
      user,
      toolName: "propose_candidate_papers",
      toolDescription: "Propose candidate academic papers for downstream verification.",
      inputSchema: {
        type: "object",
        properties: {
          papers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                authors: { type: "string", description: "e.g. 'Smith, J.; Doe, A.'" },
                year: { type: "number" },
              },
              required: ["title"],
            },
          },
        },
        required: ["papers"],
      },
      maxTokens: 4096,
    });
    papers = result.papers ?? [];
  } catch (error) {
    if (error instanceof AnthropicError) throw new ResearchError(error.message);
    throw error;
  }

  // Drop repeats of anything already tried (or repeated within this batch) —
  // an all-repeats batch then correctly reads as "nothing new".
  const seen = new Set(triedTitles.map(titleKey));
  const fresh: CandidatePaper[] = [];
  for (const p of papers) {
    const key = p.title ? titleKey(p.title) : "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    fresh.push(p);
  }
  return fresh;
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
    });
    return result.classifications ?? [];
  } catch (error) {
    if (error instanceof AnthropicError) throw new ResearchError(error.message);
    throw error;
  }
}

// ── Helpers ───────────────────────────────────────────────────

function shortTopic(title: string, max = 60): string {
  if (title.length <= max) return title;
  return title.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

async function candidatesFetchedThisRound(jobId: string, round: number): Promise<number> {
  return db.reference.count({ where: { researchJobId: jobId, round } });
}

function importTarget(targetCount: number): number {
  return Math.ceil(targetCount * IMPORT_TARGET_MULTIPLIER);
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
<p>These ${refs.length} references are part of your project's reference list, but their publishers don't offer a free PDF. To read one, open its DOI link while signed in to your university library portal (or connected to campus Wi-Fi) — your library's journal subscriptions usually give full access. The open-access papers for your project are saved as PDFs in this same folder.</p>
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
    case "VERIFYING_DOIS":
      return advanceVerifyingDois(job);
    case "RESOLVING_PDFS":
      return advanceResolvingAccess(job);
    case "IMPORTING_ZOTERO":
      return advanceImportingZotero(job, ctx);
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

  // How many raw candidates this round should end up with, before verification attrition.
  let roundTarget: number;
  if (job.replacementRound > 0) {
    // Replacement round: aim for enough to cover the remaining shortfall,
    // allowing for both CrossRef and relevance drop-outs.
    const kept = await db.reference.count({ where: { researchJobId: job.id, status: "KEPT" } });
    const shortfall = Math.max(job.targetCount - kept, 0);
    roundTarget =
      shortfall === 0 ? 0 : Math.min(CANDIDATES_PER_ROUND, Math.max(MIN_REPLACEMENT_CANDIDATES, shortfall * 3));
  } else {
    // Verification only ever moves a reference's status away from CANDIDATE
    // (DOI_REJECTED, IMPORTED, ...) — so this is true only once a full pass
    // has happened, which is the only way advanceImportingZotero could have
    // sent us back here for a genuine top-up.
    const hasBeenVerified =
      (await db.reference.count({
        where: { researchJobId: job.id, round: 0, status: { not: "CANDIDATE" } },
      })) > 0;

    if (!hasBeenVerified) {
      roundTarget = CANDIDATES_PER_ROUND;
    } else {
      // Genuine top-up — extrapolate the observed survival rate, capped so a
      // poorly-covered topic can't loop forever.
      const survivors = await db.reference.count({
        where: { researchJobId: job.id, round: 0, status: { in: ["IMPORTED", "KEPT"] } },
      });
      const shortfall = importTarget(job.targetCount) - survivors;
      const hardCeiling = CANDIDATES_PER_ROUND * MAX_CANDIDATE_ROUNDS;
      if (shortfall <= 0) {
        roundTarget = fetchedSoFar;
      } else {
        const survivalRate = Math.max(survivors / Math.max(fetchedSoFar, 1), 0.1);
        roundTarget = Math.min(fetchedSoFar + Math.ceil(shortfall / survivalRate), hardCeiling);
      }
    }
  }

  if (fetchedSoFar >= roundTarget || roundTarget === 0) {
    return moveTo(job, "VERIFYING_DOIS");
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

  // 3. Searching has run dry — fall back to Claude recalling specific titles,
  //    each of which must then match a real CrossRef record.
  const batchSize = Math.min(CANDIDATE_FETCH_BATCH, roundTarget - fetchedSoFar);
  const papers = await fetchCandidates(ctx, batchSize, job.triedTitles);

  if (papers.length === 0) {
    // Claude has nothing new to offer. Move on with what we have, and (for a
    // round-0 top-up) remember it so the import step doesn't send us back.
    const next = await db.researchJob.update({
      where: { id: job.id },
      data: { status: "VERIFYING_DOIS", ...(job.replacementRound === 0 ? { candidatesExhausted: true } : {}) },
    });
    return { job: next, done: false };
  }

  await db.$transaction([
    db.reference.createMany({
      data: papers.map((p) => ({
        researchJobId: job.id,
        projectId: job.projectId,
        proposedTitle: p.title,
        proposedYear: typeof p.year === "number" ? Math.round(p.year) : null,
        authors: p.authors ?? null,
        round: job.replacementRound,
      })),
    }),
    db.researchJob.update({
      where: { id: job.id },
      data: { triedTitles: { push: papers.map((p) => p.title) } },
    }),
  ]);

  const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
  return { job: updated, done: false };
}

/**
 * Runs up to SEARCH_QUERIES_PER_STEP queries against OpenAlex and inserts
 * the new works as candidates that are already verified (they carry a real
 * DOI and the index's own metadata, so VERIFYING_DOIS skips them).
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

async function advanceVerifyingDois(job: Job): Promise<AdvanceResult> {
  const pending = await db.reference.findMany({
    where: { researchJobId: job.id, status: "CANDIDATE", doi: null },
    take: VERIFY_BATCH,
  });

  if (pending.length === 0) return moveTo(job, "RESOLVING_PDFS");

  // In waves of VERIFY_CONCURRENCY — CrossRef rate-limits bursts with 429s.
  const settled: PromiseSettledResult<Awaited<ReturnType<typeof findWorkByTitle>>>[] = [];
  for (let i = 0; i < pending.length; i += VERIFY_CONCURRENCY) {
    const wave = pending.slice(i, i + VERIFY_CONCURRENCY);
    settled.push(
      ...(await Promise.allSettled(
        wave.map((ref) => findWorkByTitle(ref.proposedTitle, { authors: ref.authors, year: ref.proposedYear }))
      ))
    );
  }

  const unavailable = settled.filter((s) => s.status === "rejected");
  if (unavailable.length === pending.length) {
    const reason = (unavailable[0] as PromiseRejectedResult).reason;
    if (reason instanceof CrossRefUnavailableError) {
      throw new ResearchError("CrossRef isn't responding right now — press Resume in a minute to carry on.");
    }
    throw reason;
  }

  // Claude can propose the same underlying paper under two different working
  // titles; CrossRef then resolves both to the same DOI. Track DOIs already
  // claimed by this job — including ones assigned earlier in this batch — so
  // a second candidate for the same paper is rejected rather than imported twice.
  const alreadyClaimed = await db.reference.findMany({
    where: { researchJobId: job.id, doi: { not: null }, status: { not: "DOI_REJECTED" } },
    select: { doi: true },
  });
  const claimedDois = new Set(alreadyClaimed.map((r) => (r.doi as string).toLowerCase()));

  const writes = pending.flatMap((ref, i) => {
    const outcome = settled[i];
    // Couldn't reach CrossRef for this one — leave it as a candidate to retry next step.
    if (outcome.status === "rejected") return [];
    const work = outcome.value;
    if (!work || claimedDois.has(work.doi.toLowerCase())) {
      return db.reference.update({ where: { id: ref.id }, data: { status: "DOI_REJECTED" } });
    }
    claimedDois.add(work.doi.toLowerCase());
    return db.reference.update({
      where: { id: ref.id },
      data: {
        doi: work.doi,
        title: work.title,
        authors: work.authors || ref.authors,
        year: work.year ?? ref.proposedYear,
        journal: work.journal,
        abstract: work.abstract,
      },
    });
  });
  await db.$transaction(writes);

  const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
  return { job: updated, done: false };
}

/** Sorts each verified reference into Track A (open access) or Track B (paywalled) — nothing is dropped here. */
async function advanceResolvingAccess(job: Job): Promise<AdvanceResult> {
  const pending = await db.reference.findMany({
    where: { researchJobId: job.id, status: "CANDIDATE", doi: { not: null }, access: null },
    take: RESOLVE_BATCH,
  });

  if (pending.length === 0) return moveTo(job, "IMPORTING_ZOTERO");

  const results = await Promise.all(
    pending.map(async (ref) => {
      const doi = ref.doi as string;
      const [oa, abstract] = await Promise.all([
        // ref.pdfUrl here is OpenAlex's unverified hint (search-sourced papers) — probed like any other.
        resolveOpenAccessPdf(doi, [ref.pdfUrl]),
        ref.abstract ? Promise.resolve(null) : fetchAbstractByDoi(doi),
      ]);
      return { ref, oa, abstract };
    })
  );

  await db.$transaction(
    results.map(({ ref, oa, abstract }) =>
      db.reference.update({
        where: { id: ref.id },
        data: {
          access: oa.isOpenAccess && oa.pdfUrl ? "OPEN_ACCESS" : "PAYWALLED",
          pdfUrl: oa.isOpenAccess ? oa.pdfUrl : null,
          ...(abstract ? { abstract } : {}),
        },
      })
    )
  );

  const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
  return { job: updated, done: false };
}

async function advanceImportingZotero(job: Job, ctx: ProjectContext): Promise<AdvanceResult> {
  let collectionKey = job.zoteroCollectionKey;
  if (!collectionKey) {
    try {
      collectionKey = await createCollection(`${ctx.projectId} — ${shortTopic(ctx.topic)}`);
    } catch (error) {
      if (error instanceof ZoteroError) throw new ResearchError(error.message);
      throw error;
    }
    await db.researchJob.update({ where: { id: job.id }, data: { zoteroCollectionKey: collectionKey } });
  }

  const pending = await db.reference.findMany({
    where: {
      researchJobId: job.id,
      status: "CANDIDATE",
      doi: { not: null },
      access: { not: null },
      zoteroItemKey: null,
    },
    take: IMPORT_BATCH,
  });

  if (pending.length === 0) {
    const importedCount = await db.reference.count({
      where: { researchJobId: job.id, status: { in: ["IMPORTED", "KEPT"] } },
    });
    if (importedCount === 0) {
      const next = await db.researchJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED_NEEDS_REVIEW",
          errorMessage: "None of the candidate papers could be matched to a real CrossRef record.",
        },
      });
      await notifyAdmins({
        title: "Research pipeline needs review",
        message: `${ctx.projectId}: no candidate papers could be verified against CrossRef.`,
        type: "urgent",
        link: `/admin/projects/${ctx.projectId}`,
      });
      return { job: next, done: true };
    }

    // Round 0 came up short — top up with more raw candidates (bounded inside
    // advanceFindingCandidates) rather than handing over fewer than asked for.
    if (job.replacementRound === 0 && !job.candidatesExhausted && importedCount < importTarget(job.targetCount)) {
      const fetchedSoFar = await candidatesFetchedThisRound(job.id, 0);
      if (fetchedSoFar < CANDIDATES_PER_ROUND * MAX_CANDIDATE_ROUNDS) {
        return moveTo(job, "FINDING_CANDIDATES");
      }
    }

    return moveTo(job, "CLASSIFYING");
  }

  let keys: (string | null)[];
  try {
    keys = await importItems(
      collectionKey,
      pending.map((r) => ({
        title: r.title as string,
        authors: r.authors ?? "",
        doi: r.doi as string,
        year: r.year,
        journal: r.journal,
        abstract: r.abstract,
        tags: [r.access === "OPEN_ACCESS" ? "Open Access — PDF" : "Reference Only — Paywalled"],
      }))
    );
  } catch (error) {
    if (error instanceof ZoteroError) throw new ResearchError(error.message);
    throw error;
  }

  // A reference Zotero refused is still a CrossRef-verified reference — keep
  // it (status IMPORTED, no item key) rather than retrying it forever.
  await db.$transaction(
    pending.map((r, i) =>
      db.reference.update({ where: { id: r.id }, data: { zoteroItemKey: keys[i] ?? null, status: "IMPORTED" } })
    )
  );
  const missing = keys.filter((k) => !k).length;
  if (missing > 0) console.error(`[research] Zotero rejected ${missing} item(s) for job ${job.id}`);

  // Best effort — the reference keeps its pdfUrl even if the attachment fails.
  await Promise.allSettled(
    pending.map((r, i) =>
      keys[i] && r.access === "OPEN_ACCESS" && r.pdfUrl
        ? addLinkedPdfAttachment(keys[i] as string, r.pdfUrl)
        : Promise.resolve()
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
