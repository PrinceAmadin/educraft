import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { payoutsQuerySchema } from "@/lib/validations/finance-payouts";
import { calculateMonthlyPayouts, getCooPayoutView } from "@/lib/services/finance/payouts-engine";
import { currentMonthKey } from "@/lib/services/finance/surplus";

/** The COO's limited view: worker payouts only, and their submission. COO, CFO and founder. */
export async function GET(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO", "COO"]);
  if (!guard.ok) return guard.response;
  const parsed = payoutsQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return badRequest("Use YYYY-MM");
  const month = parsed.data.month || currentMonthKey();
  try {
    await calculateMonthlyPayouts(month);
    return NextResponse.json(await getCooPayoutView(month));
  } catch (error) {
    return serverError("GET /api/admin/finance/payouts/coo-view", error);
  }
}
