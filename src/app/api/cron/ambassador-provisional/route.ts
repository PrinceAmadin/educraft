import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { mailerConfigured, sendMail } from "@/lib/mailer";
import { siteUrl as liveSiteUrl } from "@/lib/site-url";
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
 *   (cron)      warns ambassadors whose 30-day window is nearly up, and
 *               releases the slot of anyone whose window has passed with no
 *               confirmed order
 *   ?dry=true   counts who would be warned and who would lapse, sends and
 *               changes nothing (cron secret or admin session)
 *   ?force=true run again on a day that already ran (cron secret only)
 *
 * Sending requires CRON_SECRET; without it this route refuses, so nobody can
 * release slots by guessing the URL.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  // Email links always point at the live site, whichever deployment runs this.
  const siteUrl = liveSiteUrl();

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
      if (!mailerConfigured()) {
        return NextResponse.json({ error: "Email is not set up (GMAIL_APP_PASSWORD)." }, { status: 503 });
      }
    }

    const result = await runProvisionalSweep({
      dry,
      force: q.get("force") === "true" && cron,
      siteUrl,
      send: sendMail,
    });
    console.log("[provisional-sweep]", JSON.stringify({ ...result, failures: result.failures.length }));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("GET /api/cron/ambassador-provisional", error);
  }
}
