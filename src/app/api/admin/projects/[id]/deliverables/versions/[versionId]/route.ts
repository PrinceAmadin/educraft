import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin } from "@/lib/api";
import { fileActionError } from "@/lib/files/route-errors";
import { reviewVersion } from "@/lib/services/deliverables";
import { reviewVersionSchema } from "@/lib/validations/deliverables";

export const dynamic = "force-dynamic";

/**
 * POST { decision: "release" | "return", note }: release an uploaded version
 * to the client, or send it back to the worker with a note. 409 when someone
 * else reviewed it first.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; versionId: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = reviewVersionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Choose release or return.");

  try {
    const result = await reviewVersion({
      projectIdOrCode: params.id,
      versionId: params.versionId,
      decision: parsed.data.decision,
      note: parsed.data.note,
      adminUserId: guard.session.userId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return fileActionError("POST /api/admin/projects/[id]/deliverables/versions/[versionId]", error);
  }
}
