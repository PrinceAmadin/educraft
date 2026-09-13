"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn, formatNaira } from "@/lib/utils";
import type { ChartGranularity, RevenuePoint } from "@/lib/services/finance-dashboard";

const TABS: { key: ChartGranularity; label: string }[] = [
  { key: "daily", label: "30 days" },
  { key: "weekly", label: "12 weeks" },
  { key: "monthly", label: "12 months" },
];

/** Shared tooltip look for the finance charts — a lifted surface, no outline. */
export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  background: "hsl(var(--popover))",
  border: "none",
  borderRadius: 10,
  boxShadow: "var(--shadow-lift)",
  fontSize: 12,
  padding: "8px 10px",
};

/** Revenue over time. Sits on the page — the chart is the content, not a card. */
export function RevenueTrendChart({ data }: { data: Record<ChartGranularity, RevenuePoint[]> }) {
  const [granularity, setGranularity] = React.useState<ChartGranularity>("daily");
  const points = data[granularity];
  const hasData = points.some((p) => p.revenue > 0);

  return (
    <section aria-labelledby="trend-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="trend-heading" className="text-[15px] font-semibold text-foreground">
          Revenue trend
        </h2>
        <div role="group" aria-label="Chart range" className="flex gap-1 rounded-lg bg-zone p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={granularity === tab.key}
              onClick={() => setGranularity(tab.key)}
              className={cn(
                "min-h-9 rounded-md px-3 text-xs font-medium transition-colors",
                granularity === tab.key
                  ? "bg-card text-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 h-64 sm:h-72">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatNaira(v, { compact: true })}
                width={56}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--zone))" }}
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number) => [formatNaira(value), "Revenue"]}
              />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl bg-zone text-sm text-muted-foreground">
            No revenue in this window yet
          </div>
        )}
      </div>
    </section>
  );
}
