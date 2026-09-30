import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireWorker, serverError } from "@/lib/api";
import { ensureReadback } from "@/lib/services/chapter-readback";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET: chapter review, what the specialist's own upload (or the AI draft they work from) reads back
 * as, before the COO sees it. Their assigned project only; never a file hidden from them. 404 otherwise.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string; versionId: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;
  try {
    const v = await db.deliverableVersion.findFirst({
      where: {
        id: params.versionId,
        file: { hiddenFromWorkerAt: null, deletedAt: null },
        deliverable: { kind: "CHAPTER", archivedAt: null, project: { workerId: guard.workerId, OR: [{ id: params.id }, { projectId: params.id }] } },
      },
      select: { id: true },
    });
    if (!v) return NextResponse.json({ error: "Version not found" }, { status: 404 });
    const { readback, text } = await ensureReadback(v.id);
    return NextResponse.json({ readback, text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("GET /api/worker/projects/[id]/deliverables/versions/[versionId]/readback", error);
  }
}
