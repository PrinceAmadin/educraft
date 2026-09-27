import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import {
  addSpecialistFiles,
  cancelDataPause,
  DataPauseError,
  getAdminPauses,
  openDataPause,
  regenerateDataForm,
  requestMoreFiles,
  saveAnswers,
  verifyDataPause,
} from "@/lib/services/data-pause";
import { dataPauseErrorResponse } from "@/lib/services/data-pause-errors";
import { pauseActionSchema } from "@/lib/validations/data-pause";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Opening a pause drafts its data request with one Claude call; adding files reads them back once.
export const maxDuration = 120;

/** GET: every data pause of the project, with its request, the files sent and the answers. Founder and COO only. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ pauses: await getAdminPauses(params.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return dataPauseErrorResponse("GET /api/admin/projects/[id]/data-pause", error);
  }
}

/**
 * POST { action, ... }. Founder and COO only:
 *  - open { afterChapter }: pause the report there and draft the client's data request
 *    (the chapter orchestrator will do this on its own); regenerate_form; cancel
 *  - the specialist's actions, when the founder or COO checks the data themselves:
 *    add_files, save_answers, verify, request_more
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, pauseActionSchema);
  if (!body.ok) return body.response;
  try {
    const project = await db.project.findFirst({ where: { OR: [{ id: params.id }, { projectId: params.id }] }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const actor = { userId: guard.actor.userId, role: "ADMIN" as const };
    const b = body.data;
    if (b.action === "open") await openDataPause(project.id, b.afterChapter, { userId: guard.actor.userId });
    else if (b.action === "regenerate_form") await regenerateDataForm(b.pauseId);
    else if (b.action === "cancel") {
      const owned = await db.pipelinePause.count({ where: { id: b.pauseId, projectId: project.id } });
      if (!owned) throw new DataPauseError("Pause not found", 404);
      if (!(await cancelDataPause(b.pauseId))) throw new DataPauseError("This pause has already ended.");
    } else if (b.action === "add_files") await addSpecialistFiles(actor, project.id, b.pauseId, b.files);
    else if (b.action === "save_answers") await saveAnswers(project.id, b.pauseId, b.answers);
    else if (b.action === "verify") await verifyDataPause(actor, project.id, b.pauseId, b.chapterFileIds);
    else await requestMoreFiles(project.id, b.pauseId, b.note || null);
    return NextResponse.json({ pauses: await getAdminPauses(project.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return dataPauseErrorResponse("POST /api/admin/projects/[id]/data-pause", error);
  }
}
