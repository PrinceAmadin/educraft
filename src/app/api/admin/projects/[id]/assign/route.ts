import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { TransitionError, assignWorker } from "@/lib/services/projects";
import { assignWorkerBodySchema } from "@/lib/validations/projects";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
    return NextResponse.json({ status: project.status });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/admin/projects/[id]/assign", error);
  }
}
