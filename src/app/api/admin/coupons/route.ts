import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { rateLimited } from "@/lib/rate-limit";
import { CouponError, createCoupon, listCoupons } from "@/lib/services/finance/coupons";
import { createCouponSchema } from "@/lib/validations/coupons";

/** Every coupon, with what each has cost and how many clients it brought in. */
export async function GET() {
  const guard = await requireAdminRoles(["COO"]);
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(await listCoupons());
  } catch (error) {
    return serverError("admin/coupons", error);
  }
}

/**
 * Creates a coupon. The CEO's go live at once; the COO's wait for the CEO while
 * the approval switch is on. A discount deeper than any order can fund needs
 * the CEO's own override and his reason, which the service enforces.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdminRoles(["COO"]);
  if (!guard.ok) return guard.response;
  const limited = await rateLimited(guard.session.userId, "coupon-create", 10);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = createCouponSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const created = await createCoupon(parsed.data, { userId: guard.session.userId, role: guard.session.role });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof CouponError) {
      return NextResponse.json({ error: error.message, problems: error.problems }, { status: error.status });
    }
    return serverError("admin/coupons", error);
  }
}
