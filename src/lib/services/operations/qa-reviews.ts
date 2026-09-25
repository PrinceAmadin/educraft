import { Prisma, type ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { transitionProject, TransitionError } from "@/lib/services/projects";
import { notifyRole, notifyUsers } from "@/lib/services/notifications";
import { checklistForTemplate, type QaChecklistDef } from "@/lib/qa-checklists";
import {
  DELIVERY_CHECKLIST,
  allDeliveryChecksPassed,
  deliveryChecklistState,
  deliveryChecksDone,
  type DeliveryChecklistState,
} from "@/lib/operations/qa-delivery-checklist";
import { writeProjectNote } from "@/lib/services/operations/project-ops";
import type { Actor } from "@/lib/services/operations/actor";
import type { QaDecisionBody } from "@/lib/validations/operations";

/**
 * The QA review queue and the human review itself (Layer 4): who reviews a
 * submitted project, the delivery checklist, and the decision that moves it
 * on. The COO assigns and monitors; a junior reviewer (a worker with
 * `isQaReviewer`) or the COO reviews.
 */

export const QA_OVERDUE_HOURS = 24;

export type QaBucket = "unassigned" | "assigned" | "reviewing" | "overdue";

export interface QaQueueOpsRow {
  id: string;
  projectId: string;
  projectTitle: string | null;
  status: "SUBMITTED" | "IN_QA_REVIEW";
  clientName: string;
  serviceName: string;
  workerName: string | null;
  submittedAt: string | null;
  deadline: string | null;
  revisionCount: number;
  reviewer: { id: string; type: string; name: string } | null;
  startedAt: string | null;
  ageHours: number;
  overdue: boolean;
  bucket: Exclude<QaBucket, "overdue">;
}

export interface QaQueueOps {
  rows: QaQueueOpsRow[];
  counts: Record<QaBucket, number>;
}

export async function listQaQueueOps(now: Date = new Date()): Promise<QaQueueOps> {
  const projects = await db.project.findMany({
    where: { status: { in: ["SUBMITTED", "IN_QA_REVIEW"] } },
    orderBy: [{ internalDeadline: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      projectId: true,
      projectTitle: true,
      status: true,
      revisionCount: true,
      internalDeadline: true,
      clientDeadline: true,
      updatedAt: true,
      client: { select: { fullName: true } },
      service: { select: { serviceName: true } },
      worker: { select: { fullName: true } },
      statusLog: { where: { toStatus: "SUBMITTED" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      qaReview: { select: { reviewerId: true, reviewerType: true, reviewerName: true, startedAt: true } },
    },
  });

  const counts: Record<QaBucket, number> = { unassigned: 0, assigned: 0, reviewing: 0, overdue: 0 };
  const rows: QaQueueOpsRow[] = projects.map((p) => {
    const submittedAt = p.statusLog[0]?.createdAt ?? p.updatedAt;
    const ageHours = Math.max(0, (now.getTime() - submittedAt.getTime()) / 3_600_000);
    const overdue = ageHours >= QA_OVERDUE_HOURS;
    const reviewer = p.qaReview?.reviewerId
      ? { id: p.qaReview.reviewerId, type: p.qaReview.reviewerType ?? "COO", name: p.qaReview.reviewerName ?? "Reviewer" }
      : null;
    const bucket: QaQueueOpsRow["bucket"] = p.status === "IN_QA_REVIEW" ? "reviewing" : reviewer ? "assigned" : "unassigned";
    counts[bucket]++;
    if (overdue) counts.overdue++;
    return {
      id: p.id,
      projectId: p.projectId,
      projectTitle: p.projectTitle,
      status: p.status as "SUBMITTED" | "IN_QA_REVIEW",
      clientName: p.client.fullName,
      serviceName: p.service.serviceName,
      workerName: p.worker?.fullName ?? null,
      submittedAt: submittedAt.toISOString(),
      deadline: (p.internalDeadline ?? p.clientDeadline)?.toISOString() ?? null,
      revisionCount: p.revisionCount,
      reviewer,
      startedAt: p.qaReview?.startedAt?.toISOString() ?? null,
      ageHours,
      overdue,
      bucket,
    };
  });
  rows.sort((a, b) => b.ageHours - a.ageHours);
  return { rows, counts };
}

// ── Reviewers ───────────────────────────────────────────────

export interface QaReviewerOption {
  id: string;
  workerId: string;
  name: string;
  currentReviews: number;
}

/** Workers designated as QA reviewers, with how many reviews each has open. */
export async function listQaReviewers(): Promise<QaReviewerOption[]> {
  const workers = await db.worker.findMany({
    where: { isQaReviewer: true, status: { in: ["Active", "On Break"] } },
    select: { id: true, workerId: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  if (workers.length === 0) return [];
  const open = await db.qaReview.groupBy({
    by: ["reviewerId"],
    where: {
      reviewerId: { in: workers.map((w) => w.id) },
      reviewerType: "WORKER",
      completedAt: null,
      project: { status: { in: ["SUBMITTED", "IN_QA_REVIEW"] } },
    },
    _count: { _all: true },
  });
  const counts = new Map(open.map((g) => [g.reviewerId, g._count._all]));
  return workers.map((w) => ({ id: w.id, workerId: w.workerId, name: w.fullName, currentReviews: counts.get(w.id) ?? 0 }));
}

async function findQaProject(idOrCode: string) {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: {
      id: true,
      projectId: true,
      status: true,
      revisionCount: true,
      worker: { select: { fullName: true, userId: true } },
      qaReview: true,
    },
  });
  if (!project) throw new TransitionError("Project not found");
  return project;
}

interface ReviewerFields {
  reviewerId: string;
  reviewerType: string;
  reviewerName: string;
  notifyUserId: string | null;
}

async function resolveReviewer(actor: Actor, reviewerId: string): Promise<ReviewerFields> {
  if (reviewerId === "self") return { reviewerId: actor.userId, reviewerType: actor.role, reviewerName: actor.name, notifyUserId: null };
  const worker = await db.worker.findUnique({
    where: { id: reviewerId },
    select: { id: true, fullName: true, isQaReviewer: true, status: true, userId: true },
  });
  if (!worker || !worker.isQaReviewer) throw new TransitionError("That worker is not a QA reviewer");
  if (worker.status !== "Active" && worker.status !== "On Break") throw new TransitionError("That reviewer is not active");
  return { reviewerId: worker.id, reviewerType: "WORKER", reviewerName: worker.fullName, notifyUserId: worker.userId };
}

/** Hands a submitted project to a reviewer (a QA-reviewer worker, or the caller). */
export async function assignReviewer(idOrCode: string, actor: Actor, reviewerId: string) {
  const project = await findQaProject(idOrCode);
  if (project.status !== "SUBMITTED" && project.status !== "IN_QA_REVIEW") {
    throw new TransitionError("Only a submitted project can be given a reviewer");
  }
  const r = await resolveReviewer(actor, reviewerId);
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.qaReview.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, reviewerId: r.reviewerId, reviewerType: r.reviewerType, reviewerName: r.reviewerName, assignedAt: now, assignedById: actor.userId },
      update: { reviewerId: r.reviewerId, reviewerType: r.reviewerType, reviewerName: r.reviewerName, assignedAt: now, assignedById: actor.userId },
    });
    await writeProjectNote(tx, project.id, { kind: "QA", actor, authorType: "SYSTEM", content: `QA reviewer assigned: ${r.reviewerName}` });
  });
  if (r.notifyUserId) {
    await notifyUsers([r.notifyUserId], {
      title: "QA review assigned to you",
      message: `${project.projectId} is waiting for your review.`,
      type: "info",
      link: `/worker/projects`,
    });
  }
  return { reviewerName: r.reviewerName, reviewerType: r.reviewerType };
}

