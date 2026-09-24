import { Prisma, type BucketType } from "@prisma/client";
import { db } from "@/lib/db";
import { BUCKET_META, expenseNeedsApproval, FINANCE_DEFAULTS } from "@/lib/finance/commission-config";
import { syncExpenseOutflow } from "@/lib/services/finance/buckets";
import { getGrowthFundQuarter, quarterOf, type GrowthFundQuarter } from "@/lib/services/finance/surplus";
import { notifyFinance, notifyRole, notifyUsers } from "@/lib/services/notifications";
import { formatNaira } from "@/lib/utils";
import type { CreateExpenseInput, ExpenseListParams, SponsorshipExpenseInput } from "@/lib/validations/expenses";

export const EXPENSE_PAGE_SIZE = 25;

export class ExpenseError extends Error {}

/** Only these count as money out: a pending or declined expense has not left a bucket. */
export const COUNTED_STATUSES = ["AUTO_APPROVED", "APPROVED"] as const;

export interface ExpenseRow {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  recurring: boolean;
  frequency: string | null;
  /** Set when the system logged this for a job (an ambassador commission). */
  projectId: string | null;
  /** MANUAL, COMMISSION, AI, SPONSORSHIP */
  kind: string;
  bucketSource: BucketType | null;
  approvalStatus: string;
  approvedAt: string | null;
  loggedByName: string | null;
}

export interface ExpenseListResult {
  rows: ExpenseRow[];
  total: number;
  page: number;
  pageCount: number;
  /** Sum of `amount` across every row matching the filters (not just this page). */
  filteredTotal: number;
}

type ExpenseSource = Prisma.ExpenseGetPayload<{ select: typeof ROW_SELECT }>;

const ROW_SELECT = {
  id: true,
  category: true,
  description: true,
  amount: true,
  date: true,
  recurring: true,
  frequency: true,
  projectId: true,
  kind: true,
  bucketSource: true,
  approvalStatus: true,
  approvedAt: true,
  approvedBy: true,
} satisfies Prisma.ExpenseSelect;

function toRow(e: ExpenseSource, names: Map<string, string>): ExpenseRow {
  return {
    id: e.id,
    category: e.category,
    description: e.description,
    amount: e.amount,
    date: e.date.toISOString(),
    recurring: e.recurring,
    frequency: e.frequency,
    projectId: e.projectId,
    kind: e.kind,
    bucketSource: e.bucketSource,
    approvalStatus: e.approvalStatus,
    approvedAt: e.approvedAt?.toISOString() ?? null,
    loggedByName: e.approvedBy ? (names.get(e.approvedBy) ?? null) : null,
  };
}

async function namesFor(rows: { approvedBy: string | null }[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.approvedBy).filter((x): x is string => x != null))];
  if (ids.length === 0) return new Map();
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, email: true, execProfile: { select: { fullName: true } } } });
  return new Map(users.map((u) => [u.id, u.execProfile?.fullName ?? u.displayName ?? u.email.split("@")[0]]));
}

function monthBounds(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

function buildWhere(filters: ExpenseListParams): Prisma.ExpenseWhereInput {
  const where: Prisma.ExpenseWhereInput = {};
  if (filters.category) where.category = filters.category;
  if (filters.bucket) where.bucketSource = filters.bucket;
  if (filters.status) where.approvalStatus = filters.status;
  if (filters.kind) where.kind = filters.kind;
  if (filters.month) {
    const { start, end } = monthBounds(filters.month);
    where.date = { gte: start, lt: end };
  } else if (filters.from || filters.to) {
    where.date = {
      ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
      ...(filters.to ? { lt: new Date(new Date(`${filters.to}T00:00:00.000Z`).getTime() + 86_400_000) } : {}),
    };
  }
  return where;
}

export async function listExpenses(filters: ExpenseListParams): Promise<ExpenseListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const where = buildWhere(filters);

  const [rows, total, agg] = await db.$transaction([
    db.expense.findMany({ where, orderBy: { date: "desc" }, skip: (page - 1) * EXPENSE_PAGE_SIZE, take: EXPENSE_PAGE_SIZE, select: ROW_SELECT }),
    db.expense.count({ where }),
    db.expense.aggregate({ where, _sum: { amount: true } }),
  ]);
  const names = await namesFor(rows);

  return {
    rows: rows.map((r) => toRow(r, names)),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / EXPENSE_PAGE_SIZE)),
    filteredTotal: agg._sum.amount ?? 0,
  };
}

