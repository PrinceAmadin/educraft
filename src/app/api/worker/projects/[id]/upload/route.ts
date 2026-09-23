import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/api";
import { db } from "@/lib/db";
import { handleUploadRequest } from "@/lib/files/upload-route";
import { canSubmitDeliverable, whySubmitClosed } from "@/lib/services/deliverables";

export const dynamic = "force-dynamic";

/** POST: where the assigned worker uploads a chapter or document (see files/upload-route.ts). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  const project = await db.project.findFirst({
    where: { workerId: guard.workerId, OR: [{ id: params.id }, { projectId: params.id }] },
    select: { id: true, status: true },
  });
  if (!project) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });

  return handleUploadRequest(req, {
    userId: guard.userId,
    role: "WORKER",
    projectDbId: project.id,
    checkTarget: async (purpose, targetId) => {
      if (purpose !== "deliverable") return "Workers upload chapters and documents only.";
      const d = await db.projectDeliverable.findFirst({
        where: { id: targetId, projectId: project.id, archivedAt: null },
        select: { kind: true },
      });
      if (!d) return "That document isn't part of this project.";
      return canSubmitDeliverable(d.kind, project.status) ? null : whySubmitClosed(d.kind, project.status);
    },
  });
}
