import type { ProjectStatus } from "@prisma/client";

/**
 * Worker performance is all derived — no counters on the Worker row. These
 * helpers take the worker's projects and compute the numbers the list and
 * profile screens show.
 */

/** Worker still has hands on the project. */
export const WORKER_ACTIVE_STATUSES: ProjectStatus[] = [
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_CLIENT_INPUT",
  "SUBMITTED",
  "IN_QA_REVIEW",
  "REVISION_NEEDED",
];

export const WORKER_STATUSES = ["Active", "On Break", "Suspended", "Terminated"] as const;
export type WorkerStatus = (typeof WORKER_STATUSES)[number];

export interface WorkerProjectFacts {
  status: ProjectStatus;
  revisionCount: number;
  qaScore: number | null;
  assignedDate: Date | null;
  deliveryDate: Date | null;
  internalDeadline: Date | null;
  workerPayout: number | null;
  workerPayoutPaid: boolean;
}

export interface WorkerMetrics {
  activeProjects: number;
  completedProjects: number;
  totalAssigned: number;
  /** 0–100, or null when no completed project had a deadline. */
  onTimeRate: number | null;
  /** 0–100 — share of finished work that needed at least one revision. */
  revisionRate: number | null;
  /** Average calendar days from assignment to delivery, or null. */
  avgDeliveryDays: number | null;
  /** 0–5 from average QA score, or null when never QA'd. */
  rating: number | null;
  totalEarned: number;
  totalPaid: number;
  payoutBalance: number;
}

function pct(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return Math.round((part / whole) * 100);
}

export function workerMetrics(
  projects: WorkerProjectFacts[],
  maxConcurrent: number
): WorkerMetrics & { atCapacity: boolean; load: string } {
  const active = projects.filter((p) => WORKER_ACTIVE_STATUSES.includes(p.status)).length;

  const finished = projects.filter(
    (p) => p.status === "COMPLETED" || p.status === "DELIVERED"
  );

  const withDeadline = finished.filter((p) => p.internalDeadline && p.deliveryDate);
  const onTime = withDeadline.filter(
    (p) => p.deliveryDate!.getTime() <= p.internalDeadline!.getTime()
  ).length;

  const neededRevision = finished.filter((p) => p.revisionCount > 0).length;

  const deliverySpans = finished
    .filter((p) => p.assignedDate && p.deliveryDate)
    .map((p) => (p.deliveryDate!.getTime() - p.assignedDate!.getTime()) / 86_400_000)
    .filter((d) => d >= 0);
  const avgDeliveryDays =
    deliverySpans.length > 0
      ? Math.round((deliverySpans.reduce((s, d) => s + d, 0) / deliverySpans.length) * 10) / 10
      : null;

  const scores = projects
    .map((p) => p.qaScore)
    .filter((s): s is number => s != null && Number.isFinite(s));
  const rating =
    scores.length > 0
      ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length / 20) * 10) / 10
      : null;

  const completedPayouts = projects.filter((p) => p.status === "COMPLETED");
  const totalEarned = completedPayouts.reduce((s, p) => s + (p.workerPayout ?? 0), 0);
  const totalPaid = completedPayouts
    .filter((p) => p.workerPayoutPaid)
    .reduce((s, p) => s + (p.workerPayout ?? 0), 0);

  return {
    activeProjects: active,
    completedProjects: finished.filter((p) => p.status === "COMPLETED").length,
    totalAssigned: projects.length,
    onTimeRate: pct(onTime, withDeadline.length),
    revisionRate: pct(neededRevision, finished.length),
    avgDeliveryDays,
    rating,
    totalEarned,
    totalPaid,
    payoutBalance: totalEarned - totalPaid,
    atCapacity: active >= maxConcurrent,
    load: `${active}/${maxConcurrent}`,
  };
}

export const WORKER_STATUS_BADGE: Record<string, string> = {
  Active: "border-transparent bg-success/15 text-success",
  "On Break": "border-transparent bg-gold/15 text-gold",
  Suspended: "border-transparent bg-danger/15 text-danger",
  Terminated: "border-border bg-elevated text-subtle line-through",
};
