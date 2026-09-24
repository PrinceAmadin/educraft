import { db } from "@/lib/db";
import { getBucketCards, getRetainedForMonth, type BucketCard } from "@/lib/services/finance/buckets";
import { getMonthlyDrawPanel } from "@/lib/services/finance/founder-draws";
import { payoutTotalsForMonth } from "@/lib/services/finance/payouts-engine";
import { getRevenueSummary, listOutstandingBalances } from "@/lib/services/finance/revenue";
import { currentMonthKey, getSurplusAnalysis, monthLabel, monthRange, netRevenueForMonths } from "@/lib/services/finance/surplus";
import { listPendingApprovals } from "@/lib/services/expenses";

/**
 * The CFO's morning screen: this month against last, the four buckets,
 * what needs a hand, and six months of revenue against payouts. Every
 * figure comes from the same definitions the other finance pages use —
 * revenue = confirmed client money less refunds, payouts = PayoutRecords,
 * retained = what the buckets were allocated.
 *
 * The reads run in small batches on purpose: the whole screen is a few
 * dozen queries, and Prisma's pool (9 connections on the dev machine, one
 * function on Vercel) times out when they are all fired at once.
 */

export interface DashboardMonth {
  month: string;
  label: string;
  revenue: number;
  /** Everything owed on the month's completed projects (paid or not). */
  payouts: number;
  payoutsPaid: number;
  /** EduCraft's retained share allocated to the buckets this month. */
  retained: number;
  /** Projects completed in the month. */
  projectCount: number;
}

export interface DashboardAlerts {
  unpaidWorkers: { count: number; amount: number };
  unpaidAmbassadors: { count: number; amount: number };
  unpaidExecutives: { count: number; amount: number };
  /** Balances owed for more than 7 days since the downpayment. */
  overdueBalances: { count: number; amount: number };
  founderDrawPending: { pending: boolean; outstanding: number; funded: boolean };
  pendingExpenses: { count: number; amount: number };
  awaitingVerification: { count: number; amount: number };
  duplicates: { count: number; amount: number };
  semesterBonusPending: boolean;
}

export interface RevenueHistoryPoint {
  month: string;
  label: string;
  revenue: number;
  payouts: number;
  retained: number;
}

export interface FinanceDashboard {
  currentMonth: DashboardMonth;
  previousMonth: DashboardMonth;
  changes: { revenue: number | null; payouts: number | null; retained: number | null; projects: number | null };
  buckets: BucketCard[];
  alerts: DashboardAlerts;
  revenueHistory: RevenueHistoryPoint[];
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

async function completedCount(month: string): Promise<number> {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return db.project.count({
    where: {
      status: "COMPLETED",
      isProBono: false,
      OR: [{ finalCompletionDate: { gte: start, lt: end } }, { finalCompletionDate: null, statusLog: { some: { toStatus: "COMPLETED", createdAt: { gte: start, lt: end } } } }],
    },
  });
}

export async function getDashboardMonth(month: string): Promise<DashboardMonth> {
  const revenue = await netRevenueForMonths([month]);
  const payouts = await payoutTotalsForMonth(month);
  const retained = await getRetainedForMonth(month);
  const projectCount = await completedCount(month);
  return { month, label: monthLabel(month), revenue, payouts: payouts.owed, payoutsPaid: payouts.paid, retained, projectCount };
}

async function unpaidByType(recipientType: "WORKER" | "AMBASSADOR" | "EXECUTIVE"): Promise<{ count: number; amount: number }> {
  const rows = await db.payoutRecord.groupBy({ by: ["recipientId"], where: { recipientType, status: "PENDING" }, _sum: { amount: true } });
  return { count: rows.length, amount: Math.round(rows.reduce((s, r) => s + (r._sum.amount ?? 0), 0)) };
}

export async function getDashboardAlerts(month: string): Promise<DashboardAlerts> {
  const [workers, ambassadors, executives] = await Promise.all([unpaidByType("WORKER"), unpaidByType("AMBASSADOR"), unpaidByType("EXECUTIVE")]);
  const outstanding = await listOutstandingBalances();
  const draws = await getMonthlyDrawPanel(month);
  const pendingExpenses = await listPendingApprovals();
  const revenue = await getRevenueSummary();
  const surplus = await getSurplusAnalysis(month);
  const overdue = outstanding.rows.filter((r) => r.daysSince > 7);
  return {
    unpaidWorkers: workers,
    unpaidAmbassadors: ambassadors,
    unpaidExecutives: executives,
    overdueBalances: { count: overdue.length, amount: Math.round(overdue.reduce((s, r) => s + r.balanceAmount, 0)) },
    founderDrawPending: { pending: draws.drawEach > 0 && draws.outstandingTotal > 0, outstanding: draws.outstandingTotal, funded: draws.funded },
    pendingExpenses: { count: pendingExpenses.length, amount: Math.round(pendingExpenses.reduce((s, e) => s + e.amount, 0)) },
    awaitingVerification: revenue.awaiting,
    duplicates: revenue.duplicates,
    semesterBonusPending: surplus.recommendation?.status === "PENDING",
  };
}

export async function getRevenueHistory(months: number = 6, now: Date = new Date()): Promise<RevenueHistoryPoint[]> {
  const current = currentMonthKey(now);
  const keys = monthRange(shiftMonth(current, -(months - 1)), current);
  const points: RevenueHistoryPoint[] = [];
  for (const month of keys) {
    const [revenue, payouts, retained] = await Promise.all([netRevenueForMonths([month]), payoutTotalsForMonth(month), getRetainedForMonth(month)]);
    points.push({ month, label: `${monthLabel(month).slice(0, 3)} ${month.slice(2, 4)}`, revenue, payouts: payouts.owed, retained });
  }
  return points;
}

export async function getFinanceDashboard(now: Date = new Date()): Promise<FinanceDashboard> {
  const month = currentMonthKey(now);
  const previous = shiftMonth(month, -1);
  const currentMonth = await getDashboardMonth(month);
  const previousMonth = await getDashboardMonth(previous);
  const buckets = await getBucketCards(month);
  const alerts = await getDashboardAlerts(month);
  const revenueHistory = await getRevenueHistory(6, now);
  return {
    currentMonth,
    previousMonth,
    changes: {
      revenue: pctChange(currentMonth.revenue, previousMonth.revenue),
      payouts: pctChange(currentMonth.payouts, previousMonth.payouts),
      retained: pctChange(currentMonth.retained, previousMonth.retained),
      projects: pctChange(currentMonth.projectCount, previousMonth.projectCount),
    },
    buckets,
    alerts,
    revenueHistory,
  };
}
