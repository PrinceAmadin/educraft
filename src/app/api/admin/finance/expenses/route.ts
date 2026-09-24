import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, requireAdminRoles, serverError } from "@/lib/api";
import { createExpenseSchema, expenseListParamsSchema } from "@/lib/validations/expenses";
import { createExpense, getMonthlyExpenseSummary, listExpenses } from "@/lib/services/expenses";
import { currentMonthKey } from "@/lib/services/finance/surplus";

/** Expenses for a month (or date range) with the per-bucket summary. Founder and CFO. */
export async function GET(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  const parsed = expenseListParamsSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return badRequest("Check the filters", parsed.error.flatten());
  const filters = parsed.data;
  const month = filters.month ?? (filters.from || filters.to ? undefined : currentMonthKey());
  try {
    const [list, summary] = await Promise.all([listExpenses({ ...filters, month }), month ? getMonthlyExpenseSummary(month) : null]);
    return NextResponse.json({ ...list, summary });
  } catch (error) {
    return serverError("GET /api/admin/finance/expenses", error);
  }
}

/** Log an expense against a bucket. Over ₦50,000 it waits for the founder unless the founder logged it. */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = createExpenseSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const expense = await createExpense(parsed.data, guard.session.userId, guard.session.role);
    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    return serverError("POST /api/admin/finance/expenses", error);
  }
}
