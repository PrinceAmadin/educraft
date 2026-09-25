"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { GrowthPayload } from "@/lib/command-center/types";
import { ConversionTrendChart, ConversionTrendChartSkeleton } from "./ConversionTrendChart";
import { Funnel, FunnelSkeleton } from "./Funnel";
import { TierDistributionChart, TierDistributionChartSkeleton } from "./TierDistributionChart";
import { TopAmbassadors, TopAmbassadorsSkeleton } from "./TopAmbassadors";

// The old Command Center's stagger: sections rise in one after another,
// 50 ms apart, on a quick spring. Skipped entirely under reduced motion.
const CONTAINER = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const ITEM = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 30 } },
};

/**
 * Growth engine tab (Phase 5): the month's funnel first (referrals, the
 * ambassador base, schools), then the tier distribution beside this month's
 * top ambassadors, then twelve weeks of conversions. Page-level sections
 * separated by spacing — no containers. Charts mount only while this tab is
 * open (the shell renders one panel), so their ResponsiveContainers measure.
 * Signals this branch cannot track yet are named in one footnote line.
 */
export function GrowthTab({ data }: { data: GrowthPayload }) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      variants={CONTAINER}
      initial={reduced ? false : "hidden"}
      animate="show"
      className="space-y-10 sm:space-y-12"
    >
      <motion.div variants={ITEM}>
        <Funnel data={data} />
      </motion.div>

      <motion.div variants={ITEM} className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <TierDistributionChart data={data.tierDistribution} />
        <TopAmbassadors rows={data.topAmbassadors} links={data.links} monthLabel={data.monthLabel} />
      </motion.div>

      <motion.div variants={ITEM}>
        <ConversionTrendChart data={data.conversionTrend} />
      </motion.div>

      {data.pending.length > 0 ? (
        <motion.p variants={ITEM} className="text-[13px] text-muted-foreground">
          Not yet on this dashboard: {data.pending.join(", ")}.
        </motion.p>
      ) : null}
    </motion.div>
  );
}

export function GrowthTabSkeleton() {
  return (
    <div className="space-y-10 sm:space-y-12" aria-busy="true">
      <FunnelSkeleton />
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <TierDistributionChartSkeleton />
        <TopAmbassadorsSkeleton />
      </div>
      <ConversionTrendChartSkeleton />
    </div>
  );
}
