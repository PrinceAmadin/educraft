import { NextRequest, NextResponse } from "next/server";
import { opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { getAdminPauses, openDataPause, regenerateDataForm } from "@/lib/services/data-pause";
import { dataPauseErrorResponse } from "@/lib/services/data-pause-errors";
import { pauseActionSchema } from "@/lib/validations/data-pause";

export const dynamic = "force-dynamic";
// Opening a pause drafts its data request with one Claude call.
export const maxDuration = 120;

/** GET: every data pause of the project, with its request, answers and files. Founder and COO only. */
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
 * POST { action: "open", afterChapter } pauses the report there and drafts the data request (D4 does
 * this on its own); { action: "regenerate_form", pauseId } drafts it again. Founder and COO only.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, pauseActionSchema);
  if (!body.ok) return body.response;
  try {
    if (body.data.action === "open") await openDataPause(params.id, body.data.afterChapter, { userId: guard.actor.userId });
    else await regenerateDataForm(body.data.pauseId);
    return NextResponse.json({ pauses: await getAdminPauses(params.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return dataPauseErrorResponse("POST /api/admin/projects/[id]/data-pause", error);
  }
}
