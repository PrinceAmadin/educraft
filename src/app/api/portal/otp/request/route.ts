import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { sendMail } from "@/lib/mailer";
import { requestPortalCode } from "@/lib/services/portal-otp";

export const dynamic = "force-dynamic";

const schema = z.object({ identifier: z.string().trim().min(1).max(120) });

/**
 * POST /api/portal/otp/request  { "identifier": an email, or an EC-A- / ECW- ID }
 *
 * Emails a code to the address on that worker or ambassador record. The caller
 * never chooses where it goes, and the answer is identical whether or not the
 * account exists (only an IP asking too often gets a 429).
 */
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your email or ID." }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  try {
    const { limited } = await requestPortalCode({
      identifier: parsed.data.identifier,
      ip,
      send: sendMail,
      defer: (work) => waitUntil(work.catch(() => {})),
    });
    if (limited) return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[POST /api/portal/otp/request]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
