import Link from "next/link";
import { LuCircleCheck, LuHourglass } from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatWatDate } from "@/lib/command-center/presentation";
import type {
  FinancePayload,
  FounderDrawStatus,
  PayoutGroupStatus,
  PayoutLineStatus,
} from "@/lib/command-center/types";
import { type AppIcon, IconArrowRight } from "@/lib/icons";
import { cn, formatNaira } from "@/lib/utils";

type Status = FinancePayload["payoutStatus"];

/**
 * Payout status (Phase 5, Financial pulse): what each group is owed from
 * this month's PayoutRecords — workers, ambassadors (personal referrals and
 * Core overrides together), HOG and COO — with a chip per line, the pending
 * total, the founder draws for the month and whether the COO has sent the
 * payout list. Every line links into the Finance Platform; nothing here
 * marks anything paid.
 */

const ROW =
  "-mx-2 flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors duration-fast hover:bg-zone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-10";

function LineBadge({ status }: { status: PayoutLineStatus }) {
  if (status === "PAID") {
    return (
      <Badge variant="success">
        <LuCircleCheck className="size-3" aria-hidden />
        Paid
      </Badge>
    );
  }
  if (status === "PENDING") {
    return (
      <Badge variant="gold">
        <LuHourglass className="size-3" aria-hidden />
        Pending
      </Badge>
    );
  }
  return (
    <Badge variant="neutral">
      <span aria-hidden>—</span>
      <span className="sr-only">Nothing owed</span>
    </Badge>
  );
}

const DRAW_BADGE: Record<
  FounderDrawStatus,
  { variant: "success" | "gold" | "neutral"; label: string; icon: AppIcon | null }
> = {
  NONE: { variant: "neutral", label: "No draw", icon: null },
  PENDING: { variant: "gold", label: "Not distributed", icon: LuHourglass },
  PARTIAL: { variant: "gold", label: "Partly distributed", icon: LuHourglass },
  DISTRIBUTED: { variant: "success", label: "Distributed", icon: LuCircleCheck },
};

const OVERDRAWN_BADGE: { variant: "success" | "gold" | "neutral"; label: string; icon: AppIcon | null } = {
  variant: "gold",
  label: "Above tier",
  icon: LuHourglass,
};

/** An executive's sub-line: the name, plus any performance bonus already inside the amount. */
function execSub(exec: Status["hog"]): string {
  const bonus = exec.bonus?.pending ?? 0;
  return bonus > 0 ? `${exec.name} · incl. ${formatNaira(bonus)} performance bonus` : exec.name;
}

