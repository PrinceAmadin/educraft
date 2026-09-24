import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { manualAdjustmentSchema } from "@/lib/validations/finance-buckets";
import { BucketError, manualAdjustment } from "@/lib/services/finance/buckets";

/** The CFO's manual correction to a bucket (rare): a signed amount with a reason, logged as an ADJUSTMENT. */
export async function POST(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = manualAdjustmentSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const result = await manualAdjustment({ ...parsed.data, recordedById: guard.session.userId });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof BucketError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/admin/finance/buckets/manual-adjustment", error);
  }
}
