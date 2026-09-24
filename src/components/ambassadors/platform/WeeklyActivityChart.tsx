"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_TOOLTIP_STYLE } from "@/components/finance/chart-style";
import type { WeekPoint } from "@/lib/services/ambassador-platform/dashboard";

/**
 * Twelve weeks of referrals submitted (light) against conversions (solid).
 * The gap between the two bars is the drop-off the HOG works on.
 */
export function WeeklyActivityChart({ data }: { data: WeekPoint[] }) {
  const empty = data.every((d) => d.referrals === 0 && d.conversions === 0);
  if (empty) {
    return <div className="mt-3 flex h-56 items-center justify-center rounded-2xl bg-zone text-sm text-muted-foreground">No referrals in the last 12 weeks yet.</div>;
  }
  return (
    <div className="mt-3 h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "hsl(var(--zone))" }}
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
            labelFormatter={(label: string, payload) => {
              const key = payload?.[0]?.payload?.key as string | undefined;
              return key ? `Week of ${label} (${key})` : `Week of ${label}`;
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }} iconType="circle" iconSize={8} />
          <Bar dataKey="referrals" name="Referrals submitted" fill="hsl(var(--primary))" fillOpacity={0.3} radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="conversions" name="Conversions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
