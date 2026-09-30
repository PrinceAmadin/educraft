import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runObjectivesCheck, verifyCheckRequest } from "@/lib/research/objectives-check";

// Two judge attempts of at most 140 s each.
export const maxDuration = 300;

/**
 * Internal: a Draft's save (or the card's Check again) took the check's lease
 * and hands the check here, so it runs in its own invocation and never in the
 * drafting slice. Answers at once and runs the check in the background.
 */
export async function POST(req: NextRequest) {
  let body: { briefId?: unknown; lease?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  const briefId = typeof body.briefId === "string" ? body.briefId : "";
  if (!briefId || !verifyCheckRequest(briefId, req.headers.get("x-objectives-check-token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const lease = typeof body.lease === "string" ? new Date(body.lease) : null;
  if (!lease || Number.isNaN(lease.getTime())) return NextResponse.json({ error: "Expected the lease" }, { status: 400 });
  waitUntil(
    runObjectivesCheck(briefId, lease).catch((error) => {
      console.error("[POST /api/internal/objectives-check/run]", briefId, error);
    }),
  );
  return NextResponse.json({ accepted: true }, { status: 202 });
}
