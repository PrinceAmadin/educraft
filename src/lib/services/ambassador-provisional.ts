import { db } from "@/lib/db";
import { notifyGrowth } from "@/lib/services/notifications";
import type { SendFn } from "@/lib/services/ambassador-weekly-report";

/**
 * The provisional-slot sweep — silent, non-destructive (Oct 2026, HOG's call).
 *
 * A new ambassador still has a 30-day window to bring their first confirmed
 * order, but NOTHING happens automatically any more: the ambassador never sees
 * a countdown, their status is never changed and their slot is never released.
 * When the window passes with no confirmed order, this simply reports the new
 * ambassador to the Head of Growth ONCE, and the HOG decides whether to keep,
 * pause or remove them. Every fate of an ambassador is a human decision.
 *
 * `provisionalReviewNotifiedAt` makes the report idempotent: each new ambassador
 * is flagged (atomically) and reported exactly once, even if the sweep runs
 * again or two runs overlap. A confirmed order sets `activatedAt` elsewhere, so
 * an ambassador who converts before the window passes is never reported.
 */

export interface ProvisionalSweepResult {
  day: string;
  /** New ambassadors reported to the HOG this run. */
  flagged: number;
  failed: number;
  failures: { ambassadorId: string; error: string }[];
  names: string[];
  dryRun: boolean;
}

const selection = {
  id: true,
  ambassadorId: true,
  fullName: true,
} as const;

const dayKey = (now: Date) => now.toISOString().slice(0, 10);

export async function runProvisionalSweep(opts: {
  /** Accepted for the cron route's call signature; no email is sent any more. */
  send?: SendFn;
  siteUrl?: string;
  dry?: boolean;
  force?: boolean;
  now?: Date;
}): Promise<ProvisionalSweepResult> {
  const now = opts.now ?? new Date();
  const day = dayKey(now);

  // New ambassadors whose 30-day window has passed with no confirmed order and
  // who have not been reported yet.
  const toFlag = await db.ambassador.findMany({
    where: {
      activatedAt: null,
      provisionalUntil: { lte: now },
      status: "Active",
      provisionalReviewNotifiedAt: null,
    },
    select: selection,
  });

  const base: ProvisionalSweepResult = {
    day,
    flagged: toFlag.length,
    failed: 0,
    failures: [],
    names: toFlag.map((a) => a.fullName),
    dryRun: Boolean(opts.dry),
  };

  if (opts.dry) return base;
  if (toFlag.length === 0) return base;

  const fail = (id: string, err: unknown) => {
    base.failed += 1;
    base.failures.push({ ambassadorId: id, error: err instanceof Error ? err.message : String(err) });
  };

  // Claim each one atomically: only the run that flips the flag reports it, so
  // the HOG hears about each new ambassador exactly once.
  const reported: string[] = [];
  for (const a of toFlag) {
    try {
      const claimed = await db.ambassador.updateMany({
        where: { id: a.id, provisionalReviewNotifiedAt: null },
        data: { provisionalReviewNotifiedAt: now },
      });
      if (claimed.count === 1) reported.push(a.fullName);
    } catch (err) {
      fail(a.ambassadorId, err);
    }
  }

  if (reported.length > 0) {
    await notifyGrowth({
      title: `${reported.length} new ambassador${reported.length === 1 ? "" : "s"} brought no client in 30 days`,
      message: `${reported.join(", ")} — their first 30 days have passed with no confirmed order. Nothing has changed automatically: review each one and decide whether to keep, pause or remove them.`,
      type: "info",
      link: "/admin/ambassadors/list?newNoClient=1",
    });
  }

  return { ...base, flagged: reported.length, names: reported };
}
