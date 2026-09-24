import { db } from "@/lib/db";
import { TransitionError } from "@/lib/services/projects";
import { APPROVAL_WINDOW_HOURS, RerunRequestError, reviewRerunRequest } from "@/lib/services/research-runs";
import { estimateEta, type EtaJob } from "@/lib/research-eta";
import { RESEARCH_SUBSYSTEM } from "@/lib/services/operations/research-ledger";
import type { Actor } from "@/lib/services/operations/actor";

/**
 * Research approvals for the COO: every research run (pending approval,
 * running, complete, failed) with what it found and what it cost, the
 * approve / deny acts, and a live progress view of a running pipeline.
 */

export type ResearchRequestStatus = "PENDING" | "APPROVED" | "DENIED" | "RUNNING" | "COMPLETE" | "FAILED";

export interface CostEstimate {
  low: number;
  high: number;
  /** How many finished runs the estimate rests on. */
  basis: number;
  scope: "department" | "overall";
}

export interface ResearchRequestRow {
  id: string;
  status: ResearchRequestStatus;
  projectDbId: string;
  projectCode: string;
  projectTitle: string | null;
  clientName: string;
  department: string;
  papersRequested: number;
  workerName: string | null;
  requestedAt: string;
  reason: string | null;
  approvedAt: string | null;
  deniedAt: string | null;
  denialReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  totalReferences: number | null;
  openAccessCount: number | null;
  paywalledCount: number | null;
  actualCostNaira: number | null;
  costEstimate: CostEstimate | null;
  /** The live job's status while the run is on (null once finished or before it starts). */
  jobStatus: string | null;
  driveFolderLink: string | null;
  /** True while the row is PENDING and the rationing record can still be reviewed. */
  canReview: boolean;
  /** An approval that lapsed unused. */
  expired: boolean;
  /** The rationing record this row mirrors, when the run needed approval. */
  rerunRequestId: string | null;
}

const STATUS_ORDER: Record<ResearchRequestStatus, number> = { PENDING: 0, RUNNING: 1, APPROVED: 2, COMPLETE: 3, FAILED: 4, DENIED: 5 };

function normDept(d: string | null | undefined): string {
  return (d ?? "").trim().toLowerCase();
}

/**
 * What a run costs in Claude credits: the average of finished runs in the
 * same department (when there are at least two), else of every finished
 * run; shown as a ±25% range. Null until any run has finished.
 */
export async function researchCostEstimates(): Promise<{ byDepartment: Map<string, CostEstimate>; overall: CostEstimate | null }> {
  const done = await db.researchRequest.findMany({
    where: { status: "COMPLETE", actualCostNaira: { not: null } },
    select: { actualCostNaira: true, project: { select: { client: { select: { department: true } } } } },
    take: 500,
    orderBy: { completedAt: "desc" },
  });
  const range = (values: number[], scope: CostEstimate["scope"]): CostEstimate | null => {
    if (values.length === 0) return null;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return { low: Math.round(avg * 0.75), high: Math.round(avg * 1.25), basis: values.length, scope };
  };
  const overall = range(done.map((d) => d.actualCostNaira as number), "overall");
  const byDept = new Map<string, number[]>();
  for (const d of done) {
    const key = normDept(d.project.client.department);
    if (!key) continue;
    byDept.set(key, [...(byDept.get(key) ?? []), d.actualCostNaira as number]);
  }
  const byDepartment = new Map<string, CostEstimate>();
  for (const [key, values] of byDept) {
    if (values.length >= 2) {
      const r = range(values, "department");
      if (r) byDepartment.set(key, r);
    }
  }
  return { byDepartment, overall };
}

