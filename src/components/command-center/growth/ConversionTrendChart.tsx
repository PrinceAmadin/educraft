"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_TOOLTIP_STYLE } from "@/components/finance/chart-style";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount } from "@/lib/command-center/presentation";
import type { ConversionTrendPoint } from "@/lib/command-center/types";

/**
 * Twelve Monday-aligned weeks of conversions and new ambassadors (Phase 5):
 * the finance dashboard's area chart, with its own gradient ids so it can
 * share a page with the revenue chart. Conversions are the teal wash; new
 * ambassadors the dashed gold line. Both themes come from the tokens.
 */

const AXIS_TICK = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

/** Surface ring on the hovered point so it stays legible where the lines cross. */
const ACTIVE_DOT = { r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" };

export function ConversionTrendChart({ data }: { data: ConversionTrendPoint[] }) {
  const hasData = data.some((p) => p.conversions > 0 || p.newAmbassadors > 0);

  return (
    <section aria-labelledby="cc-growth-trend" className="min-w-0">
      <div className="min-w-0">
        <h2 id="cc-growth-trend" className="text-[15px] font-semibold leading-tight text-foreground">
          Conversion trend
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Last 12 weeks · each week starts on Monday, West Africa Time
        </p>
      </div>

      <div className="mt-5 h-56 sm:h-64">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="cc-conv-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="cc-amb-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={32}
              />
              <Tooltip
                cursor={{ stroke: "hsl(var(--border))" }}
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
                labelFormatter={(label: string) => `Week of ${label}`}
                formatter={(value: number, name: string) => [formatCount(value), name]}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value: string) => <span className="text-muted-foreground">{value}</span>}
              />
              <Area
                type="monotone"
                dataKey="conversions"
                name="Conversions"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#cc-conv-fill)"
                dot={false}
                activeDot={ACTIVE_DOT}
              />
              <Area
                type="monotone"
                dataKey="newAmbassadors"
                name="New ambassadors"
                stroke="hsl(var(--gold))"
                strokeWidth={2}
                strokeDasharray="4 4"
                fill="url(#cc-amb-fill)"
                dot={false}
                activeDot={ACTIVE_DOT}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl bg-zone px-6 text-center text-sm text-muted-foreground">
            No conversions or new ambassadors in the last 12 weeks
          </div>
        )}
      </div>
    </section>
  );
}

export function ConversionTrendChartSkeleton() {
  return (
    <div className="min-w-0" aria-hidden>
      <Skeleton className="h-4 w-36" />
      <Skeleton className="mt-2 h-3 w-64" />
      <Skeleton className="mt-5 h-56 w-full rounded-2xl sm:h-64" />
    </div>
  );
}
