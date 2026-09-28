import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { tickOrchestrator, verifyTickRequest } from "@/lib/generation/orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// A tick may draft a data request or fetch a dataset inline; both are well inside this.
export const maxDuration = 300;

/**
 * POST: one tick of the chapter orchestrator (Phase D9). Called every 30
 * seconds by the scheduler (a Supabase job, with `Authorization: Bearer
 * ORCHESTRATOR_TICK_SECRET`) and by HQ's own routes straight after Start, a
 * verified data request or a retry (signed with AUTH_SECRET). There is no
 * session here: the request proves itself.
 *
 * It answers 202 at once and works after the response, so the scheduler is
 * never kept waiting. `?wait=1` runs the tick before answering and returns
 * its report (for tests and for checking by hand).
 */
export async function POST(req: NextRequest) {
  if (!verifyTickRequest(req.headers)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { depth?: unknown; only?: unknown } | null;
  // The scheduler's tick is the first function of its chain; a tick fired by one of our routes is the second.
  const depth = typeof body?.depth === "number" && Number.isFinite(body.depth) ? body.depth : 1;
  const only = typeof body?.only === "string" && body.only.length > 0 && body.only.length < 60 ? body.only : undefined;

  if (new URL(req.url).searchParams.get("wait") === "1") {
    try {
      return NextResponse.json({ ok: true, report: await tickOrchestrator({ depth, only }) }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("[orchestrator] tick failed", error);
      return NextResponse.json({ error: "The tick failed" }, { status: 500 });
    }
  }

  waitUntil(tickOrchestrator({ depth, only }).catch((error) => console.error("[orchestrator] tick failed", error)));
  return NextResponse.json({ accepted: true }, { status: 202 });
}