/** One recipient line: label (+ sub-line), the amount that matters, a chip. */
function GroupRow({
  href,
  label,
  sub,
  group,
}: {
  href: string;
  label: string;
  sub: string | null;
  group: PayoutGroupStatus;
}) {
  // A paid line shows what was paid; a pending line what is still owed.
  const amount = group.status === "PAID" ? group.paid : group.pending;
  const note = group.status === "PENDING" && group.paid > 0 ? `${formatNaira(group.paid)} already paid` : null;
  const detail = [sub, note].filter(Boolean).join(" · ");
  return (
    <Link href={href} className={ROW}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-foreground">{label}</span>
        {detail ? <span className="mt-0.5 block text-[13px] text-muted-foreground">{detail}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-2.5">
        <span
          className={cn("font-mono tabular-nums", group.status === "NONE" ? "text-muted-foreground" : "text-foreground")}
        >
          {group.status === "NONE" ? "—" : formatNaira(amount)}
        </span>
        <LineBadge status={group.status} />
      </span>
    </Link>
  );
}

export function PayoutStatus({
  status,
  month,
  monthLabel,
  financeHref,
}: {
  status: Status;
  /** "YYYY-MM", for the payout page's month filter. */
  month: string;
  monthLabel: string;
  financeHref: string;
}) {
  const payoutsHref = `/admin/finance/payouts?month=${encodeURIComponent(month)}`;
  const draws = status.founderDraws;
  // A refund can drop the month below the tier its draws were paid at: say so rather than show "Distributed".
  const overdrawn = draws.distributed > draws.total;
  const drawMeta = overdrawn ? OVERDRAWN_BADGE : DRAW_BADGE[draws.status];
  const DrawIcon = drawMeta.icon;
  const drawAmount =
    draws.status === "NONE" ? null : draws.status === "DISTRIBUTED" ? draws.distributed : draws.outstanding;
  const drawUnderfunded = draws.status !== "NONE" && draws.status !== "DISTRIBUTED" && !draws.funded;

  return (
    <section aria-labelledby="cc-finance-payouts" className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id="cc-finance-payouts" className="text-[15px] font-semibold leading-tight text-foreground">
            Payout status
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">{monthLabel} · what each group is owed</p>
        </div>
        <Link
          href={payoutsHref}
          className="inline-flex min-h-12 items-center gap-1 text-[13px] font-medium text-primary hover:underline sm:min-h-0"
        >
          Payout engine
          <IconArrowRight className="size-3" aria-hidden />
        </Link>
      </div>

      <div className="mt-3">
        <GroupRow
          href={payoutsHref}
          label={`Workers (${status.workers.recipients})`}
          sub={null}
          group={status.workers}
        />
        <GroupRow
          href={payoutsHref}
          label={`Ambassadors (${status.ambassadors.recipients})`}
          sub={null}
          group={status.ambassadors}
        />
        <GroupRow href={payoutsHref} label="HOG" sub={execSub(status.hog)} group={status.hog} />
        <GroupRow href={payoutsHref} label="COO" sub={execSub(status.coo)} group={status.coo} />

        <div className="mt-1.5 border-t border-border pt-1.5">
          <Link href={payoutsHref} className={ROW}>
            <span className="font-medium text-foreground">Total pending</span>
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {formatNaira(status.totalPending)}
            </span>
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <Link href="/admin/finance/founder-draws" className={ROW}>
          <span className="min-w-0 flex-1">
            <span className="block text-foreground">Founder draws</span>
            <span className="mt-0.5 block text-[13px] text-muted-foreground">
              {overdrawn ? (
                `${formatNaira(draws.distributed)} drawn · this month's revenue tier now allows ${formatNaira(draws.total)}`
              ) : draws.status === "NONE" ? (
                "No draw at this month's revenue tier"
              ) : (
                <>
                  {formatNaira(draws.drawEach)} each · {formatNaira(draws.total)} total
                  {draws.status === "PARTIAL" ? ` · ${formatNaira(draws.distributed)} so far` : null}
                  {draws.tierMin > 0 ? ` · tier from ${formatNaira(draws.tierMin, { compact: true })}` : null}
                  {drawUnderfunded ? (
                    <span className="text-danger"> · Founder Distribution cannot fund it yet</span>
                  ) : null}
                </>
              )}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2.5">
            <span
              className={cn("font-mono tabular-nums", drawAmount === null ? "text-muted-foreground" : "text-foreground")}
            >
              {drawAmount === null ? "—" : formatNaira(drawAmount)}
            </span>
            <Badge variant={drawMeta.variant}>
              {DrawIcon ? <DrawIcon className="size-3" aria-hidden /> : null}
              {drawMeta.label}
            </Badge>
          </span>
        </Link>

        <Link href={payoutsHref} className={ROW}>
          <span className="min-w-0 flex-1">
            <span className="block text-foreground">COO payout list</span>
            <span className="mt-0.5 block text-[13px] text-muted-foreground">
              {status.submission
                ? `Submitted ${formatWatDate(status.submission.submittedAt)}`
                : "Not submitted yet — the COO reviews the worker list first"}
            </span>
          </span>
          {status.submission ? (
            <Badge variant="success" className="shrink-0">
              <LuCircleCheck className="size-3" aria-hidden />
              Submitted
            </Badge>
          ) : (
            <Badge variant="neutral" className="shrink-0">
              <LuHourglass className="size-3" aria-hidden />
              Waiting
            </Badge>
          )}
        </Link>
      </div>

      <p className="mt-4 text-[13px]">
        <Link
          href={financeHref}
          className="inline-flex min-h-12 items-center gap-1 font-medium text-primary hover:underline sm:min-h-0"
        >
          Go to Finance Platform
          <IconArrowRight className="size-3" aria-hidden />
        </Link>
      </p>
    </section>
  );
}

export function PayoutStatusSkeleton() {
  return (
    <div className="min-w-0" aria-hidden>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-2 h-3 w-56 max-w-full" />
      <div className="mt-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex min-h-12 items-center justify-between gap-3 py-1.5 sm:min-h-10">
            <Skeleton className="h-3.5 w-1/3" />
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex min-h-12 items-center justify-between gap-3 py-1.5 sm:min-h-10">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-4 h-3.5 w-40" />
    </div>
  );
}
