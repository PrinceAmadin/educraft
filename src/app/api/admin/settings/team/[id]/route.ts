import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { setTeamMemberActive, TeamError } from "@/lib/services/team";

const bodySchema = z.object({ isActive: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    await setTeamMemberActive(params.id, parsed.data.isActive, guard.session.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TeamError) {
      const status = error.message === "Team member not found" ? 404 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }
    return serverError("PATCH /api/admin/settings/team/[id]", error);
  }
}
