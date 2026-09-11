import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { CreateExpenseInput, ExpenseListParams } from "@/lib/validations/expenses";

export const EXPENSE_PAGE_SIZE = 25;

export class ExpenseError extends Error {}

export interface ExpenseRow {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  recurring: boolean;
  frequency: string | null;
}

export interface ExpenseListResult {
  rows: ExpenseRow[];
  total: number;
  page: number;
  pageCount: number;
  /** Sum of `amount` across every row matching the filters (not just this page). */
  filteredTotal: number;
}

function toRow(e: {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: Date;
  recurring: boolean;
  frequency: string | null;
}): ExpenseRow {
  return {
    id: e.id,
    category: e.category,
    description: e.description,
    amount: e.amount,
    date: e.date.toISOString(),
    recurring: e.recurring,
    frequency: e.frequency,
  };
}

function buildWhere(filters: ExpenseListParams): Prisma.ExpenseWhereInput {
  const where: Prisma.ExpenseWhereInput = {};
  if (filters.category) where.category = filters.category;
  if (filters.from || filters.to) {
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
    db.expense.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * EXPENSE_PAGE_SIZE,
      take: EXPENSE_PAGE_SIZE,
    }),
    db.expense.count({ where }),
    db.expense.aggregate({ where, _sum: { amount: true } }),
  ]);

  return {
    rows: rows.map(toRow),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / EXPENSE_PAGE_SIZE)),
    filteredTotal: agg._sum.amount ?? 0,
  };
}

/** Sum of expenses dated within the current calendar month. */
export async function getMonthToDateTotal(now: Date = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const agg = await db.expense.aggregate({
    where: { date: { gte: start, lt: end } },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
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
export async function getProjectedRecurring(): Promise<{
  items: ProjectedRecurringItem[];
  monthlyTotal: number;
}> {
  // One row per recurring description+category — the latest entry stands in
  // for "what this currently costs" rather than double-counting every past
  // instance logged for it.
  const rows = await db.expense.findMany({
    where: { recurring: true },
    orderBy: { date: "desc" },
  });

  const seen = new Map<string, ProjectedRecurringItem>();
  for (const r of rows) {
    const key = `${r.description.trim().toLowerCase()}|${r.category}`;
    if (seen.has(key)) continue;
    const divisor = FREQUENCY_DIVISOR[r.frequency ?? "Monthly"] ?? 1;
    seen.set(key, {
      id: r.id,
      description: r.description,
      category: r.category,
      frequency: r.frequency ?? "Monthly",
      monthlyAmount: r.amount / divisor,
    });
  }

  const items = [...seen.values()].sort((a, b) => b.monthlyAmount - a.monthlyAmount);
  return { items, monthlyTotal: items.reduce((s, i) => s + i.monthlyAmount, 0) };
}

export async function createExpense(
  input: CreateExpenseInput,
  approvedById: string
): Promise<{ id: string }> {
  return db.expense.create({
    data: {
      category: input.category,
      description: input.description,
      amount: input.amount,
      date: new Date(`${input.date}T00:00:00.000Z`),
      recurring: input.recurring,
      frequency: input.recurring ? input.frequency || null : null,
      approvedBy: approvedById,
    },
    select: { id: true },
  });
}

export async function deleteExpense(id: string): Promise<void> {
  try {
    await db.expense.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw new ExpenseError("Expense not found");
    }
    throw err;
  }
}
