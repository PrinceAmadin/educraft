import type { ProjectStatus } from "@prisma/client";

/**
 * Worker performance, the way the COO judges it: on-time delivery, QA
 * first-pass, supervisor acceptance, reference flags. Pure — the database
 * layer (`worker-metrics.ts`) loads the facts and calls in here, and the
 * screens and reports read the same numbers.
 */

/** Targets from the spec: what "good" means on the profile and the league table. */
export const WORKER_TARGETS = {
  onTimeRate: 95,
  qaFirstPassRate: 80,
  supervisorAcceptRate: 95,
} as const;

/** More active projects than this and a worker is "Busy" — flagged, not blocked. */
export const WORKER_BUSY_THRESHOLD = 6;
/** Reference flags are counted over a rolling window; this many in it is a warning. */
export const TIER2_FLAG_WINDOW_DAYS = 30;
export const TIER2_FLAG_WARNING = 3;
/** No project activity for this long and an active worker reads as Inactive. */
export const INACTIVE_AFTER_DAYS = 14;

/** Statuses where the worker still has hands on the project. */
export const WORKER_ACTIVE_STATUSES: readonly ProjectStatus[] = [
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_CLIENT_INPUT",
  "SUBMITTED",
  "IN_QA_REVIEW",
  "REVISION_NEEDED",
];

/** Delivered work: what the rates are measured on. */
export const FINISHED_STATUSES: readonly ProjectStatus[] = ["DELIVERED", "SUPERVISOR_CORRECTIONS", "COMPLETED"];

export interface WorkerProjectFact {
  status: ProjectStatus;
  deliveryDate: Date | null;
  internalDeadline: Date | null;
  finalCompletionDate: Date | null;
  qaFirstPassDate: Date | null;
  revisionCount: number;
  supervisorCorrectionCount: number;
  /** Rounds in the SupervisorCorrection table (Phase 4) — 0 for older projects. */
  correctionRounds: number;
  qaScore: number | null;
  workerPayout: number | null;
}

export interface WorkerPerformance {
  /** Projects delivered in the period. */
  totalCompleted: number;
  /** 0–100, null when no delivered project in the period had both dates. */
  onTimeRate: number | null;
  /** 0–100, null when nothing was delivered in the period. */
  qaFirstPassRate: number | null;
  /** 0–100, null when nothing was delivered in the period. */
  supervisorAcceptRate: number | null;
  /** Reference flags in the rolling window. */
  tier2FlagCount: number;
  /** 0–5 from the average QA score, null when never scored. */
  avgQuality: number | null;
  /** Worker payout on the period's delivered projects, per month of the period. */
  avgPayoutPerMonth: number;
  /** Counts behind the rates, for the screens that show "n of m". */
  counts: { onTime: number; withDeadline: number; firstPass: number; accepted: number };
}

function pct(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 100);
}

/** When a project counts as delivered for the period: the delivery date, else the completion date. */
export function finishedAt(p: Pick<WorkerProjectFact, "deliveryDate" | "finalCompletionDate">): Date | null {
  return p.deliveryDate ?? p.finalCompletionDate;
}

/** Delivered on time: the delivery date is on or before the internal deadline. Null when either date is missing. */
export function deliveredOnTime(p: Pick<WorkerProjectFact, "deliveryDate" | "internalDeadline">): boolean | null {
  if (!p.deliveryDate || !p.internalDeadline) return null;
  return p.deliveryDate.getTime() <= p.internalDeadline.getTime();
}

/** A first-pass project passed QA without a revision: the Phase 4 stamp, or (older rows) no revision was ever asked for. */
export function passedQaFirstTime(p: Pick<WorkerProjectFact, "qaFirstPassDate" | "revisionCount">): boolean {
  return p.qaFirstPassDate != null || p.revisionCount === 0;
}

/** The supervisor accepted it: never came back for corrections. */
export function supervisorAccepted(p: Pick<WorkerProjectFact, "status" | "supervisorCorrectionCount" | "correctionRounds">): boolean {
  return p.status !== "SUPERVISOR_CORRECTIONS" && p.supervisorCorrectionCount === 0 && p.correctionRounds === 0;
}