/**
 * Starts the review: the project moves SUBMITTED → IN_QA_REVIEW. A project
 * with no reviewer yet is taken by the caller.
 */
export async function startReview(idOrCode: string, actor: Actor) {
  const project = await findQaProject(idOrCode);
  if (project.status !== "SUBMITTED" && project.status !== "IN_QA_REVIEW") throw new TransitionError("This project is not waiting for QA");
  const now = new Date();
  const existing = project.qaReview;
  const fields = existing?.reviewerId ? {} : { reviewerId: actor.userId, reviewerType: actor.role, reviewerName: actor.name, assignedAt: now, assignedById: actor.userId };
  await db.qaReview.upsert({
    where: { projectId: project.id },
    create: { projectId: project.id, ...fields, startedAt: now },
    update: { ...fields, startedAt: existing?.startedAt ?? now },
  });
  if (project.status === "SUBMITTED") {
    await db.project.update({ where: { id: project.id }, data: { qaReviewerId: actor.userId } });
    await transitionProject(project.id, "IN_QA_REVIEW", { changedById: actor.userId });
  }
  return { status: "IN_QA_REVIEW" as ProjectStatus };
}

// ── Detail ──────────────────────────────────────────────────

const detailSelect = {
  id: true,
  projectId: true,
  projectTitle: true,
  status: true,
  qaStatus: true,
  qaNotes: true,
  qaScore: true,
  qaChecklist: true,
  revisionCount: true,
  minimumPages: true,
  chapterCount: true,
  referencingStyle: true,
  internalDeadline: true,
  clientDeadline: true,
  specialInstructions: true,
  supervisorHighRisk: true,
  service: { select: { serviceName: true, intakeFormTemplate: true } },
  worker: { select: { id: true, fullName: true, workerId: true } },
  client: { select: { fullName: true, department: true } },
  files: { orderBy: { createdAt: "desc" } },
  statusLog: { where: { toStatus: "SUBMITTED" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
  qaReview: true,
} satisfies Prisma.ProjectSelect;

export type QaDetailProject = Prisma.ProjectGetPayload<{ select: typeof detailSelect }>;

export interface QaReviewDetail {
  project: QaDetailProject;
  /** The per-service content checklist (kept from the first QA screen). */
  checklist: QaChecklistDef;
  checked: Record<string, boolean>;
  /** The fixed Layer 4 delivery checklist state. */
  delivery: DeliveryChecklistState;
  deliveryDone: number;
  deliveryTotal: number;
  submittedAt: string | null;
}

export async function getQaReviewDetail(idOrCode: string): Promise<QaReviewDetail | null> {
  const project = await db.project.findFirst({ where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] }, select: detailSelect });
  if (!project) return null;
  const checklist = checklistForTemplate(project.service.intakeFormTemplate);
  const raw = (project.qaChecklist ?? {}) as Record<string, unknown>;
  const checked: Record<string, boolean> = {};
  for (const item of checklist.items) checked[item.id] = raw[item.id] === true;
  const delivery = deliveryChecklistState(project.qaReview?.deliveryChecklist);
  return {
    project,
    checklist,
    checked,
    delivery,
    deliveryDone: deliveryChecksDone(delivery),
    deliveryTotal: DELIVERY_CHECKLIST.length,
    submittedAt: project.statusLog[0]?.createdAt.toISOString() ?? null,
  };
}

