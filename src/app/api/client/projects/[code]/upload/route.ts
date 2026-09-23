import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/api";
import { MESSAGE_TARGET } from "@/lib/files/paths";
import { handleUploadRequest } from "@/lib/files/upload-route";
import { findClientProject } from "@/lib/services/client-portal";

export const dynamic = "force-dynamic";

/** POST: the signed-in client attaches a file to a message on their own project. */
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const guard = await requireClient();
  if (!guard.ok) return guard.response;

  const project = await findClientProject(guard.scope, params.code);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  return handleUploadRequest(req, {
    userId: guard.scope.userId,
    role: "CLIENT",
    projectDbId: project.id,
    checkTarget: async (purpose, targetId) =>
      purpose === "message" && targetId === MESSAGE_TARGET ? null : "Invalid upload.",
  });
}
