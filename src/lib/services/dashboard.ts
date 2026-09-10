import type { ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { CLOSED_STATUSES, PIPELINE_STATUSES, type PipelineStatus } from "@/lib/status";
import type {
  ActionCounts,
  ActivityEntry,
  DashboardSummary,
  PipelineSegment,
} from "@/types/dashboard";

/** Projects past their internal deadline but not yet out of the building. */
const OPEN_STATUSES: ProjectStatus[] = [
  ...PIPELINE_STATUSES,
  "REVISION_NEEDED",
  "SUPERVISOR_CORRECTIONS",
];

const AT_RISK_WINDOW_DAYS = 3;
const REVISION_ESCALATION_THRESHOLD = 3; // MAX_REVISIONS

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d: Date, days: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Everything the Command Center renders, in one round trip.
 *
 * Read-only and batched through `$transaction` so every number on the screen
 * describes the same instant — a stat row assembled from separately-timed
 * queries can show a project in two places at once.
 */
export async function getDashboardSummary(now: Date = new Date()): Promise<DashboardSummary> {
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const lastMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
  const atRiskCutoff = addDays(now, AT_RISK_WINDOW_DAYS);

  const [
    activeProjects,
    newToday,
    revenueThisMonth,
    revenueLastMonth,
    workerUnpaid,
    ambassadorUnpaid,
    workerPayoutGroups,
    ambassadorPayoutGroups,
    atRiskCount,
    overdueCount,
    statusLogs,
    downpaymentsToVerify,
    balancesToVerify,
    awaitingAssignment,
    qaQueue,
    revisionEscalations,
  ] = await db.$transaction([
    db.project.count({ where: { status: { notIn: [...CLOSED_STATUSES] } } }),

    db.project.count({ where: { createdAt: { gte: todayStart } } }),

    db.payment.aggregate({
      _sum: { amount: true },
      where: {
        direction: "INFLOW",
        status: "Confirmed",
        date: { gte: monthStart },
      },
    }),

    db.payment.aggregate({
      _sum: { amount: true },
      where: {
        direction: "INFLOW",
        status: "Confirmed",
        date: { gte: lastMonthStart, lt: monthStart },
      },
    }),

    // Money owed on completed projects and not yet sent out. Worker and
    // ambassador legs are aggregated separately because each has its own
    // paid flag — a single sum would count a leg that has already gone out.
    db.project.aggregate({
      _sum: { workerPayout: true },
      where: { status: "COMPLETED", workerPayoutPaid: false },
    }),

    db.project.aggregate({
      _sum: { ambassadorCommission: true },
      where: { status: "COMPLETED", ambassadorCommPaid: false },
    }),

    db.project.groupBy({
      by: ["workerId"],
      orderBy: { workerId: "asc" },
      where: {
        status: "COMPLETED",
        workerPayoutPaid: false,
        workerId: { not: null },
      },
    }),

    db.project.groupBy({
      by: ["ambassadorId"],
      orderBy: { ambassadorId: "asc" },
      where: {
        status: "COMPLETED",
        ambassadorCommPaid: false,
        ambassadorId: { not: null },
      },
    }),

    db.project.count({
      where: { status: "IN_PROGRESS", internalDeadline: { lt: atRiskCutoff } },
    }),

    db.project.count({
      where: { status: { in: OPEN_STATUSES }, internalDeadline: { lt: now } },
    }),

    db.projectStatusLog.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        createdAt: true,
        project: { select: { id: true, projectId: true } },
        changedBy: { select: { displayName: true, email: true } },
      },
    }),

    db.project.count({ where: { downpaymentStatus: "Paid" } }),

    db.project.count({ where: { balanceStatus: "Paid" } }),

    db.project.count({
      where: { status: "REQUIREMENTS_CONFIRMED", workerId: null },
    }),

    db.project.count({ where: { status: { in: ["SUBMITTED", "IN_QA_REVIEW"] } } }),

    db.project.count({
      where: {
        status: { in: OPEN_STATUSES },
        revisionCount: { gte: REVISION_ESCALATION_THRESHOLD },
      },
    }),
  ]);

  // Kept out of the batch above: Prisma's groupBy payload type does not survive
  // inference through `$transaction`, which erases `_count` down to a union.
  const [pipelineGroups, pipelineAtRiskGroups] = await Promise.all([
    db.project.groupBy({
      by: ["status"],
      orderBy: { status: "asc" },
      _count: { _all: true },
      where: { status: { in: [...PIPELINE_STATUSES] } },
    }),
    db.project.groupBy({
      by: ["status"],
      orderBy: { status: "asc" },
      _count: { _all: true },
      where: {
        status: { in: [...PIPELINE_STATUSES] },
        internalDeadline: { lt: atRiskCutoff },
      },
    }),
  ]);

  const countByStatus = new Map<ProjectStatus, number>(
    pipelineGroups.map((g) => [g.status, g._count._all])
  );
  const atRiskByStatus = new Map<ProjectStatus, number>(
    pipelineAtRiskGroups.map((g) => [g.status, g._count._all])
  );

  const pipeline: PipelineSegment[] = PIPELINE_STATUSES.map((status: PipelineStatus) => ({
    status,
    count: countByStatus.get(status) ?? 0,
    atRisk: atRiskByStatus.get(status) ?? 0,
  }));

  const activity: ActivityEntry[] = statusLogs.map((log) => ({
    id: log.id,
    projectCode: log.project.projectId,
    projectDbId: log.project.id,
    fromStatus: log.fromStatus,
    toStatus: log.toStatus,
    actor: log.changedBy?.displayName ?? log.changedBy?.email ?? null,
    createdAt: log.createdAt.toISOString(),
  }));

  const actions: ActionCounts = {
    downpaymentsToVerify,
    balancesToVerify,
    awaitingAssignment,
    overdue: overdueCount,
    qaQueue,
    revisionEscalations,
  };

  const thisMonth = revenueThisMonth._sum.amount ?? 0;
  const lastMonth = revenueLastMonth._sum.amount ?? 0;
  const workerAmount = workerUnpaid._sum.workerPayout ?? 0;
  const ambassadorAmount = ambassadorUnpaid._sum.ambassadorCommission ?? 0;

  return {
    stats: {
      activeProjects: { count: activeProjects, newToday },
      revenueThisMonth: {
        amount: thisMonth,
        lastMonthAmount: lastMonth,
        deltaPercent: lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null,
      },
      pendingPayouts: {
        amount: workerAmount + ambassadorAmount,
        workerAmount,
        ambassadorAmount,
        workerCount: workerPayoutGroups.length,
        ambassadorCount: ambassadorPayoutGroups.length,
      },
      atRisk: { count: atRiskCount, overdueCount },
    },
    pipeline,
    activity,
    actions,
    generatedAt: now.toISOString(),
  };
}
