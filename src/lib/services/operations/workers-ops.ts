import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { TransitionError } from "@/lib/services/projects";
import { getAssignmentContext, updateWorker, type WorkerRecommendation } from "@/lib/services/workers";
import { notifyRole, notifyUsers } from "@/lib/services/notifications";
import { getWorkerMetrics, tier2FlagCounts, toPerformanceFacts, workerPerformanceSelect, type WorkerMetrics } from "@/lib/operations/worker-metrics";
import {
  computeWorkerPerformance,
  deliveredOnTime,
  TIER2_FLAG_WARNING,
  WORKER_ACTIVE_STATUSES,
  WORKER_BUSY_THRESHOLD,
  workerActivityStatus,
  type WorkerActivityStatus,
} from "@/lib/operations/worker-performance";
import { deadlineInfo, type DeadlineUrgency } from "@/lib/utils";
import type { Actor } from "@/lib/services/operations/actor";

/**
 * Worker management for the COO: the directory with live status and
 * performance, the profile's operational sections, and the acts on a
 * worker (notes, flags, suspension, load, QA-reviewer designation).
 */

export const WORKER_DIRECTORY_PAGE_SIZE = 20;

// ── Last activity ───────────────────────────────────────────

/** The latest of: last sign-in, last status change they made, last document they uploaded. */
async function lastActiveByUser(userIds: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (userIds.length === 0) return out;
  const bump = (id: string | null | undefined, at: Date | null | undefined) => {
    if (!id || !at) return;
    const cur = out.get(id);
    if (!cur || at > cur) out.set(id, at);
  };
  const [users, logs, versions] = await Promise.all([
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, lastSignInAt: true } }),
    db.projectStatusLog.groupBy({ by: ["changedById"], where: { changedById: { in: userIds } }, _max: { createdAt: true } }),
    db.deliverableVersion.groupBy({ by: ["submittedById"], where: { submittedById: { in: userIds } }, _max: { createdAt: true } }),
  ]);
  for (const u of users) bump(u.id, u.lastSignInAt);
  for (const l of logs) bump(l.changedById, l._max.createdAt);
  for (const v of versions) bump(v.submittedById, v._max.createdAt);
  return out;
}

// ── Directory ───────────────────────────────────────────────

export interface WorkerDirectoryFilters {
  dept?: string;
  status?: WorkerActivityStatus;
  q?: string;
  page?: number;
}

export interface WorkerDirectoryRow {
  id: string;
  workerId: string;
  fullName: string;
  phone: string;
  departments: string[];
  /** The record's own status (Active / On Break / Suspended / Terminated). */
  recordStatus: string;
  /** What the directory shows: Active, Busy, Inactive, or the manual status. */
  activity: WorkerActivityStatus;
  activeProjects: number;
  maxConcurrentProjects: number;
  busy: boolean;
  projectsDone: number;
  avgQuality: number | null;
  onTimeRate: number | null;
  qaFirstPassRate: number | null;
  tier2Flags: number;
  tier2Warning: boolean;
  lastActiveAt: string | null;
  isQaReviewer: boolean;
}

export interface WorkerDirectory {
  rows: WorkerDirectoryRow[];
  total: number;
  page: number;
  pageCount: number;
  departments: string[];
}

