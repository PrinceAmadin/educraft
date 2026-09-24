import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { distributeSchema } from "@/lib/validations/finance-draws";
import { distributeMonthlyDraws, DrawError } from "@/lib/services/finance/founder-draws";

/** Mark the month's founder draws distributed. Founder and CFO; a partial amount is the founder's call. */
export async function POST(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = distributeSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());
  try {
    const result = await distributeMonthlyDraws({
      month: parsed.data.month,
      recipients: parsed.data.recipients,
      amountEach: parsed.data.amountEach,
      note: parsed.data.note || undefined,
      approvedById: guard.session.userId,
      isFounder: guard.session.role === "SUPER_ADMIN",
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof DrawError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/admin/finance/founder-draws/distribute", error);
  }
}
