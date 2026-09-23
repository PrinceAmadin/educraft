import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin } from "@/lib/api";
import { fileActionError } from "@/lib/files/route-errors";
import { adminUploadVersion } from "@/lib/services/deliverables";
import { adminUploadVersionSchema } from "@/lib/validations/deliverables";

export const dynamic = "force-dynamic";

/** POST { upload, note, release }: an admin's own copy of a document, released at once when `release` is set. */
export async function POST(req: NextRequest, { params }: { params: { id: string; deliverableId: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = adminUploadVersionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Upload a file first.");

  try {
    const result = await adminUploadVersion({
      projectIdOrCode: params.id,
      deliverableId: params.deliverableId,
      upload: parsed.data.upload,
      note: parsed.data.note,
      release: parsed.data.release,
      adminUserId: guard.session.userId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return fileActionError("POST /api/admin/projects/[id]/deliverables/[deliverableId]/upload", error);
  }
}
