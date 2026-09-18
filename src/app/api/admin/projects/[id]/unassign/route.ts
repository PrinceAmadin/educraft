import { NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { TransitionError, unassignWorker } from "@/lib/services/projects";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const project = await unassignWorker(params.id, guard.session.userId);
    return NextResponse.json({ status: project.status });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/admin/projects/[id]/unassign", error);
  }
}
