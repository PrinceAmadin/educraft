import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/api";
import { db } from "@/lib/db";
import { MESSAGE_TARGET } from "@/lib/files/paths";
import { handleUploadRequest } from "@/lib/files/upload-route";
import { findClientProject } from "@/lib/services/client-portal";

export const dynamic = "force-dynamic";

/**
 * POST: the signed-in client uploads to their own project: a message attachment,
 * or (D4) a data file while the report waits for their data. Nothing else.
 */
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const guard = await requireClient();
  if (!guard.ok) return guard.response;

  const project = await findClientProject(guard.scope, params.code);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // The one pause a client may upload to: this project's own, waiting for them, with its request ready.
  const openPause = await db.pipelinePause.findFirst({
    where: { projectId: project.id, status: "OPEN", formStatus: "READY" },
    select: { id: true },
  });

  return handleUploadRequest(req, {
    userId: guard.scope.userId,
    role: "CLIENT",
    projectDbId: project.id,
    uploadContext: { ownsProject: true, activeDataPause: Boolean(openPause) },
    checkTarget: async (purpose, targetId) => {
      if (purpose === "message") return targetId === MESSAGE_TARGET ? null : "Invalid upload.";
      if (purpose === "data") return openPause && targetId === openPause.id ? null : "This project is not waiting for your files right now.";
      return "Invalid upload.";
    },
  });
}
