import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { updateExecutiveSchema } from "@/lib/validations/team";
import { removeExecutive, TeamError, updateExecutive } from "@/lib/services/team";

/** Change an executive's role, name, title, email, phone, or switch their login on/off. Founder only. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = updateExecutiveSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    return NextResponse.json(await updateExecutive(params.id, parsed.data, guard.session.userId));
  } catch (error) {
    if (error instanceof TeamError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("PATCH /api/admin/team/[id]", error);
  }
}

/**
 * Remove from the executive team: the login stays, demoted to WORKER, and the
 * executive record goes; `?deactivate=1` switches the login off too. Founder only.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const deactivate = req.nextUrl.searchParams.get("deactivate") === "1";

  try {
    return NextResponse.json(await removeExecutive(params.id, guard.session.userId, { deactivate }));
  } catch (error) {
    if (error instanceof TeamError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("DELETE /api/admin/team/[id]", error);
  }
}
