import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { PartnershipError, renewPartnership } from "@/lib/services/ambassador-platform/partnerships";
import { renewPartnershipSchema } from "@/lib/validations/ambassador-platform";

/** "Renew": log the next term's payment from the Growth Fund and move the renewal date on. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = renewPartnershipSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());
  try {
    return NextResponse.json(await renewPartnership(params.id, parsed.data, { userId: guard.session.userId, role: guard.session.role }));
  } catch (error) {
    if (error instanceof PartnershipError) return NextResponse.json({ error: error.message }, { status: error.message.includes("not found") ? 404 : 409 });
    return serverError("POST /api/admin/ambassadors/partnerships/[id]/renew", error);
  }
}
