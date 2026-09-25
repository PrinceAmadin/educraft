"use client";

import Link from "next/link";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { deltaLabel, formatCount, formatPercent } from "@/lib/command-center/presentation";
import type { Kpi, KpiUnit } from "@/lib/command-center/types";
import type { AppIcon } from "@/lib/icons";
import { cn, formatNaira } from "@/lib/utils";

/**
 * A Business health KPI (Phase 5): the StatsCard typography — label with
 * icon, mono number, supporting delta line — plus a six-point sparkline
 * under the number. No border and no card: it sits on the page inside
 * STATS_GRID like every other stat row. The whole tile is a Link to the
 * page that explains the figure.
 *
 * The sparkline is decoration, not a chart: no axes, grid, tooltip or
 * animation, and hidden from assistive tech (the delta line already says
 * which way the figure moved). A KPI with an `emptyLabel` has no meaningful
 * value yet (a margin before any revenue): it shows "—" and that line.
 */

export type KpiTone = "primary" | "gold" | "danger" | "success";

const TONE_TEXT: Record<KpiTone, string> = {
  primary: "text-primary",
  gold: "text-gold",
  danger: "text-danger",
  success: "text-success",
};

const DELTA_TEXT = {
  muted: "text-muted-foreground",
  success: "text-success",
  danger: "text-danger",
} as const;

/** ₦2.4M / 1,234 / 40.3% — the unit decides the shape. */
export function formatKpiValue(value: number, unit: KpiUnit): string {
  if (unit === "naira") return formatNaira(value, { compact: true });
  if (unit === "count") return formatCount(value);
  // A whole percent stays whole; anything else keeps one decimal so a small
  // goal progress (0.4%) does not collapse to "0%".
  return formatPercent(value, Number.isInteger(value) ? 0 : 1);
}

export function KpiCard({
  label,
  icon: Icon,
  kpi,
  tone = "primary",
}: {
  label: string;
  icon: AppIcon;
  kpi: Kpi;
  tone?: KpiTone;
}) {
  const empty = kpi.emptyLabel ?? null;
  const delta = empty
    ? { text: empty, tone: "muted" as const }
    : deltaLabel(kpi.value, kpi.previous, kpi.unit, kpi.previousLabel ?? "last month");
  const points = kpi.sparkline.map((v, i) => ({ i, v }));

  return (
    <Link
      href={kpi.href}
      className="group/stat -m-2.5 block min-w-0 rounded-xl p-2.5 transition-colors duration-fast hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors group-hover/stat:text-foreground">
        <Icon className={cn("size-3.5 shrink-0", TONE_TEXT[tone])} aria-hidden />
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-2 font-mono text-[1.625rem] font-medium leading-none tabular-nums text-foreground sm:text-[2rem]">
        {empty ? "—" : formatKpiValue(kpi.value, kpi.unit)}
      </p>
      {points.length >= 2 ? (
        <div className="mt-2 h-9 w-full" aria-hidden>
          <ResponsiveContainer width="100%" height={36}>
            <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Line
                type="monotone"
                dataKey="v"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      <p className={cn("mt-2 text-[13px] leading-snug", DELTA_TEXT[delta.tone])}>{delta.text}</p>
    </Link>
  );
}

export function KpiCardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}
