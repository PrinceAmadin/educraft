import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { sendMail } from "@/lib/mailer";
import { requestPortalCode } from "@/lib/services/portal-otp";

export const dynamic = "force-dynamic";

const schema = z.object({ identifier: z.string().trim().min(1).max(120) });

/**
 * POST /api/portal/otp/request  { "identifier": an email, or an EC-A- / ECW- / ECC- ID }
 *
 * The forgot-password page for every login: works out whether it is a worker's,
 * an ambassador's or a client's and emails a code to the address on that record;
 * the caller never chooses where it goes. Answers 200 `{ status, account?,
 * sentTo?, retryAfter?, codeStillValid? }` (`CodeRequestResult`): "sent" with
 * `account` "team" or "client" (which password the code sets), or why not (not
 * registered, application under review, suspended, wait before asking again…),
 * so the form can say so plainly. 429 when the IP is asking too often.
 */
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your email or ID." }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  try {
    const result = await requestPortalCode({
      identifier: parsed.data.identifier,
      ip,
      send: sendMail,
      defer: (work) => waitUntil(work.catch(() => {})),
    });
    if (result.status === "limited") {
      return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[POST /api/portal/otp/request]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