export async function listResearchRequests(filter?: { status?: string }, now: Date = new Date()): Promise<ResearchRequestRow[]> {
  const statuses = filter?.status
    ? filter.status
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s): s is ResearchRequestStatus => s in STATUS_ORDER)
    : null;
  const [rows, estimates] = await Promise.all([
    db.researchRequest.findMany({
      where: statuses && statuses.length ? { status: { in: statuses } } : undefined,
      orderBy: { createdAt: "desc" },
      take: 150,
      include: {
        project: {
          select: {
            id: true,
            projectId: true,
            projectTitle: true,
            client: { select: { fullName: true, department: true } },
            researchJob: { select: { status: true, driveFolderLink: true } },
          },
        },
        worker: { select: { fullName: true } },
      },
    }),
    researchCostEstimates(),
  ]);
  const approvedIds = rows.filter((r) => r.status === "APPROVED" && r.rerunRequestId).map((r) => r.rerunRequestId as string);
  const rationing = approvedIds.length
    ? await db.researchRerunRequest.findMany({ where: { id: { in: approvedIds } }, select: { id: true, approvedUntil: true, status: true } })
    : [];
  const rationingById = new Map(rationing.map((r) => [r.id, r]));

  const mapped: ResearchRequestRow[] = rows.map((r) => {
    const dept = r.project.client.department;
    const estimate = estimates.byDepartment.get(normDept(dept)) ?? estimates.overall;
    const rr = r.rerunRequestId ? rationingById.get(r.rerunRequestId) : undefined;
    const expired = r.status === "APPROVED" && rr?.approvedUntil != null && rr.approvedUntil < now;
    const running = r.status === "RUNNING";
    return {
      id: r.id,
      status: r.status as ResearchRequestStatus,
      projectDbId: r.project.id,
      projectCode: r.project.projectId,
      projectTitle: r.project.projectTitle,
      clientName: r.project.client.fullName,
      department: dept,
      papersRequested: r.papersRequested,
      workerName: r.worker?.fullName ?? null,
      requestedAt: r.createdAt.toISOString(),
      reason: r.reason,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      deniedAt: r.deniedAt?.toISOString() ?? null,
      denialReason: r.denialReason,
      startedAt: r.startedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      totalReferences: r.totalReferences,
      openAccessCount: r.openAccessCount,
      paywalledCount: r.paywalledCount,
      actualCostNaira: r.actualCostNaira,
      costEstimate: r.status === "COMPLETE" || r.status === "FAILED" ? null : estimate,
      jobStatus: running ? r.project.researchJob?.status ?? null : null,
      driveFolderLink: r.status === "COMPLETE" ? (r.project.researchJob?.driveFolderLink ?? null) : null,
      canReview: r.status === "PENDING" && r.rerunRequestId != null,
      expired,
      rerunRequestId: r.rerunRequestId,
    };
  });
  mapped.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.requestedAt < b.requestedAt ? 1 : -1));
  return mapped;
}

export async function countPendingResearchRequests(): Promise<number> {
  return db.researchRequest.count({ where: { status: "PENDING" } });
}

// ── Approve / deny ──────────────────────────────────────────

async function findReviewable(id: string) {
  const row = await db.researchRequest.findUnique({ where: { id }, select: { id: true, status: true, rerunRequestId: true } });
  if (!row) throw new TransitionError("Request not found");
  if (row.status !== "PENDING" || !row.rerunRequestId) throw new TransitionError("This request is not waiting for approval");
  return row;
}

/** Approves the re-run: the worker can start it within the approval window. */
export async function approveResearchRequest(id: string, actor: Actor) {
  const row = await findReviewable(id);
  try {
    await reviewRerunRequest({ requestId: row.rerunRequestId as string, reviewerId: actor.userId, decision: "approve" });
  } catch (error) {
    if (error instanceof RerunRequestError) throw new TransitionError(error.message);
    throw error;
  }
  return { status: "APPROVED" as const, approvalWindowHours: APPROVAL_WINDOW_HOURS };
}

