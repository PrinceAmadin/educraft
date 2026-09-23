import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireClient, serverError } from "@/lib/api";
import { findClientProject } from "@/lib/services/client-portal";
import { MessageError, getThread, postMessage } from "@/lib/services/client-messages";
import { messageBodySchema } from "@/lib/validations/client-portal";

export const dynamic = "force-dynamic";

/** GET: the client's thread with EduCraft on this project (opening it marks EduCraft's messages read). */
export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  const guard = await requireClient();
  if (!guard.ok) return guard.response;
  const project = await findClientProject(guard.scope, params.code);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  try {
    const messages = await getThread(project.id, "CLIENT");
    return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("GET /api/client/projects/[code]/messages", error);
  }
}

/** POST { body }: a message to EduCraft. Never reaches the worker. */
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const guard = await requireClient();
  if (!guard.ok) return guard.response;

  const parsed = messageBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Write a message first.");

  const project = await findClientProject(guard.scope, params.code);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    const message = await postMessage({
      projectDbId: project.id,
      authorUserId: guard.scope.userId,
      side: "CLIENT",
      body: parsed.data.body,
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    if (error instanceof MessageError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("POST /api/client/projects/[code]/messages", error);
  }
}
