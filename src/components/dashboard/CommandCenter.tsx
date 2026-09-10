"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatsCard, StatsCardSkeleton } from "@/components/dashboard/StatsCard";
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
        message:
          error instanceof Error ? error.message : "Could not load dashboard data.",
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
      <Card>
        <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="rounded-lg bg-danger/12 p-2 text-danger">
            <IconError className="size-5" aria-hidden />
          </span>
          <p className="text-sm font-medium text-foreground">Dashboard could not load</p>
          <p className="max-w-[42ch] text-xs text-muted-foreground">{state.message}</p>
          <Button variant="outline" size="sm" className="mt-1" onClick={() => void load()}>
            <IconRefresh className="size-4" aria-hidden />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { stats, pipeline, activity, actions, generatedAt } = state.data;
  const { revenueThisMonth: revenue, pendingPayouts: payouts, atRisk } = stats;

  const revenueDetail =
    revenue.deltaPercent === null
      ? revenue.amount > 0
        ? "First month on record"
        : "No confirmed inflow yet"
      : `${revenue.deltaPercent >= 0 ? "+" : ""}${revenue.deltaPercent.toFixed(
          0
        )}% vs last month`;

  const payoutDetail =
    payouts.amount > 0
      ? `${payouts.workerCount} worker${payouts.workerCount === 1 ? "" : "s"}, ${
          payouts.ambassadorCount
        } ambassador${payouts.ambassadorCount === 1 ? "" : "s"}`
      : "Nothing owed out";

  return (
    <motion.div variants={CONTAINER} initial="hidden" animate="show" className="space-y-4 sm:space-y-5">
      {/* Stats — 2-up on phones, 4-up from lg */}
      <motion.div variants={ITEM} className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatsCard
          label="Active Projects"
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
          label="Revenue (Month)"
          value={formatNaira(revenue.amount, { compact: true })}
          detail={revenueDetail}
          detailTone={
            revenue.deltaPercent === null
              ? "muted"
              : revenue.deltaPercent >= 0
                ? "success"
                : "danger"
          }
          icon={IconRevenue}
          tone="success"
          href="/admin/finance"
        />
        <StatsCard
          label="Pending Payouts"
          value={formatNaira(payouts.amount, { compact: true })}
          detail={payoutDetail}
          icon={IconPayouts}
          tone="gold"
          href="/admin/finance?tab=payouts"
        />
        <StatsCard
          label="At-Risk Projects"
          value={String(atRisk.count)}
          detail={
            atRisk.overdueCount > 0
              ? `${atRisk.overdueCount} already overdue`
              : "Deadline inside 3 days"
          }
          detailTone={atRisk.overdueCount > 0 ? "danger" : "muted"}
          icon={IconAtRisk}
          tone={atRisk.count > 0 ? "danger" : "primary"}
          href="/admin/projects?flag=at-risk"
        />
      </motion.div>

      <motion.div variants={ITEM}>
        <PipelineBar segments={pipeline} />
      </motion.div>

      <motion.div variants={ITEM} className="grid gap-4 lg:grid-cols-2">
        <ActivityFeed entries={activity} />
        <ActionRequired actions={actions} />
      </motion.div>

      <motion.div
        variants={ITEM}
        className="flex items-center justify-between gap-3 pt-1 text-xs text-muted-foreground"
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
    <div className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatsCardSkeleton key={i} />
        ))}
      </div>
      <PipelineBarSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        <ActivityFeedSkeleton />
        <ActionRequiredSkeleton />
      </div>
    </div>
  );
}
