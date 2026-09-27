import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/api";
import { getWorkerPauseView } from "@/lib/services/data-pause";
import { dataPauseErrorResponse } from "@/lib/services/data-pause-errors";

export const dynamic = "force-dynamic";

/** GET: the data request the assigned worker must answer now (or has answered), or { pause: null }. */
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
