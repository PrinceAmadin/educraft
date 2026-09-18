import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { getAssignmentContext } from "@/lib/services/workers";

/** Ranked worker recommendations for one project — used by any inline reassign picker (e.g. the delete-worker dialog). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const ctx = await getAssignmentContext(params.id);
    if (!ctx) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(ctx);
  } catch (error) {
    return serverError("GET /api/admin/projects/[id]/assignment-context", error);
  }
}
