import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/api";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { wakeRun } from "@/lib/generation/orchestrator";
import { projectNotFound } from "@/lib/generation/route-helpers";
import { runQualityGate } from "@/lib/quality-gate";
import { qualityErrorResponse, workerActor } from "@/lib/quality/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST: the assigned worker runs the quality gate on their report (Phase D8).
 * A run only pays for AI on chapters that changed since the last one, and
 * chapters only change by a founder/COO re-generation, so a repeat run is free.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;
  try {
    const project = await resolveGenerationProject(params.id, guard.workerId);
    if (!project) return projectNotFound();
    const result = await runQualityGate(project.id, await workerActor(guard.workerId, guard.userId));
    await wakeRun(project.id); // D9: the report's run reads this result on its next tick
    return NextResponse.json({ ...result, costNaira: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return qualityErrorResponse("POST /api/worker/projects/[id]/quality/run", error);
  }
}
