import { db } from "@/lib/db";
import { executiveLegs, workerLeg } from "@/lib/finance/commission-config";
import { AI_COST_PER_PROJECT } from "@/lib/command-center/rag";
import { currentMonthKey, monthBounds, monthLongLabel, shiftMonth } from "@/lib/command-center/time";
import type {
  AiBalance,
  BucketPulseCard,
  ExecPayoutStatus,
  FinancePayload,
  FounderDrawStatus,
  PayoutGroupStatus,
  PayoutLineStatus,
} from "@/lib/command-center/types";
import { getCreditBalance } from "@/lib/services/ai-usage";
import { getBucketCards, getBucketMonthFlows, getRetainedForMonth } from "@/lib/services/finance/buckets";
import { getMonthlyDrawPanel } from "@/lib/services/finance/founder-draws";
import { execNames } from "@/lib/services/finance/payouts-engine";
import { getRevenueSummary, listOutstandingBalances } from "@/lib/services/finance/revenue";
import { netRevenueForMonths } from "@/lib/services/finance/surplus";

/**
 * The Financial pulse tab (Phase 5): the month's revenue position, bucket
 * pulse, payout status and Claude spend, every figure taken from the Finance
 * Platform's own definitions so the Command Center never disagrees with
 * /admin/finance. Read-only: nothing here writes, reconciles or notifies.
 *
 * Months are UTC "YYYY-MM" keys like every finance service. The reads run in
 * small sequential groups on purpose: the Prisma pool (9 connections on the
 * dev machine, one function on Vercel) times out when a page fires them all
 * at once — the same rule as services/finance/dashboard.ts.
 */

const FINANCE_HREF = "/admin/finance";
const AI_USAGE_HREF = "/admin/finance/ai-usage";

/** The Revenue Tracker's inflow types (Payment.type values). */
const CLIENT_INFLOW_TYPES = ["CLIENT_DOWNPAYMENT", "CLIENT_BALANCE"] as const;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

// ── Revenue position ─────────────────────────────────────────────

interface CashLegs {
  workerPayouts: number;
  ambassadorComm: number;
  hogComm: number;
  cooComm: number;
}

/**
 * The month's payout legs on a CASH basis. Each project's money in is read
 * from the same Payment rows the revenue line sums — confirmed client
 * inflows less confirmed refunds, by `Payment.date` — and each of its frozen
 * legs is scaled by moneyIn ÷ price, the share of the leg this month's cash
 * has earned. So Σ money in = confirmed revenue, and confirmed − legs is what
 * this month's money leaves EduCraft.
 *
 * Why not PayoutRecord: its legs are completion-based (a record exists only
 * once a project is COMPLETED, dated that month), so they would not tie to
 * this month's cash. Why not BucketAllocationLog: reallocation and
 * cancellation rows move no cash, so reading money in from them would invent
 * payments; the difference they make shows as the ledger's true-up line.
 */
async function cashBasisLegs(start: Date, end: Date): Promise<CashLegs> {
  const flows = await db.payment.groupBy({
    by: ["projectId", "direction"],
    where: {
      status: "Confirmed",
      date: { gte: start, lt: end },
      projectId: { not: null },
      OR: [
        { direction: "INFLOW", type: { in: [...CLIENT_INFLOW_TYPES] } },
        { direction: "OUTFLOW", type: "REFUND" },
      ],
    },
    _sum: { amount: true },
  });
  const moneyIn = new Map<string, number>();
  for (const f of flows) {
    if (!f.projectId) continue;
    const signed = (f._sum.amount ?? 0) * (f.direction === "INFLOW" ? 1 : -1);
    moneyIn.set(f.projectId, (moneyIn.get(f.projectId) ?? 0) + signed);
  }
  const ids = [...moneyIn.keys()];
  const projects =
    ids.length === 0
      ? []
      : await db.project.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            price: true,
            workerPayout: true,
            workerPayoutRate: true,
            ambassadorCommission: true,
            parentCommission: true,
            ambassadorId: true,
            isProBono: true,
          },
        });

  let worker = 0;
  let ambassador = 0;
  let hog = 0;
  let coo = 0;
  for (const p of projects) {
    // Share of the project's price that this month's cash represents (a refund month can be negative).
    const f = p.price > 0 ? (moneyIn.get(p.id) ?? 0) / p.price : 0;
    if (f === 0) continue;
    const exec = executiveLegs(p);
    worker += workerLeg(p) * f;
    // Ambassador 15% in total = the referrer's leg + the Core override, both frozen on the project at allocation.
    ambassador += ((p.ambassadorCommission ?? 0) + (p.parentCommission ?? 0)) * f;
    hog += exec.hog * f;
    coo += exec.coo * f;
  }
  return {
    workerPayouts: Math.round(worker),
    ambassadorComm: Math.round(ambassador),
    hogComm: Math.round(hog),
    cooComm: Math.round(coo),
  };
}

