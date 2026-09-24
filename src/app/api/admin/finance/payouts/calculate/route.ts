import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { calculatePayoutsSchema } from "@/lib/validations/finance-payouts";
import { calculateMonthlyPayouts } from "@/lib/services/finance/payouts-engine";
import { currentMonthKey } from "@/lib/services/finance/surplus";

/** Re-reconcile every project completed in the month. Idempotent. Founder and CFO. */
export async function POST(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  let body: unknown = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = calculatePayoutsSchema.safeParse(body);
  if (!parsed.success) return badRequest("Use YYYY-MM", parsed.error.flatten());
  try {
    return NextResponse.json(await calculateMonthlyPayouts(parsed.data.month || currentMonthKey()));
  } catch (error) {
    return serverError("POST /api/admin/finance/payouts/calculate", error);
  }
}
