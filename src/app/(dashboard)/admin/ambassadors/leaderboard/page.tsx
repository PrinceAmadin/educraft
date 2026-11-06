import type { Metadata } from "next";
import { LuTrophy } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { effectiveRole } from "@/lib/rbac";
import { getAmbassadorByUserId } from "@/lib/services/ambassador-portal";
import { getClickLeaderboard } from "@/lib/services/ambassador-leaderboard";
import { weeklySpotlight } from "@/lib/services/ambassador-platform/leaderboard";
import { weekRhythm } from "@/lib/services/ambassador-platform/content";
import { AmbassadorTabs } from "@/components/ambassadors/AmbassadorTabs";
import { SpotlightPicker } from "@/components/ambassadors/platform/SpotlightPicker";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  PERIODS,
  PeriodTabs,
  Podium,
  ago,
  parsePeriod,
} from "@/components/ambassador-analytics/LeaderboardParts";
import { RankedList } from "@/components/ambassador-analytics/RankedList";

export const metadata: Metadata = { title: "Ambassador leaderboard" };

/**
 * THE SAME BOARD THE AMBASSADORS SEE (founder, 6 Nov 2026). This page shows
 * the click leaderboard from /ambassador/leaderboard with the identical layout
 * and figures — Daily / Weekly / All time unique clicks, the podium, the top
 * 10 with "See all" — so what an executive reads here is exactly what every
 * ambassador is looking at. It replaced the Phase 3 conversions board, which
 * disagreed with the ambassadors' board (and sat empty while clicks moved).
 *
 * The COO may open this ONE page (its own row in rbac.ts); the rest of the
 * ambassador platform stays SUPER_ADMIN + HOG, so the platform tabs and the
 * Friday spotlight picker (the dashboard's rhythm panel links to #spotlight
 * here) render only for them.
 *
 * Deliberately NOT `dynamic = "force-dynamic"`: that bypasses the board's
 * 5-minute cache. The page is dynamic anyway (it reads the session).
 */
export default async function AdminLeaderboardPage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const session = await auth();
  const role = effectiveRole(session?.user?.role);
  const runsPlatform = role === "SUPER_ADMIN" || role === "HOG";

  const period = parsePeriod(searchParams.period);
  const now = new Date();
  const [{ entries, generatedAt }, me, platform] = await Promise.all([
    getClickLeaderboard(period),
    session?.user ? getAmbassadorByUserId(session.user.id) : Promise.resolve(null),
    runsPlatform
      ? Promise.all([weeklySpotlight(now), weekRhythm(now), db.ambassadorApplication.count({ where: { status: "PENDING" } })])
      : Promise.resolve(null),
  ]);

  // Only people with clicks stand on the podium; everyone else is in the list.
  const withClicks = entries.filter((e) => e.clicks > 0);
  const podium = withClicks.slice(0, 3);
  const rest = entries.slice(podium.length);
  // An executive with an ambassador record on this login (the HOG and COO) gets
  // the same "Your position" card an ambassador sees; anyone else just reads.
  const mine = me ? entries.find((e) => e.ambassadorId === me.id) ?? null : null;
  const meId = me?.id ?? "";
  const blurb = PERIODS.find((p) => p.key === period)!.blurb;
  const friday = platform ? platform[1].days.find((d) => d.type === "FRIDAY_SPOTLIGHT") : null;

  return (
    <div className="space-y-8">
      <PageHeader title="Leaderboard" description={`${blurb}. Only unique visitors count — the same board every ambassador sees.`} />
      {platform ? <AmbassadorTabs active="leaderboard" pendingApplications={platform[2]} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <PeriodTabs active={period} basePath="/admin/ambassadors/leaderboard" />
        <p className="text-xs text-muted-foreground">Updated {ago(generatedAt)}</p>
      </div>

      {mine ? (
        <div className="flex items-center gap-4 rounded-2xl bg-primary/10 p-5">
          <span className="font-mono text-[2rem] font-medium leading-none tabular-nums text-primary">#{mine.rank}</span>
          <div>
            <p className="text-[15px] font-medium text-foreground">Your position</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {mine.clicks > 0
                ? `${mine.clicks.toLocaleString("en-NG")} unique click${mine.clicks === 1 ? "" : "s"} in this period`
                : "No unique clicks in this period yet. Share your link to get on the board."}
            </p>
          </div>
        </div>
      ) : null}

      {withClicks.length === 0 ? (
        <EmptyState
          icon={LuTrophy}
          title="No clicks yet in this period"
          description="As soon as someone opens an ambassador link, the ranking starts here."
        />
      ) : (
        <Podium top={podium} meId={meId} />
      )}

      <RankedList entries={rest} meId={meId} podiumSize={podium.length} />

      {platform ? (
        <div className="max-w-xl">
          <SpotlightPicker
            topId={platform[0].top?.ambassadorId ?? null}
            candidates={platform[0].candidates}
            weekLabel={`Week of ${platform[0].weekLabel}`}
            logged={friday?.state === "DONE" && friday.postedAt ? { note: friday.note, postedAt: friday.postedAt } : null}
          />
        </div>
      ) : null}
    </div>
  );
}