export async function listWorkerDirectory(filters: WorkerDirectoryFilters, now: Date = new Date()): Promise<WorkerDirectory> {
  const page = Math.max(1, filters.page ?? 1);
  const q = filters.q?.trim();
  const where: Prisma.WorkerWhereInput = {
    ...(filters.status === "Terminated" ? { status: "Terminated" } : { status: { not: "Terminated" } }),
    ...(filters.dept ? { specialties: { has: filters.dept } } : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { workerId: { contains: q, mode: "insensitive" } },
            { specialties: { has: q } },
          ],
        }
      : {}),
  };
  const workers = await db.worker.findMany({
    where,
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      workerId: true,
      fullName: true,
      phone: true,
      specialties: true,
      status: true,
      maxConcurrentProjects: true,
      isQaReviewer: true,
      userId: true,
      projects: { select: workerPerformanceSelect },
    },
  });
  const userIds = workers.map((w) => w.userId).filter((x): x is string => Boolean(x));
  const [lastActive, flags] = await Promise.all([lastActiveByUser(userIds), tier2FlagCounts(workers.map((w) => w.id), now)]);

  let rows: WorkerDirectoryRow[] = workers.map((w) => {
    const facts = toPerformanceFacts(w.projects);
    const perf = computeWorkerPerformance(facts, flags.get(w.id) ?? 0, 90, now);
    const activeProjects = w.projects.filter((p) => WORKER_ACTIVE_STATUSES.includes(p.status)).length;
    const projectsDone = w.projects.filter((p) => p.status === "COMPLETED" || p.status === "DELIVERED").length;
    const last = w.userId ? lastActive.get(w.userId) ?? null : null;
    const activity = workerActivityStatus({ status: w.status, activeProjects, maxConcurrentProjects: w.maxConcurrentProjects, lastActiveAt: last, now });
    return {
      id: w.id,
      workerId: w.workerId,
      fullName: w.fullName,
      phone: w.phone,
      departments: w.specialties,
      recordStatus: w.status,
      activity,
      activeProjects,
      maxConcurrentProjects: w.maxConcurrentProjects,
      busy: activeProjects > WORKER_BUSY_THRESHOLD || activity === "Busy",
      projectsDone,
      avgQuality: perf.avgQuality,
      onTimeRate: perf.onTimeRate,
      qaFirstPassRate: perf.qaFirstPassRate,
      tier2Flags: perf.tier2FlagCount,
      tier2Warning: perf.tier2FlagCount >= TIER2_FLAG_WARNING,
      lastActiveAt: last?.toISOString() ?? null,
      isQaReviewer: w.isQaReviewer,
    };
  });
  if (filters.status && filters.status !== "Terminated") rows = rows.filter((r) => r.activity === filters.status);

  const departments = [...new Set(workers.flatMap((w) => w.specialties))].sort((a, b) => a.localeCompare(b));
  const total = rows.length;
  return {
    rows: rows.slice((page - 1) * WORKER_DIRECTORY_PAGE_SIZE, page * WORKER_DIRECTORY_PAGE_SIZE),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / WORKER_DIRECTORY_PAGE_SIZE)),
    departments,
  };
}

// ── Profile ─────────────────────────────────────────────────

export interface WorkerProfileOps {
  performance: WorkerMetrics;
  activity: WorkerActivityStatus;
  lastActiveAt: string | null;
  active: { projectCode: string; title: string | null; department: string; serviceName: string; status: string; deadline: string | null; urgency: DeadlineUrgency; deadlineLabel: string }[];
  completedRecent: { projectCode: string; title: string | null; department: string; deliveredAt: string; onTime: boolean | null; lateDays: number; corrections: number }[];
  earnings: { month: string; amount: number; paid: number; status: "PAID" | "PARTLY" | "PENDING"; paidAt: string | null }[];
  flags: { id: string; kind: string; reason: string; projectCode: string | null; createdByName: string | null; createdAt: string; resolvedAt: string | null; resolutionNote: string | null }[];
  notes: { id: string; content: string; kind: string; authorName: string | null; createdAt: string }[];
  currentReviews: number;
}

