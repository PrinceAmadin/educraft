"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_TOOLTIP_STYLE } from "@/components/finance/RevenueTrendChart";
import { formatNaira } from "@/lib/utils";

/**
 * Ranked horizontal bars. One hue, stepped by rank — the order already says
 * which is biggest, so six unrelated colours would only add noise.
 */
const RANK_OPACITY = [1, 0.8, 0.64, 0.5, 0.38, 0.26];

export function RevenueBarChart({
  data,
  emptyLabel = "No completed projects yet",
}: {
  data: { label: string; value: number }[];
  emptyLabel?: string;
}) {
  if (data.length === 0) {
    return (
      <div className="mt-3 flex h-48 items-center justify-center rounded-2xl bg-zone text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="mt-3 h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatNaira(v, { compact: true })}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
            axisLine={false}
            tickLine={false}
            width={110}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--zone))" }}
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
            formatter={(value: number) => [formatNaira(value), "Revenue"]}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {data.map((d, i) => (
              <Cell
                key={d.label}
                fill={d.label === "Others" ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))"}
                fillOpacity={d.label === "Others" ? 0.35 : RANK_OPACITY[i] ?? 0.26}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
