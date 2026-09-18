import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { getWorkerCurrentAssignments } from "@/lib/services/workers";

/** The projects currently blocking this worker's deletion — surfaced so the delete dialog can offer reassignment inline. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const assignments = await getWorkerCurrentAssignments(params.id);
    return NextResponse.json({ assignments });
  } catch (error) {
    return serverError("GET /api/admin/workers/[id]/assignments", error);
  }
}
