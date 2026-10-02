import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { runProvisionalSweep } from "@/lib/services/ambassador-provisional";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
 * GET /api/cron/ambassador-provisional
 *
 *   (cron)      reports to the Head of Growth any new ambassador whose 30-day
 *               window has passed with no confirmed order — silent and
 *               non-destructive: nothing about the ambassador is changed
 *   ?dry=true   counts who would be reported, changes nothing (cron secret or
 *               admin session)
 *
 * Running requires CRON_SECRET; without it this route refuses, so nobody can
 * trigger the report by guessing the URL.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;

  try {
    const dry = q.get("dry") === "true";
    const cron = hasValidCronSecret(req);

    if (dry && !cron) {
      const guard = await requireAdmin();
      if (!guard.ok) return guard.response;
    }

    if (!dry) {
      if (!process.env.CRON_SECRET) {
        return NextResponse.json(
          { error: "CRON_SECRET is not set, so this route will not run. Add it in Vercel and redeploy." },
          { status: 503 }
        );
      }
      if (!cron) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runProvisionalSweep({ dry });
    console.log("[provisional-sweep]", JSON.stringify({ ...result, failures: result.failures.length }));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("GET /api/cron/ambassador-provisional", error);
  }
}
