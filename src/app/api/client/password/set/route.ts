import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PASSWORD_MAX, PASSWORD_MIN, setPasswordWithCode } from "@/lib/services/client-otp";

export const dynamic = "force-dynamic";

const schema = z.object({
  clientId: z.string().trim().min(1).max(40),
  code: z.string().trim().regex(/^\d{6}$/),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

/**
 * POST /api/client/password/set  { clientId, code, password }
 *
 * First-time setup and "forgot password". Needs the 6-digit code emailed to the
 * address on the client, so knowing an ID alone can never set or change a
 * password. Any failure gets the same answer. The caller then signs in normally.
 */
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: `Use the 6-digit code and a password of ${PASSWORD_MIN}-${PASSWORD_MAX} characters.` }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  try {
    const ok = await setPasswordWithCode({ ...parsed.data, clientIdInput: parsed.data.clientId, ip });
    if (!ok) return NextResponse.json({ error: "That code did not work. Check it, or ask for a new one." }, { status: 400 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[POST /api/client/password/set]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
