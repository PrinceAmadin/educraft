import { NextRequest, NextResponse } from "next/server";
import { badRequest } from "@/lib/api";
import { db } from "@/lib/db";
import { fileActionError } from "@/lib/files/route-errors";
import { returnChapter } from "@/lib/services/chapter-review";
import { opsGuard } from "@/lib/services/operations/route-helpers";
import { chapterChangesSchema } from "@/lib/validations/deliverables";

export const dynamic = "force-dynamic";

/**
 * POST { note }: chapter review, the COO's correction notes on a chapter, for the founder and the
 * COO. Returns the upload waiting for approval, notes on the AI draft before the specialist uploads,
 * or (an approved chapter) changes requested while the approved version stays in use.
 * 404 not a chapter of this project; 409 ALREADY_RETURNED / NOT_WRITTEN.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; deliverableId: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  const parsed = chapterChangesSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Say what needs to change.");
  try {
    const item = await db.projectDeliverable.findFirst({
      where: { id: params.deliverableId, kind: "CHAPTER", project: { OR: [{ id: params.id }, { projectId: params.id }] } },
      select: { chapter: true, projectId: true },
    });
    if (!item || item.chapter == null) return NextResponse.json({ error: "That chapter is not part of this project." }, { status: 404 });
    const result = await returnChapter({ projectIdOrCode: item.projectId, chapter: item.chapter, note: parsed.data.note, actor: { userId: guard.actor.userId, name: guard.actor.name } });
    return NextResponse.json(result);
  } catch (error) {
    return fileActionError("POST /api/admin/projects/[id]/deliverables/[deliverableId]/changes", error);
  }
}
