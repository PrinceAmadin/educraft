"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_TOOLTIP_STYLE } from "@/components/finance/RevenueTrendChart";
import type { TrendPoint } from "@/lib/services/ambassador-analytics";

/** 7-day clicks vs unique clicks, in Nigerian days. Sits on the page, no card. */
export function ClickTrendChart({ data }: { data: TrendPoint[] }) {
  const hasData = data.some((p) => p.clicks > 0);
  return (
    <div className="h-60 sm:h-72">
      {hasData ? (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
              itemStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Line type="monotone" dataKey="clicks" name="Clicks" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="unique" name="Unique" stroke="hsl(var(--gold))" strokeWidth={2} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-full items-center justify-center rounded-xl bg-zone px-6 text-center text-sm text-muted-foreground">
          No clicks in the last 7 days yet. Share your link and they will show up here.
        </div>
      )}
    </div>
  );
}
