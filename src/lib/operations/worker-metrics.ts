import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  computeWorkerPerformance,
  TIER2_FLAG_WINDOW_DAYS,
  WORKER_ACTIVE_STATUSES,
  type WorkerPerformance,
  type WorkerProjectFact,
} from "@/lib/operations/worker-performance";

/**
 * Worker performance for the COO's screens (spec: src/lib/operations/worker-metrics.ts).
 * Loads a worker's projects and flags and hands them to the pure calculator
 * in `worker-performance.ts`, so the profile, the directory and the monthly
 * report all agree.
 */

export const DEFAULT_METRICS_PERIOD_DAYS = 90;

const factSelect = {
  status: true,
  deliveryDate: true,
  internalDeadline: true,
  finalCompletionDate: true,
  qaFirstPassDate: true,
  revisionCount: true,
  supervisorCorrectionCount: true,
  qaScore: true,
  workerPayout: true,
  _count: { select: { correctionRounds: true } },
} satisfies Prisma.ProjectSelect;

type FactRow = Prisma.ProjectGetPayload<{ select: typeof factSelect }>;

export function toPerformanceFacts(rows: readonly FactRow[]): WorkerProjectFact[] {
  return rows.map((r) => ({
    status: r.status,
    deliveryDate: r.deliveryDate,
    internalDeadline: r.internalDeadline,
    finalCompletionDate: r.finalCompletionDate,
    qaFirstPassDate: r.qaFirstPassDate,
    revisionCount: r.revisionCount,
    supervisorCorrectionCount: r.supervisorCorrectionCount,
    correctionRounds: r._count.correctionRounds,
    qaScore: r.qaScore,
    workerPayout: r.workerPayout,
  }));
}

export { factSelect as workerPerformanceSelect };

/** Tier 2 reference flags in the rolling window, per worker. */
export async function tier2FlagCounts(workerIds: readonly string[], now: Date = new Date()): Promise<Map<string, number>> {
  if (workerIds.length === 0) return new Map();
  const since = new Date(now.getTime() - TIER2_FLAG_WINDOW_DAYS * 86_400_000);
  const groups = await db.workerFlag.groupBy({
    by: ["workerId"],
    where: { workerId: { in: [...workerIds] }, kind: "TIER2_REFERENCE", createdAt: { gte: since }, resolvedAt: null },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.workerId, g._count._all]));
}

export interface WorkerMetrics extends WorkerPerformance {
  workerId: string;
  periodDays: number;
  activeProjects: number;
}

/**
 * One worker's numbers over the last `periodDays` (90 by default): delivered
 * projects, on-time rate (delivered on or before the internal deadline), QA
 * first-pass rate (approved without a revision), supervisor acceptance
 * (no correction round), reference flags in the last 30 days, average
 * quality and payout per month.
 */
export async function getWorkerMetrics(workerId: string, periodDays = DEFAULT_METRICS_PERIOD_DAYS, now: Date = new Date()): Promise<WorkerMetrics | null> {
  const worker = await db.worker.findUnique({
    where: { id: workerId },
    select: { id: true, projects: { select: factSelect } },
  });
  if (!worker) return null;
  const flags = await tier2FlagCounts([worker.id], now);
  const perf = computeWorkerPerformance(toPerformanceFacts(worker.projects), flags.get(worker.id) ?? 0, periodDays, now);
  const activeProjects = worker.projects.filter((p) => WORKER_ACTIVE_STATUSES.includes(p.status)).length;
  return { workerId: worker.id, periodDays, activeProjects, ...perf };
}
