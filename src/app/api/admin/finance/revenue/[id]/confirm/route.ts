import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { confirmRevenueBodySchema } from "@/lib/validations/finance";
import { confirmRevenuePayment, RevenueError } from "@/lib/services/finance/revenue";

/** Confirm a bank transfer the team marked as paid. Founder and CFO only — verifying is a finance act. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;

  let body: unknown = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = confirmRevenueBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const result = await confirmRevenuePayment(params.id, {
      changedById: guard.session.userId,
      paymentMethod: parsed.data.paymentMethod || undefined,
      reference: parsed.data.reference || undefined,
      paymentDate: parsed.data.date || undefined,
      notes: parsed.data.notes || undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RevenueError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/admin/finance/revenue/[id]/confirm", error);
  }
}
