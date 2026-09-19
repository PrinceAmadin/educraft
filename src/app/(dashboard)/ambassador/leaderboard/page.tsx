import type { Metadata } from "next";
import { LuInbox, LuTrophy } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getAmbassadorByUserId } from "@/lib/services/ambassador-portal";
import { getClickLeaderboard } from "@/lib/services/ambassador-leaderboard";
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

export const metadata: Metadata = { title: "Leaderboard" };

/**
 * Click leaderboard. Every ambassador sees every other ambassador's name and
 * stats on purpose: the competition is the point. Contact details are never
 * part of the data.
 *
 * Deliberately NOT `dynamic = "force-dynamic"`: that also bypasses the
 * 5-minute ranking cache. The page is dynamic anyway (it reads the session).
 */
export default async function AmbassadorLeaderboardPage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const session = await auth();
  const ambassador = session?.user ? await getAmbassadorByUserId(session.user.id) : null;
  if (!ambassador) {
    return <EmptyState icon={LuInbox} title="No ambassador profile" description="Contact an admin." />;
  }

  const period = parsePeriod(searchParams.period);
  const { entries, generatedAt } = await getClickLeaderboard(period);

  // Only people with clicks stand on the podium; everyone else is in the list.
  const withClicks = entries.filter((e) => e.clicks > 0);
  const podium = withClicks.slice(0, 3);
  const rest = entries.slice(podium.length);
  const me = entries.find((e) => e.ambassadorId === ambassador.id) ?? null;
  const blurb = PERIODS.find((p) => p.key === period)!.blurb;

  return (
    <div className="space-y-8">
      <PageHeader title="Leaderboard" description={`${blurb}. Only unique visitors count.`} />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <PeriodTabs active={period} />
        <p className="text-xs text-muted-foreground">Updated {ago(generatedAt)}</p>
      </div>

      {me ? (
        <div className="flex items-center gap-4 rounded-2xl bg-primary/10 p-5">
          <span className="font-mono text-[2rem] font-medium leading-none tabular-nums text-primary">#{me.rank}</span>
          <div>
            <p className="text-[15px] font-medium text-foreground">Your position</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {me.clicks > 0
                ? `${me.clicks.toLocaleString("en-NG")} unique click${me.clicks === 1 ? "" : "s"} in this period`
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
        <Podium top={podium} meId={ambassador.id} />
      )}

      <RankedList entries={rest} meId={ambassador.id} podiumSize={podium.length} />
    </div>
  );
}
