import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { ProBonoError, resetInviteDevice, revokeInvite } from "@/lib/services/probono";

const bodySchema = z.object({ action: z.enum(["revoke", "reset-device"]) });

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
  if (!parsed.success) return badRequest("Unknown action");

  try {
    if (parsed.data.action === "revoke") await revokeInvite(params.id);
    else await resetInviteDevice(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ProBonoError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("PATCH /api/admin/probono/[id]", error);
  }
}
