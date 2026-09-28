"use client";

import * as React from "react";
import { LuCircleCheck, LuCircleX, LuClock, LuLoaderCircle, LuRotateCcw, LuTimerOff, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import type { ChapterCardView } from "@/lib/generation/progress-events";
import { cn } from "@/lib/utils";
import { ProgressBar } from "./ProgressBar";

const CHIP = {
  pending: { label: "Pending", icon: LuClock, className: "text-muted-foreground" },
  generating: { label: "Generating", icon: LuLoaderCircle, className: "text-primary" },
  complete: { label: "Complete", icon: LuCircleCheck, className: "text-success" },
  failed: { label: "Failed", icon: LuCircleX, className: "text-danger" },
  stalled: { label: "Stalled", icon: LuTimerOff, className: "text-danger" },
} as const;

const SURFACE = {
  pending: "bg-zone",
  generating: "bg-card shadow-soft",
  complete: "bg-success/10",
  failed: "bg-danger/10",
  stalled: "bg-danger/10",
} as const;

export function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m} min ${s} s` : `${s} s`;
}

/**
 * One chapter: its status, a live progress bar and the detail that matters for
 * that status. A chapter that failed or stalled (D9) is restarted only by the
 * founder or the COO: `retryEndpoint` gives them the button; it asks first,
 * because a restart spends credits.
 */
export function ChapterStatusCard({ card, retryEndpoint, onRestarted }: { card: ChapterCardView; retryEndpoint?: string; onRestarted?: (chapter: number) => void }) {
  const [asking, setAsking] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const chip = CHIP[card.status];
  const Icon = chip.icon;
  const stopped = card.status === "failed" || card.status === "stalled";
  const detail =
    card.status === "generating"
      ? `${card.stage === "outlining" ? "Planning the chapter" : card.partCount ? `Writing part ${card.part} of ${card.partCount}` : "Writing"}${card.retryingAttempt ? ` · retrying (attempt ${card.retryingAttempt})` : ""}`
      : card.status === "complete"
        ? [card.words ? `${card.words.toLocaleString("en-GB")} words` : null, formatDuration(card.durationSeconds)].filter(Boolean).join(" · ") || "Written"
        : stopped
          ? card.error
          : card.waitingFor;
  const action = card.status === "stalled" ? "Restart chapter" : "Try again";

  React.useEffect(() => {
    if (!stopped) {
      setAsking(false);
      setError(null);
    }
  }, [stopped]);

  async function restart() {
    if (!retryEndpoint) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(retryEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapter: card.chapterNum }) });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? "That didn't work. Try again.");
        return;
      }
      setAsking(false);
      onRestarted?.(card.chapterNum);
    } catch {
      setError("Could not reach EduCraft. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={cn("space-y-3 rounded-2xl p-4", SURFACE[card.status])} data-chapter={card.chapterNum} data-status={card.status}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="meta-label">Chapter {card.chapterNum}</p>
          <p className="truncate text-[15px] font-semibold text-foreground">{card.title}</p>
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs font-medium", chip.className)}>
          <Icon className={cn("size-4", card.status === "generating" && "animate-spin motion-reduce:animate-none")} aria-hidden />
          {chip.label}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <ProgressBar value={card.progressPercent} label={`Chapter ${card.chapterNum} progress`} tone={card.status === "complete" ? "success" : stopped ? "danger" : "primary"} />
        <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">{card.progressPercent}%</span>
      </div>
      {detail ? <p className={cn("break-words text-sm", stopped ? "text-danger" : "text-muted-foreground")}>{detail}</p> : null}
      {stopped && !retryEndpoint ? <p className="text-xs text-muted-foreground">The COO decides whether to {card.status === "stalled" ? "restart it" : "try it again"}.</p> : null}

      {stopped && retryEndpoint ? (
        <div className="space-y-2">
          {error ? (
            <p className="flex items-start gap-2 text-sm text-danger" role="alert">
              <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}
          {asking ? (
            <div className="space-y-2" role="group" aria-label="Confirm">
              <p className="max-w-prose text-sm text-foreground">
                Chapter {card.chapterNum} carries on from the part that stopped; the parts already written are kept. It starts at once and spends credits.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" onClick={() => void restart()} disabled={busy} className="h-12 w-full sm:h-10 sm:w-auto" data-chapter-restart-confirm>
                  {busy ? <LuLoaderCircle className="animate-spin" aria-hidden /> : <LuRotateCcw aria-hidden />}
                  {action}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setAsking(false)} disabled={busy} className="h-12 w-full sm:h-10 sm:w-auto">
                  Not now
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => setAsking(true)} className="h-12 w-full sm:h-10 sm:w-auto" data-chapter-restart>
              <LuRotateCcw aria-hidden />
              {action}
            </Button>
          )}
        </div>
      ) : null}
    </li>
  );
}
