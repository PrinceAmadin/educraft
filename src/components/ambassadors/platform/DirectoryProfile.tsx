import Link from "next/link";
import { LuCalendarCheck, LuTrendingUp, LuWallet } from "react-icons/lu";
import { EmptyState } from "@/components/shared/EmptyState";
import { LuUsers } from "react-icons/lu";
import { SubTeam, type SubCandidate } from "@/components/ambassadors/platform/SubTeam";
import { LogReferralDialog, ReferralRowActions } from "@/components/ambassadors/platform/LogReferralDialog";
import { tierLabel } from "@/lib/ambassadors/tier-utils";
import type { DirectoryDetail } from "@/lib/services/ambassador-platform/directory";
import { cn, formatDate, formatNaira } from "@/lib/utils";

/**
 * The platform's view of one ambassador (Phase 3 Section 2 detail): the
 * performance summary from lifetime conversions, this quarter's challenge,
 * the sub-team, the current month's commission from PayoutRecord, the last
 * 20 referrals and earnings by month.
 */
export function DirectoryProfile({ detail, subCandidates }: { detail: DirectoryDetail; subCandidates: SubCandidate[] }) {
  const p = detail.performance;
  const ch = detail.quarter.challenge;
  return (
    <>
      <section className="surface p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <LuTrendingUp className="size-4 text-muted-foreground" aria-hidden />
          Performance summary
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <Stat label="Referrals submitted" value={String(p.referrals)} />
          <Stat label="Conversions" value={String(p.conversions)} />
          <Stat label="Conversion rate" value={p.conversionRate != null ? `${p.conversionRate}%` : "—"} />
          <Stat label="Lifetime earnings" value={formatNaira(p.lifetimeEarnings)} />
        </dl>
        <div className="mt-4">
          <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground">
              Current tier: <span className="font-medium text-foreground">{tierLabel(detail.tier)}</span>
            </span>
            <span className="text-muted-foreground">
              {p.nextTier ? (
                <>
                  Next tier ({tierLabel(p.nextTier)}): <span className="font-mono text-foreground">{p.toNext}</span> more conversion{p.toNext === 1 ? "" : "s"}
                </>
              ) : (
                "Top tier"
              )}
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border" aria-hidden>
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${p.percent}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {p.nextTier ? `Progress to ${tierLabel(p.nextTier)}: ${p.percent}%` : `Platinum — ${p.conversions} lifetime conversions`}
          </p>
        </div>
      </section>

      <section className="surface p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <LuCalendarCheck className="size-4 text-muted-foreground" aria-hidden />
          This quarter ({detail.quarter.label})
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Line label="Conversions this quarter" value={String(detail.quarter.conversions)} />
          <div className="flex items-start justify-between gap-4 border-b border-border pb-2">
            <dt className="text-muted-foreground">Quarterly challenge</dt>
            <dd className="text-right text-foreground">
              <ChallengeLine ch={ch} />
            </dd>
          </div>
          <Line label={ch.completed ? (ch.bonusPaid ? "Quarterly bonus (paid)" : "Quarterly bonus (earned)") : "Quarterly bonus (if completed)"} value={formatNaira(ch.bonusAmount)} />
        </dl>
      </section>

      <SubTeam coreId={detail.id} coreName={detail.fullName} coreTier={detail.tier} subTeam={detail.subTeam} canHaveSubs={detail.canHaveSubs} slotsLeft={detail.subSlotsLeft} candidates={subCandidates} />

      <section className="surface p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <LuWallet className="size-4 text-muted-foreground" aria-hidden />
          Commission breakdown ({detail.commission.label})
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Line label={`Personal referrals: ${detail.commission.personal.count} client${detail.commission.personal.count === 1 ? "" : "s"}`} value={formatNaira(detail.commission.personal.amount)} />
          {detail.commission.overrides.map((o) => (
            <Line key={o.subId} label={`Core override — ${o.subName}: ${o.count} client${o.count === 1 ? "" : "s"} (Sub ${tierLabel(o.subTier)})`} value={formatNaira(o.amount)} />
          ))}
          {detail.subTeam
            .filter((s) => !detail.commission.overrides.some((o) => o.subId === s.id))
            .map((s) => (
              <Line key={s.id} label={`Core override — ${s.fullName}: 0 clients this month`} value={formatNaira(0)} />
            ))}
          <Line label="Total this month" value={formatNaira(detail.commission.total)} strong detail={detail.commission.total === 0 ? undefined : detail.commission.unpaid > 0 ? "Pending payout" : "Paid"} />
        </dl>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Referral history
            <span className="ml-2 font-mono text-xs text-muted-foreground">last {Math.min(20, detail.referralHistory.length)}</span>
          </h2>
          <LogReferralDialog ambassadorId={detail.id} ambassadorName={detail.fullName} />
        </div>
        {detail.referralHistory.length === 0 ? (
          <EmptyState icon={LuUsers} title="No referrals yet" description="Students this ambassador brings in appear here as they are logged or order." className="py-8" />
        ) : (
          <ul className="divide-y divide-border/80">
            {detail.referralHistory.map((r) => (
              <li key={r.id} className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-3">
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block truncate text-sm text-foreground">
                    {r.clientName}
                    {r.serviceName ? <span className="text-muted-foreground"> · {r.serviceName}</span> : null}
                  </span>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {formatDate(r.submittedAt)}
                    {r.projectCode ? (
                      <>
                        {" · "}
                        <Link href={`/admin/projects/${r.projectCode}`} className="hover:text-primary">
                          {r.projectCode}
                        </Link>
                      </>
                    ) : null}
                  </span>
                </span>
                <span className="flex basis-full items-center justify-between gap-3 sm:basis-auto sm:justify-end">
                  <ReferralStatus status={r.status} />
                  {r.status === "PENDING" && !r.projectCode ? <ReferralRowActions ambassadorId={detail.id} referralId={r.id} /> : null}
                  <span className="font-mono text-sm tabular-nums text-foreground sm:w-20 sm:text-right">{r.commission != null ? formatNaira(r.commission) : "—"}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Earnings history</h2>
        {detail.earnings.length === 0 ? (
          <p className="rounded-2xl bg-zone px-4 py-6 text-sm text-muted-foreground">No commission recorded yet. Each confirmed downpayment on a referred order adds a month here.</p>
        ) : (
          <ul className="divide-y divide-border/80">
            {detail.earnings.map((m) => (
              <li key={m.month} className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="text-foreground">{m.label}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono tabular-nums text-foreground">{formatNaira(m.owed)}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", m.status === "PAID" ? "bg-success/15 text-success" : m.status === "PARTLY" ? "bg-gold/15 text-gold" : "bg-zone text-muted-foreground")}>
                    {m.status === "PAID" ? `Paid${m.paidAt ? ` ${formatDate(m.paidAt)}` : ""}` : m.status === "PARTLY" ? "Partly paid" : "Pending"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function ChallengeLine({ ch }: { ch: DirectoryDetail["quarter"]["challenge"] }) {
  const end = formatDate(ch.extensionGranted && ch.extensionEndDate ? ch.extensionEndDate : ch.endDate);
  if (ch.state === "COMPLETED") return <span className="text-success">Completed — {ch.actualCount}/{ch.targetCount}</span>;
  if (ch.state === "EXPIRED") return <span className="text-muted-foreground">Missed — {ch.actualCount}/{ch.targetCount} by {end}</span>;
  return (
    <>
      <span className="text-gold">In progress</span>
      <span className="block text-xs text-muted-foreground">
        needs {Math.max(0, ch.targetCount - ch.actualCount)} more by {end}
        {ch.extensionGranted ? " (extended)" : ""}
      </span>
    </>
  );
}

const REFERRAL_STATUS: Record<string, { label: string; className: string }> = {
  CONVERTED: { label: "Converted", className: "bg-success/15 text-success" },
  PENDING: { label: "Pending", className: "bg-gold/15 text-gold" },
  LOST: { label: "Lost", className: "bg-zone text-muted-foreground" },
  CANCELLED: { label: "Cancelled", className: "bg-danger/15 text-danger" },
};

function ReferralStatus({ status }: { status: string }) {
  const s = REFERRAL_STATUS[status] ?? { label: status, className: "bg-zone text-muted-foreground" };
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", s.className)}>{s.label}</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="meta-label">{label}</dt>
      <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function Line({ label, value, strong, detail }: { label: string; value: string; strong?: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-2 last:border-0">
      <dt className={strong ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</dt>
      <dd className={cn("text-right font-mono tabular-nums", strong ? "font-semibold text-foreground" : "text-foreground")}>
        {value}
        {detail ? <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">{detail}</span> : null}
      </dd>
    </div>
  );
}
