import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { transitionProject, TransitionError } from "@/lib/services/projects";
import { notifyAdmins } from "@/lib/services/notifications";
import { checklistForTemplate, type QaChecklistDef } from "@/lib/qa-checklists";
import type { QaDecisionInput } from "@/lib/validations/qa";

// ── Queue ────────────────────────────────────────────────────

export interface QaQueueRow {
  id: string;
  projectId: string;
  projectTitle: string | null;
  status: "SUBMITTED" | "IN_QA_REVIEW";
  serviceName: string;
  workerName: string | null;
  submittedAt: string | null;
  deadline: string | null;
  revisionCount: number;
}

export async function listQaQueue(): Promise<QaQueueRow[]> {
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
      service: { select: { serviceName: true } },
      worker: { select: { fullName: true } },
      statusLog: {
        where: { toStatus: "SUBMITTED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  return projects.map((p) => ({
    id: p.id,
    projectId: p.projectId,
    projectTitle: p.projectTitle,
    status: p.status as "SUBMITTED" | "IN_QA_REVIEW",
    serviceName: p.service.serviceName,
    workerName: p.worker?.fullName ?? null,
    submittedAt: p.statusLog[0]?.createdAt.toISOString() ?? null,
    deadline: (p.internalDeadline ?? p.clientDeadline)?.toISOString() ?? null,
    revisionCount: p.revisionCount,
  }));
}

// ── Review ───────────────────────────────────────────────────

const reviewSelect = {
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
  service: { select: { serviceName: true, intakeFormTemplate: true } },
  worker: { select: { fullName: true, workerId: true } },
  client: { select: { fullName: true, department: true } },
  files: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.ProjectSelect;

export type QaReviewProject = Prisma.ProjectGetPayload<{ select: typeof reviewSelect }>;

export interface QaReview {
  project: QaReviewProject;
  checklist: QaChecklistDef;
  checked: Record<string, boolean>;
}

export async function getQaReview(idOrCode: string): Promise<QaReview | null> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: reviewSelect,
  });
  if (!project) return null;

  const checklist = checklistForTemplate(project.service.intakeFormTemplate);
  const raw = (project.qaChecklist ?? {}) as Record<string, unknown>;
  const checked: Record<string, boolean> = {};
  for (const item of checklist.items) checked[item.id] = raw[item.id] === true;

  return { project, checklist, checked };
}

// ── Mutations ────────────────────────────────────────────────

export async function startQaReview(idOrCode: string, reviewerId: string): Promise<void> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true, status: true },
  });
  if (!project) throw new TransitionError("Project not found");
  if (project.status === "IN_QA_REVIEW") return;
  if (project.status !== "SUBMITTED") {
    throw new TransitionError("This project is not waiting for QA");
  }

  await db.project.update({ where: { id: project.id }, data: { qaReviewerId: reviewerId } });
  await transitionProject(project.id, "IN_QA_REVIEW", { changedById: reviewerId });
}

export async function saveChecklist(
  idOrCode: string,
  checklist: Record<string, boolean>
): Promise<void> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true },
  });
  if (!project) throw new TransitionError("Project not found");
  await db.project.update({
    where: { id: project.id },
    data: { qaChecklist: checklist as Prisma.InputJsonValue },
  });
}

export interface QaDecisionResult {
  status: string;
}

export async function submitQaDecision(
  idOrCode: string,
  input: QaDecisionInput,
  reviewerId: string
): Promise<QaDecisionResult> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true, projectId: true, status: true },
  });
  if (!project) throw new TransitionError("Project not found");
  if (project.status !== "IN_QA_REVIEW") {
    throw new TransitionError("This project is not in QA review");
  }

  const notes = input.notes?.trim() || null;

  if (input.decision === "escalate") {
    await db.project.update({
      where: { id: project.id },
      data: {
        qaStatus: "Escalated",
        qaNotes: notes,
        qaReviewerId: reviewerId,
        ...(input.checklist ? { qaChecklist: input.checklist as Prisma.InputJsonValue } : {}),
      },
    });
    await notifyAdmins({
      title: "QA escalated",
      message: `${project.projectId} was escalated by QA${notes ? `: ${notes}` : "."}`,
      type: "urgent",
      link: `/admin/projects/${project.projectId}`,
    });
    return { status: project.status };
  }

  // pass / revision both write QA fields first, then move the project.
  await db.project.update({
    where: { id: project.id },
    data: {
      qaStatus: input.decision === "pass" ? "Passed" : "Revision Needed",
      qaNotes: notes,
      qaScore: input.score ?? undefined,
      qaReviewerId: reviewerId,
      ...(input.checklist ? { qaChecklist: input.checklist as Prisma.InputJsonValue } : {}),
    },
  });

  const detail = await transitionProject(
    project.id,
    input.decision === "pass" ? "APPROVED" : "REVISION_NEEDED",
    { changedById: reviewerId, note: notes ?? undefined }
  );

  return { status: detail.status };
}