/** Sum of counted expenses dated within the current calendar month. */
export async function getMonthToDateTotal(now: Date = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const agg = await db.expense.aggregate({
    where: { date: { gte: start, lt: end }, approvalStatus: { in: [...COUNTED_STATUSES] } },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/** Counted expense totals by category within a date range, highest first. */
export async function getExpensesByCategory(start: Date, end: Date): Promise<{ category: string; amount: number }[]> {
  const rows = await db.expense.groupBy({
    by: ["category"],
    where: { date: { gte: start, lt: end }, approvalStatus: { in: [...COUNTED_STATUSES] } },
    _sum: { amount: true },
  });
  return rows.map((r) => ({ category: r.category, amount: r._sum.amount ?? 0 })).sort((a, b) => b.amount - a.amount);
}

export interface BucketExpenseSummary {
  bucket: BucketType;
  label: string;
  total: number;
  count: number;
  categories: { category: string; amount: number }[];
}

export interface MonthlyExpenseSummary {
  month: string;
  buckets: BucketExpenseSummary[];
  /** Rows with no bucket (the ambassador commissions come off the 15%, never a bucket). */
  unbucketed: { total: number; count: number };
  pending: { count: number; amount: number };
  total: number;
}

/** What flowed out of each bucket in a month and what for — the CFO's summary. */
export async function getMonthlyExpenseSummary(month: string): Promise<MonthlyExpenseSummary> {
  const { start, end } = monthBounds(month);
  const [rows, pending] = await Promise.all([
    db.expense.groupBy({
      by: ["bucketSource", "category"],
      where: { date: { gte: start, lt: end }, approvalStatus: { in: [...COUNTED_STATUSES] } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.expense.aggregate({ where: { date: { gte: start, lt: end }, approvalStatus: "PENDING_APPROVAL" }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const buckets: BucketExpenseSummary[] = (["OPERATIONS_RESERVE", "GROWTH_FUND", "REINVESTMENT_FUND"] as const).map((bucket) => {
    const mine = rows.filter((r) => r.bucketSource === bucket);
    return {
      bucket,
      label: BUCKET_META[bucket].label,
      total: Math.round(mine.reduce((s, r) => s + (r._sum.amount ?? 0), 0) * 100) / 100,
      count: mine.reduce((s, r) => s + r._count._all, 0),
      categories: mine.map((r) => ({ category: r.category, amount: Math.round((r._sum.amount ?? 0) * 100) / 100 })).sort((a, b) => b.amount - a.amount),
    };
  });
  const un = rows.filter((r) => r.bucketSource == null);
  return {
    month,
    buckets,
    unbucketed: { total: Math.round(un.reduce((s, r) => s + (r._sum.amount ?? 0), 0)), count: un.reduce((s, r) => s + r._count._all, 0) },
    pending: { count: pending._count._all, amount: Math.round(pending._sum.amount ?? 0) },
    total: Math.round(rows.reduce((s, r) => s + (r._sum.amount ?? 0), 0)),
  };
}

export interface HogBudget extends GrowthFundQuarter {
  recent: ExpenseRow[];
  pendingCount: number;
}

/** The HOG's sponsorship budget this quarter, with the recent spending behind it. */
export async function getHogBudget(month: string): Promise<HogBudget> {
  const quarter = quarterOf(month);
  const [budget, recent, pendingCount] = await Promise.all([
    getGrowthFundQuarter(month),
    db.expense.findMany({
      where: { kind: "SPONSORSHIP", approvalStatus: { not: "DECLINED" }, date: { gte: monthBounds(quarter.months[0]).start, lt: monthBounds(quarter.months[quarter.months.length - 1]).end } },
      orderBy: { date: "desc" },
      take: 10,
      select: ROW_SELECT,
    }),
    db.expense.count({ where: { kind: "SPONSORSHIP", approvalStatus: "PENDING_APPROVAL" } }),
  ]);
  const names = await namesFor(recent);
  return { ...budget, recent: recent.map((r) => toRow(r, names)), pendingCount };
}

export async function listPendingApprovals(): Promise<ExpenseRow[]> {
  const rows = await db.expense.findMany({ where: { approvalStatus: "PENDING_APPROVAL" }, orderBy: { date: "desc" }, select: ROW_SELECT });
  const names = await namesFor(rows);
  return rows.map((r) => toRow(r, names));
}

export interface ProjectedRecurringItem {
  id: string;
  description: string;
  category: string;
  frequency: string;
  /** Original recurring amount, normalised to a monthly figure. */
  monthlyAmount: number;
}

const FREQUENCY_DIVISOR: Record<string, number> = { Monthly: 1, Quarterly: 3, Annual: 12 };

/**
 * Every currently-recurring expense, normalised to what it costs per month —
 * "Monthly recurring expenses auto-display as projected costs" from the
 * roadmap. This is projected, not what actually landed this month.
 */
export async function getProjectedRecurring(): Promise<{ items: ProjectedRecurringItem[]; monthlyTotal: number }> {
  // One row per recurring description+category — the latest entry stands in
  // for "what this currently costs" rather than double-counting every past
  // instance logged for it.
  const rows = await db.expense.findMany({ where: { recurring: true, approvalStatus: { in: [...COUNTED_STATUSES] } }, orderBy: { date: "desc" } });

  const seen = new Map<string, ProjectedRecurringItem>();
  for (const r of rows) {
    const key = `${r.description.trim().toLowerCase()}|${r.category}`;
    if (seen.has(key)) continue;
    const divisor = FREQUENCY_DIVISOR[r.frequency ?? "Monthly"] ?? 1;
    seen.set(key, { id: r.id, description: r.description, category: r.category, frequency: r.frequency ?? "Monthly", monthlyAmount: r.amount / divisor });
  }

  const items = [...seen.values()].sort((a, b) => b.monthlyAmount - a.monthlyAmount);
  return { items, monthlyTotal: items.reduce((s, i) => s + i.monthlyAmount, 0) };
}

// ── Writes ───────────────────────────────────────────────────────────────

async function notifyPendingApproval(expense: { id: string; description: string; amount: number }, who: string) {
  await notifyRole("SUPER_ADMIN", {
    title: "Expense needs your approval",
    message: `${who} logged ${formatNaira(expense.amount)} — ${expense.description}. Over ${formatNaira(FINANCE_DEFAULTS.expenseApprovalThreshold)}, so it waits for you before leaving the bucket.`,
    type: "warning",
    link: "/admin/finance/expenses?status=PENDING_APPROVAL",
  });
}

async function displayName(userId: string): Promise<string> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { displayName: true, email: true, execProfile: { select: { fullName: true } } } });
  return u?.execProfile?.fullName ?? u?.displayName ?? u?.email ?? "A team member";
}

/**
 * Log an expense against a bucket. Over the threshold and not logged by the
 * founder, it waits for the founder's approval and leaves no bucket until
 * then; otherwise its outflow is written at once.
 */
export async function createExpense(input: CreateExpenseInput, loggedById: string, loggedByRole: string): Promise<{ id: string; approvalStatus: string }> {
  const approvalStatus = expenseNeedsApproval(input.amount, loggedByRole) ? "PENDING_APPROVAL" : "AUTO_APPROVED";
  const row = await db.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        category: input.category,
        description: input.description,
        amount: input.amount,
        date: new Date(`${input.date}T00:00:00.000Z`),
        recurring: input.recurring,
        frequency: input.recurring ? input.frequency || null : null,
        approvedBy: loggedById,
        kind: "MANUAL",
        bucketSource: input.bucketSource,
        approvalStatus,
      },
      select: { id: true, description: true, amount: true },
    });
    await syncExpenseOutflow(tx, created.id);
    return created;
  });
  if (approvalStatus === "PENDING_APPROVAL") await notifyPendingApproval(row, await displayName(loggedById));
  return { id: row.id, approvalStatus };
}

/** The HOG's student-union sponsorship, paid from the Growth Fund against the quarterly budget. */
export async function createSponsorshipExpense(
  input: SponsorshipExpenseInput,
  loggedById: string,
  loggedByRole: string,
  /** Phase 3: the partnership this payment is for (its term commitment or a renewal). */
  opts: { partnershipId?: string } = {}
): Promise<{ id: string; approvalStatus: string; budget: GrowthFundQuarter }> {
  const approvalStatus = expenseNeedsApproval(input.amount, loggedByRole) ? "PENDING_APPROVAL" : "AUTO_APPROVED";
  const row = await db.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        category: "Sponsorship",
        description: input.description,
        amount: input.amount,
        date: new Date(`${input.date}T00:00:00.000Z`),
        approvedBy: loggedById,
        kind: "SPONSORSHIP",
        bucketSource: "GROWTH_FUND",
        approvalStatus,
        partnershipId: opts.partnershipId ?? null,
        ...(input.notes ? { frequency: null } : {}),
      },
      select: { id: true, description: true, amount: true, date: true },
    });
    await syncExpenseOutflow(tx, created.id);
    return created;
  });
  const who = await displayName(loggedById);
  const budget = await getGrowthFundQuarter(`${row.date.getUTCFullYear()}-${String(row.date.getUTCMonth() + 1).padStart(2, "0")}`);
  if (approvalStatus === "PENDING_APPROVAL") await notifyPendingApproval(row, who);
  await notifyFinance({
    title: "Sponsorship logged",
    message: `${who} logged ${formatNaira(row.amount)} — ${row.description} (Growth Fund${approvalStatus === "PENDING_APPROVAL" ? ", awaiting the founder" : ""}). ${formatNaira(Math.max(0, budget.remaining))} of the ${budget.quarter.label} budget remains.`,
    type: budget.remaining < 0 ? "warning" : "info",
    link: "/admin/finance/expenses",
  });
  return { id: row.id, approvalStatus, budget };
}

