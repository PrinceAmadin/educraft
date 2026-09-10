import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listForUser } from "@/lib/services/notifications";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 10;

  try {
    const data = await listForUser(session.user.id, limit);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[GET /api/notifications]", error);
    return NextResponse.json({ error: "Could not load notifications" }, { status: 500 });
  }
}
