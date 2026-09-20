import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { sendMail } from "@/lib/mailer";
import { requestAmbassadorCode } from "@/lib/services/ambassador-otp";

export const dynamic = "force-dynamic";

const schema = z.object({ identifier: z.string().trim().min(1).max(120) });

/**
 * POST /api/ambassador/otp/request  { "identifier": "EC-A-00012" or an email }
 *
 * Emails a code to the address on that ambassador's record. The caller never
 * chooses where it goes, and the answer is identical whether or not the
 * ambassador exists (only an IP asking too often gets a 429).
 */
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your email or Ambassador ID." }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  try {
    const { limited } = await requestAmbassadorCode({
      identifier: parsed.data.identifier,
      ip,
      send: sendMail,
      defer: (work) => waitUntil(work.catch(() => {})),
    });
    if (limited) return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[POST /api/ambassador/otp/request]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
