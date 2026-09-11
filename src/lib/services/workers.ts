import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { nextId, TransitionError } from "@/lib/services/projects";
import {
  workerMetrics,
  WORKER_ACTIVE_STATUSES,
  type WorkerProjectFacts,
} from "@/lib/worker-metrics";
import type { CreateWorkerInput } from "@/lib/validations/workers";

export const WORKER_PAGE_SIZE = 20;

const projectFactsSelect = {
  status: true,
  revisionCount: true,
  qaScore: true,
  assignedDate: true,
  deliveryDate: true,
  internalDeadline: true,
  workerPayout: true,
  workerPayoutPaid: true,
} satisfies Prisma.ProjectSelect;

function toFacts(rows: Prisma.ProjectGetPayload<{ select: typeof projectFactsSelect }>[]): WorkerProjectFacts[] {
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

// ── List ─────────────────────────────────────────────────────

export interface WorkerListFilters {
  status?: string;
  specialty?: string;
  availability?: "available" | "at-capacity";
  q?: string;
  page?: number;
}

export interface WorkerListRow {
  id: string;
  workerId: string;
  fullName: string;
  status: string;
  specialties: string[];
  load: string;
  atCapacity: boolean;
  maxConcurrentProjects: number;
  activeProjects: number;
  rating: number | null;
  onTimeRate: number | null;
  revisionRate: number | null;
  payoutBalance: number;
}

export interface WorkerListResult {
  rows: WorkerListRow[];
  total: number;
  page: number;
  pageCount: number;
}

export async function listWorkers(filters: WorkerListFilters): Promise<WorkerListResult> {
  const page = Math.max(1, filters.page ?? 1);

  const where: Prisma.WorkerWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.specialty ? { specialties: { has: filters.specialty } } : {}),
    ...(filters.q?.trim()
      ? {
          OR: [
            { fullName: { contains: filters.q.trim(), mode: "insensitive" } },
            { phone: { contains: filters.q.trim(), mode: "insensitive" } },
            { workerId: { contains: filters.q.trim(), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [workers, total] = await db.$transaction([
    db.worker.findMany({
      where,
      orderBy: { createdAt: "desc" },
      // availability filter is post-computed, so pull a wider page then slice
      skip: filters.availability ? 0 : (page - 1) * WORKER_PAGE_SIZE,
      take: filters.availability ? 500 : WORKER_PAGE_SIZE,
      select: {
        id: true,
        workerId: true,
        fullName: true,
        status: true,
        specialties: true,
        maxConcurrentProjects: true,
        projects: { select: projectFactsSelect },
      },
    }),
    db.worker.count({ where }),
  ]);

  let rows: WorkerListRow[] = workers.map((w) => {
    const m = workerMetrics(toFacts(w.projects), w.maxConcurrentProjects);
    return {
      id: w.id,
      workerId: w.workerId,
      fullName: w.fullName,
      status: w.status,
      specialties: w.specialties,
      load: m.load,
      atCapacity: m.atCapacity,
      maxConcurrentProjects: w.maxConcurrentProjects,
      activeProjects: m.activeProjects,
      rating: m.rating,
      onTimeRate: m.onTimeRate,
      revisionRate: m.revisionRate,
      payoutBalance: m.payoutBalance,
    };
  });

  let effectiveTotal = total;
  if (filters.availability) {
    rows = rows.filter((r) =>
      filters.availability === "available"
        ? !r.atCapacity && r.status === "Active"
        : r.atCapacity
    );
    effectiveTotal = rows.length;
    rows = rows.slice((page - 1) * WORKER_PAGE_SIZE, page * WORKER_PAGE_SIZE);
  }

  return {
    rows,
    total: effectiveTotal,
    page,
    pageCount: Math.max(1, Math.ceil(effectiveTotal / WORKER_PAGE_SIZE)),
  };
}

/** Distinct specialty values across all workers, for the filter dropdown. */
export async function getWorkerSpecialties(): Promise<string[]> {
  const workers = await db.worker.findMany({ select: { specialties: true } });
  const set = new Set<string>();
  for (const w of workers) for (const s of w.specialties) set.add(s);
  return [...set].sort((a, b) => a.localeCompare(b));
}

// ── Detail ───────────────────────────────────────────────────

const workerDetailSelect = {
  id: true,
  workerId: true,
  fullName: true,
  phone: true,
  email: true,
  userId: true,
  educationLevel: true,
  status: true,
  specialties: true,
  skills: true,
  serviceTypes: true,
  maxConcurrentProjects: true,
  bankName: true,
  accountNumber: true,
  accountName: true,
  notes: true,
  createdAt: true,
  projects: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      projectId: true,
      projectTitle: true,
      status: true,
      price: true,
      workerPayout: true,
      workerPayoutPaid: true,
      internalDeadline: true,
      deliveryDate: true,
      assignedDate: true,
      revisionCount: true,
      qaScore: true,
      service: { select: { serviceName: true } },
      client: { select: { fullName: true } },
    },
  },
} satisfies Prisma.WorkerSelect;

export type WorkerDetail = Prisma.WorkerGetPayload<{ select: typeof workerDetailSelect }>;

export async function getWorkerDetail(id: string) {
  const worker = await db.worker.findUnique({ where: { id }, select: workerDetailSelect });
  if (!worker) return null;

  const metrics = workerMetrics(
    toFacts(
      worker.projects.map((p) => ({
        status: p.status,
        revisionCount: p.revisionCount,
        qaScore: p.qaScore,
        assignedDate: p.assignedDate,
        deliveryDate: p.deliveryDate,
        internalDeadline: p.internalDeadline,
        workerPayout: p.workerPayout,
        workerPayoutPaid: p.workerPayoutPaid,
      }))
    ),
    worker.maxConcurrentProjects
  );

  return { worker, metrics };
}

// ── Mutations ────────────────────────────────────────────────

export async function createWorker(input: CreateWorkerInput) {
  // Single write — no transaction needed. Retry once on the rare id clash.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.worker.create({
        data: {
          workerId: await nextId("WORKER"),
          fullName: input.fullName,
          phone: input.phone,
          email: input.email || null,
          educationLevel: input.educationLevel || null,
          specialties: input.specialties,
          skills: input.skills,
          serviceTypes: [],
          maxConcurrentProjects: input.maxConcurrentProjects,
          bankName: input.bankName || null,
          accountNumber: input.accountNumber || null,
          accountName: input.accountName || null,
          notes: input.notes || null,
          status: "Active",
        },
        select: { id: true, workerId: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        attempt < 2
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new TransitionError("Could not allocate a worker id — try again");
}

export async function updateWorkerStatus(id: string, status: string) {
  const worker = await db.worker.findUnique({ where: { id }, select: { id: true } });
  if (!worker) throw new TransitionError("Worker not found");
  return db.worker.update({ where: { id }, data: { status }, select: { status: true } });
}

// ── Assignment recommendations ───────────────────────────────

export interface WorkerRecommendation {
  id: string;
  workerId: string;
  fullName: string;
  status: string;
  specialties: string[];
  skills: string[];
  load: string;
  atCapacity: boolean;
  activeProjects: number;
  maxConcurrentProjects: number;
  rating: number | null;
  onTimeRate: number | null;
  revisionRate: number | null;
  avgDeliveryDays: number | null;
  /** True when a specialty matches the project's department. */
  specialtyMatch: boolean;
}

export interface AssignmentContext {
  project: {
    id: string;
    projectId: string;
    projectTitle: string | null;
    status: string;
    department: string;
    projectType: string;
    chapterCount: number | null;
    internalDeadline: Date | null;
    clientDeadline: Date | null;
    serviceName: string;
  };
  recommendations: WorkerRecommendation[];
}

/**
 * Ranked worker list for the assignment screen: specialty match first, then
 * lighter load, then higher rating, then better on-time rate. Terminated and
 * suspended workers are dropped entirely.
 */
export async function getAssignmentContext(idOrCode: string): Promise<AssignmentContext | null> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: {
      id: true,
      projectId: true,
      projectTitle: true,
      status: true,
      projectType: true,
      chapterCount: true,
      internalDeadline: true,
      clientDeadline: true,
      service: { select: { serviceName: true } },
      client: { select: { department: true } },
    },
  });
  if (!project) return null;

  const department = project.client.department;

  const workers = await db.worker.findMany({
    where: { status: { in: ["Active", "On Break"] } },
    select: {
      id: true,
      workerId: true,
      fullName: true,
      status: true,
      specialties: true,
      skills: true,
      maxConcurrentProjects: true,
      projects: { select: projectFactsSelect },
    },
  });

  const normalizedDept = department.trim().toLowerCase();

  const recommendations: WorkerRecommendation[] = workers
    .map((w) => {
      const m = workerMetrics(toFacts(w.projects), w.maxConcurrentProjects);
      const specialtyMatch = w.specialties.some(
        (s) => s.trim().toLowerCase() === normalizedDept
      );
      return {
        id: w.id,
        workerId: w.workerId,
        fullName: w.fullName,
        status: w.status,
        specialties: w.specialties,
        skills: w.skills,
        load: m.load,
        atCapacity: m.atCapacity,
        activeProjects: m.activeProjects,
        maxConcurrentProjects: w.maxConcurrentProjects,
        rating: m.rating,
        onTimeRate: m.onTimeRate,
        revisionRate: m.revisionRate,
        avgDeliveryDays: m.avgDeliveryDays,
        specialtyMatch,
      };
    })
    .sort((a, b) => {
      if (a.specialtyMatch !== b.specialtyMatch) return a.specialtyMatch ? -1 : 1;
      if (a.atCapacity !== b.atCapacity) return a.atCapacity ? 1 : -1;
      if (a.activeProjects !== b.activeProjects) return a.activeProjects - b.activeProjects;
      if ((b.rating ?? 0) !== (a.rating ?? 0)) return (b.rating ?? 0) - (a.rating ?? 0);
      return (b.onTimeRate ?? 0) - (a.onTimeRate ?? 0);
    });

  return {
    project: {
      id: project.id,
      projectId: project.projectId,
      projectTitle: project.projectTitle,
      status: project.status,
      department,
      projectType: project.projectType,
      chapterCount: project.chapterCount,
      internalDeadline: project.internalDeadline,
      clientDeadline: project.clientDeadline,
      serviceName: project.service.serviceName,
    },
    recommendations,
  };
}
