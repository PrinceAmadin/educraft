import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { rateLimited } from "@/lib/rate-limit";
import { CouponError, decideCoupon, revokeCoupon } from "@/lib/services/finance/coupons";
import { decideCouponSchema } from "@/lib/validations/coupons";

/**
 * Approve or refuse a coupon the COO created, or withdraw a live one. Approving
 * and refusing are the CEO's alone (the service checks); either role may
 * withdraw, because stopping a discount is never the risky direction.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["COO"]);
  if (!guard.ok) return guard.response;
  const limited = await rateLimited(guard.session.userId, "coupon-decide", 20);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = decideCouponSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  const actor = { userId: guard.session.userId, role: guard.session.role };
  try {
    const result =
      parsed.data.action === "revoke"
        ? await revokeCoupon(params.id, actor, parsed.data.note)
        : await decideCoupon(params.id, parsed.data.action, actor, parsed.data.note);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CouponError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("admin/coupons", error);
  }
}
