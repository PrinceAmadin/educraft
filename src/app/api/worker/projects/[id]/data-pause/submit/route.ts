import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/api";
import { parseBody } from "@/lib/services/operations/route-helpers";
import { submitPauseData } from "@/lib/services/data-pause";
import { dataPauseErrorResponse } from "@/lib/services/data-pause-errors";
import { submitPauseSchema } from "@/lib/validations/data-pause";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Reads each file back once (to check a PDF's pages and turn Word/Excel/CSV into text).
export const maxDuration = 120;

/** POST: the assigned worker sends (or changes, until the report resumes) the data asked for at the pause. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, submitPauseSchema);
  if (!body.ok) return body.response;
  try {
    const pause = await submitPauseData(guard.workerId, guard.userId, params.id, body.data);
    return NextResponse.json({ pause }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return dataPauseErrorResponse("POST /api/worker/projects/[id]/data-pause/submit", error);
  }
}
