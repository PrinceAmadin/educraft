import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { resetClickCount } from "@/lib/services/ambassador-analytics";
import { LEADERBOARD_CACHE_TAG } from "@/lib/services/ambassador-leaderboard";

/**
 * POST /api/admin/ambassadors/[id]/analytics/reset
 *
 * Archives the ambassador's current clicks into History and starts a fresh
 * count. Nothing is deleted. Also refreshes the leaderboard immediately, since
 * a reset changes that ambassador's Daily/Weekly/All-time position.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const amb = await db.ambassador.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!amb) return NextResponse.json({ error: "Ambassador not found" }, { status: 404 });
    const result = await resetClickCount(params.id);
    revalidateTag(LEADERBOARD_CACHE_TAG);
    revalidatePath("/ambassador/leaderboard");
    return NextResponse.json(result);
  } catch (error) {
    return serverError("POST /api/admin/ambassadors/[id]/analytics/reset", error);
  }
}
