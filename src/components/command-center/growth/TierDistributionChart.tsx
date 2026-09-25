"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_TOOLTIP_STYLE } from "@/components/finance/chart-style";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount, TIER_COLORS, TIER_LABELS, TIER_ORDER } from "@/lib/command-center/presentation";
import type { GrowthPayload, TierDistributionPoint, TierKey } from "@/lib/command-center/types";

/**
 * Ambassadors per tier at each of the last six month ends (Phase 5): one
 * stacked column per month, Bronze at the base up to Platinum, in the
 * TierBadge colour families so the chart matches the pills on every
 * ambassador page in both themes. A 2px card-coloured stroke is the surface
 * gap between segments. The legend is the identity channel; the "Now" line
 * under the chart labels the latest column outright, so the quiet silver
 * segment never has to be read from colour alone.
 */

const SERIES: Record<TierKey, keyof TierDistributionPoint> = {
  BRONZE: "bronze",
  SILVER: "silver",
  GOLD: "gold",
  PLATINUM: "platinum",
};

const AXIS_TICK = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

function total(p: TierDistributionPoint): number {
  return p.bronze + p.silver + p.gold + p.platinum;
}

export function TierDistributionChart({ data }: { data: GrowthPayload["tierDistribution"] }) {
  const points = data.points;
  const hasData = points.some((p) => total(p) > 0);
  const latest = points.length > 0 ? points[points.length - 1] : null;

  return (
    <section aria-labelledby="cc-growth-tiers" className="min-w-0">
      <div className="min-w-0">
        <h2 id="cc-growth-tiers" className="text-[15px] font-semibold leading-tight text-foreground">
          Tier distribution
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Ambassadors per tier at each month end, last 6 months
        </p>
      </div>

      <div className="mt-5 h-56 sm:h-64">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={32}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--zone))" }}
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number, name: string) => [formatCount(value), name]}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value: string) => <span className="text-muted-foreground">{value}</span>}
              />
              {TIER_ORDER.map((tier) => (
                <Bar
                  key={tier}
                  dataKey={SERIES[tier]}
                  name={TIER_LABELS[tier]}
                  stackId="tiers"
                  fill={TIER_COLORS[tier]}
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                  maxBarSize={24}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl bg-zone px-6 text-center text-sm text-muted-foreground">
            No ambassadors on the ladder yet
          </div>
        )}
      </div>

      {hasData && latest ? (
        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
          <li className="font-medium text-foreground">Now</li>
          {TIER_ORDER.map((tier) => (
            <li key={tier}>
              {TIER_LABELS[tier]}{" "}
              <span className="font-mono tabular-nums text-foreground">
                {formatCount(latest[SERIES[tier]] as number)}
              </span>
            </li>
          ))}
          <li>
            Total{" "}
            <span className="font-mono tabular-nums text-foreground">{formatCount(total(latest))}</span>
          </li>
        </ul>
      ) : null}

      <p className="mt-2 text-xs text-subtle">
        {data.basis === "referrals"
          ? "Each ambassador’s tier at month end, from the conversions they had by then: the rule that sets the tier on their record."
          : "Tiers reconstructed from conversions: the ladder applied to each ambassador’s paying clients at month end, not the tier stored on their record."}
      </p>
    </section>
  );
}

export function TierDistributionChartSkeleton() {
  return (
    <div className="min-w-0" aria-hidden>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-2 h-3 w-56" />
      <Skeleton className="mt-5 h-56 w-full rounded-2xl sm:h-64" />
      <Skeleton className="mt-3 h-3 w-64" />
    </div>
  );
}
