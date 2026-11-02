import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAmbassador, serverError } from "@/lib/api";
import { TourError, saveTourProgress } from "@/lib/services/ambassador-tour";
import { tourProgressSchema } from "@/lib/validations/ambassador";

/**
 * How far the signed-in ambassador has watched the tutorial video.
 *
 * There is deliberately no id in the body: the ambassador comes from the
 * session, so there is nothing to tamper with to mark someone else's tour
 * watched — the same property the link routes document.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAmbassador();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = tourProgressSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const result = await saveTourProgress(guard.ambassadorId, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TourError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return serverError("POST /api/ambassador/tour/progress", error);
  }
}
