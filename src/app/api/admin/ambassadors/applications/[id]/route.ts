import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { ApplicationError, editApplication } from "@/lib/services/applications";
import { editApplicationSchema } from "@/lib/validations/application";

/** Admin correcting a pending application (details and slot) before deciding it. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = editApplicationSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    await editApplication(params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ApplicationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("PATCH /api/admin/ambassadors/applications/[id]", error);
  }
}
