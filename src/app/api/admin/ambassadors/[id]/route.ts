import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, requireSuperAdmin, serverError } from "@/lib/api";
import { AmbassadorEditError, deleteAmbassador, updateAmbassador } from "@/lib/services/ambassadors";
import { TransitionError } from "@/lib/services/projects";
import { updateAmbassadorSchema } from "@/lib/validations/ambassadors";

/** Status/tier (AmbassadorControls) or a profile correction (EditAmbassadorDialog). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = updateAmbassadorSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const result = await updateAmbassador(params.id, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AmbassadorEditError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverError("PATCH /api/admin/ambassadors/[id]", error);
  }
}

/** Delete is Super Admin only — matches the "no delete" restriction on Ops Manager. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  try {
    await deleteAmbassador(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AmbassadorEditError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverError("DELETE /api/admin/ambassadors/[id]", error);
  }
}
