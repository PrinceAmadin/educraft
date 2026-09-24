import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { listReferrals, logReferral, ReferralError } from "@/lib/services/ambassador-platform/referrals";
import { logReferralSchema } from "@/lib/validations/ambassador-platform";

/** Every referral of this ambassador, newest first. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ referrals: await listReferrals(params.id) });
  } catch (error) {
    return serverError("GET /api/admin/ambassadors/[id]/referrals", error);
  }
}

/** The HOG logs a referral on the ambassador's behalf (PENDING until an order's downpayment confirms it). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = logReferralSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const row = await logReferral(params.id, parsed.data, guard.session.userId);
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (error instanceof ReferralError) {
      return NextResponse.json({ error: error.message }, { status: error.message.includes("not found") ? 404 : 409 });
    }
    return serverError("POST /api/admin/ambassadors/[id]/referrals", error);
  }
}
