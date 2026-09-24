import type { ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveMonth } from "@/lib/services/reports";
import { getExpectedHours } from "@/lib/services/operations/pipeline";
import { tier2FlagCounts } from "@/lib/operations/worker-metrics";
import {
  deliveredOnTime,
  passedQaFirstTime,
  performanceLabel,
  supervisorAccepted,
  WORKER_TARGETS,
  type PerformanceLabel,
} from "@/lib/operations/worker-performance";
import type { ExpectedHours } from "@/lib/operations/pipeline-stages";

/**
 * The COO's monthly operations report: the headline rates, how long
 * projects sat in each status, the worker league table, delivery by
 * department, and supervisor corrections. Every number comes from the
 * database for the month asked for.
 */

export interface OperationsKpi {
  /** 0–100, null when there is nothing to measure. */
  value: number | null;
  target: number;
  count: number;
  total: number;
  /** Null when there is no value. */
  ok: boolean | null;
}

export interface TimingRow {
  key: string;
  label: string;
  avgDays: number | null;
  targetDays: number | null;
  samples: number;
  ok: boolean | null;
}

export interface LeagueRow {
  rank: number;
  workerId: string;
  name: string;
  projects: number;
  onTimeRate: number | null;
  qaFirstPassRate: number | null;
  supervisorAcceptRate: number | null;
  flags: number;
  label: PerformanceLabel;
}

export interface DepartmentRow {
  department: string;
  projects: number;
  avgDeliveryDays: number | null;
  onTimeRate: number | null;
  belowTarget: boolean;
}

export interface CorrectionsSummary {
  delivered: number;
  zero: number;
  one: number;
  twoPlus: number;
  items: { projectCode: string; workerName: string | null; department: string; rounds: number; note: string | null; status: string }[];
}

export interface OperationsReport {
  month: string;
  monthLabel: string;
  generatedAt: string;
  kpis: {
    onTime: OperationsKpi;
    qaFirstPass: OperationsKpi;
    supervisorAccept: OperationsKpi;
    completed: { value: number; lastMonth: number; delivered: number };
  };
  timing: TimingRow[];
  league: LeagueRow[];
  star: { name: string; projects: number; summary: string } | null;
  departments: DepartmentRow[];
  corrections: CorrectionsSummary;
}

const TARGETS = { onTime: WORKER_TARGETS.onTimeRate, qaFirstPass: WORKER_TARGETS.qaFirstPassRate, supervisorAccept: WORKER_TARGETS.supervisorAcceptRate };