export async function getWorkerProfileOps(workerId: string, now: Date = new Date()): Promise<WorkerProfileOps | null> {
  const worker = await db.worker.findUnique({
    where: { id: workerId },
    select: {
      id: true,
      status: true,
      maxConcurrentProjects: true,
      userId: true,
      projects: {
        select: {
          projectId: true,
          projectTitle: true,
          status: true,
          internalDeadline: true,
          clientDeadline: true,
          deliveryDate: true,
          finalCompletionDate: true,
          supervisorCorrectionCount: true,
          service: { select: { serviceName: true } },
          client: { select: { department: true } },
          _count: { select: { correctionRounds: true } },
        },
      },
      flags: { orderBy: { createdAt: "desc" }, take: 30, include: { project: { select: { projectId: true } } } },
      opsNotes: { orderBy: { createdAt: "desc" }, take: 40 },
    },
  });
  if (!worker) return null;
  const performance = await getWorkerMetrics(worker.id, 90, now);
  if (!performance) return null;

  const active = worker.projects
    .filter((p) => WORKER_ACTIVE_STATUSES.includes(p.status))
    .map((p) => {
      const deadline = p.internalDeadline ?? p.clientDeadline;
      const info = deadlineInfo(deadline, now);
      return {
        projectCode: p.projectId,
        title: p.projectTitle,
        department: p.client.department,
        serviceName: p.service.serviceName,
        status: p.status,
        deadline: deadline?.toISOString() ?? null,
        urgency: info.urgency,
        deadlineLabel: info.label,
      };
    })
    .sort((a, b) => (a.deadline ?? "9") .localeCompare(b.deadline ?? "9"));

  const thirtyDays = new Date(now.getTime() - 30 * 86_400_000);
  const completedRecent = worker.projects
    .filter((p) => (p.status === "DELIVERED" || p.status === "COMPLETED" || p.status === "SUPERVISOR_CORRECTIONS") && (p.deliveryDate ?? p.finalCompletionDate) != null)
    .filter((p) => (p.deliveryDate ?? p.finalCompletionDate)! >= thirtyDays)
    .map((p) => {
      const at = (p.deliveryDate ?? p.finalCompletionDate) as Date;
      const onTime = deliveredOnTime({ deliveryDate: p.deliveryDate, internalDeadline: p.internalDeadline });
      const lateDays = onTime === false && p.deliveryDate && p.internalDeadline ? Math.ceil((p.deliveryDate.getTime() - p.internalDeadline.getTime()) / 86_400_000) : 0;
      return {
        projectCode: p.projectId,
        title: p.projectTitle,
        department: p.client.department,
        deliveredAt: at.toISOString(),
        onTime,
        lateDays,
        corrections: Math.max(p._count.correctionRounds, p.supervisorCorrectionCount),
      };
    })
    .sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt));

  const records = await db.payoutRecord.findMany({
    where: { leg: "WORKER", recipientId: worker.id, status: { not: "CANCELLED" } },
    select: { month: true, amount: true, status: true, paidAt: true },
  });
  const byMonth = new Map<string, { amount: number; paid: number; count: number; paidCount: number; paidAt: Date | null }>();
  for (const r of records) {
    const m = byMonth.get(r.month) ?? { amount: 0, paid: 0, count: 0, paidCount: 0, paidAt: null };
    m.amount += r.amount;
    m.count++;
    if (r.status === "PAID") {
      m.paid += r.amount;
      m.paidCount++;
      if (r.paidAt && (!m.paidAt || r.paidAt > m.paidAt)) m.paidAt = r.paidAt;
    }
    byMonth.set(r.month, m);
  }
  const earnings = [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 12)
    .map(([month, m]) => ({
      month,
      amount: Math.round(m.amount),
      paid: Math.round(m.paid),
      status: (m.paidCount === m.count ? "PAID" : m.paidCount > 0 ? "PARTLY" : "PENDING") as "PAID" | "PARTLY" | "PENDING",
      paidAt: m.paidAt?.toISOString() ?? null,
    }));

  const [lastActive, currentReviews] = await Promise.all([
    worker.userId ? lastActiveByUser([worker.userId]) : Promise.resolve(new Map<string, Date>()),
    db.qaReview.count({ where: { reviewerId: worker.id, reviewerType: "WORKER", completedAt: null, project: { status: { in: ["SUBMITTED", "IN_QA_REVIEW"] } } } }),
  ]);
  const last = worker.userId ? lastActive.get(worker.userId) ?? null : null;

  return {
    performance,
    activity: workerActivityStatus({ status: worker.status, activeProjects: active.length, maxConcurrentProjects: worker.maxConcurrentProjects, lastActiveAt: last, now }),
    lastActiveAt: last?.toISOString() ?? null,
    active,
    completedRecent,
    earnings,
    flags: worker.flags.map((f) => ({
      id: f.id,
      kind: f.kind,
      reason: f.reason,
      projectCode: f.project?.projectId ?? null,
      createdByName: f.createdByName,
      createdAt: f.createdAt.toISOString(),
      resolvedAt: f.resolvedAt?.toISOString() ?? null,
      resolutionNote: f.resolutionNote,
    })),
    notes: worker.opsNotes.map((n) => ({ id: n.id, content: n.content, kind: n.kind, authorName: n.authorName, createdAt: n.createdAt.toISOString() })),
    currentReviews,
  };
}

// ── Acts ────────────────────────────────────────────────────

async function findWorker(workerId: string) {
  const worker = await db.worker.findUnique({ where: { id: workerId }, select: { id: true, fullName: true, status: true, userId: true, maxConcurrentProjects: true } });
  if (!worker) throw new TransitionError("Worker not found");
  return worker;
}

export async function addWorkerNote(workerId: string, actor: Actor, content: string, kind = "NOTE") {
  const worker = await findWorker(workerId);
  const text = content.trim();
  if (!text) throw new TransitionError("Write a note first");
  const note = await db.workerNote.create({ data: { workerId: worker.id, content: text, kind, authorId: actor.userId, authorName: actor.name } });
  return { id: note.id, createdAt: note.createdAt.toISOString() };
}

export async function flagWorker(workerId: string, actor: Actor, input: { kind: string; reason: string; projectCode?: string }) {
  const worker = await findWorker(workerId);
  let projectId: string | null = null;
  if (input.projectCode?.trim()) {
    const project = await db.project.findFirst({ where: { OR: [{ id: input.projectCode.trim() }, { projectId: input.projectCode.trim().toUpperCase() }] }, select: { id: true } });
    if (!project) throw new TransitionError("No project with that code");
    projectId = project.id;
  }
  const reason = input.reason.trim();
  const [flag] = await db.$transaction([
    db.workerFlag.create({ data: { workerId: worker.id, kind: input.kind, reason, projectId, createdById: actor.userId, createdByName: actor.name } }),
    db.workerNote.create({
      data: { workerId: worker.id, kind: "FLAG", content: `Flagged (${input.kind.replace(/_/g, " ").toLowerCase()}): ${reason}`, authorId: actor.userId, authorName: actor.name },
    }),
  ]);
  await notifyRole("SUPER_ADMIN", {
    title: "Worker flagged for review",
    message: `${actor.name} flagged ${worker.fullName}: ${reason.slice(0, 140)}`,
    type: "warning",
    link: `/admin/workers/${worker.id}`,
  });
  return { id: flag.id };
}

