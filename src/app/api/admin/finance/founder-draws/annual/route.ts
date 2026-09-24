import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { annualActionSchema } from "@/lib/validations/finance-draws";
import { actOnAnnualProfitShare, DrawError } from "@/lib/services/finance/founder-draws";

/** December: the CFO recommends the year's profit share; the founder approves or declines it. */
export async function POST(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = annualActionSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());
  try {
    const result = await actOnAnnualProfitShare({ year: parsed.data.year, action: parsed.data.action, note: parsed.data.note || undefined, userId: guard.session.userId, isFounder: guard.session.role === "SUPER_ADMIN" });
    return NextResponse.json(result, { status: parsed.data.action === "recommend" ? 201 : 200 });
  } catch (error) {
    if (error instanceof DrawError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/admin/finance/founder-draws/annual", error);
  }
}
