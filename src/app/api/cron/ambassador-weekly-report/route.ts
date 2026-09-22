import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { ambassadorWeeklyEmail } from "@/lib/emails/ambassador-weekly";
import { mailerConfigured, sendMail } from "@/lib/mailer";
import { siteUrl as liveSiteUrl } from "@/lib/site-url";
import { buildWeeklyReports, runWeeklyReport } from "@/lib/services/ambassador-weekly-report";

export const dynamic = "force-dynamic";
// ~50 ambassadors, sent 5 at a time over Gmail SMTP; generous headroom.
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
 * GET /api/cron/ambassador-weekly-report
 *
 *   (cron)                         sends last week's summary to every active ambassador
 *   ?preview=true[&ambassador=id]  renders one email as HTML in the browser. Sends nothing.
 *                                  Admin session required. Defaults to the busiest ambassador.
 *   ?dry=true                      counts recipients, sends nothing (cron secret or admin)
 *   ?force=true                    re-send a week already sent (cron secret only)
 *
 * Sending requires CRON_SECRET; without it this route refuses, so nobody can
 * trigger a mass email by guessing the URL.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  // Dashboard and unsubscribe links point at the live site whichever
  // deployment (or local server) renders the email.
  const siteUrl = liveSiteUrl();
  const dashboardUrl = `${siteUrl}/ambassador`;

  try {
    // ── Preview: HTML in the browser, never sends ──────────────
    if (q.get("preview") === "true") {
      const guard = await requireAdmin();
      if (!guard.ok) return guard.response;

      const { reports, label, optedOut } = await buildWeeklyReports();
      const want = q.get("ambassador");
      const pick =
        (want && reports.find((r) => r.ambassadorId === want || r.slotCode === want)) ||
        [...reports].sort((a, b) => b.totalClicks - a.totalClicks)[0];
      if (!pick) {
        return new NextResponse(
          "<p style=\"font-family:sans-serif;padding:24px\">No active ambassador with an email and a slot to preview.</p>",
          { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }
      // The real unsubscribe link would change a real ambassador's setting if
      // clicked while previewing, so the preview link is inert.
      const mail = ambassadorWeeklyEmail(pick, { dashboardUrl, unsubscribeUrl: "#preview-link-disabled" });
      const banner =
        `<div style="font:13px/1.5 Inter,Arial,sans-serif;background:#FEF3C7;color:#78350F;padding:10px 16px;text-align:center">` +
        `Preview only, nothing was sent. Week ${label} · ${reports.length} would receive it (${optedOut} unsubscribed) · Subject: ${mail.subject.replace(/</g, "&lt;")}</div>`;
      return new NextResponse(mail.html.replace(/<body[^>]*>/, (m) => m + banner), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    const dry = q.get("dry") === "true";
    const cron = hasValidCronSecret(req);

    // ── Dry run: cron secret or an admin session ───────────────
    if (dry && !cron) {
      const guard = await requireAdmin();
      if (!guard.ok) return guard.response;
    }

    // ── Everything else must be the cron ────────────────────────
    if (!dry) {
      if (!process.env.CRON_SECRET) {
        return NextResponse.json(
          { error: "CRON_SECRET is not set, so this route will not send. Add it in Vercel and redeploy." },
          { status: 503 }
        );
      }
      if (!cron) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (!mailerConfigured()) {
        return NextResponse.json({ error: "Email is not set up (GMAIL_APP_PASSWORD)." }, { status: 503 });
      }
    }

    const result = await runWeeklyReport({
      dry,
      force: q.get("force") === "true" && cron,
      dashboardUrl,
      siteUrl,
      send: sendMail,
    });
    console.log("[weekly-report]", JSON.stringify({ ...result, failures: result.failures.length }));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("GET /api/cron/ambassador-weekly-report", error);
  }
}
