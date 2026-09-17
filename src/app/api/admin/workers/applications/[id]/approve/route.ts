import { NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { WorkerApplicationError, approveWorkerApplication } from "@/lib/services/worker-applications";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const result = await approveWorkerApplication(params.id, guard.session.userId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof WorkerApplicationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/admin/workers/applications/[id]/approve", error);
  }
}
