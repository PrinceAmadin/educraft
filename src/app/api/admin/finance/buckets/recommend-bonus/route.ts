import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { recommendBonusSchema } from "@/lib/validations/finance-buckets";
import { BucketError } from "@/lib/services/finance/buckets";
import { currentMonthKey, recommendSemesterBonus } from "@/lib/services/finance/surplus";

/** The CFO recommends this semester's bonus: two PENDING draws for the founder to approve on Founder draws. */
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
  const parsed = recommendBonusSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const result = await recommendSemesterBonus({
      month: parsed.data.month || currentMonthKey(),
      note: parsed.data.note || undefined,
      recordedById: guard.session.userId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof BucketError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/admin/finance/buckets/recommend-bonus", error);
  }
}
