"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { FinancePayload } from "@/lib/command-center/types";
import { AiCostTracker, AiCostTrackerSkeleton } from "./AiCostTracker";
import { BucketPulse, BucketPulseSkeleton } from "./BucketPulse";
import { PayoutStatus, PayoutStatusSkeleton } from "./PayoutStatus";
import { RevenuePosition, RevenuePositionSkeleton } from "./RevenuePosition";

// The old Command Center's stagger: sections rise in one after another,
// 50 ms apart, on a quick spring. Skipped entirely under reduced motion.
const CONTAINER = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const ITEM = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 30 } },
};

/**
 * Financial pulse tab (Phase 5): this month's revenue position as a ledger,
 * the four buckets with their trend, then payout status and the AI cost
 * tracker side by side from lg. Read-only — every figure links into the
 * Finance Platform, where the acts live. No charts here, so the sections
 * are plain markup.
 */
export function FinanceTab({ data }: { data: FinancePayload }) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      variants={CONTAINER}
      initial={reduced ? false : "hidden"}
      animate="show"
      className="space-y-10 sm:space-y-12"
    >
      <motion.div variants={ITEM}>
        <RevenuePosition position={data.revenuePosition} monthLabel={data.monthLabel} />
      </motion.div>

      <motion.div variants={ITEM}>
        <BucketPulse buckets={data.buckets} monthLabel={data.monthLabel} />
      </motion.div>

      <motion.div variants={ITEM} className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <PayoutStatus
          status={data.payoutStatus}
          month={data.month}
          monthLabel={data.monthLabel}
          financeHref={data.links.finance}
        />
        <AiCostTracker usage={data.aiUsage} monthLabel={data.monthLabel} href={data.links.aiUsage} />
      </motion.div>
    </motion.div>
  );
}

export function FinanceTabSkeleton() {
  return (
    <div className="space-y-10 sm:space-y-12" aria-busy="true">
      <RevenuePositionSkeleton />
      <BucketPulseSkeleton />
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <PayoutStatusSkeleton />
        <AiCostTrackerSkeleton />
      </div>
    </div>
  );
}
