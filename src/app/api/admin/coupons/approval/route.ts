import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { rateLimited } from "@/lib/rate-limit";
import { CouponError, setCooApproval } from "@/lib/services/finance/coupons";
import { couponApprovalSchema } from "@/lib/validations/coupons";

/**
 * The CEO's switch: while it is on, a coupon the COO creates gives nothing away
 * until the CEO approves it. Turning it off is how he says he trusts the COO to
 * grant discounts on his own. Founder only, and written to the audit log.
 */
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const limited = await rateLimited(guard.session.userId, "coupon-approval-switch", 10);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = couponApprovalSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    await setCooApproval(parsed.data.cooNeedsApproval, {
      userId: guard.session.userId,
      role: guard.session.role,
    });
    return NextResponse.json({ cooNeedsApproval: parsed.data.cooNeedsApproval });
  } catch (error) {
    if (error instanceof CouponError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("admin/coupons", error);
  }
}
