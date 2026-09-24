import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { markAllPaidSchema } from "@/lib/validations/finance-payouts";
import { markPayoutsPaid, PayoutError } from "@/lib/services/finance/payouts-engine";

/** Mark every unpaid record of a type for the month paid — or one recipient's, when `recipientId` is given. Founder and CFO. */
export async function POST(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = markAllPaidSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());
  const { month, recipientType, recipientId } = parsed.data;
  try {
    const result = await markPayoutsPaid(
      recipientId ? { kind: "recipient", month, recipientType, recipientId } : { kind: "all", month, recipientType },
      { paidById: guard.session.userId, reference: parsed.data.reference || undefined, date: parsed.data.date || undefined }
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PayoutError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/admin/finance/payouts/mark-all-paid", error);
  }
}
