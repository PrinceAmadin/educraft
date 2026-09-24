import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { COMMISSION_RATES, annualProfitShare, founderDrawFor, type AnnualProfitShare, type FounderDrawTier } from "@/lib/finance/commission-config";
import { getBucketBalances } from "@/lib/services/finance/buckets";
import { getFinanceSettings } from "@/lib/services/finance/settings";
import { currentMonthKey, getSurplusAnalysis, monthLabel, monthRange, netRevenueForMonths, semesterOf, type SurplusAnalysis } from "@/lib/services/finance/surplus";
import { notifyFinance, notifyRole } from "@/lib/services/notifications";
import { formatNaira } from "@/lib/utils";

/**
 * Founder money, three channels: the tiered monthly draw (set by the
 * month's confirmed revenue), the semester bonus the CFO recommends and the
 * founder approves, and the annual profit share in December. Every
 * distribution is a FounderDraw row per founder and an OUTFLOW from the
 * bucket it came from, so the buckets always show what is left. A draw the
 * Founder Distribution bucket cannot fund is refused; the founder may
 * distribute a stated partial amount instead.
 */

type Tx = Prisma.TransactionClient;

export class DrawError extends Error {}

export type FounderRecipient = "CEO" | "CFO";
const RECIPIENTS: readonly FounderRecipient[] = ["CEO", "CFO"];

export interface FounderNames {
  CEO: string;
  CFO: string;
}

