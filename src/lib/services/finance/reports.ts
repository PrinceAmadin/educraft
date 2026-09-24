import { db } from "@/lib/db";
import { BUCKET_META, BUCKET_TYPES } from "@/lib/finance/commission-config";
import { getBucketBalances, getBucketCards, getBucketMonthFlows, getRetainedForMonth, type BucketCard } from "@/lib/services/finance/buckets";
import { getAnnualPanel, type AnnualPanel } from "@/lib/services/finance/founder-draws";
import { payoutTotalsForMonth, type PayoutLeg } from "@/lib/services/finance/payouts-engine";
import { listOutstandingBalances } from "@/lib/services/finance/revenue";
import { currentMonthKey, getSurplusAnalysis, monthLabel, monthRange, netRevenueForMonths, semesterOf, type SurplusAnalysis } from "@/lib/services/finance/surplus";
import { COUNTED_STATUSES } from "@/lib/services/expenses";

/**
 * The CFO's statements: monthly, semester and annual, every figure from the
 * same definitions the finance pages use. Displayed in-app and exported as
 * .docx (report-docx.ts) for the executive team.
 */

export type ReportType = "monthly" | "semester" | "annual";

export interface ReportPeriod {
  type: ReportType;
  /** "2026-09" | "2026-S2" | "2026" */
  key: string;
  label: string;
  months: string[];
}

export class ReportError extends Error {}

/** Resolve a period key for a type, defaulting to the current one. */
export function parsePeriod(type: ReportType, raw?: string | null): ReportPeriod {
  const now = currentMonthKey();
  if (type === "monthly") {
    const key = raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : now;
    if (key > now) throw new ReportError("That month has not started yet");
    return { type, key, label: monthLabel(key), months: [key] };
  }
  if (type === "semester") {
    const m = raw && /^(\d{4})-S([12])$/.exec(raw);
    const month = m ? `${m[1]}-${m[2] === "1" ? "01" : "07"}` : now;
    const s = semesterOf(month);
    if (s.months[0] > now) throw new ReportError("That semester has not started yet");
    return { type, key: s.key, label: s.label, months: s.months.filter((x) => x <= now) };
  }
  const year = raw && /^\d{4}$/.test(raw) ? Number(raw) : Number(now.slice(0, 4));
  if (year > Number(now.slice(0, 4))) throw new ReportError("That year has not started yet");
  return { type, key: String(year), label: String(year), months: monthRange(`${year}-01`, `${year}-12`).filter((x) => x <= now) };
}

export interface MonthFigures {
  month: string;
  label: string;
  revenue: number;
  refunds: number;
  payouts: { owed: number; paid: number; byLeg: Record<PayoutLeg, number> };
  retained: number;
  /** Counted expenses other than ambassador commissions (those come off the 15%, not the retained share). */
  operatingExpenses: number;
  founderDraws: number;
  completed: number;
  /** retained − operating expenses. */
  netProfit: number;
}

