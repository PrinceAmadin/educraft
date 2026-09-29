import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { refreshFxRate } from "@/lib/fx-fetch";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Constant-time compare. */
function hasValidCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * GET /api/cron/refresh-fx-rate
 *
 * Fetches today's USD → NGN mid-market rate and stores it as `ai.fxRateAuto`.
 * Cron secret required — nobody can trigger a background fetch by guessing the URL.
 * On failure the response is 200 with `{ ok: false, reason }` and the previous
 * auto value is preserved: yesterday's rate is better than none.
 */
export async function GET(req: NextRequest) {
  if (!hasValidCronSecret(req)) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }
  const result = await refreshFxRate();
  if (!result.ok) {
    console.error("[fx-rate] refresh failed:", result.reason);
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 200 });
  }
  return NextResponse.json({ ok: true, base: result.base, source: result.source, fetchedAt: result.fetchedAt });
}