export async function denyResearchRequest(id: string, actor: Actor, reason: string) {
  const row = await findReviewable(id);
  try {
    await reviewRerunRequest({ requestId: row.rerunRequestId as string, reviewerId: actor.userId, decision: "reject", note: reason });
  } catch (error) {
    if (error instanceof RerunRequestError) throw new TransitionError(error.message);
    throw error;
  }
  return { status: "DENIED" as const };
}

// ── Progress ────────────────────────────────────────────────

export type StepState = "done" | "running" | "waiting" | "failed";

export interface ResearchProgress {
  id: string;
  status: ResearchRequestStatus;
  jobStatus: string | null;
  done: boolean;
  failed: boolean;
  steps: { key: string; label: string; state: StepState; detail: string }[];
  counts: { candidates: number; openAccess: number; paywalled: number; kept: number; core: number; closelyRelated: number; uploaded: number };
  replacementRound: number;
  etaSeconds: number | null;
  errorMessage: string | null;
  driveFolderLink: string | null;
  actualCostNaira: number | null;
  totalReferences: number | null;
}

const ORDER = ["FINDING_CANDIDATES", "RESOLVING_PDFS", "CLASSIFYING", "UPLOADING_DRIVE", "PASSED"] as const;

function stageIndex(status: string): number {
  switch (status) {
    case "FINDING_CANDIDATES":
    case "REPLACING":
      return 0;
    case "VERIFYING_DOIS":
    case "RESOLVING_PDFS":
    case "IMPORTING_ZOTERO":
      return 1;
    case "CLASSIFYING":
      return 2;
    case "UPLOADING_DRIVE":
      return 3;
    case "PASSED":
      return 4;
    default:
      return -1;
  }
}

