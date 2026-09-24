import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { CommissionsError, processQuarterBonuses } from "@/lib/services/ambassador-platform/commissions";
import { processQuarterSchema } from "@/lib/validations/ambassador-platform";

/** "Process Qn bonuses": every locked-in bonus of an ended quarter becomes a PENDING payout record. Idempotent. */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = processQuarterSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    return NextResponse.json(await processQuarterBonuses(parsed.data.quarter, guard.session.userId));
  } catch (error) {
    if (error instanceof CommissionsError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/admin/ambassadors/commissions/quarterly/process", error);
  }
}
