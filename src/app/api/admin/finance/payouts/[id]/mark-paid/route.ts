import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { markPaidBodySchema } from "@/lib/validations/finance-payouts";
import { markPayoutsPaid, PayoutError } from "@/lib/services/finance/payouts-engine";

/** Mark one payout record paid (commissions and performance bonuses are one ledger since Phase 3). Founder and CFO only. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  let body: unknown = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = markPaidBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());
  const input = { paidById: guard.session.userId, reference: parsed.data.reference || undefined, date: parsed.data.date || undefined };
  try {
    const result = await markPayoutsPaid({ kind: "record", id: params.id }, input);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PayoutError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("PATCH /api/admin/finance/payouts/[id]/mark-paid", error);
  }
}
