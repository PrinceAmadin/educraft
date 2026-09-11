"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn, formatNaira } from "@/lib/utils";
import type { ChartGranularity, RevenuePoint } from "@/lib/services/finance-dashboard";

const TABS: { key: ChartGranularity; label: string }[] = [
  { key: "daily", label: "Daily (30d)" },
  { key: "weekly", label: "Weekly (12w)" },
  { key: "monthly", label: "Monthly (12mo)" },
];

export function RevenueTrendChart({
  data,
}: {
  data: Record<ChartGranularity, RevenuePoint[]>;
}) {
  const [granularity, setGranularity] = React.useState<ChartGranularity>("daily");
  const points = data[granularity];
  const hasData = points.some((p) => p.revenue > 0);

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Revenue trend</h2>
        <div className="flex gap-1 rounded-lg border border-border bg-elevated p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setGranularity(tab.key)}
              className={cn(
                "min-h-8 rounded-md px-3 text-xs font-medium transition-colors",
                granularity === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-64">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
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
                cursor={{ fill: "hsl(var(--elevated))" }}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                formatter={(value: number) => [formatNaira(value), "Revenue"]}
              />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No revenue in this window yet
          </div>
        )}
      </div>
    </div>
  );
}
