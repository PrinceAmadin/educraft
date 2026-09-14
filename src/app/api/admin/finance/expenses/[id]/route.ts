import { NextResponse } from "next/server";
import { requireSuperAdmin, serverError } from "@/lib/api";
import { deleteExpense, ExpenseError, ExpenseLockedError } from "@/lib/services/expenses";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  try {
    await deleteExpense(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ExpenseLockedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ExpenseError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverError("DELETE /api/admin/finance/expenses/[id]", error);
  }
}
