import Link from "next/link";
import { LuArrowDown, LuArrowUp, LuMoveRight } from "react-icons/lu";
import { Skeleton } from "@/components/ui/skeleton";
import type { BucketHealthLevel, BucketPulseCard } from "@/lib/command-center/types";
import { type AppIcon, IconArrowRight } from "@/lib/icons";
import { cn, formatNaira } from "@/lib/utils";

/**
 * Bucket pulse (Phase 5, Financial pulse): the four buckets exactly as the
 * Finance dashboard's BucketHealthGrid shows them — label, mono balance,
 * meter, health — plus one trend line: the net movement logged this month
 * against last month's. The arrow follows this month's sign (the bucket
 * grew, shrank or stood still), so a bucket paying out more than it took
 * in reads as down even when it is still healthy. Each card is a Link to
 * that bucket in the Bucket manager.
 */

const BAR: Record<BucketHealthLevel, string> = { healthy: "bg-success", monitor: "bg-gold", attention: "bg-danger" };
const TEXT: Record<BucketHealthLevel, string> = { healthy: "text-success", monitor: "text-gold", attention: "text-danger" };
const LABEL: Record<BucketHealthLevel, string> = { healthy: "Healthy", monitor: "Monitor", attention: "Needs attention" };

/** "₦42K" / "−₦12K" — compact, with a real minus sign in front rather than inside. */
function signedCompact(n: number): string {
  const abs = formatNaira(Math.abs(n), { compact: true });
  return n < 0 ? `−${abs}` : abs;
}

function trendFor(net: number): { icon: AppIcon; tone: string; word: string } {
  if (net > 0) return { icon: LuArrowUp, tone: "text-success", word: "Up" };
  if (net < 0) return { icon: LuArrowDown, tone: "text-danger", word: "Down" };
  return { icon: LuMoveRight, tone: "text-muted-foreground", word: "Flat" };
}

function clampPercent(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

function BucketTile({ card }: { card: BucketPulseCard }) {
  const trend = trendFor(card.netThisMonth);
  const TrendIcon = trend.icon;
  const percent = Math.round(card.health.percent);
  return (
    <Link
      href={card.href}
      title={card.purpose}
      className="group/bucket min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="truncate text-[13px] font-medium text-muted-foreground group-hover/bucket:text-foreground">
        {card.label}
      </p>
      <p className="mt-1 font-mono text-xl font-medium tabular-nums text-foreground">{formatNaira(card.balance)}</p>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated"
        role="img"
        aria-label={`${percent}% of target`}
      >
        <div className={cn("h-full rounded-full", BAR[card.health.level])} style={{ width: `${clampPercent(percent)}%` }} />
      </div>
      <p className="mt-1 flex items-center justify-between text-xs">
        <span className={cn("font-medium", TEXT[card.health.level])}>{LABEL[card.health.level]}</span>
        <span className="font-mono tabular-nums text-muted-foreground">{percent}%</span>
      </p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
        <span className={cn("inline-flex items-center gap-1 font-medium", trend.tone)}>
          <TrendIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="sr-only">{trend.word}</span>
          <span className="font-mono tabular-nums">{signedCompact(card.netThisMonth)}</span>
          <span>this month</span>
        </span>
        <span className="text-subtle">
          <span className="hidden sm:inline">· </span>
          <span className="font-mono tabular-nums">{signedCompact(card.netLastMonth)}</span> last month
        </span>
      </p>
    </Link>
  );
}

export function BucketPulse({ buckets, monthLabel }: { buckets: BucketPulseCard[]; monthLabel: string }) {
  return (
    <section aria-labelledby="cc-finance-buckets" className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id="cc-finance-buckets" className="text-[15px] font-semibold leading-tight text-foreground">
            Bucket pulse
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Balance now · net movement in {monthLabel} against last month
          </p>
        </div>
        <Link
          href="/admin/finance/buckets"
          className="inline-flex min-h-12 items-center gap-1 text-[13px] font-medium text-primary hover:underline sm:min-h-0"
        >
          Bucket manager
          <IconArrowRight className="size-3" aria-hidden />
        </Link>
      </div>

      {buckets.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-zone px-4 py-8 text-center text-sm text-muted-foreground">
          No bucket has been allocated to yet — the first confirmed payment fills them.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
          {buckets.map((card) => (
            <BucketTile key={card.bucket} card={card} />
          ))}
        </div>
      )}
    </section>
  );
}

export function BucketPulseSkeleton() {
  return (
    <div className="min-w-0" aria-hidden>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-2 h-3 w-72 max-w-full" />
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="min-w-0">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="mt-2 h-6 w-24" />
            <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
            <div className="mt-2 flex items-center justify-between">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className="mt-2 h-3 w-36 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
