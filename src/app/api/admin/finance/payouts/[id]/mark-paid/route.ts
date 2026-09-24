import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { markPaidBodySchema } from "@/lib/validations/finance-payouts";
import { markBonusPaid, markPayoutsPaid, PayoutError } from "@/lib/services/finance/payouts-engine";

/** Mark one payout record (or one performance bonus) paid. Founder and CFO only. */
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
    const isBonus = (await db.performanceBonus.count({ where: { id: params.id } })) > 0;
    const result = isBonus ? await markBonusPaid(params.id, input) : await markPayoutsPaid({ kind: "record", id: params.id }, input);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PayoutError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("PATCH /api/admin/finance/payouts/[id]/mark-paid", error);
  }
}
