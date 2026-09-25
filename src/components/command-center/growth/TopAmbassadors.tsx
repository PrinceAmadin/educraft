import Link from "next/link";
import { TierBadge } from "@/components/ambassadors/TierBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { IconArrowRight } from "@/lib/icons";
import { formatCount } from "@/lib/command-center/presentation";
import type { GrowthPayload, TopAmbassador } from "@/lib/command-center/types";
import { formatNaira } from "@/lib/utils";

/**
 * This month's top five ambassadors (Phase 5): the finance page's ranked
 * row template — rank in mono, name with the tier pill, school beneath,
 * conversions and what they earned stacked on the right. Each row opens the
 * ambassador; two links beneath go to the leaderboard and the platform.
 */

const ROW =
  "-mx-2 flex min-h-12 items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-fast hover:bg-zone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

const DEEP_LINK =
  "inline-flex min-h-12 items-center gap-1 text-[13px] font-medium text-primary hover:underline sm:min-h-0";

function AmbassadorRow({ row, rank }: { row: TopAmbassador; rank: number }) {
  return (
    <li>
      <Link href={row.href} className={ROW}>
        <span className="w-5 shrink-0 text-center font-mono text-xs font-medium tabular-nums text-muted-foreground">
          {rank}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-foreground">{row.name}</span>
            <TierBadge tier={row.tier} className="shrink-0" />
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {row.school ?? <span className="font-mono tabular-nums">{row.code}</span>}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm text-foreground">
            <span className="font-mono font-medium tabular-nums">{formatCount(row.conversions)}</span>
            <span className="text-[11px] text-muted-foreground">
              {" "}
              {row.conversions === 1 ? "conversion" : "conversions"}
            </span>
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            <span className="font-mono tabular-nums">{formatNaira(row.earned)}</span> earned
          </span>
        </span>
      </Link>
    </li>
  );
}

export function TopAmbassadors({
  rows,
  links,
  monthLabel,
}: {
  rows: TopAmbassador[];
  links: GrowthPayload["links"];
  monthLabel: string;
}) {
  return (
    <section aria-labelledby="cc-growth-top" className="min-w-0">
      <div className="min-w-0">
        <h2 id="cc-growth-top" className="text-[15px] font-semibold leading-tight text-foreground">
          Top ambassadors
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {monthLabel} · by conversions, then commission earned
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-zone px-4 py-8 text-center text-sm text-muted-foreground">
          No referred client has paid a downpayment this month yet
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border/70">
          {rows.map((row, i) => (
            <AmbassadorRow key={row.id} row={row} rank={i + 1} />
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1">
        <Link href={links.leaderboard} className={DEEP_LINK}>
          View full leaderboard
          <IconArrowRight className="size-3" aria-hidden />
        </Link>
        <Link href={links.platform} className={DEEP_LINK}>
          View ambassador platform
          <IconArrowRight className="size-3" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

export function TopAmbassadorsSkeleton() {
  return (
    <div className="min-w-0" aria-hidden>
      <Skeleton className="h-4 w-36" />
      <Skeleton className="mt-2 h-3 w-52" />
      <div className="mt-2 space-y-1">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex min-h-12 items-center gap-3 py-2.5">
            <Skeleton className="h-3 w-5" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <div className="space-y-2">
              <Skeleton className="ml-auto h-3.5 w-20" />
              <Skeleton className="ml-auto h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-6">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3.5 w-40" />
      </div>
    </div>
  );
}
