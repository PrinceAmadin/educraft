import { Prisma, type BucketType } from "@prisma/client";
import { db } from "@/lib/db";
import {
  BUCKET_KEY,
  BUCKET_META,
  BUCKET_TYPES,
  bucketHealth,
  bucketSplit,
  expectedAllocation,
  retainedRateFor,
  type BucketAmounts,
  type BucketHealth,
} from "@/lib/finance/commission-config";
import { getFinanceSettings } from "@/lib/services/finance/settings";

/**
 * The four buckets.
 *
 * EduCraft's retained share of a project (price less every leg owed out) is
 * what the buckets hold, in proportion to the money actually in. The unit of
 * truth is the PROJECT, not the payment: `syncProjectBuckets` compares what
 * the buckets should hold for a project with what has been logged and writes
 * the difference — so a webhook replay changes nothing, an ambassador
 * allocated after the downpayment trues the buckets up, and a refund takes
 * the money back out. Every event is one BucketAllocationLog row (signed) and
 * four BucketTransaction rows; the balance of a bucket is Σ its transactions.
 */

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof db;

export type AllocationReason = "PAYMENT" | "REALLOCATION" | "REFUND" | "BACKFILL" | "ADJUSTMENT";

const CLIENT_INFLOW_TYPES = ["CLIENT_DOWNPAYMENT", "CLIENT_BALANCE"] as const;

/** "2026-09" for a date, in UTC like every other finance figure. */
export function monthKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Money actually in on a project: confirmed client inflows less confirmed refunds (up to `asOf`, for the backfill). */
export async function projectNetInflow(tx: Db, projectId: string, asOf?: Date): Promise<number> {
  const dated = asOf ? { date: { lte: asOf } } : {};
  const [inflow, refunds] = await Promise.all([
    tx.payment.aggregate({
      where: { projectId, direction: "INFLOW", status: "Confirmed", type: { in: [...CLIENT_INFLOW_TYPES] }, ...dated },
      _sum: { amount: true },
    }),
    tx.payment.aggregate({
      where: { projectId, direction: "OUTFLOW", status: "Confirmed", type: "REFUND", ...dated },
      _sum: { amount: true },
    }),
  ]);
  return Math.round((inflow._sum.amount ?? 0) - (refunds._sum.amount ?? 0));
}

export interface SyncOptions {
  reason: AllocationReason;
  /** The confirmed payment that triggered this (unique on the log: a replay is a no-op). */
  paymentId?: string;
  /** Month the money belongs to; defaults to now. */
  month?: string;
  note?: string;
  recordedById?: string | null;
  /** Backfill only: allocate as the buckets stood at this moment (payments dated after it are ignored). */
  asOf?: Date;
}

export interface SyncResult {
  delta: number;
  amounts: BucketAmounts | null;
}

const LEGS_SELECT = {
  id: true,
  projectId: true,
  price: true,
  workerPayout: true,
  workerPayoutRate: true,
  ambassadorCommission: true,
  parentCommission: true,
  ambassadorId: true,
  isProBono: true,
} satisfies Prisma.ProjectSelect;

/**
 * Bring a project's bucket allocation in line with EduCraft's retained share
 * of the money in. Delta-based: a second call with nothing changed writes
 * nothing. Call it inside the transaction that confirmed the payment or
 * changed the project's legs.
 */
