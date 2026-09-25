"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_TOOLTIP_STYLE } from "@/components/finance/chart-style";
import { Skeleton } from "@/components/ui/skeleton";
import type { RevenueTrendPoint } from "@/lib/command-center/types";
import { formatNaira } from "@/lib/utils";

/**
 * Six months of revenue with the gross margin laid over it (Phase 5).
 *
 * Bars are confirmed revenue on the left axis; the line is the share
 * EduCraft kept (retained ÷ revenue) on a 0–100% right axis, so the founder
 * sees both "how much came in" and "how much of it stayed" in one glance.
 * Styling matches RevenuePayoutsChart — tokens only, so it holds in both
 * themes. Sits on the page: the chart is the content, not a card.
 */

const NAMES: Record<string, string> = { revenue: "Revenue", margin: "Gross margin" };

function seriesName(key: string): string {
  return NAMES[key] ?? key;
}

const AXIS_TICK = { fontSize: 11, fill: "hsl(var(--muted-foreground))" } as const;

export function RevenueTrendChart({ data }: { data: RevenueTrendPoint[] }) {
  const hasData = data.some((p) => p.revenue > 0);

  return (
    <section aria-labelledby="cc-health-trend" className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="cc-health-trend" className="text-[15px] font-semibold leading-tight text-foreground">
          Revenue and margin, last six months
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Bars are confirmed revenue; the line is the share EduCraft kept.
        </p>
      </div>

      <div className="mt-5 h-64 sm:h-72">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis
                yAxisId="left"
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatNaira(v, { compact: true })}
                width={56}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
                width={40}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--zone))" }}
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number, name: string) => [
                  name === "margin" ? `${Math.round(value * 10) / 10}%` : formatNaira(value),
                  seriesName(name),
                ]}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={seriesName} />
              <Bar
                yAxisId="left"
                dataKey="revenue"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="margin"
                stroke="hsl(var(--gold))"
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 2, fill: "hsl(var(--card))" }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl bg-zone text-sm text-muted-foreground">
            No revenue in the last six months yet
          </div>
        )}
      </div>
    </section>
  );
}

export function RevenueTrendChartSkeleton() {
  return (
    <div aria-hidden>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Skeleton className="h-4 w-64 max-w-full" />
        <Skeleton className="h-3 w-56 max-w-full" />
      </div>
      <Skeleton className="mt-5 h-64 w-full rounded-2xl sm:h-72" />
    </div>
  );
}
