import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { TransitionError, updateInternalNotes } from "@/lib/services/projects";
import { internalNotesBodySchema } from "@/lib/validations/projects";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = internalNotesBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const result = await updateInternalNotes(params.id, parsed.data.internalNotes);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverError("PATCH /api/admin/projects/[id]/notes", error);
  }
}
