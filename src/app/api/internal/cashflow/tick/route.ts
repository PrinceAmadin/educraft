import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { cashflowTickCaller, noteCashflowSchedulerTick, runCashflowTick } from "@/lib/services/finance/cashflow-tick";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Finalising a batch sends a round of emails inline; well inside this.
export const maxDuration = 300;

/**
 * POST: one tick of the cashflow scheduler (Phase 5). Called every minute by a
 * Supabase pg_cron job with `Authorization: Bearer CASHFLOW_TICK_SECRET`. It
 * builds the batches due today, finalises any whose ten-minute undo window has
 * closed (sending the delayed payout emails), and reminds missing-bank
 * recipients. There is no session: the request proves itself.
 *
 * It answers 202 at once and works after the response. `?wait=1` runs the tick
 * before answering and returns its report (for tests and checking by hand).
 */
export async function POST(req: NextRequest) {
  const caller = cashflowTickCaller(req.headers);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller === "scheduler") waitUntil(noteCashflowSchedulerTick());

  if (new URL(req.url).searchParams.get("wait") === "1") {
    try {
      return NextResponse.json({ ok: true, report: await runCashflowTick() }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("[cashflow] tick failed", error);
      return NextResponse.json({ error: "The tick failed" }, { status: 500 });
    }
  }

  waitUntil(runCashflowTick().catch((error) => console.error("[cashflow] tick failed", error)));
  return NextResponse.json({ accepted: true }, { status: 202 });
}