function kpi(count: number, total: number, target: number): OperationsKpi {
  const value = total === 0 ? null : Math.round((count / total) * 100);
  return { value, target, count, total, ok: value == null ? null : value >= target };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Pipeline timing ─────────────────────────────────────────

interface TimingPair {
  key: string;
  label: string;
  from: ProjectStatus;
  to: ProjectStatus;
  /** Which status's expected time is the target (null: the deadline decides). */
  targetOf: ProjectStatus | null;
}

const TIMING_PAIRS: TimingPair[] = [
  { key: "new-verified", label: "New → downpayment verified", from: "NEW", to: "DOWNPAYMENT_VERIFIED", targetOf: "NEW" },
  { key: "verified-confirmed", label: "Downpayment verified → confirmed", from: "DOWNPAYMENT_VERIFIED", to: "REQUIREMENTS_CONFIRMED", targetOf: "DOWNPAYMENT_VERIFIED" },
  { key: "confirmed-assigned", label: "Confirmed → assigned", from: "REQUIREMENTS_CONFIRMED", to: "ASSIGNED", targetOf: "REQUIREMENTS_CONFIRMED" },
  { key: "assigned-progress", label: "Assigned → in progress", from: "ASSIGNED", to: "IN_PROGRESS", targetOf: "ASSIGNED" },
  { key: "progress-submitted", label: "In progress → submitted", from: "IN_PROGRESS", to: "SUBMITTED", targetOf: null },
  { key: "submitted-qa", label: "Submitted → QA review", from: "SUBMITTED", to: "IN_QA_REVIEW", targetOf: "SUBMITTED" },
  { key: "qa-approved", label: "QA review → approved", from: "IN_QA_REVIEW", to: "APPROVED", targetOf: "IN_QA_REVIEW" },
  { key: "approved-delivered", label: "Approved → delivered", from: "APPROVED", to: "DELIVERED", targetOf: "APPROVED" },
];

async function pipelineTiming(start: Date, end: Date, expected: ExpectedHours): Promise<TimingRow[]> {
  const touched = await db.projectStatusLog.findMany({ where: { createdAt: { gte: start, lt: end } }, select: { projectId: true }, distinct: ["projectId"] });
  const ids = touched.map((t) => t.projectId);
  const logs = ids.length
    ? await db.projectStatusLog.findMany({ where: { projectId: { in: ids } }, orderBy: { createdAt: "asc" }, select: { projectId: true, toStatus: true, createdAt: true } })
    : [];
  const byProject = new Map<string, { toStatus: ProjectStatus; createdAt: Date }[]>();
  for (const l of logs) byProject.set(l.projectId, [...(byProject.get(l.projectId) ?? []), l]);

  return TIMING_PAIRS.map((pair) => {
    const hours: number[] = [];
    for (const entries of byProject.values()) {
      // The transition counts for the month it completed in.
      const arrival = entries.find((e) => e.toStatus === pair.to && e.createdAt >= start && e.createdAt < end);
      if (!arrival) continue;
      const before = entries.filter((e) => e.toStatus === pair.from && e.createdAt <= arrival.createdAt);
      const entered = before[before.length - 1];
      if (!entered) continue;
      hours.push((arrival.createdAt.getTime() - entered.createdAt.getTime()) / 3_600_000);
    }
    const avgDays = hours.length ? round1(hours.reduce((a, b) => a + b, 0) / hours.length / 24) : null;
    const targetHours = pair.targetOf ? expected[pair.targetOf] : null;
    const targetDays = targetHours != null ? round1(targetHours / 24) : null;
    return { key: pair.key, label: pair.label, avgDays, targetDays, samples: hours.length, ok: avgDays == null || targetDays == null ? null : avgDays <= targetDays };
  });
}

// ── The report ──────────────────────────────────────────────

export async function getOperationsReport(rawMonth?: string, now: Date = new Date()): Promise<OperationsReport> {
  const { month, start, end } = resolveMonth(rawMonth, now);
  const lastMonthStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const monthLabel = new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric", timeZone: "UTC" }).format(start);
  const inRange = { gte: start, lt: end };

  const [delivered, approvedLogs, completedThisMonth, completedLastMonth, expected] = await Promise.all([
    db.project.findMany({
      where: { deliveryDate: inRange, status: { in: ["DELIVERED", "SUPERVISOR_CORRECTIONS", "COMPLETED"] } },
      select: {
        id: true,
        projectId: true,
        status: true,
        deliveryDate: true,
        internalDeadline: true,
        assignedDate: true,
        finalCompletionDate: true,
        qaFirstPassDate: true,
        revisionCount: true,
        supervisorCorrectionCount: true,
        supervisorCorrectionDetails: true,
        workerId: true,
        worker: { select: { id: true, fullName: true } },
        client: { select: { department: true } },
        correctionRounds: { orderBy: { roundNumber: "desc" }, take: 1, select: { clientNote: true, status: true } },
        _count: { select: { correctionRounds: true } },
      },
    }),
    db.projectStatusLog.findMany({ where: { toStatus: "APPROVED", createdAt: inRange }, select: { projectId: true }, distinct: ["projectId"] }),
    db.project.count({ where: { finalCompletionDate: inRange } }),
    db.project.count({ where: { finalCompletionDate: { gte: lastMonthStart, lt: start } } }),
    getExpectedHours(),
  ]);

  // Headline rates
  const withDeadline = delivered.filter((p) => deliveredOnTime(p) != null);
  const onTime = withDeadline.filter((p) => deliveredOnTime(p) === true).length;
  const approvedIds = approvedLogs.map((l) => l.projectId);
  const approved = approvedIds.length
    ? await db.project.findMany({ where: { id: { in: approvedIds } }, select: { qaFirstPassDate: true, revisionCount: true } })
    : [];
  const firstPass = approved.filter(passedQaFirstTime).length;
  const facts = delivered.map((p) => ({ status: p.status, supervisorCorrectionCount: p.supervisorCorrectionCount, correctionRounds: p._count.correctionRounds }));
  const accepted = facts.filter(supervisorAccepted).length;

  // Worker league (this month's delivered projects)
  const byWorker = new Map<string, typeof delivered>();
  for (const p of delivered) {
    if (!p.worker) continue;
    byWorker.set(p.worker.id, [...(byWorker.get(p.worker.id) ?? []), p]);
  }
  const flags = await tier2FlagCounts([...byWorker.keys()], now);
  const league: LeagueRow[] = [...byWorker.entries()]
    .map(([workerId, rows]) => {
      const wd = rows.filter((p) => deliveredOnTime(p) != null);
      const wOnTime = wd.filter((p) => deliveredOnTime(p) === true).length;
      const wFirst = rows.filter(passedQaFirstTime).length;
      const wAccepted = rows.filter((p) => supervisorAccepted({ status: p.status, supervisorCorrectionCount: p.supervisorCorrectionCount, correctionRounds: p._count.correctionRounds })).length;
      const perf = {
        onTimeRate: wd.length ? Math.round((wOnTime / wd.length) * 100) : null,
        qaFirstPassRate: rows.length ? Math.round((wFirst / rows.length) * 100) : null,
        supervisorAcceptRate: rows.length ? Math.round((wAccepted / rows.length) * 100) : null,
        tier2FlagCount: flags.get(workerId) ?? 0,
      };
      return {
        rank: 0,
        workerId,
        name: rows[0].worker?.fullName ?? "Worker",
        projects: rows.length,
        onTimeRate: perf.onTimeRate,
        qaFirstPassRate: perf.qaFirstPassRate,
        supervisorAcceptRate: perf.supervisorAcceptRate,
        flags: perf.tier2FlagCount,
        label: performanceLabel(perf),
      };
    })
    .sort((a, b) => b.projects - a.projects || (b.onTimeRate ?? 0) - (a.onTimeRate ?? 0) || (b.qaFirstPassRate ?? 0) - (a.qaFirstPassRate ?? 0))
    .map((row, i) => ({ ...row, rank: i + 1 }));
  const top = league[0];
  const star =
    top && top.label === "Excellent"
      ? { name: top.name, projects: top.projects, summary: `${top.projects} project${top.projects === 1 ? "" : "s"}, all on time, all accepted first time` }
      : null;

  // Department breakdown
  const byDept = new Map<string, { label: string; rows: typeof delivered }>();
  for (const p of delivered) {
    const raw = p.client.department.trim() || "Unspecified";
    const key = raw.toLowerCase();
    const entry = byDept.get(key) ?? { label: raw, rows: [] };
    entry.rows.push(p);
    byDept.set(key, entry);
  }
  const departments: DepartmentRow[] = [...byDept.values()]
    .map(({ label, rows }) => {
      const spans = rows.filter((p) => p.assignedDate && p.deliveryDate).map((p) => (p.deliveryDate!.getTime() - p.assignedDate!.getTime()) / 86_400_000);
      const dd = rows.filter((p) => deliveredOnTime(p) != null);
      const dOnTime = dd.filter((p) => deliveredOnTime(p) === true).length;
      const onTimeRate = dd.length ? Math.round((dOnTime / dd.length) * 100) : null;
      return {
        department: label,
        projects: rows.length,
        avgDeliveryDays: spans.length ? round1(spans.reduce((a, b) => a + b, 0) / spans.length) : null,
        onTimeRate,
        belowTarget: onTimeRate != null && onTimeRate < TARGETS.onTime,
      };
    })
    .sort((a, b) => b.projects - a.projects);

  // Supervisor corrections
  const rounds = (p: (typeof delivered)[number]) => Math.max(p._count.correctionRounds, p.supervisorCorrectionCount, p.status === "SUPERVISOR_CORRECTIONS" ? 1 : 0);
  const corrections: CorrectionsSummary = {
    delivered: delivered.length,
    zero: delivered.filter((p) => rounds(p) === 0).length,
    one: delivered.filter((p) => rounds(p) === 1).length,
    twoPlus: delivered.filter((p) => rounds(p) >= 2).length,
    items: delivered
      .filter((p) => rounds(p) > 0)
      .map((p) => ({
        projectCode: p.projectId,
        workerName: p.worker?.fullName ?? null,
        department: p.client.department,
        rounds: rounds(p),
        note: p.correctionRounds[0]?.clientNote ?? p.supervisorCorrectionDetails,
        status: p.status === "SUPERVISOR_CORRECTIONS" ? "in progress" : p.correctionRounds[0]?.status === "ESCALATED" ? "escalated" : "resolved",
      })),
  };

  return {
    month,
    monthLabel,
    generatedAt: now.toISOString(),
    kpis: {
      onTime: kpi(onTime, withDeadline.length, TARGETS.onTime),
      qaFirstPass: kpi(firstPass, approved.length, TARGETS.qaFirstPass),
      supervisorAccept: kpi(accepted, delivered.length, TARGETS.supervisorAccept),
      completed: { value: completedThisMonth, lastMonth: completedLastMonth, delivered: delivered.length },
    },
    timing: await pipelineTiming(start, end, expected),
    league,
    star,
    departments,
    corrections,
  };
}
