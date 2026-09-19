import { NextRequest, NextResponse } from "next/server";
import { requireAmbassador, serverError } from "@/lib/api";
import { getRawLog } from "@/lib/services/ambassador-analytics";

export const dynamic = "force-dynamic";

/**
 * GET /api/ambassador/link/log?page=1
 *
 * One page (50 rows) of the signed-in ambassador's click log. The ambassador is
 * resolved from the session by `requireAmbassador()`; there is deliberately no
 * id parameter, so there is nothing to tamper with to read someone else's log.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAmbassador();
  if (!guard.ok) return guard.response;

  const raw = req.nextUrl.searchParams.get("page");
  const page = raw === null ? 1 : Number(raw);
  if (!Number.isInteger(page) || page < 1 || page > 100_000) {
    return NextResponse.json({ error: "page must be a positive whole number" }, { status: 400 });
  }

  try {
    const log = await getRawLog(guard.ambassadorId, page);
    return NextResponse.json(log, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("GET /api/ambassador/link/log", error);
  }
}
