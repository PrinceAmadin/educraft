import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { appointFlagger, CleanupError, listFlaggers, removeFlagger } from "@/lib/services/project-cleanup";

export const dynamic = "force-dynamic";

const appointSchema = z.object({ identifier: z.string().trim().min(1).max(200) });
const removeSchema = z.object({ userId: z.string().trim().min(1).max(60) });

async function readBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

/** Appoint someone (login email, worker ID or ambassador ID) to flag test projects. Founder only. */
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const parsed = appointSchema.safeParse(await readBody(req));
  if (!parsed.success) return badRequest("Type a login email, worker ID or ambassador ID.");
  try {
    const { name } = await appointFlagger(parsed.data.identifier, guard.session.userId);
    return NextResponse.json({ ok: true, name, flaggers: await listFlaggers() });
  } catch (error) {
    if (error instanceof CleanupError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("POST /api/admin/cleanup/flaggers", error);
  }
}

/** Take someone's appointment away; it stops working on their next request. */
export async function DELETE(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const parsed = removeSchema.safeParse(await readBody(req));
  if (!parsed.success) return badRequest("Expected { userId }");
  try {
    await removeFlagger(parsed.data.userId);
    return NextResponse.json({ ok: true, flaggers: await listFlaggers() });
  } catch (error) {
    if (error instanceof CleanupError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("DELETE /api/admin/cleanup/flaggers", error);
  }
}
