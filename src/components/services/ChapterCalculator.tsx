"use client";

import * as React from "react";
import { LuCheck } from "react-icons/lu";
import { CHAPTER_SHARES, chapterBreakdown } from "@/lib/chapter-pricing";
import { cn, formatNaira } from "@/lib/utils";

/**
 * Pick chapters, see the price worked out line by line.
 *
 * Each chapter is a fixed share of the full report's price, so the sum is
 * shown the way a student would check it by hand: "Chapter 3 · 30% of
 * ₦70,000 = ₦21,000". Controlled, so the public price list and the intake form
 * share it and always agree.
 */
export function ChapterCalculator({
  chapters,
  onChapters,
  withAnalysis,
  onWithAnalysis,
  basePrice,
  analysisAddon,
}: {
  chapters: number[];
  onChapters: (next: number[]) => void;
  withAnalysis: boolean;
  onWithAnalysis: (next: boolean) => void;
  /** Full report price without data analysis. */
  basePrice: number;
  /** What data analysis adds to the full report. */
  analysisAddon: number;
}) {
  const fullPrice = basePrice + (withAnalysis ? analysisAddon : 0);
  const { lines, total } = chapterBreakdown(fullPrice, chapters);

  const toggle = (n: number) =>
    onChapters(chapters.includes(n) ? chapters.filter((c) => c !== n) : [...chapters, n].sort((a, b) => a - b));

  return (
    <div className="space-y-6">
      {/* Report basis */}
      <fieldset>
        <legend className="meta-label mb-2">The full report it is priced from</legend>
        <div role="radiogroup" className="grid grid-cols-2 gap-2">
          {[
            { on: false, label: "Without data analysis", price: basePrice },
            { on: true, label: "With data analysis", price: basePrice + analysisAddon },
          ].map((o) => {
            const active = withAnalysis === o.on;
            return (
              <button
                key={String(o.on)}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onWithAnalysis(o.on)}
                className={cn(
                  "flex min-h-14 flex-col items-start justify-center rounded-xl px-3.5 py-2 text-left transition-colors",
                  active ? "bg-primary/10 ring-2 ring-primary" : "bg-zone ring-1 ring-inset ring-input-border hover:bg-elevated"
                )}
              >
                <span className="text-[13px] font-medium text-foreground">{o.label}</span>
                <span className="font-mono text-sm tabular-nums text-muted-foreground">{formatNaira(o.price)}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Chapters */}
      <fieldset>
        <legend className="meta-label mb-2">Chapters you need</legend>
        <ul className="divide-y divide-border/70">
          {CHAPTER_SHARES.map(({ chapter, percent }) => {
            const on = chapters.includes(chapter);
            return (
              <li key={chapter}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(chapter)}
                  className="flex min-h-14 w-full items-center gap-3 py-2 text-left"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md transition-colors",
                      on ? "bg-primary text-primary-foreground" : "bg-zone ring-1 ring-inset ring-input-border"
                    )}
                  >
                    {on ? <LuCheck className="size-4" /> : null}
                  </span>
                  <span className={cn("flex-1 text-[15px]", on ? "font-medium text-foreground" : "text-muted-foreground")}>
                    Chapter {chapter}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-subtle">{percent}%</span>
                  <span
                    className={cn(
                      "w-24 text-right font-mono text-sm font-medium tabular-nums",
                      on ? "text-foreground" : "text-subtle"
                    )}
                  >
                    {formatNaira(Math.round((fullPrice * percent) / 100))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {/* The sum, shown in full */}
      <div className="rounded-2xl bg-zone p-4 sm:p-5" aria-live="polite">
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Pick a chapter to see the price.</p>
        ) : (
          <>
            <ul className="space-y-1.5 text-sm">
              {lines.map((l) => (
                <li key={l.chapter} className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">
                    Chapter {l.chapter} <span className="font-mono tabular-nums">· {l.percent}% of {formatNaira(fullPrice)}</span>
                  </span>
                  <span className="font-mono font-medium tabular-nums text-foreground">{formatNaira(l.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-baseline justify-between gap-3 pt-3 shadow-[0_-1px_0_hsl(var(--border)/0.6)]">
              <span className="text-[15px] font-semibold text-foreground">Total</span>
              <span className="font-mono text-xl font-semibold tabular-nums text-foreground">{formatNaira(total)}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {lines.reduce((s, l) => s + l.percent, 0)}% of the full report.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
