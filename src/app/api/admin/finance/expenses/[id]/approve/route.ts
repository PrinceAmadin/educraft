import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { approveExpenseSchema } from "@/lib/validations/expenses";
import { decideExpense, ExpenseError } from "@/lib/services/expenses";

/** The founder approves or declines an expense over the threshold. Founder only. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = approveExpenseSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());
  try {
    const row = await decideExpense(params.id, { decision: parsed.data.decision, approvedById: guard.session.userId, note: parsed.data.note || undefined });
    return NextResponse.json(row);
  } catch (error) {
    if (error instanceof ExpenseError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("PATCH /api/admin/finance/expenses/[id]/approve", error);
  }
}
