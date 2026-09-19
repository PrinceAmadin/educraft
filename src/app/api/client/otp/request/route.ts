import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { sendMail } from "@/lib/mailer";
import { requestCode } from "@/lib/services/client-otp";

export const dynamic = "force-dynamic";

const schema = z.object({ clientId: z.string().trim().min(1).max(40) });

/**
 * POST /api/client/otp/request  { "clientId": "EC-C-00124" }
 *
 * Emails a one-time sign-in code to the address stored on that client. The
 * request has NO email field, so a code can never be sent to an address the
 * caller chose. The answer is the same whether or not the ID exists, and the
 * email is sent after the response, so neither the message nor the timing
 * reveals which IDs are real. The only different answer is 429 for an IP that
 * is asking too often.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter your Client ID." }, { status: 400 });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

  try {
    const { limited } = await requestCode({
      clientIdInput: parsed.data.clientId,
      ip,
      send: sendMail,
      defer: (work) => waitUntil(work.catch(() => {})),
    });
    if (limited) {
      return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[POST /api/client/otp/request]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
