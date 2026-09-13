"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { StatsCard, StatsCardSkeleton, STATS_GRID } from "@/components/dashboard/StatsCard";
import { PipelineBar, PipelineBarSkeleton } from "@/components/dashboard/PipelineBar";
import { ActivityFeed, ActivityFeedSkeleton } from "@/components/dashboard/ActivityFeed";
import { ActionRequired, ActionRequiredSkeleton } from "@/components/dashboard/ActionRequired";
import {
  IconActiveProjects,
  IconAtRisk,
  IconError,
  IconPayouts,
  IconRefresh,
  IconRevenue,
} from "@/lib/icons";
import { cn, formatNaira, timeAgo } from "@/lib/utils";
import type { DashboardSummary } from "@/types/dashboard";

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: DashboardSummary };

const CONTAINER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const ITEM = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 30 },
  },
};

/**
 * The Command Center, composed as zones rather than cards:
 *
 *   stats      on the page — numbers with breathing room
 *   pipeline   one rail, in a zone band
 *   actions    two quiet lists on the page
 *
 * The alternation of page and zone is the whole of the structure; nothing on
 * this screen draws a box.
 */
export function CommandCenter() {
  const [state, setState] = React.useState<LoadState>({ phase: "loading" });
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setState({ phase: "loading" });

    try {
      const res = await fetch("/api/dashboard/summary", { cache: "no-store" });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not load dashboard data.");
      }

      const data = (await res.json()) as DashboardSummary;
      setState({ phase: "ready", data });
    } catch (error) {
      setState({
        phase: "error",
        message: error instanceof Error ? error.message : "Could not load dashboard data.",
      });
    } finally {
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (state.phase === "loading") {
    return <CommandCenterSkeleton />;
  }

  if (state.phase === "error") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-zone px-6 py-14 text-center">
        <IconError className="size-5 text-danger" aria-hidden />
        <p className="text-sm font-medium text-foreground">The dashboard could not load</p>
        <p className="max-w-[42ch] text-[13px] text-muted-foreground">{state.message}</p>
        <Button variant="outline" size="sm" className="mt-1" onClick={() => void load()}>
          <IconRefresh className="size-4" aria-hidden />
          Try again
        </Button>
      </div>
    );
  }

  const { stats, pipeline, activity, actions, generatedAt } = state.data;
  const { revenueThisMonth: revenue, pendingPayouts: payouts, atRisk } = stats;

  const revenueDetail =
    revenue.deltaPercent === null
      ? revenue.amount > 0
        ? "First month on record"
        : "No confirmed inflow yet"
      : `${revenue.deltaPercent >= 0 ? "↑" : "↓"} ${Math.abs(revenue.deltaPercent).toFixed(0)}% vs last month`;

  const payoutDetail =
    payouts.amount > 0
      ? `${payouts.workerCount} worker${payouts.workerCount === 1 ? "" : "s"}, ${
          payouts.ambassadorCount
        } ambassador${payouts.ambassadorCount === 1 ? "" : "s"}`
      : "Nothing owed out";

  return (
    <motion.div variants={CONTAINER} initial="hidden" animate="show" className="space-y-10 sm:space-y-12">
      <motion.section variants={ITEM} aria-label="Key numbers" className={STATS_GRID}>
        <StatsCard
          label="Active projects"
          value={String(stats.activeProjects.count)}
          detail={
            stats.activeProjects.newToday > 0
              ? `+${stats.activeProjects.newToday} today`
              : "None added today"
          }
          detailTone={stats.activeProjects.newToday > 0 ? "success" : "muted"}
          icon={IconActiveProjects}
          tone="primary"
          href="/admin/projects"
        />
        <StatsCard
          label="Revenue (month)"
          value={formatNaira(revenue.amount, { compact: true })}
          detail={revenueDetail}
          detailTone={
            revenue.deltaPercent === null ? "muted" : revenue.deltaPercent >= 0 ? "success" : "danger"
          }
          icon={IconRevenue}
          tone="success"
          href="/admin/finance"
        />
        <StatsCard
          label="Pending payouts"
          value={formatNaira(payouts.amount, { compact: true })}
          detail={payoutDetail}
          icon={IconPayouts}
          tone="gold"
          href="/admin/finance?tab=payouts"
        />
        <StatsCard
          label="At-risk projects"
          value={String(atRisk.count)}
          detail={atRisk.overdueCount > 0 ? `${atRisk.overdueCount} already overdue` : "Deadline inside 3 days"}
          detailTone={atRisk.overdueCount > 0 ? "danger" : "muted"}
          icon={IconAtRisk}
          tone={atRisk.count > 0 ? "danger" : "primary"}
          href="/admin/projects?flag=at-risk"
        />
      </motion.section>

      <motion.div variants={ITEM}>
        <PipelineBar segments={pipeline} />
      </motion.div>

      <motion.div variants={ITEM} className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <ActionRequired actions={actions} />
        <ActivityFeed entries={activity} />
      </motion.div>

      <motion.div
        variants={ITEM}
        className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground"
      >
        <span>Updated {timeAgo(generatedAt)}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="min-h-12 sm:min-h-0"
        >
          <IconRefresh className={cn("size-4", refreshing && "animate-spin")} aria-hidden />
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </motion.div>
    </motion.div>
  );
}

export function CommandCenterSkeleton() {
  return (
    <div className="space-y-10 sm:space-y-12">
      <div className={STATS_GRID}>
        {Array.from({ length: 4 }).map((_, i) => (
          <StatsCardSkeleton key={i} />
        ))}
      </div>
      <PipelineBarSkeleton />
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <ActionRequiredSkeleton />
        <ActivityFeedSkeleton />
      </div>
    </div>
  );
}
