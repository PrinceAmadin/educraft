import type { ReferenceClassification } from "@prisma/client";
import { db } from "@/lib/db";
import { callClaudeForJson, AnthropicError } from "@/lib/anthropic";
import { findWorkByTitle } from "@/lib/crossref";
import { resolveOpenAccessPdf } from "@/lib/unpaywall";
import { createCollection, importItems, addLinkedPdfAttachment, ZoteroError } from "@/lib/zotero";
import { ensureProjectFolder, uploadPdfToFolder, GoogleDriveError } from "@/lib/google-drive";
import { notifyAdmins, notifyUsers } from "@/lib/services/notifications";

export class ResearchError extends Error {}

// ── Tuning constants ─────────────────────────────────────────
const MAX_REPLACEMENT_ROUNDS = 3;
const TIER2_PASS_THRESHOLD = 0.75;
const CANDIDATE_FETCH_BATCH = 10; // per Claude call
const CANDIDATE_BUFFER_MULTIPLIER = 2; // fetch 2x target to absorb CrossRef/Unpaywall attrition
const CANDIDATE_HARD_CEILING_MULTIPLIER = 4; // absolute cap on round-0 top-ups, however bad attrition gets
const VERIFY_BATCH = 5; // CrossRef / Unpaywall lookups per step
const IMPORT_BATCH = 8; // Zotero items per step
const CLASSIFY_BATCH = 12; // references per Tier 2 call
const DRIVE_BATCH = 2; // PDF downloads+uploads per step (slow, keep small)

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

// ── Claude calls ─────────────────────────────────────────────

