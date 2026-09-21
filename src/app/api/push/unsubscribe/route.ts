import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const schema = z.object({ endpoint: z.string().url().max(2048) });

/** Forget this device — only ever the caller's own. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    await db.pushSubscription.deleteMany({
      where: { endpoint: parsed.data.endpoint, userId: session.user.id },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/push/unsubscribe]", error);
    return NextResponse.json({ error: "Could not remove subscription" }, { status: 500 });
  }
}
