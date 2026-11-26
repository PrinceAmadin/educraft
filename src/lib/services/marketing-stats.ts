import { revalidateTag, unstable_cache } from "next/cache";
import { db } from "@/lib/db";

/**
 * The numbers on the public homepage.
 *
 * Every one of them is either computed from HQ's own rows or stated by the
 * founder in Settings under his own name. Nothing is written into a source
 * file, because a figure typed into code is a claim nobody can correct without
 * a deploy — which is how the homepage came to carry "95% on-time delivery"
 * and "4.5 average rating" when HQ held no delivery record and has never had a
 * rating system at all (both removed, 26 Nov 2026, the founder's call).
 *
 * Two kinds of figure, and the difference is deliberate:
 *
 *   LIVE    computed here, so it cannot go stale or be overstated.
 *   STATED  work that predates HQ. EduCraft delivered roughly a hundred
 *           projects a year before this system existed, and a database that
 *           only knows what was typed into it cannot see them. So the founder
 *           states that total and owns it; Settings shows him HQ's own count
 *           beside it, so the gap between the two is always visible.
 *
 * Every figure carries a floor. Below it the entry is dropped rather than
 * shown, because a true number too small to help is still worth leaving out —
 * and an empty band is honest where a padded one is not.
 */

export const MARKETING_STATS_TAG = "marketing-stats";

/**
 * Owned here, not in the settings registry, so settings.ts imports this module
 * and nothing imports back — the same shape as the HQ contact keys.
 */
export const MARKETING_KEYS = { projectsDelivered: "marketing_projects_delivered" } as const;

/** Flushed when the founder edits the stated figure, so the homepage moves at once. */
export function revalidateMarketingStats(): void {
  revalidateTag(MARKETING_STATS_TAG);
}

/**
 * Projects delivered as the homepage states it, or 0 when unset — in which
 * case the stat is left off rather than guessed.
 */
export async function getMarketingProjectsDelivered(): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: MARKETING_KEYS.projectsDelivered } });
  const value = Number(row?.value?.trim() ?? "");
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

export interface MarketingStat {
  /** The figure the counter animates to. */
  to: number;
  suffix?: string;
  label: string;
}

/** Fewer than this and the number says nothing useful, so it is left out. */
const AMBASSADOR_FLOOR = 10;
const UNIVERSITY_FLOOR = 3;

/** A failed read becomes a figure below its floor, so the stat is simply left out. */
const fallback =
  <T,>(label: string, value: T) =>
  (error: unknown): T => {
    console.error(`[marketing-stats] ${label} read failed:`, error instanceof Error ? error.message : error);
    return value;
  };

async function compute(): Promise<MarketingStat[]> {
  // Never throws. The homepage is prerendered at build time, so a read that
  // threw here would fail the whole deploy over a database blink — and at
  // request time it would take down the front page to hide a stat. Either way
  // the honest degraded state is the same one an under-floor figure gets: the
  // band drops the number rather than showing a wrong one.
  const [stated, ambassadors, universities] = await Promise.all([
    getMarketingProjectsDelivered().catch(fallback("stated projects", 0)),
    db.ambassador.count({ where: { status: "Active" } }).catch(fallback("ambassador count", 0)),
    db.ambassador
      .groupBy({ by: ["universityId"], where: { status: "Active" } })
      .then((rows) => rows.length)
      .catch(fallback("campus count", 0)),
  ]);

  const stats: MarketingStat[] = [];

  // Stated by the founder: HQ cannot see the work that predates it.
  if (stated > 0) stats.push({ to: stated, suffix: "+", label: "Projects delivered" });

  if (ambassadors >= AMBASSADOR_FLOOR) {
    stats.push({ to: ambassadors, label: "Campus representatives" });
  }

  // Universities where a representative is actually working — not the count of
  // universities in the table, which is every Nigerian university HQ knows of
  // and would be a lie.
  if (universities >= UNIVERSITY_FLOOR) {
    stats.push({ to: universities, label: "Universities reached" });
  }

  return stats;
}

/**
 * Cached for an hour: these move slowly, and the homepage is the most-hit page
 * on the site. Flushed when the founder edits the stated figure.
 */
export const getMarketingStats = unstable_cache(compute, ["marketing", MARKETING_STATS_TAG, "v1"], {
  tags: [MARKETING_STATS_TAG],
  revalidate: 3600,
});

/**
 * HQ's own count of delivered projects, for the hint beside the stated figure
 * in Settings. Pro bono work is excluded, as it is from every other business
 * figure — it is given away, so it is not a sales record.
 */
export function deliveredProjectCount(): Promise<number> {
  return db.project.count({
    where: { status: { in: ["DELIVERED", "COMPLETED"] }, isProBono: false },
  });
}
