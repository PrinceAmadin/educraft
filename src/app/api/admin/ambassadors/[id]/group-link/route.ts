import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { siteUrl } from "@/lib/site-url";
import {
  AmbassadorGroupError,
  ensureGroupInvite,
  getGroupInvite,
  regenerateGroupInvite,
  resetGroupDevice,
  revokeGroupInvite,
} from "@/lib/services/ambassador-group";

const bodySchema = z.object({ action: z.enum(["ensure", "regenerate", "reset-device", "revoke"]) });

function withUrl(view: Awaited<ReturnType<typeof getGroupInvite>>) {
  if (!view) return { invite: null };
  return { invite: { ...view, url: `${siteUrl()}/ambassador-group/${view.token}` } };
}

/** GET the ambassador's current group-link state (founder + HOG). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["HOG"]);
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(withUrl(await getGroupInvite(params.id)));
  } catch (error) {
    return serverError("GET /api/admin/ambassadors/[id]/group-link", error);
  }
}

/** Mint / regenerate / reset-device / revoke the ambassador's group link (founder + HOG). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["HOG"]);
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
    if (parsed.data.action === "ensure") await ensureGroupInvite(params.id, guard.session.userId);
    else if (parsed.data.action === "regenerate") await regenerateGroupInvite(params.id, guard.session.userId);
    else if (parsed.data.action === "reset-device") await resetGroupDevice(params.id);
    else await revokeGroupInvite(params.id);
    return NextResponse.json(withUrl(await getGroupInvite(params.id)));
  } catch (error) {
    if (error instanceof AmbassadorGroupError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/admin/ambassadors/[id]/group-link", error);
  }
}
