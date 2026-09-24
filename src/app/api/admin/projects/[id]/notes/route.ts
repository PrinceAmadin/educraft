import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { TransitionError, updateInternalNotes } from "@/lib/services/projects";
import { internalNotesBodySchema } from "@/lib/validations/projects";
import { addProjectNote, findProject, getProjectTimeline } from "@/lib/services/operations/project-ops";
import { opsError, opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { projectNoteBodySchema } from "@/lib/validations/operations";

export const dynamic = "force-dynamic";

/** GET — the project's timeline: the COO's notes and every status change, newest first. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const project = await findProject(params.id);
    return NextResponse.json({ entries: await getProjectTimeline(project.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return opsError("GET /api/admin/projects/[id]/notes", error);
  }
}

/** POST { content } — a dated note from the signed-in executive. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard();
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, projectNoteBodySchema);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json(await addProjectNote(params.id, guard.actor, body.data.content), { status: 201 });
  } catch (error) {
    return opsError("POST /api/admin/projects/[id]/notes", error);
  }
}

/** PATCH { internalNotes } — the free-text working notes (the Notes tab). */
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
