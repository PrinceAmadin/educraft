import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { manualRevenueBodySchema } from "@/lib/validations/finance";
import { recordManualPayment, RevenueError } from "@/lib/services/finance/revenue";

/** Finance recording a bank transfer or cash payment nobody marked first: marked and confirmed in one go. */
export async function POST(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = manualRevenueBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const result = await recordManualPayment({
      projectCode: parsed.data.projectCode,
      leg: parsed.data.leg,
      paymentMethod: parsed.data.paymentMethod,
      reference: parsed.data.reference || undefined,
      paymentDate: parsed.data.date || undefined,
      notes: parsed.data.notes || undefined,
      changedById: guard.session.userId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof RevenueError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/admin/finance/revenue/manual", error);
  }
}
