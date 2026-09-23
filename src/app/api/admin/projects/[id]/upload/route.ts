import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { db } from "@/lib/db";
import { MESSAGE_TARGET } from "@/lib/files/paths";
import { handleUploadRequest } from "@/lib/files/upload-route";

export const dynamic = "force-dynamic";

/** POST: an admin uploads a reviewed copy of a document, or a file for the client thread. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const project = await db.project.findFirst({
    where: { OR: [{ id: params.id }, { projectId: params.id }] },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  return handleUploadRequest(req, {
    userId: guard.session.userId,
    role: "ADMIN",
    projectDbId: project.id,
    checkTarget: async (purpose, targetId) => {
      if (purpose === "message") return targetId === MESSAGE_TARGET ? null : "Invalid upload.";
      const d = await db.projectDeliverable.findFirst({
        where: { id: targetId, projectId: project.id },
        select: { id: true },
      });
      return d ? null : "That document isn't part of this project.";
    },
  });
}
