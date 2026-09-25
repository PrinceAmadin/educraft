import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * The research-run ledger (`ResearchRequest`): one row per run and per
 * approval, mirrored from the rationing code so the COO's Research
 * approvals screen can list every run with its outcome and cost. Every
 * hook here swallows its own errors — the ledger must never stop a run.
 */

type Db = Prisma.TransactionClient | typeof db;

export const DEFAULT_PAPERS_REQUESTED = 50;
export const RESEARCH_SUBSYSTEM = "research_pipeline";

function report(tag: string, error: unknown) {
  console.error(`[research-ledger] ${tag}`, error);
}

async function workerIdForUser(client: Db, userId: string): Promise<string | null> {
  const worker = await client.worker.findUnique({ where: { userId }, select: { id: true } });
  return worker?.id ?? null;
}

/** A worker asked for a re-run beyond the free one: a PENDING row. */
export async function ledgerRerunRequested(
  client: Db,
  input: { rerunRequestId: string; projectId: string; userId: string; workerId?: string | null; reason: string }
): Promise<void> {
  try {
    const workerId = input.workerId ?? (await workerIdForUser(client, input.userId));
    await client.researchRequest.create({
      data: {
        projectId: input.projectId,
        workerId,
        requestedById: input.userId,
        papersRequested: DEFAULT_PAPERS_REQUESTED,
        status: "PENDING",
        reason: input.reason,
        rerunRequestId: input.rerunRequestId,
      },
    });
  } catch (error) {
    report("rerun requested", error);
  }
}

/** A manager approved or declined that request. */
export async function ledgerRerunReviewed(
  client: Db,
  input: { rerunRequestId: string; decision: "approve" | "reject"; reviewerId: string; note: string | null }
): Promise<void> {
  try {
    const now = new Date();
    await client.researchRequest.updateMany({
      where: { rerunRequestId: input.rerunRequestId, status: "PENDING" },
      data:
        input.decision === "approve"
          ? { status: "APPROVED", approvedBy: input.reviewerId, approvedAt: now }
          : { status: "DENIED", deniedBy: input.reviewerId, deniedAt: now, denialReason: input.note },
    });
  } catch (error) {
    report("rerun reviewed", error);
  }
}

/** A run was claimed: the approved row becomes RUNNING, or a free run gets its own RUNNING row. */
export async function ledgerRunStarted(
  client: Db,
  input: { projectId: string; userId: string; logId: string; requestId: string | null; papers?: number }
): Promise<void> {
  try {
    const now = new Date();
    // A re-run deletes the project's job, so a run still marked RUNNING will never finish: close it.
    await client.researchRequest.updateMany({
      where: { projectId: input.projectId, status: "RUNNING" },
      data: { status: "FAILED", completedAt: now, pipelineLog: { errorMessage: "Replaced by a re-run before it finished" } as Prisma.InputJsonValue },
    });
    if (input.requestId) {
      const moved = await client.researchRequest.updateMany({
        where: { rerunRequestId: input.requestId, status: { in: ["APPROVED", "PENDING"] } },
        data: { status: "RUNNING", runLogId: input.logId, startedAt: now },
      });
      if (moved.count > 0) return;
    }
    const workerId = await workerIdForUser(client, input.userId);
    await client.researchRequest.create({
      data: {
        projectId: input.projectId,
        workerId,
        requestedById: input.userId,
        papersRequested: input.papers ?? DEFAULT_PAPERS_REQUESTED,
        status: "RUNNING",
        runLogId: input.logId,
        approvedAt: now,
        startedAt: now,
      },
    });
  } catch (error) {
    report("run started", error);
  }
}

/**
 * The run could not start after all (its claim was given back): an approved
 * request goes back to APPROVED so the worker can still use it; a free run's
 * row is removed.
 */
export async function ledgerRunReleased(input: { logId: string; requestId: string | null }): Promise<void> {
  try {
    if (input.requestId) {
      await db.researchRequest.updateMany({ where: { runLogId: input.logId }, data: { status: "APPROVED", runLogId: null, startedAt: null } });
    } else {
      await db.researchRequest.deleteMany({ where: { runLogId: input.logId, status: "RUNNING" } });
    }
  } catch (error) {
    report("run released", error);
  }
}

/** The pipeline finished: counts, cost and a progress snapshot on the RUNNING row (or a fresh row for an older job). */
export async function ledgerRunFinished(projectId: string, jobId: string, outcome: "COMPLETE" | "FAILED"): Promise<void> {
  try {
    const running = await db.researchRequest.findFirst({ where: { projectId, status: "RUNNING" }, orderBy: { startedAt: "desc" } });
    const job = await db.researchJob.findUnique({
      where: { id: jobId },
      select: { status: true, corePercent: true, closelyRelatedPercent: true, replacementRound: true, errorMessage: true, driveFolderLink: true, createdAt: true },
    });
    const [total, withPdf] = await Promise.all([
      db.reference.count({ where: { researchJobId: jobId, status: "KEPT" } }),
      db.reference.count({ where: { researchJobId: jobId, status: "KEPT", driveFileId: { not: null }, NOT: { driveFileId: "SKIPPED" } } }),
    ]);
    const since = running?.startedAt ?? job?.createdAt ?? undefined;
    const cost = await db.aiUsageLog.aggregate({
      where: { projectId, subsystem: RESEARCH_SUBSYSTEM, ...(since ? { createdAt: { gte: since } } : {}) },
      _sum: { costNaira: true },
    });
    const now = new Date();
    const data = {
      status: outcome,
      totalReferences: total,
      openAccessCount: withPdf,
      paywalledCount: total - withPdf,
      actualCostNaira: Math.round((cost._sum.costNaira ?? 0) * 100) / 100,
      completedAt: now,
      pipelineLog: {
        jobStatus: job?.status ?? null,
        corePercent: job?.corePercent ?? null,
        closelyRelatedPercent: job?.closelyRelatedPercent ?? null,
        replacementRound: job?.replacementRound ?? null,
        errorMessage: job?.errorMessage ?? null,
        driveFolderLink: job?.driveFolderLink ?? null,
      } as Prisma.InputJsonValue,
    };
    if (running) {
      await db.researchRequest.update({ where: { id: running.id }, data });
    } else {
      await db.researchRequest.create({ data: { projectId, papersRequested: DEFAULT_PAPERS_REQUESTED, startedAt: job?.createdAt ?? now, ...data } });
    }
  } catch (error) {
    report("run finished", error);
  }
}
