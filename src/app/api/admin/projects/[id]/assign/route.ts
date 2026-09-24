import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { TransitionError, assignWorker } from "@/lib/services/projects";
import { assignWorkerBodySchema } from "@/lib/validations/projects";

async function handle(req: NextRequest, params: { id: string }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = assignWorkerBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const project = await assignWorker(params.id, {
      workerId: parsed.data.workerId,
      changedById: guard.session.userId,
    });
    return NextResponse.json({ status: project.status, worker: project.worker ? { id: project.worker.id, fullName: project.worker.fullName } : null });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError(`${req.method} /api/admin/projects/[id]/assign`, error);
  }
}

/** POST { workerId } — assign (or reassign) a worker. Always the COO's call; nothing assigns automatically. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(req, params);
}

/** PATCH { workerId } — the same act, for callers that treat assignment as an edit. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(req, params);
}
