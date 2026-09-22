import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { sendMail } from "@/lib/mailer";
import { requestCode } from "@/lib/services/client-otp";

export const dynamic = "force-dynamic";

// `clientId` is the field name older cached pages still send.
const schema = z
  .object({
    identifier: z.string().trim().min(1).max(160).optional(),
    clientId: z.string().trim().min(1).max(160).optional(),
  })
  .refine((v) => v.identifier || v.clientId);

/**
 * POST /api/client/otp/request  { "identifier": "ECC-0124" or an email }
 *
 * Emails a one-time sign-in code to the address stored on that client. A typed
 * email only finds the client; the code still goes to the address on record,
 * never to one the caller chose. The answer is the same whether or not the
 * client exists, and the email is sent after the response, so neither the
 * message nor the timing reveals which IDs or emails are real. The only
 * different answer is 429 for an IP that is asking too often.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter your Client ID or email." }, { status: 400 });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

  try {
    const { limited } = await requestCode({
      identifierInput: (parsed.data.identifier ?? parsed.data.clientId)!,
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
