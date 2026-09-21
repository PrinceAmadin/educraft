import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const schema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
});

/** Register this device for the signed-in user. Re-posting the same endpoint re-links it to whoever is signed in now. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });

  const { endpoint, keys } = parsed.data;
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

  try {
    await db.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: session.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
      update: { userId: session.user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent, lastUsedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/push/subscribe]", error);
    return NextResponse.json({ error: "Could not save subscription" }, { status: 500 });
  }
}
