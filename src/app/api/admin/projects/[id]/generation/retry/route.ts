import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { RESTARTABLE_STATUSES, resolveGenerationProject, retryChapterGeneration } from "@/lib/generation/generate-chapter";
import { scheduleGenerationStep } from "@/lib/generation/generation-runner";
import { wakeRun } from "@/lib/generation/orchestrator";
import { projectNotFound, resumeBodySchema } from "@/lib/generation/route-helpers";

export const dynamic = "force-dynamic";

/**
 * POST { chapter }: tries a FAILED chapter run again, or restarts a STALLED
 * one (D9), from the part that stopped (the parts already written are kept).
 * Founder and COO only: each retry spends Claude credits, so it is a
 * decision, not a button a worker can press repeatedly. It starts at once,
 * whatever the queue: the orchestrator counts it against the slots.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["COO"]);
  if (!guard.ok) return guard.response;

  const parsed = resumeBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("chapter must be a number from 1 to 5");

  try {
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
    const run = await db.generationCheckpoint.findUnique({
      where: { projectId_chapterNumber: { projectId: project.id, chapterNumber: parsed.data.chapter } },
      select: { id: true, status: true },
    });
    if (!run) return NextResponse.json({ error: `Chapter ${parsed.data.chapter} has not been started` }, { status: 404 });
    if (!RESTARTABLE_STATUSES.includes(run.status)) {
      return NextResponse.json({ error: `Chapter ${parsed.data.chapter} has not stopped (it is ${run.status.toLowerCase()})` }, { status: 409 });
    }
    if (!(await retryChapterGeneration(run.id))) {
      return NextResponse.json({ error: "Someone else changed this run just now" }, { status: 409 });
    }
    // The chapter is already set to carry on. If handing it to the runner fails (a timeout),
    // the orchestrator's next tick carries it on, so the retry itself has still succeeded.
    const handedOver = await scheduleGenerationStep(run.id).then(
      () => true,
      (error) => {
        console.warn("[POST /api/admin/projects/[id]/generation/retry] not handed to the runner yet", run.id, error instanceof Error ? error.message : error);
        return false;
      },
    );
    // The report's run was waiting for a person: it reads the chapter again on the next tick.
    await wakeRun(project.id);
    return NextResponse.json({ ok: true, handedOver });
  } catch (error) {
    return serverError("POST /api/admin/projects/[id]/generation/retry", error);
  }
}
