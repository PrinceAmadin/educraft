import { NextResponse } from "next/server";
import { requireWorker, serverError } from "@/lib/api";
import { acceptAssignment } from "@/lib/services/worker-portal";
import { TransitionError } from "@/lib/services/projects";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;
  try {
    await acceptAssignment(guard.workerId, params.id, guard.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/worker/projects/[id]/accept", error);
  }
}
