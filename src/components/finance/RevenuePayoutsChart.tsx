"use client";

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_TOOLTIP_STYLE } from "@/components/finance/chart-style";
import type { RevenueHistoryPoint } from "@/lib/services/finance/dashboard";
import { formatNaira } from "@/lib/utils";

/**
 * Six months of revenue with payouts laid over it: the gap between the two
 * areas is what EduCraft retained. Sits on the page — the chart is the
 * content, not a card.
 */
export function RevenuePayoutsChart({ data }: { data: RevenueHistoryPoint[] }) {
  const hasData = data.some((p) => p.revenue > 0 || p.payouts > 0);
  return (
    <section aria-labelledby="history-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="history-heading" className="text-[15px] font-semibold text-foreground">
          Revenue and payouts, last six months
        </h2>
        <p className="text-[13px] text-muted-foreground">The gap between the two is what EduCraft retained.</p>
      </div>
      <div className="mt-5 h-64 sm:h-72">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="pay-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatNaira(v, { compact: true })} width={56} />
              <Tooltip
                cursor={{ stroke: "hsl(var(--border))" }}
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number, name: string) => [formatNaira(value), name === "revenue" ? "Revenue" : name === "payouts" ? "Payouts owed" : "Retained"]}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => (v === "revenue" ? "Revenue" : "Payouts owed")} />
              <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#rev-fill)" />
              <Area type="monotone" dataKey="payouts" stroke="hsl(var(--gold))" strokeWidth={2} fill="url(#pay-fill)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl bg-zone text-sm text-muted-foreground">No revenue in the last six months yet</div>
        )}
      </div>
    </section>
  );
}
