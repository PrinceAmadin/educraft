import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markRead } from "@/lib/services/notifications";

export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await markRead(params.id, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PATCH /api/notifications/[id]/read]", error);
    return NextResponse.json({ error: "Could not update notification" }, { status: 500 });
  }
}
