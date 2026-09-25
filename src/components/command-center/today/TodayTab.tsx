"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { TodayPayload } from "@/lib/command-center/types";
import { AlertsSection, AlertsSectionSkeleton } from "./AlertsSection";
import { FeedSection, FeedSectionSkeleton } from "./FeedSection";
import { TodayNumbers, TodayNumbersSkeleton } from "./TodayNumbers";

// The old Command Center's stagger: sections rise in one after another,
// 50 ms apart, on a quick spring. Skipped entirely under reduced motion.
const CONTAINER = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const ITEM = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 30 } },
};

/**
 * Today tab (Phase 5): alerts (only when there are any), then the activity
 * feed with "Today's numbers" beside it. From lg the numbers take an 18rem
 * right column; on phones they come first, above the feed, so the founder
 * reads the figures before scrolling a long list.
 */
export function TodayTab({ data }: { data: TodayPayload }) {
  const reduced = useReducedMotion();
  const hasAlerts = data.alerts.critical.length + data.alerts.attention.length > 0;

  return (
    <motion.div
      variants={CONTAINER}
      initial={reduced ? false : "hidden"}
      animate="show"
      className="space-y-10 sm:space-y-12"
    >
      {hasAlerts ? (
        <motion.div variants={ITEM}>
          <AlertsSection alerts={data.alerts} />
        </motion.div>
      ) : null}

      <motion.div
        variants={ITEM}
        className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12"
      >
        <div className="min-w-0 max-lg:order-last">
          <FeedSection feed={data.feed} pending={data.pending} dayLabel={data.dayLabel} />
        </div>
        <TodayNumbers numbers={data.todayNumbers} />
      </motion.div>
    </motion.div>
  );
}

export function TodayTabSkeleton() {
  return (
    <div className="space-y-10 sm:space-y-12" aria-busy="true">
      <AlertsSectionSkeleton />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12">
        <div className="min-w-0 max-lg:order-last">
          <FeedSectionSkeleton />
        </div>
        <TodayNumbersSkeleton />
      </div>
    </div>
  );
}
