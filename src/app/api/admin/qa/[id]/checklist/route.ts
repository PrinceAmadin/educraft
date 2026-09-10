import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { saveChecklist } from "@/lib/services/qa";
import { TransitionError } from "@/lib/services/projects";
import { saveChecklistBodySchema } from "@/lib/validations/qa";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = saveChecklistBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    await saveChecklist(params.id, parsed.data.checklist);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverError("PATCH /api/admin/qa/[id]/checklist", error);
  }
}
