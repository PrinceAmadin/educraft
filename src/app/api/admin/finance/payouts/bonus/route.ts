import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { bonusSchema } from "@/lib/validations/finance-payouts";
import { addPerformanceBonus } from "@/lib/services/finance/payouts-engine";

/** The CFO enters a performance bonus by hand after reviewing the month's metrics. Founder and CFO. */
export async function POST(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = bonusSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());
  try {
    const row = await addPerformanceBonus({ ...parsed.data, createdById: guard.session.userId });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return serverError("POST /api/admin/finance/payouts/bonus", error);
  }
}