export async function syncProjectBuckets(tx: Tx, projectDbId: string, opts: SyncOptions): Promise<SyncResult> {
  const project = await tx.project.findUnique({ where: { id: projectDbId }, select: LEGS_SELECT });
  if (!project) return { delta: 0, amounts: null };

  if (opts.paymentId) {
    // Someone else's replay already logged this payment: nothing to add.
    const already = await tx.bucketAllocationLog.findUnique({ where: { paymentId: opts.paymentId }, select: { id: true } });
    if (already) return { delta: 0, amounts: null };
  }

  const netInflow = await projectNetInflow(tx, projectDbId, opts.asOf);
  const expected = expectedAllocation(project, netInflow);
  const logged = await tx.bucketAllocationLog.aggregate({ where: { projectId: projectDbId }, _sum: { retainedAmount: true } });
  const delta = expected - Math.round(logged._sum.retainedAmount ?? 0);
  if (delta === 0) return { delta: 0, amounts: null };

  const amounts = bucketSplit(delta);
  const month = opts.month ?? monthKeyOf(new Date());
  const inflowLike = delta > 0 && (opts.reason === "PAYMENT" || opts.reason === "BACKFILL");
  const description =
    opts.note ??
    (opts.reason === "PAYMENT"
      ? `Retained share of a payment on ${project.projectId}`
      : opts.reason === "REFUND"
        ? `Refund on ${project.projectId}`
        : opts.reason === "REALLOCATION"
          ? `Legs changed on ${project.projectId} — true-up`
          : `${opts.reason} on ${project.projectId}`);

  const log = await tx.bucketAllocationLog.create({
    data: {
      paymentId: opts.paymentId ?? null,
      projectId: projectDbId,
      reason: opts.reason,
      month,
      retainedAmount: delta,
      retainedRate: retainedRateFor(project),
      ...amounts,
      note: opts.note ?? null,
      recordedById: opts.recordedById ?? null,
    },
    select: { id: true },
  });

  const rows = BUCKET_TYPES.map((bucket) => ({
    bucketType: bucket,
    type: inflowLike ? "INFLOW" : "ADJUSTMENT",
    amount: amounts[BUCKET_KEY[bucket]],
    description,
    allocationId: log.id,
    paymentId: opts.paymentId ?? null,
    projectId: projectDbId,
    recordedById: opts.recordedById ?? null,
    month,
  })).filter((r) => r.amount !== 0);
  if (rows.length) await tx.bucketTransaction.createMany({ data: rows });

  await tx.bucketBalance.upsert({
    where: { month },
    create: { month, ...amounts },
    update: {
      operationsReserve: { increment: amounts.operationsReserve },
      growthFund: { increment: amounts.growthFund },
      reinvestmentFund: { increment: amounts.reinvestmentFund },
      founderDistribution: { increment: amounts.founderDistribution },
    },
  });

  return { delta, amounts };
}

/** Keep the Payment rows' ambassador snapshot in step with the project (the spec's columns). */
export async function syncPaymentAmbassadorSnapshot(tx: Tx, projectDbId: string): Promise<void> {
  const project = await tx.project.findUnique({ where: { id: projectDbId }, select: { ambassadorId: true } });
  if (!project) return;
  await tx.payment.updateMany({
    where: { projectId: projectDbId },
    data: { ambassadorId: project.ambassadorId, isAmbassadorDriven: project.ambassadorId != null },
  });
}

// ── Reads ────────────────────────────────────────────────────────────────

const EMPTY: BucketAmounts = { operationsReserve: 0, growthFund: 0, reinvestmentFund: 0, founderDistribution: 0 };

export async function getBucketBalances(client: Db = db): Promise<BucketAmounts> {
  const rows = await client.bucketTransaction.groupBy({ by: ["bucketType"], _sum: { amount: true } });
  const out: BucketAmounts = { ...EMPTY };
  for (const r of rows) out[BUCKET_KEY[r.bucketType]] = Math.round(r._sum.amount ?? 0);
  return out;
}

export interface BucketMonthFlow {
  inflow: number;
  outflow: number;
}

/** What came into and went out of each bucket in a month (whole naira, positive numbers). */
export async function getBucketMonthFlows(month: string): Promise<Record<BucketType, BucketMonthFlow>> {
  const rows = await db.bucketTransaction.findMany({ where: { month }, select: { bucketType: true, amount: true } });
  const out = Object.fromEntries(BUCKET_TYPES.map((b) => [b, { inflow: 0, outflow: 0 }])) as Record<BucketType, BucketMonthFlow>;
  for (const r of rows) {
    if (r.amount >= 0) out[r.bucketType].inflow += r.amount;
    else out[r.bucketType].outflow += -r.amount;
  }
  for (const b of BUCKET_TYPES) {
    out[b].inflow = Math.round(out[b].inflow);
    out[b].outflow = Math.round(out[b].outflow);
  }
  return out;
}

export interface BucketCard {
  bucket: BucketType;
  label: string;
  purpose: string;
  shareOfRetained: number;
  balance: number;
  month: BucketMonthFlow;
  health: BucketHealth;
}

/** The four bucket cards for a month, balances all-time. */
export async function getBucketCards(month: string): Promise<BucketCard[]> {
  const [balances, flows, settings] = await Promise.all([getBucketBalances(), getBucketMonthFlows(month), getFinanceSettings()]);
  return BUCKET_TYPES.map((bucket) => ({
    bucket,
    label: BUCKET_META[bucket].label,
    purpose: BUCKET_META[bucket].purpose,
    shareOfRetained: BUCKET_META[bucket].shareOfRetained,
    balance: balances[BUCKET_KEY[bucket]],
    month: flows[bucket],
    health: bucketHealth(bucket, balances[BUCKET_KEY[bucket]], {
      operatingBaseline: settings.operatingCostMonthlyBaseline,
      referenceRevenue: settings.bucketReferenceRevenue,
    }),
  }));
}