interface CandidatePaper {
  title: string;
  authors?: string;
  year?: number;
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
- Prefer sources likely to be open access (arXiv, Springer Open, IEEE Open, Elsevier Open Access, PMC, DOAJ-indexed journals, institutional repositories).
- Published within roughly the last 5 years where possible; genuinely foundational older papers are fine.
- Do not repeat any title already listed as "already tried."
- Give the title as close to verbatim as you can recall — this is what gets matched against the real record.`;

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
      maxTokens: 2048,
    });
    return result.papers ?? [];
  } catch (error) {
    if (error instanceof AnthropicError) throw new ResearchError(error.message);
    throw error;
  }
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
- IRRELEVANT: not meaningfully connected to the topic at all.`;

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
      maxTokens: 3072,
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
      return advanceResolvingPdfs(job);
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

async function advanceFindingCandidates(job: Job, ctx: ProjectContext): Promise<AdvanceResult> {
  const fetchedSoFar = await candidatesFetchedThisRound(job.id, job.replacementRound);

  // How many raw candidates this round should end up with, before verification attrition.
  let roundTarget: number;
  if (job.replacementRound > 0) {
    roundTarget = (await countReplacedThisAttempt(job.id)) * CANDIDATE_BUFFER_MULTIPLIER;
  } else {
    const softTarget = job.targetCount * CANDIDATE_BUFFER_MULTIPLIER;
    // Verification only ever moves a reference's status away from CANDIDATE
    // (DOI_REJECTED, NO_OA_PDF, IMPORTED, ...) — so this is true only once a
    // full pass through VERIFYING_DOIS has actually happened, which is the
    // only way advanceImportingZotero could have sent us back here for a
    // genuine top-up. Using this instead of a fetch-count threshold avoids
    // misfiring on the ordinary call that lands exactly on softTarget.
    const hasBeenVerified =
      (await db.reference.count({
        where: { researchJobId: job.id, round: 0, status: { not: "CANDIDATE" } },
      })) > 0;

    if (!hasBeenVerified) {
      // Still working through the normal initial fetch — nothing has been
      // through verification yet, so there's no survival rate to extrapolate
      // from. Keep targeting the soft buffer regardless of how many of the
      // batched fetch calls it takes to get there.
      roundTarget = softTarget;
    } else {
      // Genuine top-up re-entry — extrapolate the observed survival rate to
      // estimate how many more raw candidates are needed, capped by a hard
      // ceiling so a genuinely poorly-covered topic can't loop forever.
      const survivors = await db.reference.count({
        where: { researchJobId: job.id, round: 0, status: { in: ["IMPORTED", "KEPT"] } },
      });
      const shortfall = job.targetCount - survivors;
      const hardCeiling = job.targetCount * CANDIDATE_HARD_CEILING_MULTIPLIER;
      if (shortfall <= 0) {
        roundTarget = fetchedSoFar;
      } else {
        const survivalRate = Math.max(survivors / fetchedSoFar, 0.1);
        roundTarget = Math.min(fetchedSoFar + Math.ceil(shortfall / survivalRate), hardCeiling);
      }
    }
  }

  if (fetchedSoFar >= roundTarget || roundTarget === 0) {
    const next = await db.researchJob.update({ where: { id: job.id }, data: { status: "VERIFYING_DOIS" } });
    return { job: next, done: false };
  }

  const batchSize = Math.min(CANDIDATE_FETCH_BATCH, roundTarget - fetchedSoFar);
  const papers = await fetchCandidates(ctx, batchSize, job.triedTitles);

  if (papers.length === 0) {
    // Claude returned nothing new — don't spin forever on an empty batch.
    const next = await db.researchJob.update({ where: { id: job.id }, data: { status: "VERIFYING_DOIS" } });
    return { job: next, done: false };
  }

  await db.$transaction([
    db.reference.createMany({
      data: papers.map((p) => ({
        researchJobId: job.id,
        projectId: job.projectId,
        proposedTitle: p.title,
        proposedYear: p.year ?? null,
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

/** How many references this replacement round needs to replace (marked REPLACED, not yet re-filled). */
async function countReplacedThisAttempt(jobId: string): Promise<number> {
  const job = await db.researchJob.findUniqueOrThrow({ where: { id: jobId } });
  return db.reference.count({ where: { researchJobId: jobId, status: "REPLACED", round: job.replacementRound - 1 } });
}

async function advanceVerifyingDois(job: Job): Promise<AdvanceResult> {
  const pending = await db.reference.findMany({
    where: { researchJobId: job.id, status: "CANDIDATE", doi: null },
    take: VERIFY_BATCH,
  });

  if (pending.length === 0) {
    const next = await db.researchJob.update({ where: { id: job.id }, data: { status: "RESOLVING_PDFS" } });
    return { job: next, done: false };
  }

  // Claude can propose the same underlying paper under two different working
  // titles (or literally repeat one despite the "already tried" instruction);
  // CrossRef then resolves both to the same DOI. Track DOIs already claimed
  // by this job — including ones assigned earlier in this very batch — so a
  // second candidate for the same paper is rejected rather than imported twice.
  const alreadyClaimed = await db.reference.findMany({
    where: { researchJobId: job.id, doi: { not: null }, status: { not: "DOI_REJECTED" } },
    select: { doi: true },
  });
  const claimedDois = new Set(alreadyClaimed.map((r) => r.doi as string));

  for (const ref of pending) {
    const work = await findWorkByTitle(ref.proposedTitle);
    if (!work || claimedDois.has(work.doi)) {
      await db.reference.update({ where: { id: ref.id }, data: { status: "DOI_REJECTED" } });
      continue;
    }
    claimedDois.add(work.doi);
    await db.reference.update({
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
  }

  const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
  return { job: updated, done: false };
}

async function advanceResolvingPdfs(job: Job): Promise<AdvanceResult> {
  const pending = await db.reference.findMany({
    where: { researchJobId: job.id, status: "CANDIDATE", doi: { not: null }, pdfUrl: null },
    take: VERIFY_BATCH,
  });

  if (pending.length === 0) {
    const next = await db.researchJob.update({ where: { id: job.id }, data: { status: "IMPORTING_ZOTERO" } });
    return { job: next, done: false };
  }

  for (const ref of pending) {
    const oa = await resolveOpenAccessPdf(ref.doi as string);
    if (!oa.isOpenAccess || !oa.pdfUrl) {
      await db.reference.update({ where: { id: ref.id }, data: { status: "NO_OA_PDF" } });
      continue;
    }
    await db.reference.update({ where: { id: ref.id }, data: { pdfUrl: oa.pdfUrl } });
  }

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
      pdfUrl: { not: null },
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
          errorMessage: "No candidate papers survived DOI/open-access verification.",
        },
      });
      await notifyAdmins({
        title: "Research pipeline needs review",
        message: `${ctx.projectId}: no references survived verification.`,
        type: "urgent",
        link: `/admin/projects/${ctx.projectId}`,
      });
      return { job: next, done: true };
    }

    // Round 0 came up short of the requested count — top up with more raw
    // candidates (bounded by the hard ceiling inside advanceFindingCandidates)
    // rather than silently handing the worker far fewer references than asked for.
    if (job.replacementRound === 0 && importedCount < job.targetCount) {
      const fetchedSoFar = await candidatesFetchedThisRound(job.id, 0);
      if (fetchedSoFar < job.targetCount * CANDIDATE_HARD_CEILING_MULTIPLIER) {
        const next = await db.researchJob.update({ where: { id: job.id }, data: { status: "FINDING_CANDIDATES" } });
        return { job: next, done: false };
      }
    }

    const next = await db.researchJob.update({ where: { id: job.id }, data: { status: "CLASSIFYING" } });
    return { job: next, done: false };
  }

  try {
    const keys = await importItems(
      collectionKey,
      pending.map((r) => ({
        title: r.title as string,
        authors: r.authors ?? "",
        doi: r.doi as string,
        year: r.year,
        journal: r.journal,
        abstract: r.abstract,
      }))
    );

    for (let i = 0; i < pending.length; i++) {
      const key = keys[i];
      if (!key) continue;
      await db.reference.update({ where: { id: pending[i].id }, data: { zoteroItemKey: key, status: "IMPORTED" } });
      try {
        await addLinkedPdfAttachment(key, pending[i].pdfUrl as string);
      } catch {
        // Best-effort — the reference still has its pdfUrl stored even if the attachment fails.
      }
    }
  } catch (error) {
    if (error instanceof ZoteroError) throw new ResearchError(error.message);
    throw error;
  }

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
    for (const ref of pending) {
      const result = byId.get(ref.id);
      if (!result) continue;
      await db.reference.update({
        where: { id: ref.id },
        data: { classification: result.classification, classificationReason: result.reason ?? null },
      });
    }
    const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    return { job: updated, done: false };
  }

  // All imported references for this attempt are classified — decide pass/fail.
  const active = await db.reference.findMany({
    where: { researchJobId: job.id, status: { in: ["IMPORTED", "KEPT"] } },
    select: { id: true, status: true, classification: true },
  });

  const total = active.length;
  const core = active.filter((r) => r.classification === "CORE").length;
  const closelyRelated = active.filter((r) => r.classification === "CLOSELY_RELATED").length;
  const irrelevant = active.filter((r) => r.classification === "IRRELEVANT").length;
  const corePercent = total > 0 ? Math.round((core / total) * 1000) / 10 : 0;
  const closelyRelatedPercent = total > 0 ? Math.round((closelyRelated / total) * 1000) / 10 : 0;
  const passRate = total > 0 ? (core + closelyRelated) / total : 0;

  const passed = total > 0 && passRate >= TIER2_PASS_THRESHOLD && irrelevant === 0;

  if (passed) {
    await db.$transaction([
      db.reference.updateMany({ where: { researchJobId: job.id, status: "IMPORTED" }, data: { status: "KEPT" } }),
      db.researchJob.update({
        where: { id: job.id },
        data: { status: "UPLOADING_DRIVE", corePercent, closelyRelatedPercent },
      }),
    ]);
    const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    return { job: updated, done: false };
  }

  // Fail — replace the flagged (TANGENTIAL/IRRELEVANT) references and try again, up to the round cap.
  const offenderIds = active
    .filter((r) => r.status === "IMPORTED" && (r.classification === "TANGENTIAL" || r.classification === "IRRELEVANT"))
    .map((r) => r.id);

  // Whatever else was CORE/CLOSELY_RELATED this round is kept for the next attempt's tally.
  const keeperIds = active
    .filter((r) => r.status === "IMPORTED" && (r.classification === "CORE" || r.classification === "CLOSELY_RELATED"))
    .map((r) => r.id);

  if (job.replacementRound >= MAX_REPLACEMENT_ROUNDS) {
    await db.$transaction([
      db.reference.updateMany({ where: { id: { in: offenderIds } }, data: { status: "REPLACED" } }),
      db.reference.updateMany({ where: { id: { in: keeperIds } }, data: { status: "KEPT" } }),
      db.researchJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED_NEEDS_REVIEW",
          corePercent,
          closelyRelatedPercent,
          errorMessage: `Reference relevance still below threshold after ${MAX_REPLACEMENT_ROUNDS} replacement rounds (${Math.round(passRate * 100)}% CORE+CLOSELY_RELATED, ${irrelevant} IRRELEVANT).`,
        },
      }),
    ]);
    await notifyAdmins({
      title: "Research pipeline needs review",
      message: `${ctx.projectId}: reference relevance still failing after ${MAX_REPLACEMENT_ROUNDS} replacement rounds.`,
      type: "urgent",
      link: `/admin/projects/${ctx.projectId}`,
    });
    const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    return { job: updated, done: true };
  }

  await db.$transaction([
    db.reference.updateMany({ where: { id: { in: offenderIds } }, data: { status: "REPLACED" } }),
    db.reference.updateMany({ where: { id: { in: keeperIds } }, data: { status: "KEPT" } }),
    db.researchJob.update({
      where: { id: job.id },
      data: { status: "REPLACING", replacementRound: job.replacementRound + 1, corePercent, closelyRelatedPercent },
    }),
  ]);

  const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
  return { job: updated, done: false };
}

async function advanceUploadingDrive(job: Job, ctx: ProjectContext): Promise<AdvanceResult> {
  let driveFolderLink = job.driveFolderLink;
  let folderId: string;
  if (!driveFolderLink) {
    try {
      const folder = await ensureProjectFolder(ctx.projectId);
      folderId = folder.folderId;
      driveFolderLink = folder.webViewLink;
    } catch (error) {
      if (error instanceof GoogleDriveError) throw new ResearchError(error.message);
      throw error;
    }
    await db.researchJob.update({ where: { id: job.id }, data: { driveFolderLink } });
  } else {
    // Folder already ensured this run — re-derive its id isn't needed again;
    // Drive lets us upload straight into a known folder by id, so re-resolve once more (cheap, idempotent).
    const folder = await ensureProjectFolder(ctx.projectId);
    folderId = folder.folderId;
  }

  const pending = await db.reference.findMany({
    where: { researchJobId: job.id, status: "KEPT", driveFileId: null },
    take: DRIVE_BATCH,
  });

  if (pending.length === 0) {
    const next = await db.researchJob.update({ where: { id: job.id }, data: { status: "PASSED" } });
    if (job.requestedById) {
      await notifyUsers([job.requestedById], {
        title: "Research complete",
        message: `${ctx.projectId}: ${await db.reference.count({ where: { researchJobId: job.id, status: "KEPT" } })} verified references ready.`,
        type: "success",
        link: `/worker/projects/${ctx.projectId}`,
      });
    }
    return { job: next, done: true };
  }

  for (const ref of pending) {
    const fileName = `${(ref.title ?? ref.proposedTitle).slice(0, 80).replace(/[\\/:*?"<>|]/g, "-")}.pdf`;
    const fileId = await uploadPdfToFolder(folderId, fileName, ref.pdfUrl as string);
    if (fileId) {
      await db.reference.update({ where: { id: ref.id }, data: { driveFileId: fileId } });
    } else {
      // Upload failed (e.g. the OA host didn't actually serve a PDF) — leave driveFileId null.
      // Not fatal: the reference still has its Zotero-linked pdfUrl for the worker to use directly.
      await db.reference.update({ where: { id: ref.id }, data: { driveFileId: "SKIPPED" } });
    }
  }

  const updated = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
  return { job: updated, done: false };
}