function bounds(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

export async function getMonthFigures(month: string): Promise<MonthFigures> {
  const { start, end } = bounds(month);
  const [revenue, refundsAgg, payouts, retained, expensesAgg, drawsAgg, completed] = await Promise.all([
    netRevenueForMonths([month]),
    db.payment.aggregate({ where: { status: "Confirmed", direction: "OUTFLOW", type: "REFUND", date: { gte: start, lt: end } }, _sum: { amount: true } }),
    payoutTotalsForMonth(month),
    getRetainedForMonth(month),
    db.expense.aggregate({ where: { date: { gte: start, lt: end }, approvalStatus: { in: [...COUNTED_STATUSES] }, kind: { not: "COMMISSION" } }, _sum: { amount: true } }),
    db.founderDraw.aggregate({ where: { month, status: "DISTRIBUTED" }, _sum: { amount: true } }),
    db.project.count({
      where: { status: "COMPLETED", isProBono: false, OR: [{ finalCompletionDate: { gte: start, lt: end } }, { finalCompletionDate: null, statusLog: { some: { toStatus: "COMPLETED", createdAt: { gte: start, lt: end } } } }] },
    }),
  ]);
  const operatingExpenses = Math.round((expensesAgg._sum.amount ?? 0) * 100) / 100;
  return {
    month,
    label: monthLabel(month),
    revenue,
    refunds: Math.round(refundsAgg._sum.amount ?? 0),
    payouts,
    retained,
    operatingExpenses,
    founderDraws: Math.round(drawsAgg._sum.amount ?? 0),
    completed,
    netProfit: Math.round((retained - operatingExpenses) * 100) / 100,
  };
}

function sumFigures(rows: MonthFigures[], label: string): MonthFigures {
  const byLeg: Record<PayoutLeg, number> = { WORKER: 0, AMBASSADOR: 0, PARENT: 0, HOG: 0, COO: 0, BONUS: 0 };
  for (const r of rows) for (const k of Object.keys(byLeg) as PayoutLeg[]) byLeg[k] += r.payouts.byLeg[k];
  const sum = (f: (r: MonthFigures) => number) => Math.round(rows.reduce((s, r) => s + f(r), 0) * 100) / 100;
  return {
    month: rows[0]?.month ?? "",
    label,
    revenue: sum((r) => r.revenue),
    refunds: sum((r) => r.refunds),
    payouts: { owed: sum((r) => r.payouts.owed), paid: sum((r) => r.payouts.paid), byLeg },
    retained: sum((r) => r.retained),
    operatingExpenses: sum((r) => r.operatingExpenses),
    founderDraws: sum((r) => r.founderDraws),
    completed: rows.reduce((s, r) => s + r.completed, 0),
    netProfit: sum((r) => r.netProfit),
  };
}

function pct(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export interface BucketMovement {
  bucket: string;
  label: string;
  inflow: number;
  outflow: number;
  balance: number;
}

export interface MonthlyReport {
  period: ReportPeriod;
  figures: MonthFigures;
  previous: MonthFigures;
  comparison: Record<"revenue" | "payouts" | "retained" | "operatingExpenses" | "netProfit" | "completed", number | null>;
  buckets: { cards: BucketCard[]; movements: BucketMovement[] };
  expensesByCategory: { category: string; amount: number }[];
  founderDraws: { recipient: string; drawType: string; amount: number; distributedAt: string | null }[];
  outstanding: { count: number; amount: number; overdueCount: number; overdueAmount: number };
}

async function expensesByCategory(months: string[]): Promise<{ category: string; amount: number }[]> {
  if (months.length === 0) return [];
  const { start } = bounds(months[0]);
  const { end } = bounds(months[months.length - 1]);
  const rows = await db.expense.groupBy({
    by: ["category"],
    where: { date: { gte: start, lt: end }, approvalStatus: { in: [...COUNTED_STATUSES] }, kind: { not: "COMMISSION" } },
    _sum: { amount: true },
  });
  return rows.map((r) => ({ category: r.category, amount: Math.round((r._sum.amount ?? 0) * 100) / 100 })).sort((a, b) => b.amount - a.amount);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getMonthlyReport(period: ReportPeriod): Promise<MonthlyReport> {
  const month = period.key;
  const [figures, previous, cards, flows, balances, byCategory, draws, outstanding] = await Promise.all([
    getMonthFigures(month),
    getMonthFigures(shiftMonth(month, -1)),
    getBucketCards(month),
    getBucketMonthFlows(month),
    getBucketBalances(),
    expensesByCategory([month]),
    db.founderDraw.findMany({ where: { month, status: "DISTRIBUTED" }, orderBy: [{ drawType: "asc" }, { recipient: "asc" }], select: { recipient: true, drawType: true, amount: true, distributedAt: true } }),
    listOutstandingBalances(),
  ]);
  const overdue = outstanding.rows.filter((r) => r.daysSince > 7);
  return {
    period,
    figures,
    previous,
    comparison: {
      revenue: pct(figures.revenue, previous.revenue),
      payouts: pct(figures.payouts.owed, previous.payouts.owed),
      retained: pct(figures.retained, previous.retained),
      operatingExpenses: pct(figures.operatingExpenses, previous.operatingExpenses),
      netProfit: pct(figures.netProfit, previous.netProfit),
      completed: pct(figures.completed, previous.completed),
    },
    buckets: {
      cards,
      movements: BUCKET_TYPES.map((b) => ({
        bucket: b,
        label: BUCKET_META[b].label,
        inflow: flows[b].inflow,
        outflow: flows[b].outflow,
        balance: balances[b === "OPERATIONS_RESERVE" ? "operationsReserve" : b === "GROWTH_FUND" ? "growthFund" : b === "REINVESTMENT_FUND" ? "reinvestmentFund" : "founderDistribution"],
      })),
    },
    expensesByCategory: byCategory,
    founderDraws: draws.map((d) => ({ recipient: d.recipient, drawType: d.drawType, amount: d.amount, distributedAt: d.distributedAt?.toISOString() ?? null })),
    outstanding: {
      count: outstanding.total.count,
      amount: outstanding.total.amount,
      overdueCount: overdue.length,
      overdueAmount: Math.round(overdue.reduce((s, r) => s + r.balanceAmount, 0)),
    },
  };
}

export interface SemesterReport {
  period: ReportPeriod;
  months: MonthFigures[];
  totals: MonthFigures;
  surplus: SurplusAnalysis;
  founderDrawsYearToDate: number;
  bucketCards: BucketCard[];
}

export async function getSemesterReport(period: ReportPeriod): Promise<SemesterReport> {
  const year = period.key.slice(0, 4);
  const [months, surplus, cards, ytd] = await Promise.all([
    Promise.all(period.months.map(getMonthFigures)),
    getSurplusAnalysis(period.months[period.months.length - 1] ?? period.months[0]),
    getBucketCards(period.months[period.months.length - 1] ?? currentMonthKey()),
    db.founderDraw.aggregate({ where: { status: "DISTRIBUTED", month: { startsWith: `${year}-` } }, _sum: { amount: true } }),
  ]);
  return { period, months, totals: sumFigures(months, period.label), surplus, founderDrawsYearToDate: Math.round(ytd._sum.amount ?? 0), bucketCards: cards };
}

export interface AnnualReport {
  period: ReportPeriod;
  months: MonthFigures[];
  totals: MonthFigures;
  profitShare: AnnualPanel;
  expensesByCategory: { category: string; amount: number }[];
  /** Tax-relevant: money in, money out to people, money out to costs, and what was left. */
  tax: { totalRevenue: number; totalPayouts: number; totalExpenses: number; netProfit: number };
  bucketCards: BucketCard[];
}

export async function getAnnualReport(period: ReportPeriod): Promise<AnnualReport> {
  const year = Number(period.key);
  const [months, profitShare, byCategory, cards] = await Promise.all([
    Promise.all(period.months.map(getMonthFigures)),
    getAnnualPanel(year),
    expensesByCategory(period.months),
    getBucketCards(period.months[period.months.length - 1] ?? currentMonthKey()),
  ]);
  const totals = sumFigures(months, period.label);
  const totalPayouts = totals.payouts.owed;
  return {
    period,
    months,
    totals,
    profitShare,
    expensesByCategory: byCategory,
    tax: {
      totalRevenue: totals.revenue,
      totalPayouts,
      totalExpenses: totals.operatingExpenses,
      netProfit: Math.round((totals.revenue - totalPayouts - totals.operatingExpenses) * 100) / 100,
    },
    bucketCards: cards,
  };
}

export type FinanceReport = { type: "monthly"; data: MonthlyReport } | { type: "semester"; data: SemesterReport } | { type: "annual"; data: AnnualReport };

export async function getFinanceReport(type: ReportType, raw?: string | null): Promise<FinanceReport> {
  const period = parsePeriod(type, raw);
  if (type === "monthly") return { type, data: await getMonthlyReport(period) };
  if (type === "semester") return { type, data: await getSemesterReport(period) };
  return { type, data: await getAnnualReport(period) };
}
