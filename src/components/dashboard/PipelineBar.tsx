"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_META } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { PipelineSegment } from "@/types/dashboard";

/**
 * The pipeline is rendered as links rather than a chart on purpose: every
 * segment is a navigation target into the filtered projects list, and a
 * Recharts bar would put that behind a canvas with no keyboard route in.
 *
 * Segments are teal; the portion of a stage that is inside three days of its
 * internal deadline (or already past it) is drawn in gold on top of the teal,
 * so a stage that is quietly running late reads at a glance.
 */
export interface PipelineBarProps {
  segments: PipelineSegment[];
}

export function PipelineBar({ segments }: PipelineBarProps) {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  const max = segments.reduce((m, s) => Math.max(m, s.count), 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 p-4 sm:p-5">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Project Pipeline
        </CardTitle>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {total} in flow
        </span>
      </CardHeader>

      <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
        {/* 2 columns at 375px, 3 on larger phones, all 11 in a row on desktop */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-11">
          {segments.map((segment, index) => {
            const meta = STATUS_META[segment.status];
            const fill = max > 0 ? Math.max(segment.count / max, segment.count > 0 ? 0.08 : 0) : 0;
            const atRiskFill = segment.count > 0 ? segment.atRisk / segment.count : 0;

            return (
              <motion.div
                key={segment.status}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 320,
                  damping: 30,
                  delay: index * 0.03,
                }}
              >
                <Link
                  href={`/admin/projects?status=${segment.status}`}
                  aria-label={`${meta.label}: ${segment.count} project${
                    segment.count === 1 ? "" : "s"
                  }${segment.atRisk > 0 ? `, ${segment.atRisk} at risk` : ""}`}
                  className={cn(
                    "group flex min-h-[76px] flex-col justify-between rounded-lg border border-border bg-elevated p-2.5",
                    "transition-colors duration-fast hover:border-primary/50",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  )}
                >
                  <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {meta.short}
                  </span>

                  <span className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "font-mono text-xl font-medium tabular-nums",
                        segment.count > 0 ? "text-foreground" : "text-subtle"
                      )}
                    >
                      {segment.count}
                    </span>
                    {segment.atRisk > 0 ? (
                      <span className="font-mono text-[11px] tabular-nums text-gold">
                        {segment.atRisk} at risk
                      </span>
                    ) : null}
                  </span>

                  {/* Load bar: teal mass, gold for the at-risk share of it */}
                  <span
                    className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-border"
                    aria-hidden
                  >
                    <motion.span
                      className="block h-full rounded-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${fill * 100}%` }}
                      transition={{ type: "spring", stiffness: 200, damping: 30 }}
                    >
                      {atRiskFill > 0 ? (
                        <span
                          className="block h-full rounded-full bg-gold"
                          style={{ width: `${atRiskFill * 100}%` }}
                        />
                      ) : null}
                    </motion.span>
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {total === 0 ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Nothing in the pipeline yet. Stages fill as projects come through intake.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function PipelineBarSkeleton() {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 p-4 sm:p-5">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-16" />
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-11">
          {Array.from({ length: 11 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-lg" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
