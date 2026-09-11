import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { createExpenseSchema } from "@/lib/validations/expenses";
import { createExpense } from "@/lib/services/expenses";

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
    const expense = await createExpense(parsed.data, guard.session.userId);
    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    return serverError("POST /api/admin/finance/expenses", error);
  }
}
