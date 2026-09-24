import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { DirectoryError, suspendAmbassador } from "@/lib/services/ambassador-platform/directory";
import { suspendSchema } from "@/lib/validations/ambassador-platform";

/** Suspend an ambassador: no new referrals count, their login is switched off, the reason is kept in their notes. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = suspendSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    await suspendAmbassador(params.id, guard.session.userId, parsed.data.reason || undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DirectoryError) {
      return NextResponse.json({ error: error.message }, { status: error.message.includes("not found") ? 404 : 409 });
    }
    return serverError("POST /api/admin/ambassadors/[id]/suspend", error);
  }
}