export async function getResearchProgress(id: string): Promise<ResearchProgress> {
  const row = await db.researchRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      projectId: true,
      actualCostNaira: true,
      totalReferences: true,
      openAccessCount: true,
      paywalledCount: true,
      pipelineLog: true,
      startedAt: true,
      project: {
        select: {
          researchJob: {
            select: {
              id: true,
              status: true,
              replacementRound: true,
              searchQueries: true,
              searchCursor: true,
              errorMessage: true,
              driveFolderLink: true,
              createdAt: true,
              references: { select: { status: true, round: true, doi: true, access: true, classification: true, driveFileId: true } },
            },
          },
        },
      },
    },
  });
  if (!row) throw new TransitionError("Request not found");
  const status = row.status as ResearchRequestStatus;
  const log = (row.pipelineLog ?? {}) as { errorMessage?: string | null; driveFolderLink?: string | null };

  // The project's current job belongs to this run only if it started with it: a
  // re-run deletes the job and makes a new one, and an older run must then show its
  // own stored results rather than the new job's numbers.
  const liveJob = row.project.researchJob;
  const sameRun = liveJob != null && row.startedAt != null && Math.abs(liveJob.createdAt.getTime() - row.startedAt.getTime()) < SAME_RUN_WINDOW_MS;
  const job = sameRun ? liveJob : null;
  const refs = job?.references ?? [];

  const counts = job
    ? {
        candidates: refs.length,
        openAccess: refs.filter((r) => r.access === "OPEN_ACCESS").length,
        paywalled: refs.filter((r) => r.access === "PAYWALLED").length,
        kept: refs.filter((r) => r.status === "KEPT").length,
        core: refs.filter((r) => r.status === "KEPT" && r.classification === "CORE").length,
        closelyRelated: refs.filter((r) => r.status === "KEPT" && r.classification === "CLOSELY_RELATED").length,
        uploaded: refs.filter((r) => r.status === "KEPT" && r.driveFileId && r.driveFileId !== "SKIPPED").length,
      }
    : {
        candidates: 0,
        openAccess: row.openAccessCount ?? 0,
        paywalled: row.paywalledCount ?? 0,
        kept: row.totalReferences ?? 0,
        core: 0,
        closelyRelated: 0,
        uploaded: row.openAccessCount ?? 0,
      };

  const jobStatus = job?.status ?? null;
  const failed = status === "FAILED" || jobStatus === "FAILED_NEEDS_REVIEW";
  const done = status === "COMPLETE" || jobStatus === "PASSED";
  const current = jobStatus ? stageIndex(jobStatus) : -1;
  const state = (i: number): StepState => {
    if (done) return "done";
    if (!job) return "waiting";
    if (failed) return i < current ? "done" : i === current ? "failed" : "waiting";
    return i < current ? "done" : i === current ? "running" : "waiting";
  };
  const stored = !job && (done || failed);
  const errorMessage = job?.errorMessage ?? log.errorMessage ?? null;
  const steps: ResearchProgress["steps"] = [
    {
      key: "search",
      label: "Search academic databases (OpenAlex)",
      state: state(0),
      detail: stored ? "Finished" : `${counts.candidates} candidates${job?.searchQueries.length ? ` · ${Math.min(job.searchCursor, job.searchQueries.length)}/${job.searchQueries.length} queries` : ""}`,
    },
    { key: "pdfs", label: "Check which papers have free PDFs (Track A / Track B)", state: state(1), detail: `${counts.openAccess} open access · ${counts.paywalled} paywalled` },
    {
      key: "relevance",
      label: "Relevance classification (Tier 2)",
      state: state(2),
      detail: stored ? `${counts.kept} kept` : `${counts.kept} kept · ${counts.core} core · ${counts.closelyRelated} closely related${job && job.replacementRound > 0 ? ` · replacement round ${job.replacementRound}` : ""}`,
    },
    { key: "drive", label: "Save PDFs and the reference list to Drive", state: state(3), detail: `${counts.uploaded} PDFs uploaded` },
    {
      key: "final",
      label: "Verified references",
      state: done ? "done" : failed ? "failed" : "waiting",
      detail: done
        ? `${row.totalReferences ?? counts.kept} total: ${row.openAccessCount ?? counts.uploaded} with PDFs + ${row.paywalledCount ?? counts.kept - counts.uploaded} paywalled`
        : failed
          ? errorMessage ?? "The pipeline stopped and needs review"
          : "Waiting",
    },
  ];

  let etaSeconds: number | null = null;
  if (job && !done && !failed) {
    try {
      const eta = estimateEta({
        status: job.status,
        replacementRound: job.replacementRound,
        searchQueries: job.searchQueries,
        searchCursor: job.searchCursor,
        references: refs.map((r) => ({ status: r.status, round: r.round, doi: r.doi, access: r.access, classification: r.classification, driveFileId: r.driveFileId })),
      } satisfies EtaJob);
      etaSeconds = eta?.remainingSeconds ?? null;
    } catch {
      etaSeconds = null;
    }
  }

  // Cost so far, for a run still going: the Claude calls on this project since it started.
  let actualCostNaira = row.actualCostNaira;
  if (actualCostNaira == null && row.startedAt) {
    const cost = await db.aiUsageLog.aggregate({
      where: { projectId: row.projectId, subsystem: RESEARCH_SUBSYSTEM, createdAt: { gte: row.startedAt } },
      _sum: { costNaira: true },
    });
    actualCostNaira = Math.round((cost._sum.costNaira ?? 0) * 100) / 100;
  }

  return {
    id: row.id,
    status,
    jobStatus,
    done,
    failed,
    steps,
    counts,
    replacementRound: job?.replacementRound ?? 0,
    etaSeconds,
    errorMessage,
    driveFolderLink: job?.driveFolderLink ?? log.driveFolderLink ?? null,
    actualCostNaira,
    totalReferences: row.totalReferences ?? (done ? counts.kept : null),
  };
}

/** A run's job is created seconds after the run is claimed; anything further apart is a different run. */
const SAME_RUN_WINDOW_MS = 10 * 60_000;

/** Order of the pipeline stages, for anything that wants to render them without a row. */
export const RESEARCH_STAGE_ORDER = ORDER;
