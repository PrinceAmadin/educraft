import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sqlTable } from "@/lib/db-schema";
import { notifyAdmins, notifyUsers } from "@/lib/services/notifications";

/*
 * Rationing for research runs. Each run spends Claude credits, so:
 *   - a project's first run is free (the worker needs it to do the job),
 *   - its first re-run is free too (a genuine second look at a bad result),
 *   - every re-run after that needs a written reason and a manager's approval,
 *     and an approval is good for one run within APPROVAL_WINDOW_HOURS.
 *
 * Enforced here, on the server, at the moment a run is claimed — the panel
 * only mirrors it. The claim is taken under a row lock on the project, so two
 * simultaneous clicks can't both slip through on the same allowance.
 */

export const FREE_RERUNS = 1;
export const APPROVAL_WINDOW_HOURS = 24;
export const MIN_REASON_LENGTH = 15;
export const MAX_REASON_LENGTH = 500;

export class ResearchApprovalRequiredError extends Error {
  constructor() {
    super("Another re-run needs a manager's approval. Send a request explaining why.");
  }
}

/** A request that can't be made or reviewed in the state it's in. */
export class RerunRequestError extends Error {}

// ── State (what the worker's panel shows) ────────────────────

export type RerunRequestView = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  reason: string;
  reviewNote: string | null;
  approvedUntil: string | null;
  createdAt: string;
};

export interface RerunState {
  rerunsUsed: number;
  freeRerunsLeft: number;
  /** True when the next re-run can't start without an approved request. */
  needsApproval: boolean;
  /** The latest request that's still relevant (not yet consumed by a run). */
  request: RerunRequestView | null;
}

