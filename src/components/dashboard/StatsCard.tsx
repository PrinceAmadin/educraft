import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AppIcon } from "@/lib/icons";

export type StatTone = "primary" | "gold" | "danger" | "success";

const TONE_STYLES: Record<StatTone, string> = {
  primary: "bg-primary/12 text-primary",
  gold: "bg-gold/12 text-gold",
  danger: "bg-danger/12 text-danger",
  success: "bg-success/12 text-success",
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
    <CardContent className="flex min-h-[104px] items-start justify-between gap-3 p-4 sm:p-5">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 font-mono text-2xl font-medium tabular-nums text-foreground sm:text-3xl">
          {value}
        </p>
        {detail ? (
          <p className={cn("mt-1.5 text-xs", DETAIL_STYLES[detailTone])}>{detail}</p>
        ) : null}
      </div>
      <span className={cn("shrink-0 rounded-lg p-2", TONE_STYLES[tone])}>
        <Icon className="size-5" aria-hidden />
      </span>
    </CardContent>
  );

  if (!href) {
    return <Card>{body}</Card>;
  }

  return (
    <Card className="transition-colors duration-fast hover:border-border-hover">
      <Link
        href={href}
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {body}
      </Link>
    </Card>
  );
}

export function StatsCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex min-h-[104px] items-start justify-between gap-3 p-4 sm:p-5">
        <div className="w-full space-y-2.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="size-9 shrink-0 rounded-lg" />
      </CardContent>
    </Card>
  );
}
