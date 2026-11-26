import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { previewCoupon, prospectiveLegs } from "@/lib/services/finance/coupons";
import { previewCouponSchema } from "@/lib/validations/coupons";

/**
 * What a code would do to one order, with EduCraft's own maths shown: what the
 * client would pay, what is still owed to the people on the job, what would be
 * left, and whether it is past what the order can fund.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdminRoles(["COO"]);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = previewCouponSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const legs = await prospectiveLegs({
      listPrice: parsed.data.listPrice,
      referralCode: parsed.data.referralCode ?? null,
    });
    return NextResponse.json(
      await previewCoupon({
        code: parsed.data.code,
        serviceCode: parsed.data.serviceCode,
        legs,
        clientId: parsed.data.clientId ?? null,
      })
    );
  } catch (error) {
    return serverError("admin/coupons", error);
  }
}
