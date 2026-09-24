import { db } from "@/lib/db";
import { semesterSurplus, type SemesterSurplus } from "@/lib/finance/commission-config";
import { BucketError, getBucketBalances } from "@/lib/services/finance/buckets";
import { getFinanceSettings } from "@/lib/services/finance/settings";
import { notifyRole } from "@/lib/services/notifications";
import { formatNaira } from "@/lib/utils";

/**
 * Calendar helpers and the semester-end surplus analysis for the Bucket
 * Manager. Semester bonuses fall in June and December (S1 = January–June,
 * S2 = July–December); the HOG's sponsorship budget is quarterly.
 */

/** Months "YYYY-MM" from `from` to `to` inclusive. */
export function monthRange(from: string, to: string): string[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const out: string[] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (m === 12) {
      y += 1;
      m = 1;
    } else {
      m += 1;
    }
  }
  return out;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** "2026-09" for now (UTC, like every other finance figure). */
export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface SemesterInfo {
  /** "2026-S2" */
  key: string;
  label: string;
  months: string[];
  endMonth: string;
  /** Whether the month the analysis is looked at from is the semester's last month. */
  atEnd: boolean;
}

export function semesterOf(month: string): SemesterInfo {
  const [y, m] = month.split("-").map(Number);
  const second = m > 6;
  const start = `${y}-${second ? "07" : "01"}`;
  const endMonth = `${y}-${second ? "12" : "06"}`;
  return {
    key: `${y}-S${second ? 2 : 1}`,
    label: second ? `July to December ${y}` : `January to June ${y}`,
    months: monthRange(start, endMonth),
    endMonth,
    atEnd: month === endMonth,
  };
}

export interface QuarterInfo {
  key: string;
  label: string;
  months: string[];
}

export function quarterOf(month: string): QuarterInfo {
  const [y, m] = month.split("-").map(Number);
  const q = Math.ceil(m / 3);
  const start = `${y}-${String((q - 1) * 3 + 1).padStart(2, "0")}`;
  const end = `${y}-${String(q * 3).padStart(2, "0")}`;
  return { key: `${y}-Q${q}`, label: `Q${q} ${y}`, months: monthRange(start, end) };
}

export interface GrowthFundQuarter {
  quarter: QuarterInfo;
  budget: number;
  spent: number;
  remaining: number;
}

/** The HOG's sponsorship budget this quarter against what the Growth Fund has paid out on expenses. */
export async function getGrowthFundQuarter(month: string): Promise<GrowthFundQuarter> {
  const quarter = quarterOf(month);
  const [settings, spentAgg] = await Promise.all([
    getFinanceSettings(),
    db.bucketTransaction.aggregate({
      where: { bucketType: "GROWTH_FUND", expenseId: { not: null }, month: { in: quarter.months } },
      _sum: { amount: true },
    }),
  ]);
  const spent = Math.round(-(spentAgg._sum.amount ?? 0)) || 0;
  const budget = settings.hogSponsorshipBudgetQuarterly;
  return { quarter, budget, spent, remaining: budget - spent };
}

/** Founder draws paid out of Founder Distribution in these months (a positive number). */
export async function getFounderDrawsPaid(months: string[]): Promise<number> {
  const agg = await db.bucketTransaction.aggregate({
    where: { bucketType: "FOUNDER_DISTRIBUTION", founderDrawId: { not: null }, month: { in: months } },
    _sum: { amount: true },
  });
  return Math.round(-(agg._sum.amount ?? 0)) || 0;
}

export interface BonusRecommendation {
  status: "PENDING" | "DISTRIBUTED" | "CANCELLED";
  amountEach: number;
  createdAt: string;
  distributedAt: string | null;
}

export interface SurplusAnalysis {
  semester: SemesterInfo;
  operatingBaseline: number;
  operationsReserve: number;
  founderDistributionInflows: number;
  founderDrawsPaid: number;
  analysis: SemesterSurplus;
  /** The latest recommendation for this semester, if any. */
  recommendation: BonusRecommendation | null;
}

/**
 * The spec's semester-end analysis: half of what Operations Reserve holds
 * above three months of operating cost, plus what flowed into Founder
 * Distribution this semester beyond the monthly draws already paid, split
 * evenly between the two founders. Shown any time; recommending is the
 * CFO's act.
 */
