import Link from "next/link";
import { LuCircleCheck, LuCircleMinus, LuTriangleAlert } from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount } from "@/lib/command-center/presentation";
import type { FinancePayload } from "@/lib/command-center/types";
import { type AppIcon, IconArrowRight } from "@/lib/icons";
import { cn, formatNaira } from "@/lib/utils";

type Usage = FinancePayload["aiUsage"];

/**
 * AI cost tracker (Phase 5, Financial pulse): Claude spend this month from
 * AiUsageLog — tokens, naira cost, the average per project judged against
 * the expected ₦520–₦1,200 range, calls and projects billed — and the
 * credit meter. Anthropic has no credit-balance API: the balance is the
 * hand-entered figure minus logged spend, so when none was entered the
 * meter gives way to one plain line. Every row links to the AI usage page.
 */

const ROW =
  "-mx-2 flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors duration-fast hover:bg-zone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-10";

const BAR: Record<"ok" | "low" | "critical", string> = { ok: "bg-primary", low: "bg-gold", critical: "bg-danger" };

// "4.2M", "12.5K", "860" — a token count is never read to the digit.
const COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function compactCount(n: number): string {
  return COMPACT.format(n);
}

function clampPercent(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

type BadgeSpec = { variant: "success" | "gold" | "danger" | "neutral"; label: string; icon: AppIcon };

/** How the average per project sits against the expected range. */
function avgBadge(avg: number | null, min: number, max: number): BadgeSpec {
  if (avg === null) return { variant: "neutral", label: "No projects billed", icon: LuCircleMinus };
  if (avg <= max) return { variant: "success", label: avg < min ? "Under range" : "In range", icon: LuCircleCheck };
  if (avg <= max * 1.5) return { variant: "gold", label: "Above range", icon: LuTriangleAlert };
  return { variant: "danger", label: "Well above range", icon: LuTriangleAlert };
}

function MetricRow({
  href,
  label,
  sub,
  value,
  badge,
}: {
  href: string;
  label: string;
  sub?: string;
  value: string;
  badge?: BadgeSpec;
}) {
  const BadgeIcon = badge?.icon;
  return (
    <Link href={href} className={ROW}>
      <span className="min-w-0 flex-1">
        <span className="block text-muted-foreground">{label}</span>
        {sub ? <span className="mt-0.5 block text-[13px] text-subtle">{sub}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-2.5">
        <span className="font-mono tabular-nums text-foreground">{value}</span>
        {badge && BadgeIcon ? (
          <Badge variant={badge.variant}>
            <BadgeIcon className="size-3" aria-hidden />
            {badge.label}
          </Badge>
        ) : null}
      </span>
    </Link>
  );
}

export function AiCostTracker({ usage, monthLabel, href }: { usage: Usage; monthLabel: string; href: string }) {
  const b = usage.balance;
  // AiBalance is not a discriminated union: all four fields must agree before the meter shows.
  const live = b.configured && b.remaining !== null && b.percentRemaining !== null && b.level !== null ? b : null;
  const percent = live && live.percentRemaining !== null ? Math.round(live.percentRemaining) : 0;
  const level = live && live.level !== null ? live.level : "ok";

  return (
    <section aria-labelledby="cc-finance-ai" className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id="cc-finance-ai" className="text-[15px] font-semibold leading-tight text-foreground">
            AI cost tracker
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">{monthLabel} · Claude spend logged by HQ</p>
        </div>
        <Link href={href} className="inline-flex min-h-12 items-center gap-1 text-[13px] font-medium text-primary hover:underline sm:min-h-0">
          View AI usage dashboard
          <IconArrowRight className="size-3" aria-hidden />
        </Link>
      </div>

      <div className="mt-3">
        <MetricRow
          href={href}
          label="Tokens this month"
          sub="Input and output together"
          value={compactCount(usage.totalTokens)}
        />
        <MetricRow href={href} label="Cost this month" value={formatNaira(usage.totalCost, { decimals: true })} />
        <MetricRow
          href={href}
          label="Average per project"
          sub={`Expected ${formatNaira(usage.targetMin)}–${formatNaira(usage.targetMax)}`}
          value={usage.avgCostPerProject === null ? "—" : formatNaira(usage.avgCostPerProject, { decimals: true })}
          badge={avgBadge(usage.avgCostPerProject, usage.targetMin, usage.targetMax)}
        />
        <MetricRow
          href={href}
          label="Calls / projects billed"
          value={`${formatCount(usage.calls)} / ${formatCount(usage.projects)}`}
        />
      </div>

      <div className="mt-4">
        {live && live.remaining !== null ? (
          <Link
            href={href}
            className="group/credit -mx-2 block rounded-lg px-2 py-2 transition-colors duration-fast hover:bg-zone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="meta-label group-hover/credit:text-foreground">Claude credit remaining</span>
              <span className="shrink-0 font-mono text-sm font-medium tabular-nums text-foreground">
                {formatNaira(live.remaining)}
                <span className="font-normal text-muted-foreground"> · {percent}% left</span>
              </span>
            </span>
            <span
              className="mt-2 block h-2 w-full overflow-hidden rounded-full bg-elevated"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Claude credit remaining"
            >
              <span className={cn("block h-full rounded-full", BAR[level])} style={{ width: `${clampPercent(percent)}%` }} />
            </span>
            {level !== "ok" ? (
              <span
                className={cn(
                  "mt-3 flex items-start gap-2 rounded-xl px-4 py-3 text-sm",
                  level === "critical" ? "bg-danger/10 text-danger" : "bg-gold/10 text-gold"
                )}
              >
                <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {level === "critical" ? "Under 10%" : "Under 20%"} of the Claude credit is left — top up on the
                  Anthropic Console.
                </span>
              </span>
            ) : null}
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">Balance unavailable — check the Anthropic dashboard</p>
        )}
      </div>
    </section>
  );
}

export function AiCostTrackerSkeleton() {
  return (
    <div className="min-w-0" aria-hidden>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-2 h-3 w-56 max-w-full" />
      <div className="mt-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex min-h-12 items-center justify-between gap-3 py-1.5 sm:min-h-10">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-4 py-2">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-3.5 w-28" />
        </div>
        <Skeleton className="mt-2 h-2 w-full rounded-full" />
      </div>
    </div>
  );
}
