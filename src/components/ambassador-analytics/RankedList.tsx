"use client";

import * as React from "react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LeaderboardEntry } from "@/lib/services/ambassador-leaderboard";

const n = (v: number) => v.toLocaleString("en-NG");
const COLS = "md:grid-cols-[3rem_minmax(0,1fr)_10rem_6rem]";

/** The board shows the top 10 (podium included); "See all" reveals the rest. */
export const TOP_COUNT = 10;

/**
 * Ranked list below the podium. Clicks only: orders and the order rate are private
 * to each ambassador and never appear here.
 *
 * `entries` are the people after the podium. The first `TOP_COUNT - podiumSize`
 * of them complete the top 10; the remainder sit behind "See all".
 */
export function RankedList({
  entries,
  meId,
  podiumSize,
}: {
  entries: LeaderboardEntry[];
  meId: string;
  podiumSize: number;
}) {
  const [showAll, setShowAll] = React.useState(false);
  if (entries.length === 0) return null;

  const initial = Math.max(0, TOP_COUNT - podiumSize);
  const hidden = Math.max(0, entries.length - initial);
  const shown = showAll ? entries : entries.slice(0, initial);
  const total = entries.length + podiumSize;

  return (
    <section aria-label="Full ranking">
      <div className={`hidden gap-3 border-b border-border/60 px-3 pb-2 md:grid ${COLS}`}>
        {["Rank", "Ambassador", "Slot", "Clicks"].map((h, i) => (
          <span key={h} className={cn("meta-label", i === 3 && "text-right")}>{h}</span>
        ))}
      </div>
      <ul>
        {shown.map((e) => {
          const me = e.ambassadorId === meId;
          return (
            <li
              key={e.ambassadorId}
              className={cn(
                "grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b border-border/40 px-3 py-3 last:border-0",
                COLS,
                me && "rounded-lg bg-primary/10"
              )}
            >
              <span className="font-mono text-sm tabular-nums text-muted-foreground">{e.rank}</span>
              <span className="min-w-0">
                <span className={cn("block truncate text-[15px]", me ? "font-semibold text-foreground" : "text-foreground")}>
                  {me ? "You" : e.name}
                  {e.school ? <span className="ml-2 text-[13px] font-normal text-muted-foreground">{e.school}</span> : null}
                </span>
              </span>
              <span className="hidden truncate font-mono text-xs text-muted-foreground md:block">
                {e.slotCode ? `EduCraftA-${e.slotCode}` : "No slot yet"}
              </span>
              <span className={cn("text-right font-mono text-[15px] font-medium tabular-nums", e.clicks === 0 ? "text-muted-foreground" : "text-foreground")}>
                {n(e.clicks)}
              </span>
            </li>
          );
        })}
      </ul>

      {hidden > 0 ? (
        <div className="mt-4 flex justify-center">
          <Button type="button" variant="outline" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
            {showAll ? (
              <>
                <LuChevronUp className="size-4" aria-hidden /> Show top {TOP_COUNT} only
              </>
            ) : (
              <>
                <LuChevronDown className="size-4" aria-hidden /> See all {n(total)} ambassadors
              </>
            )}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