export async function founderNames(): Promise<FounderNames> {
  const users = await db.user.findMany({
    where: { role: { in: ["SUPER_ADMIN", "CO_CEO_CFO"] }, isActive: true },
    select: { role: true, displayName: true, execProfile: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
  const pick = (role: "SUPER_ADMIN" | "CO_CEO_CFO", fallback: string) => {
    const u = users.find((x) => x.role === role);
    return u?.execProfile?.fullName ?? u?.displayName ?? fallback;
  };
  return { CEO: pick("SUPER_ADMIN", "CEO"), CFO: pick("CO_CEO_CFO", "Co-CEO / CFO") };
}

// ── Monthly draws ────────────────────────────────────────────────────────

export interface TierRow extends FounderDrawTier {
  current: boolean;
}

export interface DrawRow {
  recipient: FounderRecipient;
  name: string;
  /** What the tier says this founder gets this month. */
  entitled: number;
  distributed: number;
  outstanding: number;
  status: "NOT_PAID" | "DISTRIBUTED" | "PARTIAL";
  distributedAt: string | null;
}

export interface MonthlyDrawPanel {
  month: string;
  monthLabel: string;
  monthRevenue: number;
  tier: FounderDrawTier;
  tiers: TierRow[];
  drawEach: number;
  /** Founder Distribution bucket: balance now, and what flowed in this month. */
  bucketBalance: number;
  bucketInflowThisMonth: number;
  drawsTotal: number;
  distributedTotal: number;
  outstandingTotal: number;
  /** Whether the bucket can fund what is still outstanding. */
  funded: boolean;
  shortfall: number;
  remainingAfterDraws: number;
  rows: DrawRow[];
}

async function monthlyDistributed(month: string) {
  return db.founderDraw.findMany({
    where: { month, drawType: { in: ["MONTHLY", "MONTHLY_TOPUP"] }, status: "DISTRIBUTED" },
    select: { recipient: true, amount: true, distributedAt: true },
  });
}

export async function getMonthlyDrawPanel(month: string): Promise<MonthlyDrawPanel> {
  const [monthRevenue, names, balances, inflowAgg, distributed] = await Promise.all([
    netRevenueForMonths([month]),
    founderNames(),
    getBucketBalances(),
    db.bucketTransaction.aggregate({ where: { bucketType: "FOUNDER_DISTRIBUTION", amount: { gt: 0 }, month }, _sum: { amount: true } }),
    monthlyDistributed(month),
  ]);
  const tier = founderDrawFor(monthRevenue);
  const rows: DrawRow[] = RECIPIENTS.map((recipient) => {
    const mine = distributed.filter((d) => d.recipient === recipient);
    const paid = Math.round(mine.reduce((s, d) => s + d.amount, 0));
    const outstanding = Math.max(0, tier.drawEach - paid);
    const latest = mine.map((d) => d.distributedAt).filter((d): d is Date => d != null).sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      recipient,
      name: names[recipient],
      entitled: tier.drawEach,
      distributed: paid,
      outstanding,
      status: paid === 0 ? "NOT_PAID" : outstanding === 0 ? "DISTRIBUTED" : "PARTIAL",
      distributedAt: latest?.toISOString() ?? null,
    };
  });
  const distributedTotal = rows.reduce((s, r) => s + r.distributed, 0);
  const outstandingTotal = rows.reduce((s, r) => s + r.outstanding, 0);
  return {
    month,
    monthLabel: monthLabel(month),
    monthRevenue,
    tier,
    tiers: COMMISSION_RATES.founderDrawTiers.map((t) => ({ ...t, current: t.minRevenue === tier.minRevenue })),
    drawEach: tier.drawEach,
    bucketBalance: balances.founderDistribution,
    bucketInflowThisMonth: Math.round(inflowAgg._sum.amount ?? 0),
    drawsTotal: tier.drawEach * 2,
    distributedTotal,
    outstandingTotal,
    funded: balances.founderDistribution >= outstandingTotal,
    shortfall: Math.max(0, outstandingTotal - balances.founderDistribution),
    remainingAfterDraws: balances.founderDistribution - outstandingTotal,
    rows,
  };
}

export interface CurrentTier {
  month: string;
  monthRevenue: number;
  tier: FounderDrawTier;
  next: FounderDrawTier | null;
  /** Revenue still needed to reach the next tier. */
  toNext: number | null;
}

export async function getCurrentTier(month: string = currentMonthKey()): Promise<CurrentTier> {
  const monthRevenue = await netRevenueForMonths([month]);
  const tier = founderDrawFor(monthRevenue);
  const tiers = COMMISSION_RATES.founderDrawTiers;
  const idx = tiers.findIndex((t) => t.minRevenue === tier.minRevenue);
  const next = idx >= 0 && idx < tiers.length - 1 ? tiers[idx + 1] : null;
  return { month, monthRevenue, tier, next, toNext: next ? Math.max(0, next.minRevenue - monthRevenue) : null };
}

async function drawOutflow(tx: Tx, input: { drawId: string; bucket: "FOUNDER_DISTRIBUTION" | "OPERATIONS_RESERVE"; amount: number; description: string; month: string; recordedById: string }) {
  await tx.bucketTransaction.create({
    data: {
      bucketType: input.bucket,
      type: "OUTFLOW",
      amount: -Math.round(input.amount),
      description: input.description,
      founderDrawId: input.drawId,
      recordedById: input.recordedById,
      month: input.month,
    },
  });
}

export interface DistributeInput {
  month: string;
  recipients?: FounderRecipient[];
  /** The founder's stated partial amount per recipient; without it, what the tier still owes. */
  amountEach?: number;
  note?: string;
  approvedById: string;
  /** Only the founder may distribute a partial amount. */
  isFounder: boolean;
}

export interface DistributeResult {
  distributed: { recipient: FounderRecipient; amount: number; drawType: string }[];
  total: number;
}

/**
 * Mark the month's draws distributed: one DISTRIBUTED FounderDraw per
 * founder (MONTHLY, or MONTHLY_TOPUP when something was already paid this
 * month and the tier rose) and the matching Founder Distribution outflow.
 * Refused when the bucket cannot fund it.
 */
export async function distributeMonthlyDraws(input: DistributeInput): Promise<DistributeResult> {
  if (input.month > currentMonthKey()) throw new DrawError("That month has not started yet");
  const panel = await getMonthlyDrawPanel(input.month);
  const wanted = input.recipients ?? RECIPIENTS;
  if (input.amountEach != null && !input.isFounder) throw new DrawError("Only the founder may distribute a partial amount");

  const plan = panel.rows
    .filter((r) => wanted.includes(r.recipient))
    .map((r) => ({
      recipient: r.recipient,
      name: r.name,
      amount: input.amountEach != null ? Math.min(input.amountEach, r.outstanding) : r.outstanding,
      drawType: r.distributed > 0 ? "MONTHLY_TOPUP" : "MONTHLY",
    }))
    .filter((p) => p.amount > 0);
  if (plan.length === 0) {
    throw new DrawError(panel.drawEach === 0 ? `No draw this month: revenue of ${formatNaira(panel.monthRevenue)} is below the first tier` : "Nothing outstanding to distribute");
  }
  const total = plan.reduce((s, p) => s + p.amount, 0);
  if (panel.bucketBalance < total) {
    throw new DrawError(
      `Founder Distribution holds ${formatNaira(panel.bucketBalance)}; ${formatNaira(total)} is needed. ${input.isFounder ? "Distribute a smaller amount each, or wait for more revenue." : "The founder can distribute a partial amount."}`
    );
  }

  const now = new Date();
  await db.$transaction(
    async (tx) => {
      // Funding is checked again under the transaction: two clicks cannot both draw the same naira.
      const agg = await tx.bucketTransaction.aggregate({ where: { bucketType: "FOUNDER_DISTRIBUTION" }, _sum: { amount: true } });
      if (Math.round(agg._sum.amount ?? 0) < total) throw new DrawError("Founder Distribution can no longer fund this draw. Refresh the page.");
      for (const p of plan) {
        const draw = await tx.founderDraw.create({
          data: {
            month: input.month,
            drawType: p.drawType,
            recipient: p.recipient,
            amount: p.amount,
            monthRevenue: panel.monthRevenue,
            status: "DISTRIBUTED",
            distributedAt: now,
            approvedById: input.approvedById,
            createdById: input.approvedById,
            notes: input.amountEach != null ? `Partial draw stated by the founder${input.note ? `: ${input.note}` : ""}` : input.note || null,
          },
          select: { id: true },
        });
        await drawOutflow(tx, {
          drawId: draw.id,
          bucket: "FOUNDER_DISTRIBUTION",
          amount: p.amount,
          description: `Founder draw — ${p.recipient} (${p.name}), ${panel.monthLabel}${p.drawType === "MONTHLY_TOPUP" ? " top-up" : ""}`,
          month: input.month,
          recordedById: input.approvedById,
        });
      }
    },
    { timeout: 15_000, maxWait: 10_000 }
  );
  await notifyFinance({
    title: "Founder draws distributed",
    message: `${panel.monthLabel}: ${plan.map((p) => `${p.recipient} ${formatNaira(p.amount)}`).join(", ")} recorded as distributed from Founder Distribution.`,
    type: "success",
    link: "/admin/finance/founder-draws",
  });
  return { distributed: plan.map((p) => ({ recipient: p.recipient, amount: p.amount, drawType: p.drawType })), total };
}

// ── Semester bonus ──────────────────────────────────────────────────────

export interface RecommendationView {
  status: "PENDING" | "DISTRIBUTED" | "CANCELLED";
  amountEach: number;
  total: number;
  createdAt: string;
  decidedAt: string | null;
  note: string | null;
  /** The analysis snapshot the recommendation was made on. */
  snapshot: { operationsRelease: number; founderAvailable: number; operationsSurplus: number; requiredMinimum: number } | null;
}

export interface SemesterPanel {
  analysis: SurplusAnalysis;
  recommendation: RecommendationView | null;
}

function parseSnapshot(notes: string | null): RecommendationView["snapshot"] {
  if (!notes) return null;
  try {
    const j = JSON.parse(notes) as Record<string, unknown>;
    if (typeof j.operationsRelease !== "number") return null;
    return {
      operationsRelease: j.operationsRelease,
      founderAvailable: Number(j.founderAvailable ?? 0),
      operationsSurplus: Number(j.operationsSurplus ?? 0),
      requiredMinimum: Number(j.requiredMinimum ?? 0),
    };
  } catch {
    return null;
  }
}

async function latestPair(drawType: "SEMESTER_BONUS" | "ANNUAL_PROFIT_SHARE", month: string) {
  const rows = await db.founderDraw.findMany({ where: { drawType, month }, orderBy: { createdAt: "desc" }, take: 2 });
  return rows.length ? rows.filter((r) => r.createdAt.getTime() === rows[0].createdAt.getTime() || Math.abs(r.createdAt.getTime() - rows[0].createdAt.getTime()) < 5000) : [];
}

function toRecommendation(rows: { status: string; amount: number; createdAt: Date; distributedAt: Date | null; updatedAt: Date; notes: string | null }[]): RecommendationView | null {
  if (rows.length === 0) return null;
  const first = rows[0];
  const snap = parseSnapshot(first.notes);
  let note: string | null = null;
  try {
    note = first.notes ? ((JSON.parse(first.notes) as { note?: string | null }).note ?? null) : null;
  } catch {
    note = first.notes;
  }
  return {
    status: first.status as RecommendationView["status"],
    amountEach: first.amount,
    total: Math.round(rows.reduce((s, r) => s + r.amount, 0)),
    createdAt: first.createdAt.toISOString(),
    decidedAt: first.status === "DISTRIBUTED" ? (first.distributedAt?.toISOString() ?? null) : first.status === "CANCELLED" ? first.updatedAt.toISOString() : null,
    note,
    snapshot: snap,
  };
}

export async function getSemesterPanel(month: string): Promise<SemesterPanel> {
  const analysis = await getSurplusAnalysis(month);
  const rows = await latestPair("SEMESTER_BONUS", analysis.semester.endMonth);
  return { analysis, recommendation: toRecommendation(rows) };
}

/**
 * The founder's decision on the CFO's semester bonus recommendation.
 * Approving distributes it: each founder's share leaves Operations Reserve
 * (the released surplus) and Founder Distribution (the rest) as outflows
 * tied to the draw. Declining keeps the money in the buckets.
 */
export async function decideSemesterBonus(input: { month: string; decision: "approve" | "decline"; note?: string; approvedById: string }): Promise<RecommendationView> {
  const semester = semesterOf(input.month);
  const pending = await db.founderDraw.findMany({ where: { drawType: "SEMESTER_BONUS", month: semester.endMonth, status: "PENDING" } });
  if (pending.length === 0) throw new DrawError("There is no semester bonus recommendation waiting");
  const snapshot = parseSnapshot(pending[0].notes);
  const total = Math.round(pending.reduce((s, r) => s + r.amount, 0));
  const now = new Date();

  if (input.decision === "decline") {
    await db.founderDraw.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: { status: "CANCELLED", approvedById: input.approvedById },
    });
    await notifyFinance({ title: "Semester bonus declined", message: `The founder declined the ${semester.label} semester bonus (${formatNaira(total)}). The money stays in the buckets.`, type: "info", link: "/admin/finance/founder-draws" });
  } else {
    // Where each naira comes from: the Operations release first, the rest from Founder Distribution.
    const fromOps = Math.min(total, snapshot?.operationsRelease ?? 0);
    const fromFd = total - fromOps;
    await db.$transaction(
      async (tx) => {
        const [ops, fd] = await Promise.all([
          tx.bucketTransaction.aggregate({ where: { bucketType: "OPERATIONS_RESERVE" }, _sum: { amount: true } }),
          tx.bucketTransaction.aggregate({ where: { bucketType: "FOUNDER_DISTRIBUTION" }, _sum: { amount: true } }),
        ]);
        if (Math.round(ops._sum.amount ?? 0) < fromOps) throw new DrawError(`Operations Reserve can no longer fund its ${formatNaira(fromOps)} share of this bonus`);
        if (Math.round(fd._sum.amount ?? 0) < fromFd) throw new DrawError(`Founder Distribution can no longer fund its ${formatNaira(fromFd)} share of this bonus`);
        const claimed = await tx.founderDraw.updateMany({
          where: { id: { in: pending.map((p) => p.id) }, status: "PENDING" },
          data: { status: "DISTRIBUTED", distributedAt: now, approvedById: input.approvedById },
        });
        if (claimed.count !== pending.length) throw new DrawError("This recommendation was just decided by someone else. Refresh the page.");
        let opsLeft = fromOps;
        for (const [i, row] of pending.entries()) {
          // The last row takes the remainder so the two shares add up to the release exactly.
          const opsPart = i === pending.length - 1 ? opsLeft : Math.min(opsLeft, Math.round(fromOps * (row.amount / total)));
          opsLeft -= opsPart;
          const fdPart = Math.round(row.amount - opsPart);
          if (opsPart > 0) {
            await drawOutflow(tx, { drawId: row.id, bucket: "OPERATIONS_RESERVE", amount: opsPart, description: `Semester bonus — ${row.recipient}, ${semester.label} (released surplus)`, month: semester.endMonth, recordedById: input.approvedById });
          }
          if (fdPart > 0) {
            await drawOutflow(tx, { drawId: row.id, bucket: "FOUNDER_DISTRIBUTION", amount: fdPart, description: `Semester bonus — ${row.recipient}, ${semester.label}`, month: semester.endMonth, recordedById: input.approvedById });
          }
        }
      },
      { timeout: 15_000, maxWait: 10_000 }
    );
    await notifyFinance({ title: "Semester bonus distributed", message: `${semester.label}: ${formatNaira(pending[0].amount)} each to the CEO and CFO, approved by the founder.`, type: "success", link: "/admin/finance/founder-draws" });
  }
  const rows = await latestPair("SEMESTER_BONUS", semester.endMonth);
  return toRecommendation(rows)!;
}

