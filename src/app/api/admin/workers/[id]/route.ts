import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { getWorkerDetail, updateWorker } from "@/lib/services/workers";
import { TransitionError } from "@/lib/services/projects";
import { updateWorkerSchema } from "@/lib/validations/workers";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const data = await getWorkerDetail(params.id);
  if (!data) return NextResponse.json({ error: "Worker not found" }, { status: 404 });
  return NextResponse.json(data);
}

/**
 * General admin edit — handles both a full profile correction and a
 * status-only change (WorkerStatusControl sends just `{ status }`, which
 * validates fine against this same partial schema).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = updateWorkerSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const result = await updateWorker(params.id, parsed.data, guard.session.userId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverError("PATCH /api/admin/workers/[id]", error);
  }
}
