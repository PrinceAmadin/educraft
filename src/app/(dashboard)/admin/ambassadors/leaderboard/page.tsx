import type { Metadata } from "next";
import Link from "next/link";
import { LuMedal, LuTrophy } from "react-icons/lu";
import { PageHeader } from "@/components/shared/PageHeader";
import { AmbassadorTabs } from "@/components/ambassadors/AmbassadorTabs";
import { TierBadge } from "@/components/ambassadors/TierBadge";
import { LeaderboardBadges } from "@/components/ambassadors/platform/LeaderboardBadges";
import { CopyTextButton, SpotlightPicker } from "@/components/ambassadors/platform/SpotlightPicker";
import { EmptyState } from "@/components/shared/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getLeaderboard, LEADERBOARD_VIEWS, weeklySpotlight, type LeaderboardView } from "@/lib/services/ambassador-platform/leaderboard";
import { weekRhythm } from "@/lib/services/ambassador-platform/content";
import { leaderboardMessage } from "@/lib/ambassadors/spotlight";
import { cn, formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Ambassador leaderboard" };
export const dynamic = "force-dynamic";

const MEDAL: Record<number, string> = { 1: "text-gold", 2: "text-slate-400 dark:text-slate-300", 3: "text-amber-700 dark:text-amber-500" };

/** Phase 3 Section 5 — the Leaderboard: four views ranked by conversions, badges, and the Friday spotlight. */
export default async function LeaderboardPage({ searchParams }: { searchParams: { view?: string } }) {
  const view: LeaderboardView = (["all", "month", "quarter", "week"] as const).find((v) => v === searchParams.view) ?? "month";
  const now = new Date();
  const [board, spotlight, rhythm, pendingApplications] = await Promise.all([getLeaderboard(view, now), weeklySpotlight(now), weekRhythm(now), db.ambassadorApplication.count({ where: { status: "PENDING" } })]);
  const friday = rhythm.days.find((d) => d.type === "FRIDAY_SPOTLIGHT");
  const message = leaderboardMessage(board.title.replace("Leaderboard — ", "EduCraft leaderboard — "), board.rows);

  return (
    <div className="space-y-7">
      <PageHeader title="Leaderboard" description="Who is bringing in the most paying clients, with the badges and the Friday spotlight for the community." />
      <AmbassadorTabs active="leaderboard" pendingApplications={pendingApplications} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Leaderboard views" className="no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-zone p-1">
          {LEADERBOARD_VIEWS.map((v) => (
            <Link key={v.key} href={`/admin/ambassadors/leaderboard?view=${v.key}`} scroll={false} aria-current={v.key === view ? "page" : undefined} className={cn("inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium transition-colors sm:px-4", v.key === view ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")}>
              {v.label}
            </Link>
          ))}
        </nav>
        <CopyTextButton text={message} label="Copy leaderboard message" />
      </div>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="board-heading" className="min-w-0 space-y-3">
          <div>
            <h2 id="board-heading" className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
              <LuTrophy className="size-4 text-gold" aria-hidden />
              {board.title}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {board.periodLabel} · <span className="font-mono">{board.totalConversions}</span> conversion{board.totalConversions === 1 ? "" : "s"}
              {board.unranked > 0 ? ` · ${board.unranked} ambassador${board.unranked === 1 ? "" : "s"} with none yet` : ""}. Earnings are the commission on these conversions, personal plus Core override.
            </p>
          </div>

          {board.rows.length === 0 ? (
            <EmptyState icon={LuTrophy} title="No conversions in this period yet" description="The first referral whose downpayment is confirmed takes the top spot." className="py-10" />
          ) : (
            <>
              <ol className="space-y-2 md:hidden">
                {board.rows.map((r) => (
                  <li key={r.id} className="surface flex gap-3 p-3.5">
                    <Rank rank={r.rank} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/admin/ambassadors/${r.id}`} className="min-w-0 truncate text-sm font-medium text-foreground hover:text-primary">
                          {r.fullName}
                        </Link>
                        <TierBadge tier={r.tier} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {r.school ?? "—"} · <span className="font-mono text-foreground">{r.conversions}</span> conv{r.conversions === 1 ? "" : "s"} · <span className="font-mono text-foreground">{formatNaira(r.earnings)}</span>
                      </p>
                      <LeaderboardBadges badges={r.badges} className="mt-2" />
                    </div>
                  </li>
                ))}
              </ol>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-14">Rank</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>School</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead className="text-right">Convs</TableHead>
                      <TableHead className="text-right">Earnings</TableHead>
                      <TableHead>Badge</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {board.rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Rank rank={r.rank} />
                        </TableCell>
                        <TableCell>
                          <Link href={`/admin/ambassadors/${r.id}`} className="text-sm font-medium text-foreground hover:text-primary">
                            {r.fullName}
                          </Link>
                          <div className="font-mono text-xs text-muted-foreground">{r.code}</div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.school ?? "—"}</TableCell>
                        <TableCell>
                          <TierBadge tier={r.tier} />
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{r.conversions}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(r.earnings)}</TableCell>
                        <TableCell>
                          <LeaderboardBadges badges={r.badges} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </section>

        <aside className="space-y-6">
          <SpotlightPicker topId={spotlight.top?.ambassadorId ?? null} candidates={spotlight.candidates} weekLabel={`Week of ${spotlight.weekLabel}`} logged={friday?.state === "DONE" && friday.postedAt ? { note: friday.note, postedAt: friday.postedAt } : null} />
        </aside>
      </div>
    </div>
  );
}

function Rank({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <span className="inline-flex w-10 shrink-0 items-center gap-1 font-mono text-sm font-semibold tabular-nums text-foreground" aria-label={`Rank ${rank}`}>
        <LuMedal className={cn("size-4", MEDAL[rank])} aria-hidden />
        {rank}
      </span>
    );
  }
  return <span className="inline-flex w-10 shrink-0 justify-center font-mono text-sm tabular-nums text-muted-foreground">{rank}</span>;
}
