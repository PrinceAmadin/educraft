"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceHeader } from "@/components/ui/surface";
import { IconEmpty, IconTransition } from "@/lib/icons";
import { STATUS_META } from "@/lib/status";
import { cn, timeAgo } from "@/lib/utils";
import type { ActivityEntry } from "@/types/dashboard";

/** Recent status changes — a quiet list on the page, newest first. */
export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  return (
    <section aria-labelledby="activity-heading" className="min-w-0">
      <SurfaceHeader title={<span id="activity-heading">Recent activity</span>} />

      {entries.length === 0 ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl bg-zone px-6 py-10 text-center">
          <IconEmpty className="size-5 text-subtle" aria-hidden />
          <p className="text-sm font-medium text-foreground">No activity yet</p>
          <p className="max-w-[36ch] text-[13px] text-muted-foreground">
            Every status change on a project shows up here, newest first.
          </p>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-border/70">
          {entries.map((entry) => {
            const to = STATUS_META[entry.toStatus];
            const from = STATUS_META[entry.fromStatus];

            return (
              <li key={entry.id}>
                <Link
                  href={`/admin/projects/${entry.projectDbId}`}
                  className={cn(
                    "-mx-2 flex min-h-12 items-start gap-3 rounded-lg px-2 py-3",
                    "transition-colors duration-fast hover:bg-zone",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      entry.toStatus === "DELIVERED" || entry.toStatus === "COMPLETED"
                        ? "bg-success"
                        : "bg-primary"
                    )}
                    aria-hidden
                  />

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-sm text-foreground">{entry.projectCode}</span>
                      <IconTransition className="size-3 text-subtle" aria-hidden />
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                          to.badge
                        )}
                      >
                        {to.label}
                      </span>
                    </span>

                    <span className="mt-1 block text-[13px] text-muted-foreground">
                      from {from.label}
                      {entry.actor ? ` · ${entry.actor}` : ""}
                    </span>
                  </span>

                  <span className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-subtle">
                    {timeAgo(entry.createdAt)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function ActivityFeedSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-32" />
      <ul className="mt-3 divide-y divide-border/70">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="flex items-start gap-3 py-3">
            <Skeleton className="mt-1 size-2 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-3 w-12 shrink-0" />
          </li>
        ))}
      </ul>
    </div>
  );
}
