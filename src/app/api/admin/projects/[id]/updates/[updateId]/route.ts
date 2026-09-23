import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { hideUpdateSchema } from "@/lib/validations/client-portal";

export const dynamic = "force-dynamic";

/** PATCH { hidden }: hide a feed line from the client (kept for the record) or show it again. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; updateId: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = hideUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Say whether to hide it");

  try {
    const project = await db.project.findFirst({
      where: { OR: [{ id: params.id }, { projectId: params.id }] },
      select: { id: true },
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const changed = await db.projectUpdate.updateMany({
      where: { id: params.updateId, projectId: project.id },
      data: { hiddenAt: parsed.data.hidden ? new Date() : null },
    });
    if (changed.count === 0) return NextResponse.json({ error: "Update not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("PATCH /api/admin/projects/[id]/updates/[updateId]", error);
  }
}
