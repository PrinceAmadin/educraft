import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

export const dynamic = "force-dynamic";

/**
 * GET  -> sends the person to the confirmation page. A GET must never change
 *         anything: mail scanners and link previewers open every link.
 * POST -> the actual change. Two callers:
 *         1. the confirmation page's form (fields `t`, `action`, `from=page`),
 *            answered with a redirect back to the page;
 *         2. a mail client's one-click unsubscribe (RFC 8058), which POSTs
 *            `List-Unsubscribe=One-Click` to the URL in the email header,
 *            answered with plain JSON.
 * The signed token in the URL or form is the only credential; it identifies
 * one ambassador and cannot be guessed or reused for anything else.
 */
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t") ?? "";
  return NextResponse.redirect(new URL(`/unsubscribe/weekly?t=${encodeURIComponent(t)}`, req.url), 303);
}

export async function POST(req: NextRequest) {
  let form: FormData | null = null;
  try {
    form = await req.formData();
  } catch {
    form = null; // no/other body type: fine for one-click, the token is in the URL
  }

  const token = (form?.get("t") as string | null) ?? req.nextUrl.searchParams.get("t");
  const ambassadorId = verifyUnsubscribeToken(token);
  if (!ambassadorId) return NextResponse.json({ error: "This link is not valid." }, { status: 400 });

  const resubscribe = form?.get("action") === "resubscribe";
  try {
    // updateMany so a deleted ambassador is a quiet no-op rather than a 500.
    const { count } = await db.ambassador.updateMany({
      where: { id: ambassadorId },
      data: { weeklyEmailOptOut: !resubscribe },
    });
    if (count === 0) return NextResponse.json({ error: "This link is not valid." }, { status: 404 });
  } catch (error) {
    console.error("[POST /api/unsubscribe/weekly]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  if (form?.get("from") === "page") {
    const done = resubscribe ? "resubscribed" : "unsubscribed";
    return NextResponse.redirect(
      new URL(`/unsubscribe/weekly?t=${encodeURIComponent(token!)}&done=${done}`, req.url),
      303
    );
  }
  return NextResponse.json({ ok: true, weeklyEmailOptOut: !resubscribe });
}