// ── Checklists ──────────────────────────────────────────────

export async function saveQaChecklists(
  idOrCode: string,
  input: { checklist?: Record<string, boolean>; delivery?: Record<string, boolean> }
): Promise<{ deliveryDone: number; allChecksPassed: boolean }> {
  const project = await findQaProject(idOrCode);
  let state = deliveryChecklistState(project.qaReview?.deliveryChecklist);
  await db.$transaction(async (tx) => {
    if (input.checklist) {
      await tx.project.update({ where: { id: project.id }, data: { qaChecklist: input.checklist as Prisma.InputJsonValue } });
    }
    if (input.delivery) {
      state = deliveryChecklistState(input.delivery);
      const allChecksPassed = allDeliveryChecksPassed(state);
      await tx.qaReview.upsert({
        where: { projectId: project.id },
        create: { projectId: project.id, deliveryChecklist: state as unknown as Prisma.InputJsonValue, allChecksPassed },
        update: { deliveryChecklist: state as unknown as Prisma.InputJsonValue, allChecksPassed },
      });
    }
  });
  return { deliveryDone: deliveryChecksDone(state), allChecksPassed: allDeliveryChecksPassed(state) };
}

// ── Decision ────────────────────────────────────────────────

export type QaDecisionValue = "APPROVED" | "REVISION_NEEDED" | "MINOR_FIXES" | "ESCALATED";

const DECISION_VALUE: Record<Exclude<QaDecisionBody["decision"], "pass">, QaDecisionValue> = {
  approve: "APPROVED",
  minor_fixes: "MINOR_FIXES",
  revision: "REVISION_NEEDED",
  escalate: "ESCALATED",
};

/**
 * Records the reviewer's decision and moves the project: approve (or minor
 * fixes made by the reviewer) → APPROVED, revision → REVISION_NEEDED with
 * the notes for the worker, escalate → stays in review and the founder is
 * told. Approval needs every delivery check ticked.
 */
