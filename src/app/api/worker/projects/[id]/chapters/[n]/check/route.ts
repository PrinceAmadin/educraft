import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireWorker, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { checkView } from "@/lib/quality/chapter-gate";
import { projectChapterChecks } from "@/lib/services/chapter-gate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET: chapter gate, the checks of Chapter n on the specialist's own assigned project (the AI text
 * and their uploads), without costs. 404 for any other project.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string; n: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;
  const chapter = Number(params.n);
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 10) return badRequest("Unknown chapter.");
  try {
    const project = await db.project.findFirst({ where: { workerId: guard.workerId, OR: [{ id: params.id }, { projectId: params.id }] }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const rows = (await projectChapterChecks(project.id)).filter((r) => r.chapterNumber === chapter);
    return NextResponse.json({ chapter, checks: rows.map((r) => ({ subject: r.subject, versionId: r.versionId, createdAt: r.createdAt, ...checkView(r, false) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("GET /api/worker/projects/[id]/chapters/[n]/check", error);
  }
}
