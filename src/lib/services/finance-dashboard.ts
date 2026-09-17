import { db } from "@/lib/db";
import { ANNUAL_REVENUE_TARGET } from "@/lib/constants";
import { getMonthlyReport } from "@/lib/services/reports";
import { getExpensesByCategory } from "@/lib/services/expenses";
import { getPendingPayouts } from "@/lib/services/payouts";

const INFLOW_TYPES = ["CLIENT_DOWNPAYMENT", "CLIENT_BALANCE"] as const;

// ── Date helpers (UTC throughout, matching reports.ts) ──────────────

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}
function startOfWeek(d: Date): Date {
  // ISO week — Monday start.
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  return startOfDay(addDays(d, diff));
}
function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
function startOfYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}
function addYears(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear() + n, 0, 1));
}

async function revenueBetween(start: Date, end: Date): Promise<number> {
  const agg = await db.payment.aggregate({
    where: {
      status: "Confirmed",
      direction: "INFLOW",
      type: { in: [...INFLOW_TYPES] },
      date: { gte: start, lt: end },
    },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/** null = no prior-period data to compare against ("new"). */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

// ── 1. Revenue cards ─────────────────────────────────────────────────

export interface RevenueCard {
  amount: number;
  changePercent: number | null;
}

export interface RevenueCards {
  today: RevenueCard;
  thisWeek: RevenueCard;
  thisMonth: RevenueCard;
  thisYear: RevenueCard & { targetPercent: number };
}

export async function getRevenueCards(now: Date = new Date()): Promise<RevenueCards> {
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);
  const yearStart = startOfYear(now);

  const [today, yesterday, week, prevWeek, month, prevMonth, year, prevYear] = await Promise.all([
    revenueBetween(todayStart, addDays(todayStart, 1)),
    revenueBetween(addDays(todayStart, -1), todayStart),
    revenueBetween(weekStart, addDays(weekStart, 7)),
    revenueBetween(addDays(weekStart, -7), weekStart),
    revenueBetween(monthStart, addMonths(monthStart, 1)),
    revenueBetween(addMonths(monthStart, -1), monthStart),
    revenueBetween(yearStart, addYears(yearStart, 1)),
    revenueBetween(addYears(yearStart, -1), yearStart),
  ]);

  return {
    today: { amount: today, changePercent: pctChange(today, yesterday) },
    thisWeek: { amount: week, changePercent: pctChange(week, prevWeek) },
    thisMonth: { amount: month, changePercent: pctChange(month, prevMonth) },
    thisYear: {
      amount: year,
      changePercent: pctChange(year, prevYear),
      targetPercent: Math.round((year / ANNUAL_REVENUE_TARGET) * 1000) / 10,
    },
  };
}

// ── 2. Revenue trend chart ───────────────────────────────────────────

export type ChartGranularity = "daily" | "weekly" | "monthly";

export interface RevenuePoint {
  label: string;
  revenue: number;
}

const DAY_LABEL = new Intl.DateTimeFormat("en-NG", { month: "short", day: "numeric", timeZone: "UTC" });
const MONTH_LABEL = new Intl.DateTimeFormat("en-NG", { month: "short", year: "2-digit", timeZone: "UTC" });

export async function getRevenueSeries(
  granularity: ChartGranularity,
  now: Date = new Date()
): Promise<RevenuePoint[]> {
  const todayEnd = addDays(startOfDay(now), 1);

  if (granularity === "daily") {
    const start = addDays(todayEnd, -30);
    const rows = await paymentsInRange(start, todayEnd);
    const buckets = Array.from({ length: 30 }, (_, i) => ({ start: addDays(start, i), revenue: 0 }));
    for (const r of rows) {
      const idx = Math.floor((r.date.getTime() - start.getTime()) / 86_400_000);
      if (idx >= 0 && idx < buckets.length) buckets[idx].revenue += r.amount;
    }
    return buckets.map((b) => ({ label: DAY_LABEL.format(b.start), revenue: b.revenue }));
  }

  if (granularity === "weekly") {
    const start = addDays(todayEnd, -84);
    const rows = await paymentsInRange(start, todayEnd);
    const buckets = Array.from({ length: 12 }, (_, i) => ({ start: addDays(start, i * 7), revenue: 0 }));
    for (const r of rows) {
      const idx = Math.floor((r.date.getTime() - start.getTime()) / (7 * 86_400_000));
      if (idx >= 0 && idx < buckets.length) buckets[idx].revenue += r.amount;
    }
    return buckets.map((b) => ({ label: DAY_LABEL.format(b.start), revenue: b.revenue }));
  }

  // monthly — last 12 calendar months
  const monthsBack = 11;
  const firstMonth = addMonths(startOfMonth(now), -monthsBack);
  const rows = await paymentsInRange(firstMonth, todayEnd);
  const buckets = Array.from({ length: monthsBack + 1 }, (_, i) => ({
    start: addMonths(firstMonth, i),
    revenue: 0,
  }));
  for (const r of rows) {
    const idx =
      (r.date.getUTCFullYear() - firstMonth.getUTCFullYear()) * 12 +
      (r.date.getUTCMonth() - firstMonth.getUTCMonth());
    if (idx >= 0 && idx < buckets.length) buckets[idx].revenue += r.amount;
  }
  return buckets.map((b) => ({ label: MONTH_LABEL.format(b.start), revenue: b.revenue }));
}

async function paymentsInRange(start: Date, end: Date): Promise<{ date: Date; amount: number }[]> {
  return db.payment.findMany({
    where: { status: "Confirmed", direction: "INFLOW", type: { in: [...INFLOW_TYPES] }, date: { gte: start, lt: end } },
    select: { date: true, amount: true },
  });
}

// ── 3. Cash flow breakdown (this month) ──────────────────────────────

export interface CashFlowBreakdown {
  income: {
    totalRevenue: number;
    educraftShare: number;
    workerPayouts: number;
    ambassadorCommissions: number;
  };
  expensesByCategory: { category: string; amount: number }[];
  totalExpenses: number;
  netProfit: number;
  /** null when there's no revenue this month to divide by. */
  profitMarginPercent: number | null;
}

export async function getCashFlowBreakdown(now: Date = new Date()): Promise<CashFlowBreakdown> {
  const monthStart = startOfMonth(now);
  const monthEnd = addMonths(monthStart, 1);
  const monthParam = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, "0")}`;

  const [report, expensesByCategory] = await Promise.all([
    getMonthlyReport(monthParam),
    getExpensesByCategory(monthStart, monthEnd),
  ]);

  const { totalRevenue, educraftShare, workerPayouts, ambassadorCommissions, netProfit } = report.revenue;
  const profitMarginPercent = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : null;

  return {
    income: { totalRevenue, educraftShare, workerPayouts, ambassadorCommissions },
    expensesByCategory,
    totalExpenses: report.revenue.expenses,
    netProfit,
    profitMarginPercent,
  };
}

// ── 4. Outstanding balances ──────────────────────────────────────────

export interface OutstandingBalances {
  unpaidClientBalance: { amount: number; count: number };
  pendingWorkerPayouts: { amount: number; count: number };
  pendingAmbassadorCommissions: { amount: number; count: number };
}

export async function getOutstandingBalances(): Promise<OutstandingBalances> {
  const [approvedAgg, payouts] = await Promise.all([
    db.project.aggregate({ where: { status: "APPROVED" }, _sum: { balanceAmount: true }, _count: true }),
    getPendingPayouts(),
  ]);

  return {
    unpaidClientBalance: { amount: approvedAgg._sum.balanceAmount ?? 0, count: approvedAgg._count },
    pendingWorkerPayouts: {
      amount: payouts.totals.workerAmount,
      count: payouts.totals.workerCount,
    },
    pendingAmbassadorCommissions: {
      amount: payouts.totals.ambassadorAmount,
      count: payouts.totals.ambassadorCount,
    },
  };
}

// ── 4b. Payment method breakdown (this month) ────────────────────────

export interface PaymentMethodRow {
  method: string;
  amount: number;
}

export async function getPaymentMethodBreakdown(now: Date = new Date()): Promise<PaymentMethodRow[]> {
  const monthStart = startOfMonth(now);
  const monthEnd = addMonths(monthStart, 1);

  const rows = await db.payment.groupBy({
    by: ["paymentMethod"],
    where: {
      status: "Confirmed",
      direction: "INFLOW",
      type: { in: [...INFLOW_TYPES] },
      date: { gte: monthStart, lt: monthEnd },
    },
    _sum: { amount: true },
  });

  return rows
    .map((r) => ({ method: r.paymentMethod ?? "Unspecified", amount: r._sum.amount ?? 0 }))
    .sort((a, b) => b.amount - a.amount);
}

// ── 5. Business intelligence (lifetime, from completed projects) ────

export interface RevenueByServiceRow {
  serviceName: string;
  revenue: number;
  projects: number;
}

export interface RevenueByUniversityRow {
  name: string;
  abbreviation: string;
  revenue: number;
  clients: number;
}

export interface TopPerformerRow {
  id: string;
  code: string;
  name: string;
  revenue: number;
  completed: number;
}

export interface BusinessIntelligence {
  byService: RevenueByServiceRow[];
  byUniversity: RevenueByUniversityRow[];
  topWorkers: TopPerformerRow[];
  topAmbassadors: TopPerformerRow[];
}

export async function getBusinessIntelligence(): Promise<BusinessIntelligence> {
  const projects = await db.project.findMany({
    where: { status: "COMPLETED" },
    select: {
      price: true,
      service: { select: { serviceName: true } },
      client: {
        select: {
          id: true,
          universityId: true,
          university: { select: { name: true, abbreviation: true } },
        },
      },
      worker: { select: { id: true, workerId: true, fullName: true } },
      ambassador: { select: { id: true, ambassadorId: true, fullName: true } },
    },
  });

  const svcMap = new Map<string, RevenueByServiceRow>();
  const uniMap = new Map<string, RevenueByUniversityRow & { clientIds: Set<string> }>();
  const workerMap = new Map<string, TopPerformerRow>();
  const ambassadorMap = new Map<string, TopPerformerRow>();

  for (const p of projects) {
    const svc = svcMap.get(p.service.serviceName) ?? {
      serviceName: p.service.serviceName,
      revenue: 0,
      projects: 0,
    };
    svc.revenue += p.price;
    svc.projects += 1;
    svcMap.set(p.service.serviceName, svc);

    const uni = uniMap.get(p.client.universityId) ?? {
      name: p.client.university.name,
      abbreviation: p.client.university.abbreviation,
      revenue: 0,
      clients: 0,
      clientIds: new Set<string>(),
    };
    uni.revenue += p.price;
    uni.clientIds.add(p.client.id);
    uniMap.set(p.client.universityId, uni);

    if (p.worker) {
      const w = workerMap.get(p.worker.id) ?? {
        id: p.worker.id,
        code: p.worker.workerId,
        name: p.worker.fullName,
        revenue: 0,
        completed: 0,
      };
      w.revenue += p.price;
      w.completed += 1;
      workerMap.set(p.worker.id, w);
    }

    if (p.ambassador) {
      const a = ambassadorMap.get(p.ambassador.id) ?? {
        id: p.ambassador.id,
        code: p.ambassador.ambassadorId,
        name: p.ambassador.fullName,
        revenue: 0,
        completed: 0,
      };
      a.revenue += p.price;
      a.completed += 1;
      ambassadorMap.set(p.ambassador.id, a);
    }
  }

  return {
    byService: [...svcMap.values()].sort((a, b) => b.revenue - a.revenue),
    byUniversity: [...uniMap.values()]
      .map(({ clientIds, ...rest }) => ({ ...rest, clients: clientIds.size }))
      .sort((a, b) => b.revenue - a.revenue),
    topWorkers: [...workerMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    topAmbassadors: [...ambassadorMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
  };
}
