import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AppIcon } from "@/lib/icons";

export type StatTone = "primary" | "gold" | "danger" | "success";

const TONE_TEXT: Record<StatTone, string> = {
  primary: "text-primary",
  gold: "text-gold",
  danger: "text-danger",
  success: "text-success",
};

export interface StatsCardProps {
  label: string;
  /** Already formatted for display — ₦3.45M, 47, 3. */
  value: string;
  /** Supporting line under the number: "+12 today", "23 workers, 14 ambassadors". */
  detail?: string;
  detailTone?: "muted" | "success" | "danger" | "gold";
  icon: AppIcon;
  tone?: StatTone;
  href?: string;
}

const DETAIL_STYLES = {
  muted: "text-muted-foreground",
  success: "text-success",
  danger: "text-danger",
  gold: "text-gold",
} as const;

/**
 * A stat is data with breathing room — label, number, supporting line. No
 * border and no card: it sits on whatever ground it is placed on (the page or
 * a zone), and whitespace separates it from its neighbours.
 */
export function StatsCard({
  label,
  value,
  detail,
  detailTone = "muted",
  icon: Icon,
  tone = "primary",
  href,
}: StatsCardProps) {
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors group-hover/stat:text-foreground">
        <Icon className={cn("size-3.5 shrink-0", TONE_TEXT[tone])} aria-hidden />
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-2 font-mono text-[1.625rem] font-medium leading-none tabular-nums text-foreground sm:text-[2rem]">
        {value}
      </p>
      {detail ? (
        <p className={cn("mt-2 text-[13px] leading-snug", DETAIL_STYLES[detailTone])}>{detail}</p>
      ) : null}
    </>
  );

  if (!href) return <div className="min-w-0">{body}</div>;

  return (
    <Link
      href={href}
      className="group/stat -m-2.5 block min-w-0 rounded-xl p-2.5 transition-colors duration-fast hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  );
}

export function StatsCardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

/** Standard grid for a row of stats — two-up on phones, four-up from lg. */
export const STATS_GRID = "grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4 lg:gap-x-10";
