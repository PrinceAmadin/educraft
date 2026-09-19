import Link from "next/link";
import { LuCrown } from "react-icons/lu";
import { cn } from "@/lib/utils";
import type { LeaderboardEntry, LeaderboardPeriod } from "@/lib/services/ambassador-leaderboard";

const n = (v: number) => v.toLocaleString("en-NG");

export const PERIODS: { key: LeaderboardPeriod; label: string; blurb: string }[] = [
  { key: "daily", label: "Daily", blurb: "Unique clicks since midnight, Nigerian time" },
  { key: "weekly", label: "Weekly", blurb: "Unique clicks in the last 7 days" },
  { key: "all", label: "All time", blurb: "Unique clicks since detailed tracking began" },
];

export function parsePeriod(v: string | undefined): LeaderboardPeriod {
  return PERIODS.find((p) => p.key === v)?.key ?? "weekly";
}

export function PeriodTabs({ active }: { active: LeaderboardPeriod }) {
  return (
    <nav aria-label="Leaderboard period" className="inline-flex gap-1 rounded-xl bg-zone p-1">
      {PERIODS.map((p) => (
        <Link
          key={p.key}
          href={`/ambassador/leaderboard?period=${p.key}`}
          scroll={false}
          aria-current={p.key === active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium transition-colors sm:px-5",
            p.key === active ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

/** "just now", "3 minutes ago" */
export function ago(iso: string, now = Date.now()): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  return `${mins} minute${mins === 1 ? "" : "s"} ago`;
}

// ── Podium ───────────────────────────────────────────────────

/**
 * Top 3 as a podium: #1 in the middle and tallest, #2 left, #3 right (the
 * layout from Traqly's leaderboard, rebuilt as soft surfaces, no outlines).
 * Only ambassadors who actually have clicks stand on it.
 */
export function Podium({ top, meId }: { top: LeaderboardEntry[]; meId: string }) {
  if (top.length === 0) return null;
  // Visual order: 2nd, 1st, 3rd.
  const slots = [top[1], top[0], top[2]];
  const heights = ["h-16 sm:h-20", "h-24 sm:h-32", "h-10 sm:h-14"];
  return (
    <ol className="grid grid-cols-3 items-end gap-2 sm:gap-4" aria-label="Top three">
      {slots.map((e, i) => {
        if (!e) return <li key={i} aria-hidden />;
        const first = e.rank === 1;
        const me = e.ambassadorId === meId;
        return (
          <li key={e.ambassadorId} className="flex min-w-0 flex-col items-center text-center">
            {first ? <LuCrown className="mb-1 size-5 text-gold" aria-hidden /> : null}
            <p className={cn("w-full truncate text-[13px] font-semibold sm:text-[15px]", me ? "text-primary" : "text-foreground")}>
              {me ? "You" : e.name}
            </p>
            <p className="w-full truncate font-mono text-[11px] text-muted-foreground">
              {e.slotCode ? `EduCraftA-${e.slotCode}` : e.school ?? ""}
            </p>
            <p className={cn("mt-1 font-mono font-medium tabular-nums", first ? "text-2xl text-primary sm:text-3xl" : "text-xl text-foreground sm:text-2xl")}>
              {n(e.clicks)}
            </p>
            <p className="mb-2 text-[11px] text-muted-foreground">unique clicks</p>
            <div
              className={cn(
                "flex w-full items-start justify-center rounded-t-xl pt-2 font-mono text-lg font-semibold sm:text-2xl",
                heights[i],
                first ? "bg-primary/20 text-primary" : "bg-zone text-muted-foreground"
              )}
            >
              {e.rank}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