async function revenuePosition(now: Date, month: string): Promise<FinancePayload["revenuePosition"]> {
  const { start, end } = monthBounds(month);

  // Group 1 (3 queries): the Revenue Tracker's revenue and the Bucket Manager's retained.
  // `confirmed` is net of refunds — inflows − refunds, exactly what /admin/finance/revenue shows.
  const [confirmed, retained] = await Promise.all([netRevenueForMonths([month]), getRetainedForMonth(month)]);

  // Group 2 (4 aggregates): the same month's refund total, for the information line.
  const summary = await getRevenueSummary(now);

  // Group 3 (<= 4 queries): the cash legs, the ambassador-driven split, approved-but-unpaid count.
  const [legs, drivenRows, approvedBalancePending] = await Promise.all([
    cashBasisLegs(start, end),
    db.payment.groupBy({
      by: ["isAmbassadorDriven"],
      where: {
        status: "Confirmed",
        direction: "INFLOW",
        type: { in: [...CLIENT_INFLOW_TYPES] },
        date: { gte: start, lt: end },
      },
      _sum: { amount: true },
    }),
    db.project.count({ where: { status: "APPROVED", balanceStatus: { not: "Verified" }, isProBono: false } }),
  ]);

  // Group 4 (1 query): the CFO's outstanding-balance list; its count is projects, clients are deduped here.
  const outstandingList = await listOutstandingBalances(now);

  let drivenAmount = 0;
  let inflowAmount = 0;
  for (const r of drivenRows) {
    const amt = r._sum.amount ?? 0;
    inflowAmount += amt;
    if (r.isAmbassadorDriven) drivenAmount += amt;
  }

  const legsTotal = legs.workerPayouts + legs.ambassadorComm + legs.hogComm + legs.cooComm;

  return {
    confirmed,
    refunds: summary.refundsThisMonth,
    workerPayouts: legs.workerPayouts,
    ambassadorComm: legs.ambassadorComm,
    hogComm: legs.hogComm,
    cooComm: legs.cooComm,
    retained,
    // What the Bucket Manager logged this month beyond this month's own cash
    // (an ambassador allocated after an earlier payment, a refund true-up).
    trueUps: Math.round(retained - (confirmed - legsTotal)),
    grossMargin: confirmed > 0 ? round1((retained / confirmed) * 100) : null,
    ambassadorDrivenShare: inflowAmount > 0 ? round1((drivenAmount / inflowAmount) * 100) : null,
    outstanding: {
      amount: Math.round(outstandingList.total.amount),
      projects: outstandingList.total.count,
      clients: new Set(outstandingList.rows.map((r) => r.clientId)).size,
    },
    approvedBalancePending,
  };
}

// ── Bucket pulse ─────────────────────────────────────────────────

/**
 * The four buckets as the Bucket Manager shows them (balance all-time,
 * health from Phase 2's own `bucketHealth` rule) plus a month-over-month
 * net flow. Trends come from BucketTransaction rows (inflow − outflow), never
 * from BucketBalance, which mirrors allocation inflows only.
 */
async function bucketPulse(month: string, previousMonth: string): Promise<BucketPulseCard[]> {
  // One group (4 queries): cards = balances + this month's flows + finance settings; last month's flows beside them.
  const [cards, lastFlows] = await Promise.all([getBucketCards(month), getBucketMonthFlows(previousMonth)]);
  return cards.map((card) => ({
    bucket: card.bucket,
    label: card.label,
    purpose: card.purpose,
    balance: card.balance,
    health: { level: card.health.level, percent: card.health.percent, target: card.health.target },
    netThisMonth: card.month.inflow - card.month.outflow,
    netLastMonth: lastFlows[card.bucket].inflow - lastFlows[card.bucket].outflow,
    href: `/admin/finance/buckets?bucket=${card.bucket}`,
  }));
}

