import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runResearchStep, verifyJobToken } from "@/lib/services/research-runner";

// One step (plus an optional retry delay) runs inside this window.
export const maxDuration = 60;

/**
 * Internal — called by the research runner, never by a browser. It answers
 * straight away and does the step in the background of the same invocation
 * (waitUntil), so the caller — the previous step — can finish immediately
 * instead of waiting on this one, which is what lets the chain run for as long
 * as the job needs without any invocation waiting on the next.
 */
export async function POST(req: NextRequest) {
  let body: { jobId?: unknown; delaySeconds?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  if (!jobId || !verifyJobToken(jobId, req.headers.get("x-research-token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const delay = typeof body.delaySeconds === "number" && body.delaySeconds > 0 ? body.delaySeconds : 0;

  waitUntil(
    runResearchStep(jobId, delay).catch((error) => {
      console.error("[POST /api/internal/research/step]", jobId, error);
    })
  );
  return NextResponse.json({ accepted: true }, { status: 202 });
}
