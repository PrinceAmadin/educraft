import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { payoutsQuerySchema } from "@/lib/validations/finance-payouts";
import { calculateMonthlyPayouts, getPayoutMonth } from "@/lib/services/finance/payouts-engine";
import { currentMonthKey } from "@/lib/services/finance/surplus";

/** Everything owed for a month (workers, ambassadors, executives, bonuses), reconciled first. Founder and CFO. */
export async function GET(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  const parsed = payoutsQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return badRequest("Use YYYY-MM");
  const month = parsed.data.month || currentMonthKey();
  try {
    await calculateMonthlyPayouts(month);
    return NextResponse.json(await getPayoutMonth(month));
  } catch (error) {
    return serverError("GET /api/admin/finance/payouts", error);
  }
}
