"use client";

import { LuCircleCheck, LuCircleX, LuClock, LuLoaderCircle } from "react-icons/lu";
import type { ChapterCardView } from "@/lib/generation/progress-events";
import { cn } from "@/lib/utils";
import { ProgressBar } from "./ProgressBar";

const CHIP = {
  pending: { label: "Pending", icon: LuClock, className: "text-muted-foreground" },
  generating: { label: "Generating", icon: LuLoaderCircle, className: "text-primary" },
  complete: { label: "Complete", icon: LuCircleCheck, className: "text-success" },
  failed: { label: "Failed", icon: LuCircleX, className: "text-danger" },
} as const;

const SURFACE = {
  pending: "bg-zone",
  generating: "bg-card shadow-soft",
  complete: "bg-success/10",
  failed: "bg-danger/10",
} as const;

export function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m} min ${s} s` : `${s} s`;
}

/** One chapter: its status, a live progress bar and the detail that matters for that status. */
export function ChapterStatusCard({ card }: { card: ChapterCardView }) {
  const chip = CHIP[card.status];
  const Icon = chip.icon;
  const detail =
    card.status === "generating"
      ? `${card.stage === "outlining" ? "Planning the chapter" : card.partCount ? `Writing part ${card.part} of ${card.partCount}` : "Writing"}${card.retryingAttempt ? ` · retrying (attempt ${card.retryingAttempt})` : ""}`
      : card.status === "complete"
        ? [card.words ? `${card.words.toLocaleString("en-GB")} words` : null, formatDuration(card.durationSeconds)].filter(Boolean).join(" · ") || "Written"
        : card.status === "failed"
          ? card.error
          : card.waitingFor;

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
        <ProgressBar
          value={card.progressPercent}
          label={`Chapter ${card.chapterNum} progress`}
          tone={card.status === "complete" ? "success" : card.status === "failed" ? "danger" : "primary"}
        />
        <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">{card.progressPercent}%</span>
      </div>
      {detail ? <p className={cn("text-sm", card.status === "failed" ? "text-danger" : "text-muted-foreground")}>{detail}</p> : null}
      {card.status === "failed" ? <p className="text-xs text-muted-foreground">The COO decides whether to try it again.</p> : null}
    </li>
  );
}
