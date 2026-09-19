import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireWorker, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { RerunRequestError, requestRerun } from "@/lib/services/research-runs";
import { rerunRequestBodySchema } from "@/lib/validations/research";

/** A worker asks a manager to approve another re-run, with their reason. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = rerunRequestBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Please explain why you need another run (at least 15 characters).");

  try {
    // Scoped to the caller's own assignment.
    const project = await db.project.findFirst({
      where: { workerId: guard.workerId, OR: [{ id: params.id }, { projectId: params.id }] },
      select: { id: true, projectId: true },
    });
    if (!project) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });

    await requestRerun({
      workerId: guard.workerId,
      userId: guard.userId,
      projectDbId: project.id,
      projectCode: project.projectId,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof RerunRequestError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/worker/projects/[id]/research/rerun-request", error);
  }
}
