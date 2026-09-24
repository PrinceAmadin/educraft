import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { rejectRevenueBodySchema } from "@/lib/validations/finance";
import { rejectRevenuePayment, RevenueError } from "@/lib/services/finance/revenue";

/** Refuse a marked payment: the leg returns to Unpaid; nothing was allocated. Founder and CFO. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = rejectRevenueBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Say why the payment is refused", parsed.error.flatten());

  try {
    const result = await rejectRevenuePayment(params.id, { changedById: guard.session.userId, note: parsed.data.note });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RevenueError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/admin/finance/revenue/[id]/reject", error);
  }
}
