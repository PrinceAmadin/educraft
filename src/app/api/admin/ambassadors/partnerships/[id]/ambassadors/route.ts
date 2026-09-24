import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { linkAmbassador, PartnershipError } from "@/lib/services/ambassador-platform/partnerships";
import { linkPartnershipAmbassadorSchema } from "@/lib/validations/ambassador-platform";

/** Record that an ambassador came in through this partnership, so its projects count here. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = linkPartnershipAmbassadorSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());
  try {
    await linkAmbassador(params.id, parsed.data.ambassadorId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PartnershipError) return NextResponse.json({ error: error.message }, { status: 404 });
    return serverError("POST /api/admin/ambassadors/partnerships/[id]/ambassadors", error);
  }
}
