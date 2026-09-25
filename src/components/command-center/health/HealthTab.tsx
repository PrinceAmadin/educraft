"use client";

import { motion, useReducedMotion } from "framer-motion";
import { LuBanknote, LuPercent, LuTarget } from "react-icons/lu";
import { STATS_GRID } from "@/components/dashboard/StatsCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { HealthPayload } from "@/lib/command-center/types";
import { IconActiveProjects } from "@/lib/icons";
import { KpiCard, KpiCardSkeleton } from "./KpiCard";
import { RevenueTrendChart, RevenueTrendChartSkeleton } from "./RevenueTrendChart";
import { Scorecard, ScorecardSkeleton } from "./Scorecard";
import { Throughput, ThroughputSkeleton } from "./Throughput";

// The old Command Center's stagger: sections rise in one after another,
// 50 ms apart, on a quick spring. Skipped entirely under reduced motion.
const CONTAINER = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const ITEM = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 30 } },
};

/**
 * Business health tab (Phase 5): four KPIs with sparklines, the scorecard,
 * six months of revenue and margin, then throughput. Page-level sections
 * separated by space — no card wraps any of them.
 */
export function HealthTab({ data }: { data: HealthPayload }) {
  const reduced = useReducedMotion();
  const { kpis } = data;

  return (
    <motion.div
      variants={CONTAINER}
      initial={reduced ? false : "hidden"}
      animate="show"
      className="space-y-10 sm:space-y-12"
    >
      <motion.section variants={ITEM} aria-labelledby="cc-health-kpis" className="min-w-0">
        <h2 id="cc-health-kpis" className="text-[15px] font-semibold leading-tight text-foreground">
          {data.monthLabel}
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Operating month {data.operatingMonth} · each figure against last month
        </p>
        <div className={`mt-6 ${STATS_GRID}`}>
          <KpiCard label="Revenue this month" icon={LuBanknote} kpi={kpis.revenue} tone="success" />
          <KpiCard label="Active projects" icon={IconActiveProjects} kpi={kpis.activeProjects} />
          <KpiCard label="Gross margin" icon={LuPercent} kpi={kpis.grossMargin} tone="gold" />
          <KpiCard label="Annual goal progress" icon={LuTarget} kpi={kpis.goalProgress} />
        </div>
      </motion.section>

      <motion.div variants={ITEM} className="min-w-0">
        <Scorecard rows={data.scorecard} />
      </motion.div>

      <motion.div variants={ITEM} className="min-w-0">
        <RevenueTrendChart data={data.revenueTrend} />
      </motion.div>

      <motion.div variants={ITEM} className="min-w-0">
        <Throughput throughput={data.throughput} />
      </motion.div>
    </motion.div>
  );
}

export function HealthTabSkeleton() {
  return (
    <div className="space-y-10 sm:space-y-12" aria-busy="true">
      <div>
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-2 h-3 w-64 max-w-full" />
        <div className={`mt-6 ${STATS_GRID}`}>
          {Array.from({ length: 4 }, (_, i) => (
            <KpiCardSkeleton key={i} />
          ))}
        </div>
      </div>
      <ScorecardSkeleton />
      <RevenueTrendChartSkeleton />
      <ThroughputSkeleton />
    </div>
  );
}
