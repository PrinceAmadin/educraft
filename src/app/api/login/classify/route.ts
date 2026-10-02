import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { classifyLoginIdentifier } from "@/lib/services/portal-otp";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Public. The login page calls this ONLY after a failed password sign-in, to
 * tell a pending applicant "your application is under review" instead of the
 * generic "wrong password" (the sign-in path can't distinguish an inactive
 * login from a wrong password). It returns only "pending" vs "other", which the
 * public `/api/portal/otp/request` endpoint already exposes, so it leaks
 * nothing new; the per-IP cap stops it being used to test lists of emails.
 */
const schema = z.object({ identifier: z.string().trim().min(1).max(160) });

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: "other" });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ status: "other" });

  const ok = await checkRateLimit(`ip:${clientIp(req)}`, "login-classify", 20, 60_000);
  if (!ok) return NextResponse.json({ status: "other" });

  const status = await classifyLoginIdentifier(parsed.data.identifier);
  return NextResponse.json({ status }, { headers: { "Cache-Control": "no-store" } });
}
