"use client";

import * as React from "react";
import { LuMinus, LuPlus } from "react-icons/lu";
import { MAX_PAPERS, PUBLICATION_PRICING_TEXT, normalizePaperCount, publicationBreakdown } from "@/lib/publication-pricing";
import { cn, formatNaira } from "@/lib/utils";

/**
 * Choose how many papers to draw from one report, and where the report came
 * from, with the price worked out line by line.
 *
 * Each paper after the first costs less, because the report is only read once —
 * the client sees that laid out the way they would check it by hand. Controlled,
 * so the public price list and the intake form share it and always agree, the
 * same contract as `ChapterCalculator`.
 */
export function PaperStepper({
  papers,
  onPapers,
  outsideReport,
  onOutsideReport,
  basePrice,
  premiumPerPaper,
}: {
  papers: number;
  onPapers: (next: number) => void;
  /** True when the source is a report EduCraft did not write (the per-paper premium applies). */
  outsideReport: boolean;
  onOutsideReport: (next: boolean) => void;
  /** The first paper's price — the PUB service's own base price. */
  basePrice: number;
  /** What a report EduCraft did not write adds per paper (the variant's addon). */
  premiumPerPaper: number;
}) {
  const count = normalizePaperCount(papers);
  const premium = outsideReport ? premiumPerPaper : 0;
  const { lines, total } = publicationBreakdown(count, basePrice, premium);

  return (
    <div className="space-y-6">
      {/* Where the report came from */}
      <fieldset>
        <legend className="meta-label mb-2">Where the report comes from</legend>
        <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
          {[
            { outside: false, label: "EduCraft wrote this report", hint: "We work from it directly — no upload needed." },
            { outside: true, label: "I'll upload my own report", hint: "From somewhere else." },
          ].map((o) => {
            const active = outsideReport === o.outside;
            return (
              <button
                key={String(o.outside)}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onOutsideReport(o.outside)}
                className={cn(
                  "flex min-h-14 flex-col items-start justify-center rounded-xl px-3.5 py-2 text-left transition-colors",
                  active ? "bg-primary/10 ring-2 ring-primary" : "bg-zone ring-1 ring-inset ring-input-border hover:bg-elevated"
                )}
              >
                <span className="text-[13px] font-medium text-foreground">{o.label}</span>
                <span className="text-xs text-muted-foreground">{o.hint}</span>
              </button>
            );
          })}
        </div>
        {outsideReport ? (
          <p className="mt-2 text-xs text-muted-foreground">{PUBLICATION_PRICING_TEXT.outsideReportHint}</p>
        ) : null}
      </fieldset>

      {/* How many papers */}
      <fieldset>
        <legend className="meta-label mb-1">{PUBLICATION_PRICING_TEXT.paperCountLabel}</legend>
        <p className="mb-3 text-xs text-muted-foreground">{PUBLICATION_PRICING_TEXT.paperCountHint}</p>
        <div className="flex items-center gap-4">
          <StepButton
            label="One fewer paper"
            disabled={count <= 1}
            onClick={() => onPapers(Math.max(1, count - 1))}
          >
            <LuMinus className="size-5" />
          </StepButton>
          <span aria-live="polite" className="min-w-16 text-center">
            <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{count}</span>
            <span className="ml-1.5 text-sm text-muted-foreground">paper{count === 1 ? "" : "s"}</span>
          </span>
          <StepButton
            label="One more paper"
            disabled={count >= MAX_PAPERS}
            onClick={() => onPapers(Math.min(MAX_PAPERS, count + 1))}
          >
            <LuPlus className="size-5" />
          </StepButton>
        </div>
        {count >= MAX_PAPERS ? (
          <p className="mt-2 text-xs text-muted-foreground">
            For more than {MAX_PAPERS} papers, finish your order and we&apos;ll arrange the rest with you directly.
          </p>
        ) : null}
      </fieldset>

      {/* The sum, shown in full */}
      <div className="rounded-2xl bg-zone p-4 sm:p-5" aria-live="polite">
        <ul className="space-y-1.5 text-sm">
          {lines.map((l) => (
            <li key={l.paper} className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">
                Paper {l.paper}
                {l.percent < 100 ? <span className="font-mono tabular-nums"> · {l.percent}% of the first</span> : null}
              </span>
              <span className="font-mono font-medium tabular-nums text-foreground">{formatNaira(l.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-baseline justify-between gap-3 pt-3 shadow-[0_-1px_0_hsl(var(--border)/0.6)]">
          <span className="text-[15px] font-semibold text-foreground">Total</span>
          <span className="font-mono text-xl font-semibold tabular-nums text-foreground">{formatNaira(total)}</span>
        </div>
      </div>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-xl transition-colors",
        disabled
          ? "bg-zone text-subtle ring-1 ring-inset ring-input-border"
          : "bg-primary/10 text-primary ring-2 ring-primary hover:bg-primary/15"
      )}
    >
      {children}
    </button>
  );
}