export async function getSurplusAnalysis(month: string): Promise<SurplusAnalysis> {
  const semester = semesterOf(month);
  const [settings, balances, inflowAgg, drawsPaid, latest] = await Promise.all([
    getFinanceSettings(),
    getBucketBalances(),
    db.bucketTransaction.aggregate({
      where: { bucketType: "FOUNDER_DISTRIBUTION", amount: { gt: 0 }, month: { in: semester.months } },
      _sum: { amount: true },
    }),
    getFounderDrawsPaid(semester.months),
    db.founderDraw.findFirst({
      where: { drawType: "SEMESTER_BONUS", month: semester.endMonth },
      orderBy: { createdAt: "desc" },
      select: { status: true, amount: true, createdAt: true, distributedAt: true },
    }),
  ]);
  const founderDistributionInflows = Math.round(inflowAgg._sum.amount ?? 0);
  const analysis = semesterSurplus({
    operationsReserve: balances.operationsReserve,
    operatingBaseline: settings.operatingCostMonthlyBaseline,
    founderDistributionInflows,
    founderDrawsPaid: drawsPaid,
  });
  return {
    semester,
    operatingBaseline: settings.operatingCostMonthlyBaseline,
    operationsReserve: balances.operationsReserve,
    founderDistributionInflows,
    founderDrawsPaid: drawsPaid,
    analysis,
    recommendation: latest
      ? {
          status: latest.status as BonusRecommendation["status"],
          amountEach: latest.amount,
          createdAt: latest.createdAt.toISOString(),
          distributedAt: latest.distributedAt?.toISOString() ?? null,
        }
      : null,
  };
}

/** Confirmed client money less refunds across months (by payment date, UTC months). */
export async function netRevenueForMonths(months: string[]): Promise<number> {
  if (months.length === 0) return 0;
  const [fy, fm] = months[0].split("-").map(Number);
  const [ty, tm] = months[months.length - 1].split("-").map(Number);
  const start = new Date(Date.UTC(fy, fm - 1, 1));
  const end = new Date(Date.UTC(ty, tm, 1));
  const [inflow, refunds] = await Promise.all([
    db.payment.aggregate({
      where: { status: "Confirmed", direction: "INFLOW", type: { in: ["CLIENT_DOWNPAYMENT", "CLIENT_BALANCE"] }, date: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    db.payment.aggregate({ where: { status: "Confirmed", direction: "OUTFLOW", type: "REFUND", date: { gte: start, lt: end } }, _sum: { amount: true } }),
  ]);
  return Math.round((inflow._sum.amount ?? 0) - (refunds._sum.amount ?? 0));
}

/**
 * The CFO's semester bonus recommendation: two PENDING SEMESTER_BONUS draws
 * (CEO, CFO) carrying the analysis, for the founder to approve or decline on
 * the Founder draws page. One open recommendation per semester.
 */
export async function recommendSemesterBonus(input: { month: string; note?: string; recordedById: string }): Promise<{ each: number; total: number }> {
  const current = await getSurplusAnalysis(input.month);
  if (current.analysis.total <= 0) throw new BucketError("There is no surplus to release this semester");
  if (current.recommendation?.status === "PENDING") throw new BucketError("A recommendation for this semester is already waiting on the founder");
  if (current.recommendation?.status === "DISTRIBUTED") throw new BucketError("This semester's bonus has already been distributed");

  const revenue = await netRevenueForMonths(current.semester.months);
  const notes = JSON.stringify({
    kind: "SEMESTER_BONUS_RECOMMENDATION",
    semester: current.semester.key,
    note: input.note?.trim() || null,
    operatingBaseline: current.operatingBaseline,
    operationsReserve: current.operationsReserve,
    founderDistributionInflows: current.founderDistributionInflows,
    founderDrawsPaid: current.founderDrawsPaid,
    ...current.analysis,
  });
  await db.founderDraw.createMany({
    data: (["CEO", "CFO"] as const).map((recipient) => ({
      month: current.semester.endMonth,
      drawType: "SEMESTER_BONUS",
      recipient,
      amount: current.analysis.each,
      monthRevenue: revenue,
      status: "PENDING",
      createdById: input.recordedById,
      notes,
    })),
  });
  await notifyRole("SUPER_ADMIN", {
    title: "Semester bonus recommended",
    message: `The CFO recommends a semester bonus of ${formatNaira(current.analysis.each)} each (${current.semester.label}). Approve or decline it on Founder draws.`,
    type: "info",
    link: "/admin/finance/founder-draws",
  });
  return { each: current.analysis.each, total: current.analysis.total };
}
