import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { db } from "@/lib/db";
import { effectiveRole } from "@/lib/rbac";
import { verifyQualityToken, wakeRun } from "@/lib/generation/orchestrator";
import { QualityGateError, runQualityGate } from "@/lib/quality-gate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// The quality gate takes 40 to 80 seconds (its Claude reviews run side by side).
export const maxDuration = 300;

/**
 * POST { projectId }: runs the quality gate on a report the chapter
 * orchestrator has finished writing (Phase D9). The orchestrator asks for the
 * gate here, over HTTP, and reads the result from the QaReview row on a later
 * tick: it never imports the gate, so the two stay independent. Signed with
 * AUTH_SECRET over `quality-run:<projectId>`; there is no session.
 *
 * The actor is whoever pressed Start: a passing report is submitted to QA in
 * their name, exactly as if they had pressed "Run quality check" themselves.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { projectId?: unknown } | null;
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  if (!projectId || !verifyQualityToken(projectId, req.headers.get("x-quality-token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  waitUntil(run(projectId));
  return NextResponse.json({ accepted: true }, { status: 202 });
}

async function run(projectId: string): Promise<void> {
  const started = await db.orchestratorRun.findUnique({ where: { projectId }, select: { id: true, startedById: true, startedByName: true } });
  if (!started) return;
  try {
    const user = await db.user.findUnique({ where: { id: started.startedById }, select: { role: true } });
    await runQualityGate(projectId, { userId: started.startedById, name: started.startedByName, role: effectiveRole(user?.role ?? "COO") });
  } catch (error) {
    // Someone is running the check by hand right now: its result is the one the orchestrator reads.
    if (error instanceof QualityGateError && error.code === "QUALITY_RUN_IN_PROGRESS") return;
    const message = error instanceof Error ? error.message : String(error);
    console.error("[orchestrator] the quality check failed to run", projectId, error);
    await db.orchestratorRun.update({ where: { id: started.id }, data: { gateError: message.slice(0, 500) } }).catch(() => {});
  } finally {
    await wakeRun(projectId);
  }
}
