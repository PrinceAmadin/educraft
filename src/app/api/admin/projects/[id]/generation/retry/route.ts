import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { resolveGenerationProject, retryChapterGeneration } from "@/lib/generation/generate-chapter";
import { scheduleGenerationStep } from "@/lib/generation/generation-runner";
import { projectNotFound, resumeBodySchema } from "@/lib/generation/route-helpers";

export const dynamic = "force-dynamic";

/**
 * POST { chapter }: tries a FAILED chapter run again, from the part that
 * failed (the parts already written are kept). Founder and COO only: each
 * retry spends Claude credits, so it is a decision, not a button a worker
 * can press repeatedly.
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
    if (run.status !== "FAILED") {
      return NextResponse.json({ error: `Chapter ${parsed.data.chapter} has not stopped (it is ${run.status.toLowerCase()})` }, { status: 409 });
    }
    if (!(await retryChapterGeneration(run.id))) {
      return NextResponse.json({ error: "Someone else changed this run just now" }, { status: 409 });
    }
    await scheduleGenerationStep(run.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("POST /api/admin/projects/[id]/generation/retry", error);
  }
}
