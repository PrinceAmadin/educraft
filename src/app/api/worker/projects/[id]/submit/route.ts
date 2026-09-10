import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireWorker, serverError } from "@/lib/api";
import { submitWork } from "@/lib/services/worker-portal";
import { TransitionError } from "@/lib/services/projects";
import { submitWorkSchema } from "@/lib/validations/worker";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = submitWorkSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const result = await submitWork(guard.workerId, params.id, parsed.data, guard.userId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/worker/projects/[id]/submit", error);
  }
}
