import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/services/client-otp";
import { setPortalPasswordWithCode } from "@/lib/services/portal-otp";

export const dynamic = "force-dynamic";

const schema = z.object({
  identifier: z.string().trim().min(1).max(120),
  code: z.string().trim().regex(/^\d{6}$/),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

/** POST /api/portal/password/set  { identifier, code, password }. Needs the emailed code; any failure gets one answer. */
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: `Use the 6-digit code and a password of ${PASSWORD_MIN}-${PASSWORD_MAX} characters.` }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  try {
    const result = await setPortalPasswordWithCode({ ...parsed.data, ip });
    if (!result) return NextResponse.json({ error: "That code did not work. Check it, or ask for a new one." }, { status: 400 });
    // Safe to reveal: the emailed code just proved they own this account. It can differ from
    // the address the code went to when their login was created with another email.
    return NextResponse.json({ ok: true, signInEmail: result.signInEmail }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[POST /api/portal/password/set]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
