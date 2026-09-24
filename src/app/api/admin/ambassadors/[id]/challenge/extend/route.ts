import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { CommissionsError, grantChallengeExtension } from "@/lib/services/ambassador-platform/commissions";
import { extendChallengeSchema } from "@/lib/validations/ambassador-platform";

/** The HOG grants one one-week extension on the quarterly challenge. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = extendChallengeSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    return NextResponse.json(await grantChallengeExtension(params.id, parsed.data.quarter, guard.session.userId));
  } catch (error) {
    if (error instanceof CommissionsError) return NextResponse.json({ error: error.message }, { status: error.message.includes("not found") ? 404 : 409 });
    return serverError("POST /api/admin/ambassadors/[id]/challenge/extend", error);
  }
}
