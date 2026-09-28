import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/api";
import { db } from "@/lib/db";
import { parseBody } from "@/lib/services/operations/route-helpers";
import { addSpecialistFiles, getWorkerPauseView, requestMoreFiles, saveAnswers, verifyDataPause } from "@/lib/services/data-pause";
import { dataPauseErrorResponse } from "@/lib/services/data-pause-errors";
import { workerPauseActionSchema } from "@/lib/validations/data-pause";
import { nudge } from "@/lib/generation/orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Adding files reads each back once (Word/Excel/CSV into text); verifying counts the ticked PDFs' pages.
export const maxDuration = 120;

/** GET: the data pause the assigned worker is checking now (or waiting on), or { pause: null }. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;
  try {
    const pause = await getWorkerPauseView(guard.workerId, params.id);
    return NextResponse.json({ pause }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return dataPauseErrorResponse("GET /api/worker/projects/[id]/data-pause", error);
  }
}

/**
 * POST { action: "add_files" | "save_answers" | "verify" | "request_more", pauseId, ... }:
 * the assigned worker checks the client's data, adds their own files, corrects the
 * answers, and verifies it or asks the client for more.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, workerPauseActionSchema);
  if (!body.ok) return body.response;
  try {
    const project = await db.project.findFirst({
      where: { workerId: guard.workerId, OR: [{ id: params.id }, { projectId: params.id }] },
      select: { id: true },
    });
    if (!project) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    const actor = { userId: guard.userId, role: "WORKER" as const };
    const b = body.data;
    if (b.action === "add_files") await addSpecialistFiles(actor, project.id, b.pauseId, b.files);
    else if (b.action === "save_answers") await saveAnswers(project.id, b.pauseId, b.answers);
    else if (b.action === "verify") await verifyDataPause(actor, project.id, b.pauseId, b.chapterFileIds, b.values);
    else await requestMoreFiles(project.id, b.pauseId, b.note || null);
    // D9: verified data is what the report's run was waiting for; its next chapter starts when a slot is free.
    if (b.action === "verify") await nudge(project.id);
    const pause = await getWorkerPauseView(guard.workerId, project.id);
    return NextResponse.json({ pause }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return dataPauseErrorResponse("POST /api/worker/projects/[id]/data-pause", error);
  }
}