// ── Annual profit share ────────────────────────────────────────────────

export interface AnnualPanel {
  year: number;
  yearRevenue: number;
  share: AnnualProfitShare;
  operatingBaseline: number;
  /** December of the year: the analysis is shown from then, and the CFO may recommend. */
  open: boolean;
  recommendation: RecommendationView | null;
}

export async function getAnnualPanel(year: number): Promise<AnnualPanel> {
  const [settings, balances, yearRevenue, rows] = await Promise.all([
    getFinanceSettings(),
    getBucketBalances(),
    netRevenueForMonths(monthRange(`${year}-01`, `${year}-12`)),
    latestPair("ANNUAL_PROFIT_SHARE", `${year}-12`),
  ]);
  const share = annualProfitShare(balances, settings.operatingCostMonthlyBaseline);
  // Decided in December of that year (or in the January after): a past year with nothing decided is simply closed.
  const now = currentMonthKey();
  const currentYear = Number(now.slice(0, 4));
  const open = now >= `${year}-12` && (year === currentYear || (year === currentYear - 1 && now === `${currentYear}-01`));
  return { year, yearRevenue, share, operatingBaseline: settings.operatingCostMonthlyBaseline, open, recommendation: toRecommendation(rows) };
}

/** December: the CFO recommends, the founder approves or declines — the same shape as the semester bonus. */
export async function actOnAnnualProfitShare(input: { year: number; action: "recommend" | "approve" | "decline"; note?: string; userId: string; isFounder: boolean }): Promise<RecommendationView | null> {
  const month = `${input.year}-12`;
  const panel = await getAnnualPanel(input.year);
  if (input.action === "recommend") {
    if (!panel.open) throw new DrawError("The annual profit share is decided in December, after the year-end report");
    if (panel.share.available <= 0) throw new DrawError("There is no surplus beyond the next quarter's operating reserve");
    if (panel.recommendation?.status === "PENDING") throw new DrawError("A recommendation is already waiting on the founder");
    if (panel.recommendation?.status === "DISTRIBUTED") throw new DrawError("This year's profit share has already been distributed");
    const notes = JSON.stringify({ kind: "ANNUAL_PROFIT_SHARE_RECOMMENDATION", year: input.year, note: input.note?.trim() || null, operationsRelease: 0, founderAvailable: panel.share.available, operationsSurplus: 0, requiredMinimum: panel.share.q1Reserve, ...panel.share });
    await db.founderDraw.createMany({
      data: RECIPIENTS.map((recipient) => ({ month, drawType: "ANNUAL_PROFIT_SHARE", recipient, amount: panel.share.each, monthRevenue: panel.yearRevenue, status: "PENDING", createdById: input.userId, notes })),
    });
    await notifyRole("SUPER_ADMIN", { title: "Annual profit share recommended", message: `The CFO recommends ${formatNaira(panel.share.each)} each as the ${input.year} profit share. Approve or decline it on Founder draws.`, type: "info", link: "/admin/finance/founder-draws" });
  } else {
    if (!input.isFounder) throw new DrawError("Only the founder decides the profit share");
    const pending = await db.founderDraw.findMany({ where: { drawType: "ANNUAL_PROFIT_SHARE", month, status: "PENDING" } });
    if (pending.length === 0) throw new DrawError("There is no profit share recommendation waiting");
    const total = Math.round(pending.reduce((s, r) => s + r.amount, 0));
    if (input.action === "decline") {
      await db.founderDraw.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { status: "CANCELLED", approvedById: input.userId } });
    } else {
      // The profit share is the surplus across all four buckets: it leaves each in proportion to what it holds.
      const now = new Date();
      await db.$transaction(
        async (tx) => {
          const rows = await tx.bucketTransaction.groupBy({ by: ["bucketType"], _sum: { amount: true } });
          const held = Object.fromEntries(rows.map((r) => [r.bucketType, Math.max(0, Math.round(r._sum.amount ?? 0))])) as Record<string, number>;
          const sum = Object.values(held).reduce((s, v) => s + v, 0);
          if (sum < total) throw new DrawError(`The buckets hold ${formatNaira(sum)}; ${formatNaira(total)} is needed`);
          const claimed = await tx.founderDraw.updateMany({ where: { id: { in: pending.map((p) => p.id) }, status: "PENDING" }, data: { status: "DISTRIBUTED", distributedAt: now, approvedById: input.userId } });
          if (claimed.count !== pending.length) throw new DrawError("This recommendation was just decided by someone else. Refresh the page.");
          for (const row of pending) {
            let left = Math.round(row.amount);
            const buckets = (["FOUNDER_DISTRIBUTION", "REINVESTMENT_FUND", "GROWTH_FUND", "OPERATIONS_RESERVE"] as const).filter((b) => held[b] > 0);
            for (const [i, b] of buckets.entries()) {
              const part = i === buckets.length - 1 ? left : Math.min(left, Math.round((row.amount * held[b]) / sum));
              if (part <= 0) continue;
              await tx.bucketTransaction.create({
                data: { bucketType: b, type: "OUTFLOW", amount: -part, description: `Annual profit share — ${row.recipient}, ${input.year}`, founderDrawId: row.id, recordedById: input.userId, month },
              });
              left -= part;
              if (left <= 0) break;
            }
          }
        },
        { timeout: 15_000, maxWait: 10_000 }
      );
    }
    await notifyFinance({ title: input.action === "approve" ? "Annual profit share distributed" : "Annual profit share declined", message: `${input.year}: ${formatNaira(total)}${input.action === "approve" ? " distributed to the founders" : " kept in the buckets"}.`, type: input.action === "approve" ? "success" : "info", link: "/admin/finance/founder-draws" });
  }
  return toRecommendation(await latestPair("ANNUAL_PROFIT_SHARE", month));
}

