import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { watDayStart } from "@/lib/click-tracking/peak-hours";

/**
 * The ambassador leaderboard, ranked by unique link clicks. Ported from the
 * idea in Traqly's leaderboard (group ClickEvent by owner, count UNIQUE
 * visitors for today / this week / all time), rebuilt for ambassadors.
 *
 * What counts: quality UNIQUE, real clicks only (no bots, test clicks or
 * archived/reset clicks), tracked since Phase 1. The old Redis counter is NOT
 * included.
 *
 * This board is visible to EVERY ambassador, so it carries clicks only. Orders
 * and conversion are business data and are deliberately NOT part of this
 * service; they belong in the admin/management views.
 *
 * The whole ranking is cached for 5 minutes per period. Nothing in the cached
 * value is specific to the viewer, so it is safe to share; the page adds the
 * "You" highlight afterwards.
 */

export type LeaderboardPeriod = "daily" | "weekly" | "all";

export const LEADERBOARD_CACHE_SECONDS = 300;
const DAY_MS = 86_400_000;

export interface LeaderboardEntry {
  rank: number;
  ambassadorId: string;
  name: string;
  school: string | null;
  slotCode: string | null;
  /** Unique clicks in the selected period. */
  clicks: number;
}

export interface LeaderboardData {
  period: LeaderboardPeriod;
  entries: LeaderboardEntry[];
  /** ISO time the ranking was computed (it can be up to 5 minutes old). */
  generatedAt: string;
}

function periodStart(period: LeaderboardPeriod): Date | null {
  const today = watDayStart();
  if (period === "daily") return today;
  if (period === "weekly") return new Date(today.getTime() - 6 * DAY_MS);
  return null;
}

async function computeLeaderboard(period: LeaderboardPeriod): Promise<LeaderboardData> {
  const since = periodStart(period);
  const real = { isTestClick: false, archivedAt: null, quality: "UNIQUE" as const, ambassadorId: { not: null } };

  const [ambassadors, periodClicks] = await Promise.all([
    db.ambassador.findMany({
      where: { status: "Active" },
      select: { id: true, fullName: true, legacySlotId: true, university: { select: { abbreviation: true } } },
    }),
    db.clickEvent.groupBy({
      by: ["ambassadorId"],
      where: since ? { ...real, timestamp: { gte: since } } : real,
      _count: { _all: true },
    }),
  ]);

  const clicksBy = new Map(periodClicks.map((g) => [g.ambassadorId!, g._count._all]));

  const rows = ambassadors
    .map((a) => ({
      ambassadorId: a.id,
      name: a.fullName,
      school: a.university?.abbreviation ?? null,
      slotCode: a.legacySlotId,
      clicks: clicksBy.get(a.id) ?? 0,
    }))
    // Most clicks first, ties by name. Zero-click ambassadors naturally land
    // at the bottom, sorted by name.
    .sort((x, y) => y.clicks - x.clicks || x.name.localeCompare(y.name));

  return {
    period,
    entries: rows.map((r, i) => ({ rank: i + 1, ...r })),
    generatedAt: new Date().toISOString(),
  };
}

/** 5-minute shared cache per period. */
export const getClickLeaderboard = (period: LeaderboardPeriod) =>
  unstable_cache(() => computeLeaderboard(period), ["ambassador-click-leaderboard", period], {
    revalidate: LEADERBOARD_CACHE_SECONDS,
  })();