export async function resolveWorkerFlag(flagId: string, actor: Actor, note?: string) {
  const flag = await db.workerFlag.findUnique({ where: { id: flagId }, select: { id: true, workerId: true, resolvedAt: true } });
  if (!flag) throw new TransitionError("Flag not found");
  if (flag.resolvedAt) return { ok: true };
  await db.$transaction([
    db.workerFlag.update({ where: { id: flag.id }, data: { resolvedAt: new Date(), resolvedById: actor.userId, resolutionNote: note?.trim() || null } }),
    db.workerNote.create({ data: { workerId: flag.workerId, kind: "FLAG", content: `Flag resolved${note?.trim() ? `: ${note.trim()}` : ""}`, authorId: actor.userId, authorName: actor.name } }),
  ]);
  return { ok: true };
}

export async function suspendWorker(workerId: string, actor: Actor, reason?: string) {
  const worker = await findWorker(workerId);
  if (worker.status === "Suspended") throw new TransitionError("This worker is already suspended");
  if (worker.status === "Terminated") throw new TransitionError("This worker has been terminated");
  await updateWorker(worker.id, { status: "Suspended" }, actor.userId);
  await db.workerNote.create({ data: { workerId: worker.id, kind: "SUSPEND", content: `Suspended${reason?.trim() ? `: ${reason.trim()}` : ""}`, authorId: actor.userId, authorName: actor.name } });
  if (worker.userId) await notifyUsers([worker.userId], { title: "Your account is suspended", message: "Contact EduCraft for details.", type: "urgent" });
  return { status: "Suspended" };
}

export async function unsuspendWorker(workerId: string, actor: Actor, note?: string) {
  const worker = await findWorker(workerId);
  if (worker.status !== "Suspended") throw new TransitionError("This worker is not suspended");
  await updateWorker(worker.id, { status: "Active" }, actor.userId);
  await db.workerNote.create({ data: { workerId: worker.id, kind: "UNSUSPEND", content: `Suspension lifted${note?.trim() ? `: ${note.trim()}` : ""}`, authorId: actor.userId, authorName: actor.name } });
  if (worker.userId) await notifyUsers([worker.userId], { title: "Your account is active again", message: "You can take projects again.", type: "success" });
  return { status: "Active" };
}

export async function setWorkerMaxLoad(workerId: string, actor: Actor, maxConcurrentProjects: number) {
  const worker = await findWorker(workerId);
  if (worker.maxConcurrentProjects === maxConcurrentProjects) return { maxConcurrentProjects };
  await updateWorker(worker.id, { maxConcurrentProjects }, actor.userId);
  await db.workerNote.create({
    data: { workerId: worker.id, kind: "MAX_LOAD", content: `Max concurrent projects changed from ${worker.maxConcurrentProjects} to ${maxConcurrentProjects}`, authorId: actor.userId, authorName: actor.name },
  });
  return { maxConcurrentProjects };
}

// ── Recommendations ─────────────────────────────────────────

export interface RecommendedWorker extends WorkerRecommendation {
  /** Over the busy threshold: shown, flagged, never blocked. */
  busy: boolean;
  departmentMatch: boolean;
}

export interface RecommendedWorkers {
  project: { id: string; projectId: string; projectTitle: string | null; status: string; department: string; serviceName: string; currentWorker: { id: string; fullName: string } | null };
  workers: RecommendedWorker[];
}

/**
 * Ranked for one project: department match first, then lightest load, then
 * rating — the same order as the assignment screen, with the busy flag the
 * spec adds. Never assigns anything: the COO makes the call.
 */
export async function getRecommendedWorkers(idOrCode: string): Promise<RecommendedWorkers | null> {
  const ctx = await getAssignmentContext(idOrCode);
  if (!ctx) return null;
  return {
    project: {
      id: ctx.project.id,
      projectId: ctx.project.projectId,
      projectTitle: ctx.project.projectTitle,
      status: ctx.project.status,
      department: ctx.project.department,
      serviceName: ctx.project.serviceName,
      currentWorker: ctx.project.currentWorker,
    },
    workers: ctx.recommendations.map((r) => ({ ...r, busy: r.activeProjects > WORKER_BUSY_THRESHOLD, departmentMatch: r.specialtyMatch })),
  };
}
