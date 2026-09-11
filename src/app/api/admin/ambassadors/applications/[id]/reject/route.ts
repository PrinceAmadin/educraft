import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { ApplicationError, rejectApplication } from "@/lib/services/applications";
import { rejectApplicationSchema } from "@/lib/validations/application";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }

  const parsed = rejectApplicationSchema.safeParse(body ?? {});
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    await rejectApplication(params.id, guard.session.userId, parsed.data.note || undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ApplicationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/admin/ambassadors/applications/[id]/reject", error);
  }
}
