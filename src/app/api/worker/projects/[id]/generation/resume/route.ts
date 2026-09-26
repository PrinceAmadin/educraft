import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireWorker, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { ACTIVE_STATUSES, resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { scheduleGenerationStep } from "@/lib/generation/generation-runner";
import { projectNotFound, resumeBodySchema } from "@/lib/generation/route-helpers";

export const dynamic = "force-dynamic";

/**
 * POST { chapter }: restarts a chapter run that stopped mid-way (its chain
 * broke). Safe to call any time: a slice takes the lease first, so a run
 * already going is left alone. A FAILED run is not restarted here: every
 * retry spends Claude credits, so the COO or the founder decides
 * (POST /api/admin/projects/[id]/generation/retry).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  const parsed = resumeBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("chapter must be a number from 1 to 5");

  try {
    const project = await resolveGenerationProject(params.id, guard.workerId);
    if (!project) return projectNotFound();
    const run = await db.generationCheckpoint.findUnique({
      where: { projectId_chapterNumber: { projectId: project.id, chapterNumber: parsed.data.chapter } },
      select: { id: true, status: true },
    });
    if (!run) return NextResponse.json({ error: `Chapter ${parsed.data.chapter} has not been started` }, { status: 404 });
    if (run.status === "COMPLETED") return NextResponse.json({ ok: true, done: true });
    if (run.status === "FAILED") {
      return NextResponse.json({ error: `Chapter ${parsed.data.chapter} stopped. The COO decides whether to try it again.`, code: "RETRY_NEEDS_APPROVAL" }, { status: 409 });
    }
    if (!ACTIVE_STATUSES.includes(run.status)) return NextResponse.json({ ok: true, done: true });

    await scheduleGenerationStep(run.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("POST /api/worker/projects/[id]/generation/resume", error);
  }
}
