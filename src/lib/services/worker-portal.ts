import { Prisma, type ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { transitionProject, TransitionError } from "@/lib/services/projects";
import {
  workerMetrics,
  WORKER_ACTIVE_STATUSES,
  type WorkerProjectFacts,
} from "@/lib/worker-metrics";
import type { SubmitWorkInput } from "@/lib/validations/worker";

/** The Worker row for the signed-in worker user. */
export async function getWorkerByUserId(userId: string) {
  return db.worker.findUnique({ where: { userId } });
}

const factSelect = {
  status: true,
  revisionCount: true,
  qaScore: true,
  assignedDate: true,
  deliveryDate: true,
  internalDeadline: true,
  workerPayout: true,
  workerPayoutPaid: true,
} satisfies Prisma.ProjectSelect;

function toFacts(
  rows: Prisma.ProjectGetPayload<{ select: typeof factSelect }>[]
): WorkerProjectFacts[] {
  return rows.map((r) => ({
    status: r.status,
    revisionCount: r.revisionCount,
    qaScore: r.qaScore,
    assignedDate: r.assignedDate,
    deliveryDate: r.deliveryDate,
    internalDeadline: r.internalDeadline,
    workerPayout: r.workerPayout,
    workerPayoutPaid: r.workerPayoutPaid,
  }));
}

// ── Dashboard ────────────────────────────────────────────────

export interface WorkerAssignmentRow {
  id: string;
  projectId: string;
  projectTitle: string | null;
  status: ProjectStatus;
  serviceName: string;
  clientName: string;
  deadline: string | null;
}

export interface WorkerDashboard {
  name: string;
  stats: {
    activeAssignments: number;
    completedThisMonth: number;
    earningsThisMonth: number;
    rating: number | null;
  };
  assignments: WorkerAssignmentRow[];
}

export async function getWorkerDashboard(workerId: string): Promise<WorkerDashboard> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const worker = await db.worker.findUniqueOrThrow({
    where: { id: workerId },
    select: {
      fullName: true,
      maxConcurrentProjects: true,
      projects: {
        select: {
          ...factSelect,
          id: true,
          projectId: true,
          projectTitle: true,
          clientDeadline: true,
          finalCompletionDate: true,
          service: { select: { serviceName: true } },
          client: { select: { fullName: true } },
        },
      },
    },
  });

  const metrics = workerMetrics(toFacts(worker.projects), worker.maxConcurrentProjects);

  const completedThisMonth = worker.projects.filter(
    (p) =>
      p.status === "COMPLETED" &&
      p.finalCompletionDate != null &&
      p.finalCompletionDate >= monthStart
  ).length;

  // Earnings recognised in the month a project completes.
  const earningsThisMonth = worker.projects
    .filter(
      (p) =>
        p.status === "COMPLETED" &&
        p.finalCompletionDate != null &&
        p.finalCompletionDate >= monthStart
    )
    .reduce((s, p) => s + (p.workerPayout ?? 0), 0);

  const assignments: WorkerAssignmentRow[] = worker.projects
    .filter((p) => WORKER_ACTIVE_STATUSES.includes(p.status))
    .map((p) => ({
      id: p.id,
      projectId: p.projectId,
      projectTitle: p.projectTitle,
      status: p.status,
      serviceName: p.service.serviceName,
      clientName: p.client.fullName,
      deadline: (p.internalDeadline ?? p.clientDeadline)?.toISOString() ?? null,
    }))
    .sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline.localeCompare(b.deadline);
    });

  return {
    name: worker.fullName,
    stats: {
      activeAssignments: metrics.activeProjects,
      completedThisMonth,
      earningsThisMonth,
      rating: metrics.rating,
    },
    assignments,
  };
}

// ── Assignment list + detail ─────────────────────────────────

export async function listWorkerProjects(workerId: string): Promise<WorkerAssignmentRow[]> {
  const projects = await db.project.findMany({
    where: { workerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      projectId: true,
      projectTitle: true,
      status: true,
      internalDeadline: true,
      clientDeadline: true,
      service: { select: { serviceName: true } },
      client: { select: { fullName: true } },
    },
  });

  return projects.map((p) => ({
    id: p.id,
    projectId: p.projectId,
    projectTitle: p.projectTitle,
    status: p.status,
    serviceName: p.service.serviceName,
    clientName: p.client.fullName,
    deadline: (p.internalDeadline ?? p.clientDeadline)?.toISOString() ?? null,
  }));
}