export interface BucketTransactionRow {
  id: string;
  bucketType: BucketType;
  type: string;
  amount: number;
  description: string;
  projectCode: string | null;
  month: string;
  createdAt: string;
}

export const BUCKET_TX_PAGE_SIZE = 40;

export async function listBucketTransactions(filters: { bucket?: BucketType; month?: string; page?: number }): Promise<{
  rows: BucketTransactionRow[];
  total: number;
  page: number;
  pageCount: number;
}> {
  const page = Math.max(1, filters.page ?? 1);
  const where: Prisma.BucketTransactionWhereInput = {
    ...(filters.bucket ? { bucketType: filters.bucket } : {}),
    ...(filters.month ? { month: filters.month } : {}),
  };
  const [rows, total] = await Promise.all([
    db.bucketTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * BUCKET_TX_PAGE_SIZE,
      take: BUCKET_TX_PAGE_SIZE,
    }),
    db.bucketTransaction.count({ where }),
  ]);
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((x): x is string => x != null))];
  const projects = projectIds.length
    ? await db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, projectId: true } })
    : [];
  const codeById = new Map(projects.map((p) => [p.id, p.projectId]));
  return {
    rows: rows.map((r) => ({
      id: r.id,
      bucketType: r.bucketType,
      type: r.type,
      amount: r.amount,
      description: r.description,
      projectCode: r.projectId ? (codeById.get(r.projectId) ?? null) : null,
      month: r.month,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / BUCKET_TX_PAGE_SIZE)),
  };
}

/** Σ retained allocated in a month — what EduCraft kept of that month's money (the dashboard's "Net retained"). */
export async function getRetainedForMonth(month: string): Promise<number> {
  const agg = await db.bucketAllocationLog.aggregate({ where: { month }, _sum: { retainedAmount: true } });
  return Math.round(agg._sum.retainedAmount ?? 0);
}

/** Per-month retained allocated, for the last N months ending at `now`. */
export async function getRetainedSeries(months: string[]): Promise<Record<string, number>> {
  const rows = await db.bucketAllocationLog.groupBy({ by: ["month"], where: { month: { in: months } }, _sum: { retainedAmount: true } });
  return Object.fromEntries(months.map((m) => [m, Math.round(rows.find((r) => r.month === m)?._sum.retainedAmount ?? 0)]));
}

// ── Writes other than allocation ────────────────────────────────────────

export class BucketError extends Error {}

/** The CFO's manual correction (rare). Signed amount; a reason is required. */
export async function manualAdjustment(input: { bucket: BucketType; amount: number; reason: string; recordedById: string }): Promise<{ id: string }> {
  const amount = Math.round(input.amount);
  if (amount === 0) throw new BucketError("Enter an amount other than 0");
  const now = new Date();
  return db.bucketTransaction.create({
    data: {
      bucketType: input.bucket,
      type: "ADJUSTMENT",
      amount,
      description: `Manual adjustment: ${input.reason.trim()}`,
      recordedById: input.recordedById,
      month: monthKeyOf(now),
    },
    select: { id: true },
  });
}

/**
 * An approved expense with a bucket is an outflow from that bucket; one
 * transaction per expense (unique), kept in step with the expense's amount,
 * bucket and approval — and removed when the expense no longer qualifies.
 */
export async function syncExpenseOutflow(tx: Db, expenseId: string): Promise<void> {
  const expense = await tx.expense.findUnique({
    where: { id: expenseId },
    select: { id: true, amount: true, bucketSource: true, approvalStatus: true, description: true, category: true, date: true, kind: true },
  });
  if (!expense) {
    await tx.bucketTransaction.deleteMany({ where: { expenseId } });
    return;
  }
  const qualifies = expense.bucketSource != null && (expense.approvalStatus === "AUTO_APPROVED" || expense.approvalStatus === "APPROVED");
  if (!qualifies) {
    await tx.bucketTransaction.deleteMany({ where: { expenseId } });
    return;
  }
  // AI cost rows are the one place kobo survive (they tie to the AI usage page to the kobo).
  const amount = expense.kind === "AI" ? -Math.round(expense.amount * 100) / 100 : -Math.round(expense.amount);
  const data = {
    bucketType: expense.bucketSource as BucketType,
    type: "OUTFLOW",
    amount,
    description: `${expense.category}: ${expense.description}`,
    month: monthKeyOf(expense.date),
  };
  await tx.bucketTransaction.upsert({ where: { expenseId }, create: { ...data, expenseId }, update: data });
}
