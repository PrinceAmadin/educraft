import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runGenerationSlice, verifyGenerationToken } from "@/lib/generation/generation-runner";

// A slice writes parts back to back for up to ~4.75 minutes inside this window.
export const maxDuration = 300;

/**
 * Internal: called by the generation runner, never by a browser. Answers at
 * once and runs the slice in the background of the same invocation
 * (waitUntil), so the invocation that asked for it can finish straight away.
 */
export async function POST(req: NextRequest) {
  // The slice deadline counts from here: this invocation, delay included, must end inside maxDuration.
  const invokedAt = Date.now();
  let body: { checkpointId?: unknown; delaySeconds?: unknown; hop?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const checkpointId = typeof body.checkpointId === "string" ? body.checkpointId : "";
  if (!checkpointId || !verifyGenerationToken(checkpointId, req.headers.get("x-generation-token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const delay = typeof body.delaySeconds === "number" && body.delaySeconds > 0 ? body.delaySeconds : 0;
  const hop = typeof body.hop === "number" && body.hop >= 2 ? Math.floor(body.hop) : 2;

  waitUntil(
    runGenerationSlice(checkpointId, delay, hop, invokedAt).catch((error) => {
      console.error("[POST /api/internal/generation/step]", checkpointId, error);
    }),
  );
  return NextResponse.json({ accepted: true }, { status: 202 });
}