// ── Payout status ────────────────────────────────────────────────

interface PayoutAccumulator {
  recipients: Set<string>;
  pending: number;
  paid: number;
}

type PayoutGroupKey = "WORKER" | "AMBASSADOR" | "HOG" | "COO";

function newAccumulator(): PayoutAccumulator {
  return { recipients: new Set<string>(), pending: 0, paid: 0 };
}

/** Which line a PayoutRecord belongs to: workers and ambassadors by type, executives by their role id. */
function payoutGroupKey(recipientType: string, recipientId: string): PayoutGroupKey | null {
  if (recipientType === "WORKER" || recipientType === "AMBASSADOR") return recipientType;
  if (recipientType === "EXECUTIVE" && (recipientId === "HOG" || recipientId === "COO")) return recipientId;
  return null;
}

function lineStatus(acc: PayoutAccumulator): PayoutLineStatus {
  if (acc.pending > 0) return "PENDING";
  if (acc.paid > 0) return "PAID";
  return "NONE";
}

function toGroupStatus(acc: PayoutAccumulator): PayoutGroupStatus {
  return { recipients: acc.recipients.size, pending: acc.pending, paid: acc.paid, status: lineStatus(acc) };
}

/**
 * This month's PayoutRecords (`month` = the month the engine stamped: the
 * completion month for workers and executives; with the Ambassador
 * Platform, the downpayment month for ambassador commissions and the payout
 * month for quarterly bonuses), grouped per recipient line. The Finance dashboard's own
 * `unpaidByType` recipe with the month added; one groupBy by recipient gives
 * both the sums and the distinct-recipient counts. Cancelled records are
 * left out, as `payoutTotalsForMonth` leaves them out.
 */
async function payoutStatus(month: string): Promise<FinancePayload["payoutStatus"]> {
  // Group 1 (4 queries): records, the HOG/COO performance bonuses, the COO's submission, the executives' names.
  const [rows, bonusRows, submission, execs] = await Promise.all([
    db.payoutRecord.groupBy({
      by: ["recipientType", "recipientId", "status"],
      where: { month, status: { not: "CANCELLED" } },
      _sum: { amount: true },
    }),
    // The Payout engine's "Still unpaid" includes these (getPayoutMonth -> grand.unpaid), so the lines here do too.
    db.performanceBonus.groupBy({
      by: ["recipientId", "status"],
      where: { month, status: { not: "CANCELLED" } },
      _sum: { amount: true },
    }),
    db.payoutSubmission.findUnique({ where: { month }, select: { submittedAt: true } }),
    execNames(),
  ]);
  // Group 2 (6 queries inside): the month's founder draw from its revenue tier.
  const draws = await getMonthlyDrawPanel(month);

  const groups: Record<PayoutGroupKey, PayoutAccumulator> = {
    WORKER: newAccumulator(),
    AMBASSADOR: newAccumulator(),
    HOG: newAccumulator(),
    COO: newAccumulator(),
  };
  let totalPending = 0;
  for (const r of rows) {
    const amount = Math.round(r._sum.amount ?? 0);
    if (r.status === "PENDING") totalPending += amount;
    const key = payoutGroupKey(r.recipientType, r.recipientId);
    if (!key) continue;
    const acc = groups[key];
    acc.recipients.add(r.recipientId);
    if (r.status === "PAID") acc.paid += amount;
    else if (r.status === "PENDING") acc.pending += amount;
  }

  const bonus = { HOG: { pending: 0, paid: 0 }, COO: { pending: 0, paid: 0 } };
  for (const b of bonusRows) {
    const amount = Math.round(b._sum.amount ?? 0);
    if (b.status === "PENDING") totalPending += amount;
    if (b.recipientId !== "HOG" && b.recipientId !== "COO") continue;
    const acc = groups[b.recipientId];
    acc.recipients.add(b.recipientId);
    if (b.status === "PAID") {
      acc.paid += amount;
      bonus[b.recipientId].paid += amount;
    } else if (b.status === "PENDING") {
      acc.pending += amount;
      bonus[b.recipientId].pending += amount;
    }
  }

  const hog: ExecPayoutStatus = { ...toGroupStatus(groups.HOG), name: execs.HOG.name, bonus: bonus.HOG };
  const coo: ExecPayoutStatus = { ...toGroupStatus(groups.COO), name: execs.COO.name, bonus: bonus.COO };

  // Distributions first: a month whose revenue later fell below the tier
  // (a refund) still paid its draws out, and the card must say so.
  const drawStatus: FounderDrawStatus =
    draws.distributedTotal > 0 && draws.outstandingTotal === 0
      ? "DISTRIBUTED"
      : draws.drawsTotal === 0
        ? "NONE"
        : draws.distributedTotal > 0
          ? "PARTIAL"
          : "PENDING";

  return {
    workers: toGroupStatus(groups.WORKER),
    ambassadors: toGroupStatus(groups.AMBASSADOR),
    hog,
    coo,
    totalPending,
    submission: submission ? { submittedAt: submission.submittedAt.toISOString() } : null,
    founderDraws: {
      drawEach: draws.drawEach,
      total: draws.drawsTotal,
      distributed: draws.distributedTotal,
      outstanding: draws.outstandingTotal,
      funded: draws.funded,
      tierMin: draws.tier.minRevenue,
      status: drawStatus,
    },
  };
}

