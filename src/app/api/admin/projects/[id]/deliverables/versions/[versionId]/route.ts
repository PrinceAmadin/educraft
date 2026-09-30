import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin } from "@/lib/api";
import { fileActionError } from "@/lib/files/route-errors";
import { reviewVersion } from "@/lib/services/deliverables";
import { reviewVersionSchema } from "@/lib/validations/deliverables";

export const dynamic = "force-dynamic";

/**
 * POST { decision: "release" | "approve" | "return", note, readbackHash? }: release an uploaded
 * version to the client, or send it back to the worker with a note. 409 when someone else
 * reviewed it first. For a chapter of a generated report, release is the COO's approval
 * (chapter review): 409 APPROVAL_REFUSED with `refusals` for an AI draft, a file that is not
 * .docx, a read-back with problems or blanks, a file read again since `readbackHash`, or a
 * report in QA; a complete document built before a newer approval is 409 BUILT_FROM_STALE.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; versionId: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = reviewVersionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Choose approve, release or return.");

  try {
    const result = await reviewVersion({
      projectIdOrCode: params.id,
      versionId: params.versionId,
      decision: parsed.data.decision,
      note: parsed.data.note,
      adminUserId: guard.session.userId,
      readbackHash: parsed.data.readbackHash ?? null,
    });
    return NextResponse.json(result);
  } catch (error) {
    return fileActionError("POST /api/admin/projects/[id]/deliverables/versions/[versionId]", error);
  }
}
