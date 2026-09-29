import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { homeForRole } from "@/lib/rbac";
import { sameExecPerson } from "@/lib/services/executives";
import { newSwapPayload, signSwapToken } from "@/lib/auth-switch";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/switch-account/token
 *
 * The current session issues a short-lived HMAC-signed token that the
 * `account-switch` credentials provider swaps to. The only pair allowed is
 * two logins that belong to the same person per `ExecProfile.otherEmails`
 * — every other pair is 403.
 */

const bodySchema = z.object({ toEmail: z.string().trim().min(1).max(160).email() });

// Soft cap: no more than 20 tokens per session in 15 minutes. Guards against a
// runaway UI bug, not an attacker (same-person switch is not a lateral move).
const RATE_WINDOW_MS = 15 * 60_000;
const RATE_MAX = 20;
const rate = new Map<string, number[]>();
function tooMany(userId: string): boolean {
  const now = Date.now();
  const window = (rate.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (window.length >= RATE_MAX) {
    rate.set(userId, window);
    return true;
  }
  window.push(now);
  rate.set(userId, window);
  return false;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the email of the account to switch to" }, { status: 400 });
  }

  const toEmail = parsed.data.toEmail.toLowerCase();
  const fromUserId = session.user.id;

  if (tooMany(fromUserId)) {
    return NextResponse.json({ error: "Too many switches, wait a minute" }, { status: 429 });
  }

  const to = await db.user.findUnique({
    where: { email: toEmail },
    select: { id: true, email: true, role: true, isActive: true },
  });
  if (!to) return NextResponse.json({ error: "No account with that email" }, { status: 404 });
  if (!to.isActive) return NextResponse.json({ error: "That account is switched off" }, { status: 403 });
  if (to.id === fromUserId) return NextResponse.json({ error: "Already signed in as that account" }, { status: 400 });

  const linked = await sameExecPerson(fromUserId, to.id);
  if (!linked) return NextResponse.json({ error: "Those accounts are not linked" }, { status: 403 });

  const payload = newSwapPayload(fromUserId, to.id);
  const swapToken = signSwapToken(payload);
  return NextResponse.json({
    swapToken,
    fromUserId: payload.fromUserId,
    toUserId: payload.toUserId,
    exp: payload.exp,
    targetHome: homeForRole(to.role),
  });
}
