import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  PRO_BONO_DEVICE_COOKIE_MAX_AGE,
  deviceCookieName,
  newDeviceSecret,
} from "@/lib/pro-bono";
import { claimInvite, inviteIdForToken } from "@/lib/services/probono";

/**
 * Public. Called by the link page's own JavaScript, never by a plain GET, so a
 * link-preview crawler (WhatsApp, Telegram) that only fetches the HTML cannot
 * lock the link to itself. The first real browser to get here owns the link.
 */
export async function POST(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const inviteId = await inviteIdForToken(params.token);
    if (!inviteId) return NextResponse.json({ status: "invalid" }, { status: 404 });

    const name = deviceCookieName(inviteId);
    const existing = cookies().get(name)?.value ?? null;
    const secret = existing ?? newDeviceSecret();

    const status = await claimInvite(params.token, secret);
    const res = NextResponse.json({ status });
    if (status === "claimed") {
      res.cookies.set(name, secret, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: PRO_BONO_DEVICE_COOKIE_MAX_AGE,
      });
    }
    return res;
  } catch (error) {
    console.error("[POST /api/probono/claim]", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
