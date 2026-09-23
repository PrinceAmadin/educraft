import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireWorker } from "@/lib/api";
import { fileActionError } from "@/lib/files/route-errors";
import { submitVersion } from "@/lib/services/deliverables";
import { submitVersionSchema } from "@/lib/validations/deliverables";

export const dynamic = "force-dynamic";

/** POST { upload, note }: the worker submits an uploaded file as a new version, for an admin to review. */
export async function POST(req: NextRequest, { params }: { params: { id: string; deliverableId: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  const parsed = submitVersionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Upload a file first.");

  try {
    const result = await submitVersion({
      workerId: guard.workerId,
      userId: guard.userId,
      projectIdOrCode: params.id,
      deliverableId: params.deliverableId,
      upload: parsed.data.upload,
      note: parsed.data.note,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return fileActionError("POST /api/worker/projects/[id]/deliverables/[deliverableId]/submit", error);
  }
}
