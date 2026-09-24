import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { getLeaderboard, weeklySpotlight, type LeaderboardView } from "@/lib/services/ambassador-platform/leaderboard";

const VIEWS: LeaderboardView[] = ["all", "month", "quarter", "week"];

/** The leaderboard for one view (`?view=all|month|quarter|week`, default month) plus this week's spotlight suggestion. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const view = VIEWS.find((v) => v === req.nextUrl.searchParams.get("view")) ?? "month";
  try {
    const now = new Date();
    const [board, spotlight] = await Promise.all([getLeaderboard(view, now), weeklySpotlight(now)]);
    return NextResponse.json({ ...board, spotlight });
  } catch (error) {
    return serverError("GET /api/admin/ambassadors/leaderboard", error);
  }
}
