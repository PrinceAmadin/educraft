"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_META } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { PipelineSegment } from "@/types/dashboard";

/**
 * The pipeline as one process rail — not eleven boxes.
 *
 * Stage names run along the top, counts sit beneath, and a single continuous
 * track runs under the whole thing. A stage holding work lights its stretch of
 * the rail in teal and its label in teal; empty stages stay quiet grey. The
 * share of a stage that is inside three days of its deadline is drawn in gold.
 *
 * Every stage is a link into the filtered projects list — a chart would put
 * that behind a canvas with no keyboard route in. On narrow screens the rail
 * scrolls sideways inside itself (the page never does), with the edges faded.
 */
export interface PipelineBarProps {
  segments: PipelineSegment[];
}

export function PipelineBar({ segments }: PipelineBarProps) {
  const reduced = useReducedMotion();
  const total = segments.reduce((sum, s) => sum + s.count, 0);

  return (
    <section aria-labelledby="pipeline-heading" className="rounded-2xl bg-zone px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="pipeline-heading" className="text-[15px] font-semibold text-foreground">
          Project pipeline
        </h2>
        <span className="font-mono text-[13px] tabular-nums text-muted-foreground">
          {total} in flow
        </span>
      </div>

      <div className="no-scrollbar -mx-4 mt-5 overflow-x-auto px-4 max-lg:mask-fade-x sm:-mx-6 sm:px-6">
        <ol className="flex min-w-[46rem] lg:min-w-0">
          {segments.map((segment, index) => {
            const meta = STATUS_META[segment.status];
            const live = segment.count > 0;
            const atRiskShare = live ? segment.atRisk / segment.count : 0;

            return (
              <li key={segment.status} className="min-w-0 flex-1">
                <Link
                  href={`/admin/projects?status=${segment.status}`}
                  aria-label={`${meta.label}: ${segment.count} project${segment.count === 1 ? "" : "s"}${
                    segment.atRisk > 0 ? `, ${segment.atRisk} at risk` : ""
                  }`}
                  className="group/stage flex flex-col rounded-lg px-1.5 pb-1 pt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      "truncate text-[12px] font-medium transition-colors",
                      live ? "text-primary" : "text-muted-foreground group-hover/stage:text-foreground"
                    )}
                  >
                    {meta.short}
                  </span>
                  <span className="mt-1 flex items-baseline gap-1">
                    <span
                      className={cn(
                        "font-mono text-lg font-medium leading-none tabular-nums",
                        live ? "text-foreground" : "text-subtle"
                      )}
                    >
                      {segment.count}
                    </span>
                    {segment.atRisk > 0 ? (
                      <span className="font-mono text-[11px] tabular-nums text-gold">
                        {segment.atRisk}!
                      </span>
                    ) : null}
                  </span>
                </Link>

                {/* This stage's stretch of the one rail. Adjacent stretches
                    touch, so the track reads as a single line. */}
                <span aria-hidden className="relative mt-2 block h-[3px] bg-border">
                  {live ? (
                    <motion.span
                      className="absolute inset-y-0 left-0 block w-full bg-primary"
                      initial={reduced ? false : { scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      style={{ originX: 0 }}
                      transition={{ type: "spring", stiffness: 220, damping: 30, delay: index * 0.03 }}
                    >
                      {atRiskShare > 0 ? (
                        <span
                          className="absolute inset-y-0 right-0 block bg-gold"
                          style={{ width: `${atRiskShare * 100}%` }}
                        />
                      ) : null}
                    </motion.span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {total === 0 ? (
        <p className="mt-4 text-[13px] text-muted-foreground">
          Nothing in the pipeline yet. Stages fill as projects come through intake.
        </p>
      ) : segments.some((s) => s.atRisk > 0) ? (
        <p className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground">
          <span aria-hidden className="h-[3px] w-4 bg-gold" />
          Gold marks work inside three days of its deadline.
        </p>
      ) : null}
    </section>
  );
}

export function PipelineBarSkeleton() {
  return (
    <div className="rounded-2xl bg-zone px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="mt-5 flex gap-3 overflow-hidden">
        {Array.from({ length: 11 }).map((_, i) => (
          <div key={i} className="min-w-[3.5rem] flex-1 space-y-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-5 w-6" />
            <Skeleton className="h-[3px] w-full rounded-none" />
          </div>
        ))}
      </div>
    </div>
  );
}
