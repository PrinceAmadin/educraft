import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { inviteExecutiveSchema } from "@/lib/validations/team";
import { inviteExecutive, listExecutives, TeamError } from "@/lib/services/team";

/** The executive team. Founder only: the role is read from the server session, never the request. */
export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  try {
    return NextResponse.json({ executives: await listExecutives() });
  } catch (error) {
    return serverError("GET /api/admin/team", error);
  }
}

/** Invite an executive: creates the login with a one-time password shown on screen (no email in Phase 1). */
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = inviteExecutiveSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const created = await inviteExecutive(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof TeamError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("POST /api/admin/team", error);
  }
}
