import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { deltaLabel } from "@/lib/command-center/presentation";
import type { KpiUnit, TodayNumbers as TodayNumbersData } from "@/lib/command-center/types";
import { cn, formatNaira } from "@/lib/utils";

const DELTA_TONE = {
  success: "text-success",
  danger: "text-danger",
  muted: "text-muted-foreground",
} as const;

interface NumberRow {
  key: string;
  label: string;
  value: string;
  current: number;
  previous: number;
  unit: KpiUnit;
  /** One small line under the delta, e.g. the payment breakdown. */
  sub: string | null;
  href: string;
}

function plural(n: number, noun: string, plural = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : plural}`;
}

function rowsFor(n: TodayNumbersData): NumberRow[] {
  const p = n.paymentsReceived;
  return [
    {
      key: "completed",
      label: "Projects completed",
      value: String(n.projectsCompleted.today),
      current: n.projectsCompleted.today,
      previous: n.projectsCompleted.yesterday,
      unit: "count",
      sub: null,
      href: "/admin/projects?status=COMPLETED",
    },
    {
      key: "payments",
      label: "Payments received",
      value: formatNaira(p.amount),
      current: p.amount,
      previous: p.yesterdayAmount,
      unit: "naira",
      sub:
        p.count > 0
          ? `${plural(p.count, "payment")} — ${plural(p.downpayments, "downpayment")}, ${plural(p.balances, "balance")}`
          : null,
      href: "/admin/finance/revenue",
    },
    {
      key: "referrals",
      label: "New referrals",
      value: String(n.newReferrals.today),
      current: n.newReferrals.today,
      previous: n.newReferrals.yesterday,
      unit: "count",
      sub:
        n.newReferrals.ambassadors > 0
          ? `From ${plural(n.newReferrals.ambassadors, "ambassador")}`
          : null,
      href: "/admin/clients",
    },
    {
      key: "conversions",
      label: "New conversions",
      value: String(n.newConversions.today),
      current: n.newConversions.today,
      previous: n.newConversions.yesterday,
      unit: "count",
      sub: null,
      href: "/admin/ambassadors/tracking",
    },
  ];
}

/**
 * "Today's numbers" (Phase 5): a zone band of four figures, each with its
 * "vs yesterday" delta in the finance dashboard's words. Sits to the right
 * of the feed from lg (an 18rem column, one figure per row) and above it on
 * phones, two-up. Each figure is a Link to the page that lists it.
 */
export function TodayNumbers({ numbers }: { numbers: TodayNumbersData }) {
  const rows = rowsFor(numbers);
  return (
    <section
      aria-labelledby="cc-today-numbers"
      className="rounded-2xl bg-zone px-4 py-5 sm:px-6 sm:py-6 lg:self-start"
    >
      <h2 id="cc-today-numbers" className="text-[15px] font-semibold leading-tight text-foreground">
        {"Today's numbers"}
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">Since midnight, West Africa Time</p>

      <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6 sm:gap-x-6 lg:grid-cols-1 lg:gap-y-5">
        {rows.map((row) => {
          const delta = deltaLabel(row.current, row.previous, row.unit, "yesterday");
          return (
            <li key={row.key} className="min-w-0">
              <Link
                href={row.href}
                className="group/num -m-2.5 block min-w-0 rounded-xl p-2.5 transition-colors duration-fast hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="text-[13px] font-medium text-muted-foreground transition-colors group-hover/num:text-foreground">
                  {row.label}
                </p>
                <p className="mt-2 font-mono text-[1.375rem] font-medium leading-none tabular-nums text-foreground sm:text-2xl">
                  {row.value}
                </p>
                <p className={cn("mt-2 text-[13px] leading-snug", DELTA_TONE[delta.tone])}>
                  {delta.text}
                </p>
                {row.sub ? <p className="mt-1 text-xs leading-snug text-subtle">{row.sub}</p> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function TodayNumbersSkeleton() {
  return (
    <div className="rounded-2xl bg-zone px-4 py-5 sm:px-6 sm:py-6 lg:self-start" aria-hidden>
      <Skeleton className="h-4 w-32 bg-card/70" />
      <Skeleton className="mt-2 h-3 w-44 bg-card/70" />
      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6 sm:gap-x-6 lg:grid-cols-1 lg:gap-y-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-24 bg-card/70" />
            <Skeleton className="h-7 w-20 bg-card/70" />
            <Skeleton className="h-3 w-28 bg-card/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
