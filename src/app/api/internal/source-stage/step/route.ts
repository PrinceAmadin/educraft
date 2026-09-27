import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runSourceStageSlice, verifySourceStageToken } from "@/lib/research/source-stage-runner";

// A slice drafts objectives or searches for sources for up to ~4.5 minutes inside this window.
export const maxDuration = 300;

/**
 * Internal: called by the source-stage runner, never by a browser. Answers at
 * once and runs the slice in the background of the same invocation.
 */
export async function POST(req: NextRequest) {
  const invokedAt = Date.now();
  let body: { briefId?: unknown; delaySeconds?: unknown; hop?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  const briefId = typeof body.briefId === "string" ? body.briefId : "";
  if (!briefId || !verifySourceStageToken(briefId, req.headers.get("x-source-stage-token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const delay = typeof body.delaySeconds === "number" && body.delaySeconds > 0 ? body.delaySeconds : 0;
  const hop = typeof body.hop === "number" && body.hop >= 2 ? Math.floor(body.hop) : 2;
  waitUntil(
    runSourceStageSlice(briefId, delay, hop, invokedAt).catch((error) => {
      console.error("[POST /api/internal/source-stage/step]", briefId, error);
    }),
  );
  return NextResponse.json({ accepted: true }, { status: 202 });
}