export async function getRerunState(projectDbId: string): Promise<RerunState> {
  const [rerunsUsed, latest] = await Promise.all([
    db.researchRunLog.count({ where: { projectId: projectDbId, kind: "RERUN" } }),
    db.researchRerunRequest.findFirst({
      where: { projectId: projectDbId, status: { not: "USED" } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const freeRerunsLeft = Math.max(FREE_RERUNS - rerunsUsed, 0);
  let request: RerunRequestView | null = null;
  if (latest) {
    const expired = latest.status === "APPROVED" && latest.approvedUntil !== null && latest.approvedUntil < new Date();
    request = {
      id: latest.id,
      status: expired ? "EXPIRED" : (latest.status as "PENDING" | "APPROVED" | "REJECTED"),
      reason: latest.reason,
      reviewNote: latest.reviewNote,
      approvedUntil: latest.approvedUntil?.toISOString() ?? null,
      createdAt: latest.createdAt.toISOString(),
    };
  }
  return { rerunsUsed, freeRerunsLeft, needsApproval: freeRerunsLeft === 0, request };
}

// ── Claiming a run ───────────────────────────────────────────

export interface RunClaim {
  logId: string;
  /** The approved request this run consumed, if it needed one. */
  requestId: string | null;
}

/**
 * Takes one run's worth of allowance, or throws ResearchApprovalRequiredError.
 * A project with no job and no history is an initial run (always free);
 * anything else is a re-run.
 */
export async function claimRun(projectDbId: string, userId: string): Promise<RunClaim> {
  return db.$transaction(async (tx) => {
    // Serialise claims per project — without this, two clicks at once would
    // both read "one free re-run left".
    await tx.$queryRaw`SELECT id FROM ${sqlTable("Project")} WHERE id = ${projectDbId} FOR UPDATE`;

    const [runsStarted, reruns, jobExists] = await Promise.all([
      tx.researchRunLog.count({ where: { projectId: projectDbId } }),
      tx.researchRunLog.count({ where: { projectId: projectDbId, kind: "RERUN" } }),
      tx.researchJob.count({ where: { projectId: projectDbId } }),
    ]);

    const initial = runsStarted === 0 && jobExists === 0;
    let requestId: string | null = null;

    if (!initial && reruns >= FREE_RERUNS) {
      const now = new Date();
      const approved = await tx.researchRerunRequest.findFirst({
        where: { projectId: projectDbId, status: "APPROVED", approvedUntil: { gte: now } },
        orderBy: { reviewedAt: "asc" },
      });
      if (!approved) throw new ResearchApprovalRequiredError();
      await tx.researchRerunRequest.update({
        where: { id: approved.id },
        data: { status: "USED", usedAt: now },
      });
      requestId = approved.id;
    }

    const log = await tx.researchRunLog.create({
      data: { projectId: projectDbId, startedById: userId, kind: initial ? "INITIAL" : "RERUN", requestId },
      select: { id: true },
    });
    return { logId: log.id, requestId };
    // Waiting on the row lock plus a handful of round-trips to a remote
    // database can outrun Prisma's 5s default; a timed-out claim would surface
    // as a raw database error instead of "needs approval".
  }, { maxWait: 15_000, timeout: 30_000 });
}

/** Gives a claim back when the run it was for couldn't actually start. */
export async function releaseClaim(claim: RunClaim): Promise<void> {
  await db.researchRunLog.deleteMany({ where: { id: claim.logId } }).catch(() => {});
  if (claim.requestId) {
    await db.researchRerunRequest
      .updateMany({ where: { id: claim.requestId, status: "USED" }, data: { status: "APPROVED", usedAt: null } })
      .catch(() => {});
  }
}

// ── Requests ─────────────────────────────────────────────────

export async function requestRerun(input: {
  workerId: string;
  userId: string;
  projectDbId: string;
  projectCode: string;
  reason: string;
}): Promise<void> {
  const reason = input.reason.trim();
  if (reason.length < MIN_REASON_LENGTH) {
    throw new RerunRequestError(`Please explain why in at least ${MIN_REASON_LENGTH} characters.`);
  }
  if (reason.length > MAX_REASON_LENGTH) {
    throw new RerunRequestError(`Please keep the reason under ${MAX_REASON_LENGTH} characters.`);
  }

  const state = await getRerunState(input.projectDbId);
  if (!state.needsApproval) {
    throw new RerunRequestError("You still have a free re-run on this project — no approval needed.");
  }
  if (state.request?.status === "PENDING") {
    throw new RerunRequestError("A request for this project is already waiting for a manager.");
  }
  if (state.request?.status === "APPROVED") {
    throw new RerunRequestError("This project already has an approved re-run — use it before it expires.");
  }

  await db.researchRerunRequest.create({
    data: { projectId: input.projectDbId, requestedById: input.userId, reason },
  });

  const worker = await db.worker.findUnique({ where: { id: input.workerId }, select: { fullName: true } });
  await notifyAdmins({
    title: "Research re-run needs approval",
    message: `${worker?.fullName ?? "A worker"} asked to re-run research on ${input.projectCode}: "${reason.slice(0, 120)}${reason.length > 120 ? "…" : ""}"`,
    type: "warning",
    link: "/admin/research-requests",
  });
}

export async function reviewRerunRequest(input: {
  requestId: string;
  reviewerId: string;
  decision: "approve" | "reject";
  note?: string;
}): Promise<void> {
  const note = input.note?.trim() || null;
  if (input.decision === "reject" && !note) {
    throw new RerunRequestError("Say why you're declining, so the worker knows what to change.");
  }

  const request = await db.researchRerunRequest.findUnique({
    where: { id: input.requestId },
    select: { id: true, status: true, requestedById: true, project: { select: { projectId: true } } },
  });
  if (!request) throw new RerunRequestError("Request not found");
  if (request.status !== "PENDING") throw new RerunRequestError("This request has already been reviewed.");

  const now = new Date();
  const data: Prisma.ResearchRerunRequestUncheckedUpdateManyInput =
    input.decision === "approve"
      ? { status: "APPROVED", reviewedById: input.reviewerId, reviewNote: note, reviewedAt: now, approvedUntil: new Date(now.getTime() + APPROVAL_WINDOW_HOURS * 3_600_000) }
      : { status: "REJECTED", reviewedById: input.reviewerId, reviewNote: note, reviewedAt: now };

  // The status check makes a double click (or two managers) a no-op the second time.
  const updated = await db.researchRerunRequest.updateMany({
    where: { id: request.id, status: "PENDING" },
    data,
  });
  if (updated.count === 0) throw new RerunRequestError("This request has already been reviewed.");

  const code = request.project.projectId;
  await notifyUsers([request.requestedById], {
    title: input.decision === "approve" ? "Re-run approved" : "Re-run declined",
    message:
      input.decision === "approve"
        ? `${code}: you can re-run research now. The approval lasts ${APPROVAL_WINDOW_HOURS} hours.`
        : `${code}: ${note}`,
    type: input.decision === "approve" ? "success" : "warning",
    link: `/worker/projects/${code}`,
  });
}

// ── Admin queue ──────────────────────────────────────────────

export interface RerunRequestRow {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "USED" | "EXPIRED";
  reason: string;
  reviewNote: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  approvedUntil: Date | null;
  projectCode: string;
  projectTitle: string | null;
  workerName: string;
  reviewerName: string | null;
  rerunsUsed: number;
  /** The current research is shown in the client's dashboard: a re-run removes it until shared again. */
  sharedWithClient: boolean;
}

export async function listRerunRequests(): Promise<{ pending: RerunRequestRow[]; recent: RerunRequestRow[] }> {
  const rows = await db.researchRerunRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      project: {
        select: { id: true, projectId: true, projectTitle: true, researchJob: { select: { releasedToClientAt: true } } },
      },
      requestedBy: { select: { displayName: true, email: true, workerProfile: { select: { fullName: true } } } },
      reviewedBy: { select: { displayName: true, email: true } },
    },
  });

  const projectIds = Array.from(new Set(rows.map((r) => r.project.id)));
  const counts = projectIds.length
    ? await db.researchRunLog.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projectIds }, kind: "RERUN" },
        _count: { _all: true },
      })
    : [];
  const rerunsByProject = new Map(counts.map((c) => [c.projectId, c._count._all]));

  const now = new Date();
  const mapped: RerunRequestRow[] = rows.map((r) => ({
    id: r.id,
    status: r.status === "APPROVED" && r.approvedUntil && r.approvedUntil < now ? "EXPIRED" : r.status,
    reason: r.reason,
    reviewNote: r.reviewNote,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    approvedUntil: r.approvedUntil,
    projectCode: r.project.projectId,
    projectTitle: r.project.projectTitle,
    workerName: r.requestedBy.workerProfile?.fullName ?? r.requestedBy.displayName ?? r.requestedBy.email,
    reviewerName: r.reviewedBy ? (r.reviewedBy.displayName ?? r.reviewedBy.email) : null,
    rerunsUsed: rerunsByProject.get(r.project.id) ?? 0,
    sharedWithClient: Boolean(r.project.researchJob?.releasedToClientAt),
  }));

  return {
    pending: mapped.filter((r) => r.status === "PENDING").reverse(),
    recent: mapped.filter((r) => r.status !== "PENDING").slice(0, 25),
  };
}

export async function countPendingRerunRequests(): Promise<number> {
  return db.researchRerunRequest.count({ where: { status: "PENDING" } });
}
