import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { cooSubmitSchema } from "@/lib/validations/finance-payouts";
import { submitPayoutList } from "@/lib/services/finance/payouts-engine";

/** The COO submits the month's worker payout list to the CFO. COO, CFO and founder. */
export async function POST(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO", "COO"]);
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = cooSubmitSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());
  try {
    const result = await submitPayoutList({ month: parsed.data.month, submittedById: guard.session.userId, note: parsed.data.note || undefined });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return serverError("POST /api/admin/finance/payouts/coo-submit", error);
  }
}
