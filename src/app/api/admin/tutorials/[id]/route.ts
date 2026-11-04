import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { TrainingError, deleteEpisode, moveEpisode, updateEpisode } from "@/lib/services/training";
import { updateEpisodeSchema } from "@/lib/validations/training";

/** Edit, reorder or delete one episode. Founder only (see the create route). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = updateEpisodeSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const { move, ...fields } = parsed.data;
    if (move) await moveEpisode(params.id, move);
    if (Object.values(fields).some((v) => v !== undefined)) await updateEpisode(params.id, fields);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TrainingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return serverError("tutorials-update", error);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  try {
    await deleteEpisode(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TrainingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return serverError("tutorials-delete", error);
  }
}