export function computeWorkerPerformance(
  projects: readonly WorkerProjectFact[],
  tier2FlagCount: number,
  periodDays: number,
  now: Date = new Date()
): WorkerPerformance {
  const cutoff = new Date(now.getTime() - periodDays * 86_400_000);
  const finished = projects.filter((p) => {
    if (!FINISHED_STATUSES.includes(p.status)) return false;
    const at = finishedAt(p);
    return at != null && at >= cutoff;
  });

  const withDeadline = finished.filter((p) => deliveredOnTime(p) != null);
  const onTime = withDeadline.filter((p) => deliveredOnTime(p) === true).length;
  const firstPass = finished.filter(passedQaFirstTime).length;
  const accepted = finished.filter(supervisorAccepted).length;

  const scores = projects.map((p) => p.qaScore).filter((s): s is number => s != null && Number.isFinite(s));
  const avgQuality = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length / 20) * 10) / 10 : null;

  const payout = finished.reduce((s, p) => s + (p.workerPayout ?? 0), 0);
  const months = Math.max(periodDays / 30, 1);

  return {
    totalCompleted: finished.length,
    onTimeRate: pct(onTime, withDeadline.length),
    qaFirstPassRate: pct(firstPass, finished.length),
    supervisorAcceptRate: pct(accepted, finished.length),
    tier2FlagCount,
    avgQuality,
    avgPayoutPerMonth: Math.round(payout / months),
    counts: { onTime, withDeadline: withDeadline.length, firstPass, accepted },
  };
}

// ── Status and league labels ────────────────────────────────

export type WorkerActivityStatus = "Active" | "Busy" | "Inactive" | "On Break" | "Suspended" | "Terminated";

/**
 * The directory's status column. The record's own status wins when it is a
 * manual one (On Break, Suspended, Terminated); an active worker is Busy at
 * or above capacity, Inactive after two quiet weeks with nothing assigned,
 * else Active.
 */
export function workerActivityStatus(input: {
  status: string;
  activeProjects: number;
  maxConcurrentProjects: number;
  lastActiveAt: Date | null;
  now?: Date;
}): WorkerActivityStatus {
  if (input.status === "Suspended" || input.status === "Terminated" || input.status === "On Break") return input.status;
  if (input.activeProjects >= Math.max(input.maxConcurrentProjects, 1)) return "Busy";
  const now = input.now ?? new Date();
  if (input.activeProjects === 0) {
    const last = input.lastActiveAt;
    if (!last || now.getTime() - last.getTime() > INACTIVE_AFTER_DAYS * 86_400_000) return "Inactive";
  }
  return "Active";
}

export type PerformanceLabel = "Excellent" | "Good" | "Watch" | "Review";

/**
 * The league table's status. Review: flags at the warning level, any rate
 * far under target (20 points or more), or two rates under target with a
 * flag. Watch: two rates under target, one under target with a flag, or two
 * flags. Excellent: every measured rate at 100 and no flags. Otherwise Good.
 */
export function performanceLabel(
  perf: Pick<WorkerPerformance, "onTimeRate" | "qaFirstPassRate" | "supervisorAcceptRate" | "tier2FlagCount">
): PerformanceLabel {
  const rates: [number | null, number][] = [
    [perf.onTimeRate, WORKER_TARGETS.onTimeRate],
    [perf.qaFirstPassRate, WORKER_TARGETS.qaFirstPassRate],
    [perf.supervisorAcceptRate, WORKER_TARGETS.supervisorAcceptRate],
  ];
  let under = 0;
  let farUnder = 0;
  let perfect = 0;
  let measured = 0;
  for (const [rate, target] of rates) {
    if (rate == null) continue;
    measured++;
    if (rate === 100) perfect++;
    if (rate < target - 20) farUnder++;
    else if (rate < target) under++;
  }
  const flags = perf.tier2FlagCount;
  if (flags >= TIER2_FLAG_WARNING || farUnder > 0 || (under >= 2 && flags > 0)) return "Review";
  if (under >= 2 || (under === 1 && flags > 0) || flags >= 2) return "Watch";
  if (measured > 0 && perfect === measured && flags === 0) return "Excellent";
  return "Good";
}
