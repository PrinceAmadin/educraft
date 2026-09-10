"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { IconActivity, IconEmpty, IconTransition } from "@/lib/icons";
import { STATUS_META } from "@/lib/status";
import { cn, timeAgo } from "@/lib/utils";
import type { ActivityEntry } from "@/types/dashboard";

export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center gap-2 space-y-0 border-b border-border p-4 sm:p-5">
        <IconActivity className="size-4 text-muted-foreground" aria-hidden />
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recent Activity
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 p-0">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <IconEmpty className="size-6 text-subtle" aria-hidden />
            <p className="text-sm font-medium text-foreground">No activity yet</p>
            <p className="max-w-[36ch] text-xs text-muted-foreground">
              Every status change on a project shows up here, newest first.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((entry) => {
              const to = STATUS_META[entry.toStatus];
              const from = STATUS_META[entry.fromStatus];

              return (
                <li key={entry.id}>
                  <Link
                    href={`/admin/projects/${entry.projectDbId}`}
                    className={cn(
                      "flex min-h-12 items-start gap-3 px-4 py-3 sm:px-5",
                      "transition-colors duration-fast hover:bg-elevated",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1 size-2 shrink-0 rounded-full",
                        entry.toStatus === "DELIVERED" || entry.toStatus === "COMPLETED"
                          ? "bg-success"
                          : "bg-primary"
                      )}
                      aria-hidden
                    />

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-sm text-foreground">
                          {entry.projectCode}
                        </span>
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

                      <span className="mt-1 block text-xs text-muted-foreground">
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
      </CardContent>
    </Card>
  );
}

export function ActivityFeedSkeleton() {
  return (
    <Card>
      <CardHeader className="border-b border-border p-4 sm:p-5">
        <Skeleton className="h-4 w-36" />
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <Skeleton className="mt-1 size-2 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-3 w-12 shrink-0" />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
