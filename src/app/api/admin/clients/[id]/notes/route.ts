import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { updateClientNotes } from "@/lib/services/clients";
import { TransitionError } from "@/lib/services/projects";
import { clientNotesBodySchema } from "@/lib/validations/clients";

/** Internal notes on a client. Founder only: the Clients tab is read-only for every other role. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = clientNotesBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const result = await updateClientNotes(params.id, parsed.data.notes);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverError("PATCH /api/admin/clients/[id]/notes", error);
  }
}