export async function submitQaDecisionOps(idOrCode: string, body: QaDecisionBody, actor: Actor): Promise<{ status: ProjectStatus }> {
  let project = await findQaProject(idOrCode);
  if (project.status === "SUBMITTED") {
    await startReview(project.id, actor);
    project = await findQaProject(project.id);
  }
  if (project.status !== "IN_QA_REVIEW") throw new TransitionError("This project is not in QA review");

  const decision = body.decision === "pass" ? "approve" : body.decision;
  const value = DECISION_VALUE[decision];
  const notes = body.notes?.trim() || null;
  const delivery = body.delivery ? deliveryChecklistState(body.delivery) : deliveryChecklistState(project.qaReview?.deliveryChecklist);
  const allChecksPassed = allDeliveryChecksPassed(delivery);

  if ((decision === "approve" || decision === "minor_fixes") && !allChecksPassed) {
    throw new TransitionError(
      `All ${DELIVERY_CHECKLIST.length} delivery checks must be ticked before approval (${deliveryChecksDone(delivery)} of ${DELIVERY_CHECKLIST.length} done). Tick an item that does not apply once you have confirmed that.`
    );
  }

  const now = new Date();
  const reviewerFields = project.qaReview?.reviewerId
    ? {}
    : { reviewerId: actor.userId, reviewerType: actor.role, reviewerName: actor.name, assignedAt: now, assignedById: actor.userId };

  await db.$transaction(async (tx) => {
    await tx.qaReview.upsert({
      where: { projectId: project.id },
      create: {
        projectId: project.id,
        ...reviewerFields,
        startedAt: now,
        deliveryChecklist: delivery as unknown as Prisma.InputJsonValue,
        allChecksPassed,
        decision: value,
        revisionNotes: decision === "revision" ? notes : null,
        escalationReason: decision === "escalate" ? notes : null,
        completedAt: decision === "escalate" ? null : now,
      },
      update: {
        ...reviewerFields,
        startedAt: project.qaReview?.startedAt ?? now,
        deliveryChecklist: delivery as unknown as Prisma.InputJsonValue,
        allChecksPassed,
        decision: value,
        revisionNotes: decision === "revision" ? notes : null,
        escalationReason: decision === "escalate" ? notes : null,
        completedAt: decision === "escalate" ? null : now,
      },
    });
    await tx.project.update({
      where: { id: project.id },
      data: {
        qaStatus: decision === "escalate" ? "Escalated" : decision === "revision" ? "Revision Needed" : "Passed",
        qaNotes: notes,
        qaScore: body.score ?? undefined,
        qaReviewerId: actor.userId,
        ...(body.checklist ? { qaChecklist: body.checklist as Prisma.InputJsonValue } : {}),
      },
    });
    await writeProjectNote(tx, project.id, {
      kind: "QA",
      actor,
      authorType: "SYSTEM",
      content:
        decision === "approve"
          ? "QA approved — all 16 delivery checks passed"
          : decision === "minor_fixes"
            ? `QA approved after minor fixes by the reviewer${notes ? `: ${notes.slice(0, 300)}` : ""}`
            : decision === "revision"
              ? `QA sent the work back for revision${notes ? `: ${notes.slice(0, 300)}` : ""}`
              : `QA escalated for senior review${notes ? `: ${notes.slice(0, 300)}` : ""}`,
    });
  }, { timeout: 15_000, maxWait: 10_000 });

  if (decision === "escalate") {
    await notifyRole("SUPER_ADMIN", {
      title: "QA escalated",
      message: `${project.projectId} needs a senior domain review${notes ? `: ${notes.slice(0, 140)}` : "."}`,
      type: "urgent",
      link: `/admin/qa/${project.projectId}`,
    });
    return { status: project.status };
  }

  const detail = await transitionProject(project.id, decision === "revision" ? "REVISION_NEEDED" : "APPROVED", {
    changedById: actor.userId,
    note: decision === "minor_fixes" ? `Minor fixes made by the reviewer${notes ? `: ${notes}` : ""}` : notes ?? undefined,
  });
  return { status: detail.status };
}

/** A resubmission after a revision reopens the review as the next round (the reviewer stays). */
export async function reopenQaReviewOnResubmit(tx: Prisma.TransactionClient, projectDbId: string): Promise<void> {
  const existing = await tx.qaReview.findUnique({ where: { projectId: projectDbId }, select: { id: true, round: true } });
  if (!existing) return;
  await tx.qaReview.update({
    where: { id: existing.id },
    data: { round: existing.round + 1, decision: null, completedAt: null, startedAt: null, deliveryChecklist: Prisma.JsonNull, allChecksPassed: false },
  });
}

/** Makes (or unmakes) a worker a junior QA reviewer. */
export async function setQaReviewer(workerId: string, actor: Actor, isQaReviewer: boolean) {
  const worker = await db.worker.findUnique({ where: { id: workerId }, select: { id: true, fullName: true, isQaReviewer: true, userId: true } });
  if (!worker) throw new TransitionError("Worker not found");
  await db.$transaction([
    db.worker.update({ where: { id: worker.id }, data: { isQaReviewer, qaReviewerSince: isQaReviewer ? new Date() : null } }),
    db.workerNote.create({
      data: {
        workerId: worker.id,
        kind: "QA_REVIEWER",
        content: isQaReviewer ? "Designated as a junior QA reviewer" : "No longer a QA reviewer",
        authorId: actor.userId,
        authorName: actor.name,
      },
    }),
  ]);
  if (worker.userId && isQaReviewer) {
    await notifyUsers([worker.userId], { title: "You are now a QA reviewer", message: "The COO can assign you projects to review.", type: "info" });
  }
  return { isQaReviewer };
}
