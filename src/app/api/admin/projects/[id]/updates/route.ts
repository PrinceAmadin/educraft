import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { recordUpdate } from "@/lib/services/client-updates";
import { notifyClient } from "@/lib/services/client-notify";
import { manualUpdateSchema } from "@/lib/validations/client-portal";

export const dynamic = "force-dynamic";

/**
 * POST { title, body? }: an update in the client's own words on their activity
 * feed ("Chapter 2 is taking shape"). The client gets an in-app notification;
 * no email, so these can be posted freely.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = manualUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid update");

  const project = await db.project.findFirst({
    where: { OR: [{ id: params.id }, { projectId: params.id }] },
    select: { id: true, projectId: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    await recordUpdate(db, {
      projectId: project.id,
      kind: "MANUAL",
      title: parsed.data.title,
      body: parsed.data.body || null,
      createdById: guard.session.userId,
    });
    await notifyClient(project.id, { title: parsed.data.title, message: parsed.data.body || `New update on ${project.projectId}.` });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return serverError("POST /api/admin/projects/[id]/updates", error);
  }
}
