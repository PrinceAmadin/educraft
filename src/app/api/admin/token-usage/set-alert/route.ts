import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { setMonthlyThreshold } from "@/lib/services/ai-usage";
import { setAlertSchema } from "@/lib/validations/token-usage";

export const dynamic = "force-dynamic";

/**
 * D10: sets the monthly Claude-spend threshold that fires an email to the founder
 * once per calendar month when month-to-date spend crosses it. Founder-only (any
 * other role would be able to switch off the founder's own alerting). Clears the
 * "already sent this month" key so the new value can fire once this month too.
 */
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const parsed = setAlertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("thresholdNaira must be a positive whole number, or null to clear");
  try {
    const stored = await setMonthlyThreshold(parsed.data.thresholdNaira);
    return NextResponse.json({ ok: true, thresholdNaira: stored }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("POST /api/admin/token-usage/set-alert", error);
  }
}