// ── History ─────────────────────────────────────────────────────────────

export interface DrawHistoryRow {
  month: string;
  monthLabel: string;
  revenue: number;
  tier: FounderDrawTier;
  drawEach: number;
  distributed: number;
  semesterBonus: number;
  annualShare: number;
  status: "PAID" | "PARTIAL" | "PENDING" | "NONE";
}

/** Twelve months of draws for a year, newest first. */
export async function getDrawHistory(year: number): Promise<DrawHistoryRow[]> {
  const current = currentMonthKey();
  const months = monthRange(`${year}-01`, `${year}-12`).filter((m) => m <= current);
  const [draws, revenues] = await Promise.all([
    db.founderDraw.findMany({ where: { month: { in: months }, status: "DISTRIBUTED" }, select: { month: true, drawType: true, amount: true } }),
    Promise.all(months.map((m) => netRevenueForMonths([m]))),
  ]);
  return months
    .map((month, i) => {
      const revenue = revenues[i];
      const tier = founderDrawFor(revenue);
      const mine = draws.filter((d) => d.month === month);
      const distributed = Math.round(mine.filter((d) => d.drawType === "MONTHLY" || d.drawType === "MONTHLY_TOPUP").reduce((s, d) => s + d.amount, 0));
      const semesterBonus = Math.round(mine.filter((d) => d.drawType === "SEMESTER_BONUS").reduce((s, d) => s + d.amount, 0));
      const annualShare = Math.round(mine.filter((d) => d.drawType === "ANNUAL_PROFIT_SHARE").reduce((s, d) => s + d.amount, 0));
      const due = tier.drawEach * 2;
      const status: DrawHistoryRow["status"] = due === 0 ? "NONE" : distributed >= due ? "PAID" : distributed > 0 ? "PARTIAL" : "PENDING";
      return { month, monthLabel: monthLabel(month), revenue, tier, drawEach: tier.drawEach, distributed, semesterBonus, annualShare, status };
    })
    .reverse();
}
