import type { Prisma, ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { ANNUAL_REVENUE_TARGET } from "@/lib/constants";
import { CLOSED_STATUSES } from "@/lib/status";
import { WORKER_ACTIVE_STATUSES } from "@/lib/worker-metrics";
import { formatNaira } from "@/lib/utils";
import { getRevenueHistory } from "@/lib/services/finance/dashboard";
import { payoutTotalsForMonth } from "@/lib/services/finance/payouts-engine";
import { getBucketBalances } from "@/lib/services/finance/buckets";
import { listOutstandingBalances } from "@/lib/services/finance/revenue";
import { monthRange, netRevenueBetween, netRevenueForMonths } from "@/lib/services/finance/surplus";
import {
  DAY_MS,
  currentMonthKey,
  lastMonths,
  monthBounds,
  monthKey,
  monthLongLabel,
  pctChange,
  samePointLastMonth,
  shiftMonth,
  watDayOfMonth,
  watMonthKey,
} from "@/lib/command-center/time";
import {
  CAPACITY_BAND,
  CORRECTIONS_SHARE,
  WORKER_FLAGS_MAX,
  bandTargetLabel,
  growthStatus,
  ragStatus,
  rateTargetLabel,
  fractionToPercent,
  type ThresholdMap,
} from "@/lib/command-center/rag";
import { deliveredOnTime, ratePercent, supervisorAccepted, type ContentConsistency } from "@/lib/command-center/derive";
import { formatCount, formatPercent } from "@/lib/command-center/presentation";
import type {
  HealthKpis,
  HealthPayload,
  RagStatus,
  RevenueTrendPoint,
  ScorecardRow,
  Throughput,
} from "@/lib/command-center/types";
import {
  ACTIVE_WINDOW_DAYS,
  activationSnapshot,
  activeSchools,
  conversionsBetween,
  countConversions,
  type ActivationSnapshot,
} from "./ambassador-activity";
import { getThresholds } from "./settings";
import { contentConsistency } from "./sources/phase3";
import { correctionRoundCounts, tier2FlagCounts, type Tier2FlagCounts } from "./sources/phase4";

/**
 * The Business health tab (Phase 5): four KPIs with six-month sparklines,
 * the RAG scorecard, the revenue-and-margin trend and the throughput
 * counters. Read-only, JSON-serialisable, cached 5 minutes by the route.
 *
 * ONE definition per figure, always the owning platform's:
 * - revenue = `netRevenueForMonths` (confirmed client money less refunds,
 *   by Payment.date, UTC months) through `getRevenueHistory`;
 * - retained = Σ BucketAllocationLog.retainedAmount for the month, i.e.
 *   EduCraft's share of the money that actually came in — so gross margin
 *   (retained ÷ revenue) ties to the Bucket Manager, not to PayoutRecords,
 *   which are completion-based and sit on a different month key;
 * - on-time delivery and supervisor acceptance are the Operations report's
 *   (Phase 4): projects delivered this month by `deliveryDate`, on time when
 *   delivered by the internal deadline, accepted when never sent back for
 *   corrections;
 * - ambassador activation, conversions and active schools are the
 *   Ambassador Dashboard's (Phase 3), through `ambassador-activity.ts`;
 * - QA first-pass rate and Reference Tier 2 pass rate come from the Report
 *   Production System's automated quality gates, which do not exist yet:
 *   both rows show "Awaiting data" and query nothing.
 *
 * Reads run in small sequential groups (≤ 5 concurrent) because the Prisma
 * pool is 9 connections locally; correctness beats speed under the cache.
 */

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** "COMPLETED", "CANCELLED", "REFUNDED" — REFUNDED is not active either. */
const CLOSED: ProjectStatus[] = [...CLOSED_STATUSES];

/** Delivered and not taken back (the Operations report's month of deliveries). */
const DELIVERED_STATUSES: ProjectStatus[] = ["DELIVERED", "SUPERVISOR_CORRECTIONS", "COMPLETED"];

/** Setting key the founder edits on /admin/settings; falls back to the constant. */
const ANNUAL_TARGET_KEY = "annual_revenue_target";

/** What an untracked metric shows in the value column. */
const AWAITING = "Awaiting data";

// ── Active projects over time ─────────────────────────────────────

/**
 * Active at instant T = created by T and not closed by T. "Closed by T" =
 * a closed status now AND evidence of closing by T: the completion stamp, a
 * status-log row into a closed status, or — for legacy imports that carry
 * neither — the row's own `updatedAt`. At T = now this is exactly
 * count(status not closed), the KPI's own value.
 */
function activeAtWhere(t: Date): Prisma.ProjectWhereInput {
  return {
    createdAt: { lte: t },
    NOT: {
      status: { in: CLOSED },
      OR: [
        { finalCompletionDate: { lte: t } },
        { statusLog: { some: { toStatus: { in: CLOSED }, createdAt: { lte: t } } } },
        { finalCompletionDate: null, statusLog: { none: { toStatus: { in: CLOSED } } }, updatedAt: { lte: t } },
      ],
    },
  };
}

/**
 * The active count at each of the six month ends (the current month at
 * `now`, so the series ends with today's figure): six counts, however many
 * projects there are — never a scan of every project.
 */
async function activeProjectSeries(months: string[], now: Date): Promise<number[]> {
  const current = currentMonthKey(now);
  const instants = months.map((m) => (m === current ? now : new Date(monthBounds(m).end.getTime() - 1)));
  return Promise.all(instants.map((t) => db.project.count({ where: activeAtWhere(t) })));
}

// ── Operating month ───────────────────────────────────────────────

/** 1-based months since the first confirmed client payment (or the first project), inclusive. */
function operatingMonthFrom(first: Date | null, now: Date): number {
  if (!first) return 1;
  const [fy, fm] = monthKey(first).split("-").map(Number);
  const [cy, cm] = currentMonthKey(now).split("-").map(Number);
  return Math.max(1, (cy - fy) * 12 + (cm - fm) + 1);
}

function annualTargetFrom(raw: string | null | undefined): number {
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : ANNUAL_REVENUE_TARGET;
}

// ── Scorecard helpers ─────────────────────────────────────────────

/** Fractions in settings ("0.95") → the percent the metrics are in (rounded, so float noise never moves a verdict). */
function pct(fraction: number): number {
  return fractionToPercent(fraction);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

function rateRow(input: {
  key: string;
  domain: ScorecardRow["domain"];
  metric: string;
  rate: number | null;
  target: number;
  amber: number;
  href: string;
  note: string | null;
}): ScorecardRow {
  const target = pct(input.target);
  const amber = pct(input.amber);
  return {
    key: input.key,
    domain: input.domain,
    metric: input.metric,
    actual: input.rate,
    actualLabel: formatPercent(input.rate),
    targetLabel: rateTargetLabel(input.target),
    status: ragStatus("higher", input.rate, target, amber),
    href: input.href,
    note: input.note,
  };
}

/** A metric whose data does not exist yet: shown, never hidden, with "Awaiting data" and no verdict. */
function awaitingRow(input: {
  key: string;
  domain: ScorecardRow["domain"];
  metric: string;
  targetLabel: string;
  href: string;
  note: string;
}): ScorecardRow {
  return { ...input, actual: null, actualLabel: AWAITING, status: "neutral" };
}

function growingRow(input: {
  key: string;
  domain: ScorecardRow["domain"];
  metric: string;
  current: number;
  previous: number;
  /** What `previous` is, for the note: "at this point last month", "in the 30 days before". */
  previousLabel: string;
  href: string;
  lead?: string;
}): ScorecardRow {
  return {
    key: input.key,
    domain: input.domain,
    metric: input.metric,
    actual: input.current,
    actualLabel: formatCount(input.current),
    targetLabel: "growing",
    status: growthStatus(input.current, input.previous),
    href: input.href,
    note: `${input.lead ? `${input.lead} · ` : ""}${formatCount(input.previous)} ${input.previousLabel}`,
  };
}

// ── The payload ───────────────────────────────────────────────────

export async function getHealth(now: Date = new Date()): Promise<HealthPayload> {
  const month = currentMonthKey(now);
  const prev = shiftMonth(month, -1);
  // "Last month's payouts are due by the 5th" is a WAT date: take the month and the day from the same calendar.
  const payoutMonth = shiftMonth(watMonthKey(now), -1);
  const samePoint = samePointLastMonth(now);
  const months = lastMonths(6, now);
  const { start: monthStart, end: monthEnd } = monthBounds(month);
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const yearFirstMonth = `${now.getUTCFullYear()}-01`;

  // 1. Six months of revenue + retained (3 concurrent per month, months in sequence).
  const history = await getRevenueHistory(6, now);

  // 2. This month's deliveries, judged the way the Operations report judges them (Phase 4).
  const delivered = await db.project.findMany({
    where: { deliveryDate: { gte: monthStart, lt: monthEnd }, status: { in: DELIVERED_STATUSES } },
    select: { id: true, status: true, deliveryDate: true, internalDeadline: true, supervisorCorrectionCount: true },
  });
  // Rounds recorded in Phase 4's corrections table; before the merge there is none and the counter says it all.
  const rounds = (await correctionRoundCounts(delivered.map((p) => p.id))) ?? new Map<string, number>();

  // 3. Counts, in two groups of five. (Two round trips on five connections
  //    rather than a `$transaction([...])` array, which runs its members one
  //    after another on a single connection.)
  const [inCorrections, projectsAllTime, workersActive, projectsThisYear, clientsThisYear] = await Promise.all([
    db.project.count({ where: { status: "SUPERVISOR_CORRECTIONS" } }),
    db.project.count(),
    db.worker.count({ where: { status: "Active" } }),
    db.project.count({ where: { createdAt: { gte: yearStart } } }),
    db.client.count({ where: { createdAt: { gte: yearStart } } }),
  ]);
  const [projectsThisMonth, clientsThisMonth, targetSetting, firstPayment, firstProject] = await Promise.all([
    db.project.count({ where: { createdAt: { gte: monthStart, lt: monthEnd } } }),
    db.client.count({ where: { createdAt: { gte: monthStart, lt: monthEnd } } }),
    db.setting.findUnique({ where: { key: ANNUAL_TARGET_KEY }, select: { value: true } }),
    db.payment.findFirst({
      where: { status: "Confirmed", direction: "INFLOW", type: { in: ["CLIENT_DOWNPAYMENT", "CLIENT_BALANCE"] } },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
    // Fallback for the operating month when no client payment is confirmed yet.
    db.project.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);

  // 4. Finance services + the heavier reads (5 concurrent).
  const [activeSeries, workers, buckets, outstanding, prevPayouts] = await Promise.all([
    activeProjectSeries(months, now),
    db.worker.findMany({
      where: { status: { in: ["Active", "On Break"] } },
      select: {
        maxConcurrentProjects: true,
        _count: { select: { projects: { where: { status: { in: WORKER_ACTIVE_STATUSES } } } } },
      },
    }),
    getBucketBalances(),
    listOutstandingBalances(now),
    payoutTotalsForMonth(payoutMonth),
  ]);

  // 5. Growth (Phase 3's definitions): conversions this month so far and over the same stretch of last
  //    month (never all of it), the last 60 days for activity, and the same-point revenue.
  const [conversionsNow, conversionsPrev, recent, revenueSamePoint] = await Promise.all([
    conversionsBetween(monthStart, monthEnd),
    conversionsBetween(samePoint.start, samePoint.end),
    conversionsBetween(new Date(now.getTime() - 2 * ACTIVE_WINDOW_DAYS * DAY_MS), null),
    netRevenueBetween(samePoint.start, samePoint.end),
  ]);

  // 6. The rest, in two small groups.
  const [activation, clientSchools, revenueThisYear] = await Promise.all([
    activationSnapshot(now, recent),
    db.client.groupBy({ by: ["universityId"] }),
    netRevenueForMonths(monthRange(yearFirstMonth, month)),
  ]);
  const [thresholds, content, flags] = await Promise.all([getThresholds(), contentConsistency(now), tier2FlagCounts(now)]);

  // ── KPIs ──
  const target = annualTargetFrom(targetSetting?.value);
  const current = history[history.length - 1];
  const previous = history[history.length - 2];
  const marginOf = (p: { revenue: number; retained: number }): number | null =>
    p.revenue > 0 ? round1((p.retained / p.revenue) * 100) : null;
  const goalOf = (revenue: number): number => round1(((revenue * 12) / target) * 100);

  const currentMargin = marginOf(current);
  const kpis: HealthKpis = {
    revenue: {
      value: current.revenue,
      previous: revenueSamePoint,
      previousLabel: "this time last month",
      sparkline: history.map((p) => p.revenue),
      unit: "naira",
      href: "/admin/finance/revenue",
    },
    activeProjects: {
      value: activeSeries[activeSeries.length - 1],
      previous: activeSeries[activeSeries.length - 2],
      sparkline: activeSeries,
      unit: "count",
      href: "/admin/projects",
    },
    grossMargin: {
      // With no revenue yet this month the margin is undefined, not 0% — say so rather than draw a collapse.
      value: currentMargin ?? 0,
      previous: currentMargin === null ? null : marginOf(previous),
      emptyLabel: currentMargin === null ? "No revenue yet this month" : null,
      sparkline: history.map((p) => marginOf(p) ?? 0),
      unit: "percent",
      href: "/admin/finance/buckets",
    },
    goalProgress: {
      value: goalOf(current.revenue),
      previous: goalOf(revenueSamePoint),
      previousLabel: "this time last month",
      sparkline: history.map((p) => goalOf(p.revenue)),
      unit: "percent",
      href: "/admin/finance/reports",
    },
  };

  // ── Scorecard ──
  const judged = delivered.filter((p) => deliveredOnTime(p.deliveryDate, p.internalDeadline) !== null);
  const scorecard = buildScorecard({
    thresholds,
    delivery: {
      delivered: delivered.length,
      withDeadline: judged.length,
      onTime: judged.filter((p) => deliveredOnTime(p.deliveryDate, p.internalDeadline) === true).length,
      accepted: delivered.filter((p) =>
        supervisorAccepted({
          status: p.status,
          supervisorCorrectionCount: p.supervisorCorrectionCount,
          correctionRounds: rounds.get(p.id) ?? 0,
        })
      ).length,
    },
    workers,
    activation,
    conversions: { current: countConversions(conversionsNow.rows), previous: countConversions(conversionsPrev.rows) },
    schools: activeSchools(recent, now),
    content,
    opsReserve: buckets.operationsReserve,
    outstanding: {
      amount: Math.round(outstanding.total.amount),
      projects: outstanding.total.count,
      escalate: outstanding.bands.escalate.count,
    },
    prevPayouts: { month: payoutMonth, owed: prevPayouts.owed, unpaid: prevPayouts.unpaid, dayOfMonth: watDayOfMonth(now) },
    revenue: { current: current.revenue, previous: revenueSamePoint, previousMonth: prev },
    flags,
    corrections: { count: inCorrections, active: kpis.activeProjects.value },
  });

  // ── Trend ──
  const revenueTrend: RevenueTrendPoint[] = history.map((p) => ({
    month: p.month,
    label: p.label,
    revenue: p.revenue,
    margin: marginOf(p),
  }));

  // ── Throughput ──
  const throughput: Throughput = {
    allTime: { projects: projectsAllTime, workers: workersActive, schools: clientSchools.length },
    thisYear: { projects: projectsThisYear, revenue: revenueThisYear, clients: clientsThisYear },
    thisMonth: { projects: projectsThisMonth, revenue: current.revenue, clients: clientsThisMonth },
  };

  return {
    generatedAt: now.toISOString(),
    month,
    monthLabel: monthLongLabel(month),
    operatingMonth: operatingMonthFrom(firstPayment?.date ?? firstProject?.createdAt ?? null, now),
    kpis,
    scorecard,
    revenueTrend,
    throughput,
  };
}

// ── Scorecard ─────────────────────────────────────────────────────

interface ScorecardInput {
  thresholds: ThresholdMap;
  /** This month's deliveries (Operations report): all of them, those with an internal deadline, on time, accepted. */
  delivery: { delivered: number; withDeadline: number; onTime: number; accepted: number };
  workers: { maxConcurrentProjects: number; _count: { projects: number } }[];
  activation: ActivationSnapshot;
  conversions: { current: number; previous: number };
  schools: { current: number; previous: number };
  /** Null until the Ambassador Platform's content log is in this build. */
  content: ContentConsistency | null;
  opsReserve: number;
  outstanding: { amount: number; projects: number; escalate: number };
  prevPayouts: { month: string; owed: number; unpaid: number; dayOfMonth: number };
  /** Month so far, and last month up to the same point. */
  revenue: { current: number; previous: number; previousMonth: string };
  /** Null until the Operations Platform's worker flags are in this build. */
  flags: Tier2FlagCounts | null;
  corrections: { count: number; active: number };
}

function buildScorecard(i: ScorecardInput): ScorecardRow[] {
  const t = i.thresholds;
  const d = i.delivery;

  // OPERATIONS
  const onTime = rateRow({
    key: "ops.on_time",
    domain: "OPERATIONS",
    metric: "On-time delivery",
    rate: ratePercent(d.onTime, d.withDeadline),
    target: t["cc.ops.delivery_rate.target"],
    amber: t["cc.ops.delivery_rate.amber"],
    href: "/admin/reports/operations",
    note:
      d.withDeadline > 0
        ? `${formatCount(d.onTime)} of ${plural(d.withDeadline, "delivery", "deliveries")} this month met the internal deadline`
        : "No deliveries with an internal deadline this month yet",
  });

  // Judged on the Report Production System's automated quality gates, which do not exist yet.
  const qaFirstPass = awaitingRow({
    key: "ops.qa_first_pass",
    domain: "OPERATIONS",
    metric: "QA first-pass rate",
    targetLabel: rateTargetLabel(t["cc.ops.qa_first_pass.target"]),
    href: "/admin/qa",
    note: "Arrives with the Report Production System's automated quality gates",
  });

  const supervisorAccept = rateRow({
    key: "ops.supervisor_accept",
    domain: "OPERATIONS",
    metric: "Supervisor acceptance",
    rate: ratePercent(d.accepted, d.delivered),
    target: t["cc.ops.supervisor_accept.target"],
    amber: t["cc.ops.supervisor_accept.amber"],
    href: "/admin/projects?status=SUPERVISOR_CORRECTIONS",
    note:
      d.delivered > 0
        ? `${formatCount(d.accepted)} of ${plural(d.delivered, "delivery", "deliveries")} this month needed no supervisor corrections`
        : "No deliveries this month yet",
  });

  // Worker capacity = active assignments ÷ concurrent slots over Active + On Break workers.
  const slots = i.workers.reduce((s, w) => s + w.maxConcurrentProjects, 0);
  const load = i.workers.reduce((s, w) => s + w._count.projects, 0);
  const utilisation = slots > 0 ? Math.round((load / slots) * 100) : null;
  const capacity: ScorecardRow = {
    key: "ops.capacity",
    domain: "OPERATIONS",
    metric: "Worker capacity in use",
    actual: utilisation,
    actualLabel: formatPercent(utilisation),
    targetLabel: bandTargetLabel(CAPACITY_BAND),
    status: ragStatus("band", utilisation, CAPACITY_BAND.low, CAPACITY_BAND.tolerance, CAPACITY_BAND.high),
    href: "/admin/workers",
    note:
      slots > 0
        ? `${formatCount(load)} of ${plural(slots, "slot")} in use across ${plural(i.workers.length, "worker")}`
        : "No active workers",
  };

  // GROWTH
  const a = i.activation;
  const activation = rateRow({
    key: "growth.activation",
    domain: "GROWTH",
    metric: "Ambassador activation rate",
    rate: a.rate,
    target: t["cc.growth.activation_rate.target"],
    amber: t["cc.growth.activation_rate.amber"],
    href: "/admin/ambassadors",
    note:
      a.total > 0
        ? `${formatCount(a.active)} of ${plural(a.total, "ambassador")} converted a client in the last 30 days`
        : "No ambassadors yet",
  });

  const conversions = growingRow({
    key: "growth.conversions",
    domain: "GROWTH",
    metric: "New conversions this month",
    current: i.conversions.current,
    previous: i.conversions.previous,
    previousLabel: "at this point last month",
    href: "/admin/ambassadors",
  });

  const schools = growingRow({
    key: "growth.schools",
    domain: "GROWTH",
    metric: "Schools with active ambassadors",
    current: i.schools.current,
    previous: i.schools.previous,
    previousLabel: "in the 30 days before",
    lead: "An ambassador there converted a client in the last 30 days",
    href: "/admin/ambassadors/schools",
  });

  const c = i.content;
  const content =
    c === null
      ? awaitingRow({
          key: "growth.content",
          domain: "GROWTH",
          metric: "Content consistency (3×/week)",
          targetLabel: rateTargetLabel(t["cc.growth.content_consistency.target"]),
          href: "/admin/growth",
          note: "Arrives with the Ambassador Platform's content log",
        })
      : rateRow({
          key: "growth.content",
          domain: "GROWTH",
          metric: "Content consistency (3×/week)",
          rate: c.rate,
          target: t["cc.growth.content_consistency.target"],
          amber: t["cc.growth.content_consistency.amber"],
          href: "/admin/ambassadors/content",
          note: `${formatCount(c.made)} of ${plural(c.expected, "rhythm post")} went out in the last ${c.weeks} full weeks`,
        });

  // FINANCE
  const reserveMin = t["cc.finance.ops_reserve_min"];
  const reserveCritical = t["cc.finance.ops_reserve_critical"];
  const opsReserve: ScorecardRow = {
    key: "finance.ops_reserve",
    domain: "FINANCE",
    metric: "Operations Reserve balance",
    actual: i.opsReserve,
    actualLabel: formatNaira(i.opsReserve, { compact: true }),
    targetLabel: `≥ ${formatNaira(reserveMin, { compact: true })}`,
    status: ragStatus("higher", i.opsReserve, reserveMin, reserveCritical),
    href: "/admin/finance/buckets?bucket=OPERATIONS_RESERVE",
    note: `Critical below ${formatNaira(reserveCritical, { compact: true })}`,
  };

  const outstandingStatus: RagStatus =
    i.outstanding.amount === 0 ? "green" : i.outstanding.escalate > 0 ? "red" : "amber";
  const outstanding: ScorecardRow = {
    key: "finance.outstanding",
    domain: "FINANCE",
    metric: "Outstanding balances",
    actual: i.outstanding.amount,
    actualLabel: formatNaira(i.outstanding.amount, { compact: true }),
    targetLabel: "→ zero",
    status: outstandingStatus,
    href: "/admin/finance/revenue?view=outstanding",
    note:
      i.outstanding.projects > 0
        ? `${plural(i.outstanding.projects, "project")} owe a balance · ${formatCount(i.outstanding.escalate)} over 14 days`
        : null,
  };

  // Payout timeliness: last month's payouts are due by the 5th (WAT).
  const p = i.prevPayouts;
  let payoutStatus: RagStatus;
  let payoutLabel: string;
  let payoutNote: string;
  if (p.owed === 0) {
    payoutStatus = "neutral";
    payoutLabel = "Nothing owed";
    payoutNote = `No payouts were owed for ${monthLongLabel(p.month)}`;
  } else if (p.unpaid === 0) {
    payoutStatus = "green";
    payoutLabel = "Done";
    payoutNote = `${monthLongLabel(p.month)}: ${formatNaira(p.owed)} paid in full`;
  } else if (p.dayOfMonth < 5) {
    payoutStatus = "amber";
    payoutLabel = "Due by the 5th";
    payoutNote = `${monthLongLabel(p.month)}: ${formatNaira(p.unpaid)} of ${formatNaira(p.owed)} still pending`;
  } else {
    payoutStatus = "red";
    payoutLabel = "Late";
    payoutNote = `${monthLongLabel(p.month)}: ${formatNaira(p.unpaid)} of ${formatNaira(p.owed)} still pending`;
  }
  const payoutTimeliness: ScorecardRow = {
    key: "finance.payout_timeliness",
    domain: "FINANCE",
    metric: "Payout timeliness",
    actual: p.unpaid,
    actualLabel: payoutLabel,
    targetLabel: "By the 5th",
    status: payoutStatus,
    href: `/admin/finance/payouts?month=${p.month}`,
    note: payoutNote,
  };

  const growth = pctChange(i.revenue.current, i.revenue.previous);
  const growthRow: ScorecardRow = {
    key: "finance.mom_growth",
    domain: "FINANCE",
    metric: "Month-over-month revenue growth",
    actual: growth,
    actualLabel: growth === null ? "—" : `${growth > 0 ? "+" : ""}${formatPercent(growth, 1)}`,
    targetLabel: "positive",
    status: growth === null ? "neutral" : growth > 0 ? "green" : growth === 0 ? "amber" : "red",
    href: "/admin/finance/revenue",
    note:
      growth === null
        ? `Nothing at this point in ${monthLongLabel(i.revenue.previousMonth)} to compare`
        : `${formatNaira(i.revenue.current)} so far vs ${formatNaira(i.revenue.previous)} at this point in ${monthLongLabel(i.revenue.previousMonth)}`,
  };

  // QUALITY
  // Judged on the Report Production System's reference verification, which does not exist yet.
  const tier2 = awaitingRow({
    key: "quality.tier2_pass",
    domain: "QUALITY",
    metric: "Reference Tier 2 pass rate",
    targetLabel: rateTargetLabel(t["cc.quality.tier2_pass.target"]),
    href: "/admin/research-requests",
    note: "Arrives with the Report Production System's reference verification",
  });

  // Open Tier 2 reference flags raised in the last 30 days, counted from the dated flag records.
  const f = i.flags;
  const workersFlagged = f === null ? 0 : [...f.byWorker.values()].filter((n) => n > 0).length;
  const flags: ScorecardRow =
    f === null
      ? awaitingRow({
          key: "quality.worker_flags",
          domain: "QUALITY",
          metric: "Worker flag count (30 days)",
          targetLabel: `≤ ${WORKER_FLAGS_MAX}`,
          href: "/admin/workers",
          note: "Arrives with the Operations Platform's worker flags",
        })
      : {
          key: "quality.worker_flags",
          domain: "QUALITY",
          metric: "Worker flag count (30 days)",
          actual: f.total,
          actualLabel: plural(f.total, "flag"),
          targetLabel: `≤ ${WORKER_FLAGS_MAX}`,
          status: ragStatus("lower", f.total, WORKER_FLAGS_MAX, WORKER_FLAGS_MAX),
          href: "/admin/workers",
          note:
            f.total > 0
              ? `Open Tier 2 reference flags on ${plural(workersFlagged, "worker")}, raised in the last 30 days`
              : "No open Tier 2 reference flags raised in the last 30 days",
        };

  const share = i.corrections.active > 0 ? round1((i.corrections.count / i.corrections.active) * 100) : null;
  const corrections: ScorecardRow = {
    key: "quality.corrections",
    domain: "QUALITY",
    metric: "Projects in supervisor corrections",
    actual: share,
    actualLabel: `${formatCount(i.corrections.count)}/${formatCount(i.corrections.active)}`,
    targetLabel: rateTargetLabel(CORRECTIONS_SHARE.target / 100, "lower"),
    status: ragStatus("lower", share, CORRECTIONS_SHARE.target, CORRECTIONS_SHARE.amber),
    href: "/admin/projects?status=SUPERVISOR_CORRECTIONS",
    note: share === null ? "No active projects" : `${formatPercent(share, share % 1 === 0 ? 0 : 1)} of active projects`,
  };

  return [
    onTime,
    qaFirstPass,
    supervisorAccept,
    capacity,
    activation,
    conversions,
    schools,
    content,
    opsReserve,
    outstanding,
    payoutTimeliness,
    growthRow,
    tier2,
    flags,
    corrections,
  ];
}
