import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markAllRead } from "@/lib/services/notifications";

export async function PATCH() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const count = await markAllRead(session.user.id);
    return NextResponse.json({ count });
  } catch (error) {
    console.error("[PATCH /api/notifications/read-all]", error);
    return NextResponse.json({ error: "Could not update notifications" }, { status: 500 });
  }
}