// ── AI usage ─────────────────────────────────────────────────────

function toAiBalance(balance: Awaited<ReturnType<typeof getCreditBalance>>): AiBalance {
  if (!balance.configured) return { configured: false, remaining: null, percentRemaining: null, level: null };
  return {
    configured: true,
    remaining: balance.remaining,
    percentRemaining: balance.percentRemaining,
    level: balance.level,
  };
}

/**
 * Claude spend for the UTC month. One aggregate and one groupBy rather than
 * `getUsageSummary`, which loads every row and bounds its period in
 * server-local time (not UTC like the rest of finance). The average follows
 * the AI usage page's rule: the month's whole cost ÷ distinct projects billed.
 * The balance is the manually entered Anthropic figure less logged spend
 * (`getCreditBalance`); there is no Anthropic balance API.
 */
async function aiUsage(month: string): Promise<FinancePayload["aiUsage"]> {
  const { start, end } = monthBounds(month);
  const inMonth = { createdAt: { gte: start, lt: end } };
  // One group (4 queries): totals, distinct projects, the balance (2 inside).
  const [totals, perProject, credit] = await Promise.all([
    db.aiUsageLog.aggregate({
      where: inMonth,
      _sum: { inputTokens: true, outputTokens: true, costNaira: true },
      _count: { _all: true },
    }),
    db.aiUsageLog.groupBy({ by: ["projectId"], where: { ...inMonth, projectId: { not: null } } }),
    getCreditBalance(),
  ]);

  const totalCost = round2(totals._sum.costNaira ?? 0);
  const projects = perProject.length;
  return {
    totalTokens: (totals._sum.inputTokens ?? 0) + (totals._sum.outputTokens ?? 0),
    totalCost,
    calls: totals._count._all,
    projects,
    avgCostPerProject: projects > 0 ? round2(totalCost / projects) : null,
    targetMin: AI_COST_PER_PROJECT.min,
    targetMax: AI_COST_PER_PROJECT.max,
    balance: toAiBalance(credit),
  };
}

// ── Payload ──────────────────────────────────────────────────────

/** The Financial pulse payload for the UTC month containing `now`. Read-only. */
export async function getFinance(now: Date = new Date()): Promise<FinancePayload> {
  const month = currentMonthKey(now);
  const previousMonth = shiftMonth(month, -1);

  // Sections one after another; each keeps its own reads to a handful at a time.
  const revenue = await revenuePosition(now, month);
  const buckets = await bucketPulse(month, previousMonth);
  const payouts = await payoutStatus(month);
  const ai = await aiUsage(month);

  return {
    generatedAt: now.toISOString(),
    month,
    monthLabel: monthLongLabel(month),
    revenuePosition: revenue,
    buckets,
    payoutStatus: payouts,
    aiUsage: ai,
    links: { finance: FINANCE_HREF, aiUsage: AI_USAGE_HREF },
  };
}
