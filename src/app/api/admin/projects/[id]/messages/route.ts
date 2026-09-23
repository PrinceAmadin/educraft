import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { MessageError, getThread, postMessage } from "@/lib/services/client-messages";
import { messageBodySchema } from "@/lib/validations/client-portal";

export const dynamic = "force-dynamic";

async function findProject(idOrCode: string) {
  return db.project.findFirst({ where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] }, select: { id: true } });
}

/** GET: the client thread on this project (opening it marks the client's messages read). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const project = await findProject(params.id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  try {
    return NextResponse.json({ messages: await getThread(project.id, "ADMIN") }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("GET /api/admin/projects/[id]/messages", error);
  }
}

/** POST { body }: reply to the client as EduCraft. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = messageBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Write a message first.");

  const project = await findProject(params.id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    const message = await postMessage({
      projectDbId: project.id,
      authorUserId: guard.session.userId,
      side: "ADMIN",
      body: parsed.data.body,
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    if (error instanceof MessageError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("POST /api/admin/projects/[id]/messages", error);
  }
}
