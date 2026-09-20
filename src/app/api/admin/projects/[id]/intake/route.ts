import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { FIELD_LABELS } from "@/lib/intake-fields";
import { IntakeEditError, updateProjectIntake } from "@/lib/services/intake-edit";
import { intakeEditSchema } from "@/lib/validations/intake-edit";

/**
 * Admin (super admin or ops manager) corrects a project's intake details.
 * There is no client-facing equivalent: the client cannot change their brief
 * once submitted.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = intakeEditSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = FIELD_LABELS[String(issue?.path.at(-1) ?? "")];
    return badRequest(`${field ? `${field}: ` : ""}${issue?.message ?? "Please check the form"}`);
  }

  try {
    return NextResponse.json(await updateProjectIntake(params.id, parsed.data, guard.session.userId));
  } catch (error) {
    if (error instanceof IntakeEditError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("PATCH /api/admin/projects/[id]/intake", error);
  }
}