/** The founder approves (outflow written) or declines an expense over the threshold. */
export async function decideExpense(id: string, input: { decision: "approve" | "decline"; approvedById: string; note?: string }): Promise<ExpenseRow> {
  const expense = await db.expense.findUnique({ where: { id }, select: ROW_SELECT });
  if (!expense) throw new ExpenseError("Expense not found");
  if (expense.approvalStatus !== "PENDING_APPROVAL") throw new ExpenseError(`This expense is already ${expense.approvalStatus.toLowerCase().replace("_", " ")}`);
  const status = input.decision === "approve" ? "APPROVED" : "DECLINED";
  const updated = await db.$transaction(async (tx) => {
    const claimed = await tx.expense.updateMany({
      where: { id, approvalStatus: "PENDING_APPROVAL" },
      data: { approvalStatus: status, approvedById: input.approvedById, approvedAt: new Date(), ...(input.note ? { description: `${expense.description} — ${status === "DECLINED" ? "declined" : "approved"}: ${input.note}` } : {}) },
    });
    if (claimed.count !== 1) throw new ExpenseError("Someone else just decided this expense. Refresh the page.");
    await syncExpenseOutflow(tx, id);
    return tx.expense.findUniqueOrThrow({ where: { id }, select: ROW_SELECT });
  });
  if (expense.approvedBy) {
    await notifyUsers([expense.approvedBy], {
      title: status === "APPROVED" ? "Expense approved" : "Expense declined",
      message: `${formatNaira(expense.amount)} — ${expense.description}: ${status === "APPROVED" ? "approved by the founder and paid from the bucket." : "declined by the founder."}${input.note ? ` ${input.note}` : ""}`,
      type: status === "APPROVED" ? "success" : "warning",
      link: "/admin/finance/expenses",
    });
  }
  return toRow(updated, await namesFor([updated]));
}