const assignmentSelect = {
  id: true,
  projectId: true,
  projectTitle: true,
  status: true,
  matricNumber: true,
  supervisorName: true,
  hodName: true,
  projectType: true,
  chapterCount: true,
  referencingStyle: true,
  dataRequirements: true,
  minimumPages: true,
  departmentOutline: true,
  specialInstructions: true,
  additionalData: true,
  internalDeadline: true,
  clientDeadline: true,
  deadlinePausedAt: true,
  workerAccepted: true,
  qaStatus: true,
  qaNotes: true,
  revisionCount: true,
  service: { select: { serviceName: true, estimatedDays: true } },
  client: { select: { fullName: true, department: true, university: { select: { abbreviation: true } } } },
  files: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.ProjectSelect;

export type WorkerAssignment = Prisma.ProjectGetPayload<{ select: typeof assignmentSelect }>;

/** Scoped to the worker — returns null if the project isn't theirs. */
export async function getWorkerAssignment(
  workerId: string,
  idOrCode: string
): Promise<WorkerAssignment | null> {
  return db.project.findFirst({
    where: { workerId, OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: assignmentSelect,
  });
}

// ── Actions ──────────────────────────────────────────────────

export async function acceptAssignment(
  workerId: string,
  idOrCode: string,
  userId: string
): Promise<void> {
  const project = await db.project.findFirst({
    where: { workerId, OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true, status: true },
  });
  if (!project) throw new TransitionError("Assignment not found");
  if (project.status !== "ASSIGNED") {
    throw new TransitionError("This assignment can't be accepted right now");
  }

  await db.project.update({
    where: { id: project.id },
    data: { workerAccepted: true, workerAcceptedDate: new Date() },
  });
  await transitionProject(project.id, "IN_PROGRESS", { changedById: userId });
}

export async function submitWork(
  workerId: string,
  idOrCode: string,
  input: SubmitWorkInput,
  userId: string
): Promise<{ status: string }> {
  const project = await db.project.findFirst({
    where: { workerId, OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true, projectId: true, status: true },
  });
  if (!project) throw new TransitionError("Assignment not found");
  if (project.status !== "IN_PROGRESS" && project.status !== "REVISION_NEEDED") {
    throw new TransitionError("You can only submit while a project is in progress");
  }

  await db.projectFile.create({
    data: {
      projectId: project.id,
      fileName: input.fileName?.trim() || deriveName(input.fileUrl, project.projectId),
      fileUrl: input.fileUrl.trim(),
      category: "from_worker",
      uploadedBy: userId,
    },
  });

  const detail = await transitionProject(project.id, "SUBMITTED", {
    changedById: userId,
    note: input.note?.trim() || undefined,
  });

  return { status: detail.status };
}

function deriveName(url: string, projectId: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return decodeURIComponent(last);
  } catch {
    /* fall through */
  }
  return `${projectId}-submission`;
}

// ── Earnings ─────────────────────────────────────────────────

export interface WorkerEarningsRow {
  projectId: string;
  serviceName: string;
  status: ProjectStatus;
  amount: number;
  paid: boolean;
}

export interface WorkerEarnings {
  totalEarned: number;
  totalPaid: number;
  balance: number;
  rows: WorkerEarningsRow[];
}

export async function getWorkerEarnings(workerId: string): Promise<WorkerEarnings> {
  const projects = await db.project.findMany({
    where: { workerId, workerPayout: { not: null } },
    orderBy: { createdAt: "desc" },
    select: {
      projectId: true,
      status: true,
      workerPayout: true,
      workerPayoutPaid: true,
      service: { select: { serviceName: true } },
    },
  });

  const rows: WorkerEarningsRow[] = projects.map((p) => ({
    projectId: p.projectId,
    serviceName: p.service.serviceName,
    status: p.status,
    amount: p.workerPayout ?? 0,
    paid: p.workerPayoutPaid,
  }));

  const completed = projects.filter((p) => p.status === "COMPLETED");
  const totalEarned = completed.reduce((s, p) => s + (p.workerPayout ?? 0), 0);
  const totalPaid = completed
    .filter((p) => p.workerPayoutPaid)
    .reduce((s, p) => s + (p.workerPayout ?? 0), 0);

  return { totalEarned, totalPaid, balance: totalEarned - totalPaid, rows };
}

// ── Profile ──────────────────────────────────────────────────

export async function getWorkerProfile(workerId: string) {
  const worker = await db.worker.findUniqueOrThrow({
    where: { id: workerId },
    select: {
      workerId: true,
      fullName: true,
      phone: true,
      email: true,
      educationLevel: true,
      specialties: true,
      skills: true,
      status: true,
      maxConcurrentProjects: true,
      bankName: true,
      accountNumber: true,
      accountName: true,
      updatedAt: true,
      updatedByRole: true,
      updatedBy: { select: { displayName: true, email: true } },
      projects: { select: factSelect },
    },
  });

  const metrics = workerMetrics(toFacts(worker.projects), worker.maxConcurrentProjects);
  const { projects: _projects, ...profile } = worker;
  void _projects;
  return { profile, metrics };
}

