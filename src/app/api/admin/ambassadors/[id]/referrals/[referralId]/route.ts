import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { ReferralError, updateReferral } from "@/lib/services/ambassador-platform/referrals";
import { updateReferralSchema } from "@/lib/validations/ambassador-platform";

/** Edit a logged referral, or mark it lost / cancelled. A row tied to an order follows the order. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; referralId: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = updateReferralSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    await updateReferral(params.id, params.referralId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ReferralError) {
      return NextResponse.json({ error: error.message }, { status: error.message.includes("not found") ? 404 : 409 });
    }
    return serverError("PATCH /api/admin/ambassadors/[id]/referrals/[referralId]", error);
  }
}