/** A job's ambassador commission — managed from the job, not deletable here. */
export class ExpenseLockedError extends ExpenseError {}

export async function deleteExpense(id: string): Promise<void> {
  const expense = await db.expense.findUnique({ where: { id }, select: { projectId: true, kind: true } });
  if (!expense) throw new ExpenseError("Expense not found");
  if (expense.projectId) {
    throw new ExpenseLockedError("This is a job's ambassador commission — change or remove it from the job's Financials tab instead.");
  }
  if (expense.kind === "AI") {
    throw new ExpenseLockedError("This is Claude usage rolled up from the AI usage log — it follows the log and cannot be deleted by hand.");
  }
  try {
    await db.$transaction(async (tx) => {
      await tx.bucketTransaction.deleteMany({ where: { expenseId: id } });
      await tx.expense.delete({ where: { id } });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw new ExpenseError("Expense not found");
    }
    throw err;
  }
}

// ── Claude usage roll-up ────────────────────────────────────────────────

/** "ai:2026-09-24:research_pipeline:<projectId or ->" */
export function aiUsageKey(day: Date, subsystem: string, projectId: string | null): string {
  return `ai:${day.toISOString().slice(0, 10)}:${subsystem}:${projectId ?? "-"}`;
}

/**
 * Keep one Operations Reserve expense per project (or subsystem) per day in
 * step with the AiUsageLog rows behind it. Called after every logged Claude
 * call and by the backfill; idempotent, the amount is always the sum of the
 * log. Kobo are kept so the figure ties to the AI usage page exactly.
 */
export async function rollUpAiExpense(input: { day: Date; subsystem: string; projectId: string | null }): Promise<{ id: string; amount: number }> {
  const dayStart = new Date(Date.UTC(input.day.getUTCFullYear(), input.day.getUTCMonth(), input.day.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const [agg, project] = await Promise.all([
    db.aiUsageLog.aggregate({
      where: { subsystem: input.subsystem, projectId: input.projectId, createdAt: { gte: dayStart, lt: dayEnd } },
      _sum: { costNaira: true },
      _count: { _all: true },
    }),
    input.projectId ? db.project.findUnique({ where: { id: input.projectId }, select: { projectId: true } }) : null,
  ]);
  const amount = Math.round((agg._sum.costNaira ?? 0) * 100) / 100;
  const key = aiUsageKey(dayStart, input.subsystem, input.projectId);
  const subsystemLabel = input.subsystem.replace(/_/g, " ");
  const description = `Claude API — ${subsystemLabel}${project ? ` on ${project.projectId}` : ""} (${agg._count._all} call${agg._count._all === 1 ? "" : "s"})`;
  const row = await db.$transaction(async (tx) => {
    const upserted = await tx.expense.upsert({
      where: { aiUsageKey: key },
      create: {
        category: "API cost",
        description,
        amount,
        date: dayStart,
        kind: "AI",
        bucketSource: "OPERATIONS_RESERVE",
        approvalStatus: "AUTO_APPROVED",
        aiUsageKey: key,
        projectId: null,
      },
      update: { amount, description },
      select: { id: true, amount: true },
    });
    await syncExpenseOutflow(tx, upserted.id);
    return upserted;
  });
  return { id: row.id, amount: row.amount };
}
