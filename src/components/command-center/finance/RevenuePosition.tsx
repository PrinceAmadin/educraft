import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent } from "@/lib/command-center/presentation";
import type { FinancePayload } from "@/lib/command-center/types";
import { IconArrowRight } from "@/lib/icons";
import { cn, formatNaira } from "@/lib/utils";

type Position = FinancePayload["revenuePosition"];

/**
 * Revenue position (Phase 5, Financial pulse): this month's money as a
 * ledger — confirmed revenue, less each payout leg, retained by EduCraft —
 * with the cash still to collect beside it. Legs are on a cash basis (each
 * project's legs scaled by the money it actually paid this month), and
 * "Retained" is the Bucket manager's own number; when the buckets also
 * re-split money from earlier months (an ambassador added after payment, a
 * cancellation), that true-up is its own line, so the ledger adds up. Every
 * row links to the page that lists it. Read-only: nothing here writes.
 */

/** Below this the ledger's gap is rounding, not a true-up worth a line. */
const TRUE_UP_MIN = 10;

const ROW =
  "-mx-2 flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors duration-fast hover:bg-zone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-10";

function plural(n: number, noun: string, many = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : many}`;
}

/** A percent to one decimal, "40%" or "2.5%" (never "3%" for a 2.5% leg). */
function pct1(value: number): string {
  const v = Math.round(value * 10) / 10;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
}

/** Share of the month's confirmed revenue, or null when there was none. */
function shareOf(part: number, whole: number): string | null {
  if (whole <= 0) return null;
  return pct1((part / whole) * 100);
}

/**
 * One ledger line: label left, mono amount right. "Less" rows carry their
 * share of revenue in muted 13px just before the amount; the strong
 * (Retained) row gets a top hairline and the margin beside its label.
 */
function LedgerRow({
  href,
  label,
  aside,
  sub,
  value,
  share,
  strong,
}: {
  href: string;
  label: string;
  /** Small muted text beside the label, e.g. "(40% gross margin)". */
  aside?: string;
  /** A second line under the label. */
  sub?: string;
  value: string;
  /** Share of revenue, shown before the amount on "Less" rows. */
  share?: string | null;
  strong?: boolean;
}) {
  const row = (
    <Link href={href} className={ROW}>
      <span className="min-w-0">
        <span className={cn("block", strong ? "font-medium text-foreground" : "text-muted-foreground")}>
          {label}
          {aside ? (
            <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">{aside}</span>
          ) : null}
        </span>
        {sub ? <span className="mt-0.5 block text-[13px] text-subtle">{sub}</span> : null}
      </span>
      <span className="flex shrink-0 items-baseline gap-2.5">
        {share ? (
          <span className="inline-block min-w-[2.75rem] text-right font-mono text-[13px] tabular-nums text-muted-foreground">
            {share}
          </span>
        ) : null}
        <span className={cn("font-mono tabular-nums text-foreground", strong && "font-semibold")}>{value}</span>
      </span>
    </Link>
  );
  return strong ? <div className="mt-1.5 border-t border-border pt-1.5">{row}</div> : row;
}

export function RevenuePosition({ position, monthLabel }: { position: Position; monthLabel: string }) {
  const p = position;
  const margin = p.grossMargin === null ? "(no revenue yet)" : `(${pct1(p.grossMargin)} gross margin)`;
  const trueUps = p.trueUps ?? 0;
  // The share of confirmed money that came through ambassadors: why the margin moves month to month.
  const confirmedSub = [
    p.ambassadorDrivenShare !== null ? `${formatPercent(p.ambassadorDrivenShare)} ambassador-driven` : null,
    p.refunds > 0 ? `after ${formatNaira(p.refunds)} refunded` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section aria-labelledby="cc-finance-revenue" className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id="cc-finance-revenue" className="text-[15px] font-semibold leading-tight text-foreground">
            Revenue position
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {monthLabel} · cash basis, ties to the Bucket manager
          </p>
        </div>
        <Link
          href="/admin/finance/revenue"
          className="inline-flex min-h-12 items-center gap-1 text-[13px] font-medium text-primary hover:underline sm:min-h-0"
        >
          Revenue tracker
          <IconArrowRight className="size-3" aria-hidden />
        </Link>
      </div>

      <div className="mt-4 grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-muted-foreground">This month</h3>
          <div className="mt-1">
            <LedgerRow
              href="/admin/finance/revenue"
              label="Confirmed revenue"
              sub={confirmedSub ? confirmedSub.charAt(0).toUpperCase() + confirmedSub.slice(1) : undefined}
              value={formatNaira(p.confirmed)}
            />
            <LedgerRow
              href="/admin/finance/payouts"
              label="Less: worker payouts"
              value={formatNaira(p.workerPayouts)}
              share={shareOf(p.workerPayouts, p.confirmed)}
            />
            <LedgerRow
              href="/admin/finance/payouts"
              label="Less: ambassador commissions"
              value={formatNaira(p.ambassadorComm)}
              share={shareOf(p.ambassadorComm, p.confirmed)}
            />
            <LedgerRow
              href="/admin/finance/payouts"
              label="Less: HOG commission"
              value={formatNaira(p.hogComm)}
              share={shareOf(p.hogComm, p.confirmed)}
            />
            <LedgerRow
              href="/admin/finance/payouts"
              label="Less: COO commission"
              value={formatNaira(p.cooComm)}
              share={shareOf(p.cooComm, p.confirmed)}
            />
            {Math.abs(trueUps) >= TRUE_UP_MIN ? (
              <LedgerRow
                href="/admin/finance/buckets"
                label={trueUps > 0 ? "Plus: true-ups on earlier payments" : "Less: true-ups on earlier payments"}
                sub="Shares re-split this month: an ambassador added, or a job cancelled, after it was paid"
                value={formatNaira(Math.abs(trueUps))}
              />
            ) : null}
            <LedgerRow
              href="/admin/finance/buckets"
              label="Retained by EduCraft"
              aside={margin}
              value={formatNaira(p.retained)}
              strong
            />
          </div>
        </div>

        <div className="min-w-0">
          <h3 className="text-sm font-medium text-muted-foreground">Still to collect</h3>
          <div className="mt-1">
            <LedgerRow
              href="/admin/finance/revenue?view=outstanding"
              label="Outstanding balances"
              sub={
                p.outstanding.projects > 0
                  ? `${plural(p.outstanding.clients, "client")} · ${plural(p.outstanding.projects, "project")}`
                  : "Nothing outstanding"
              }
              value={formatNaira(p.outstanding.amount)}
            />
            <LedgerRow
              href="/admin/projects?status=APPROVED"
              label="Projects approved, balance pending"
              sub="Passed review, waiting on the 55% balance"
              value={String(p.approvedBalancePending)}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export function RevenuePositionSkeleton() {
  return (
    <div className="min-w-0" aria-hidden>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-2 h-3 w-64 max-w-full" />
      <div className="mt-4 grid gap-8 lg:grid-cols-2 lg:gap-12">
        {[6, 2].map((rows, col) => (
          <div key={col} className="min-w-0">
            <Skeleton className="h-3.5 w-24" />
            <div className="mt-1">
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex min-h-12 items-center justify-between gap-3 py-1.5 sm:min-h-10">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3.5 w-20" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
