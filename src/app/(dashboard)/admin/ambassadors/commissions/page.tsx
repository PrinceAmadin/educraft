import type { Metadata } from "next";
import Link from "next/link";
import { LuDownload, LuWallet, LuUsers, LuTrophy } from "react-icons/lu";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { StatsCard, STATS_GRID } from "@/components/dashboard/StatsCard";
import { AmbassadorTabs } from "@/components/ambassadors/AmbassadorTabs";
import { TierBadge } from "@/components/ambassadors/TierBadge";
import { ActivityBadge } from "@/components/ambassadors/platform/ActivityBadge";
import { MonthPicker } from "@/components/reports/MonthPicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ExtendChallengeButton, HistoryFilters, ProcessBonusesButton, WhatsappUpdateButton } from "@/components/ambassadors/platform/CommissionActions";
import { EmptyState } from "@/components/shared/EmptyState";
import { db } from "@/lib/db";
import { CHALLENGE_BONUS, currentQuarterKey, getCommissionHistory, getCommissionMonth, getQuarterTracker, recentQuarterKeys, type BonusState, type TrackerRow } from "@/lib/services/ambassador-platform/commissions";
import { currentMonthKey } from "@/lib/services/finance/surplus";
import { PLATINUM_QUARTERLY_BONUS_PER_CLIENT } from "@/lib/finance/commission-config";
import { commissionHistoryQuerySchema, commissionMonthQuerySchema, quarterQuerySchema } from "@/lib/validations/ambassador-platform";
import { cn, formatDate, formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Ambassador commissions" };
export const dynamic = "force-dynamic";

type Tab = "current" | "history" | "quarterly";
const TABS: { key: Tab; label: string }[] = [
  { key: "current", label: "Current month" },
  { key: "history", label: "Commission history" },
  { key: "quarterly", label: "Quarterly bonus tracker" },
];

/** Phase 3 Section 4 — Commissions: what ambassadors earn, from the same PayoutRecord ledger finance pays from. */
export default async function CommissionsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const flat = Object.fromEntries(Object.entries(searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const tab: Tab = flat.tab === "history" ? "history" : flat.tab === "quarterly" ? "quarterly" : "current";
  const pendingApplications = await db.ambassadorApplication.count({ where: { status: "PENDING" } });

  return (
    <div className="space-y-7">
      <PageHeader title="Commissions" description="What each ambassador has earned, the monthly earnings update for the community, and the quarterly bonuses." />
      <AmbassadorTabs active="commissions" pendingApplications={pendingApplications} />

      <nav aria-label="Commission views" className="no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-zone p-1">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/ambassadors/commissions?tab=${t.key}`} scroll={false} aria-current={t.key === tab ? "page" : undefined} className={cn("inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium transition-colors sm:px-4", t.key === tab ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "current" ? <CurrentMonth month={commissionMonthQuerySchema.parse(flat).month ?? currentMonthKey()} /> : tab === "history" ? <History flat={flat} /> : <Quarterly quarter={quarterQuerySchema.parse(flat).quarter ?? currentQuarterKey()} />}
    </div>
  );
}

async function CurrentMonth({ month }: { month: string }) {
  const data = await getCommissionMonth(month);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker month={month} currentMonth={currentMonthKey()} basePath="/admin/ambassadors/commissions" />
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <a href={`/api/admin/ambassadors/commissions/export?month=${month}`}>
              <LuDownload className="size-4" aria-hidden />
              Export CSV
            </a>
          </Button>
          <WhatsappUpdateButton message={data.whatsapp} monthLabel={data.label} />
        </div>
      </div>

      <section className={STATS_GRID} aria-label="Month totals">
        <StatsCard label="Total commissions" value={formatNaira(data.totals.total)} detail={`${data.totals.recipients} ambassador${data.totals.recipients === 1 ? "" : "s"} · ${data.label}`} icon={LuWallet} />
        <StatsCard label="Personal referrals" value={formatNaira(data.totals.personal)} detail="Their own tier rate" icon={LuUsers} />
        <StatsCard label="Core overrides" value={formatNaira(data.totals.overrides)} detail="15% minus the Sub's rate" icon={LuUsers} tone="gold" />
        <StatsCard label="Still to pay" value={formatNaira(data.totals.unpaid)} detail={data.totals.paid > 0 ? `${formatNaira(data.totals.paid)} paid so far` : "Nothing paid yet"} icon={LuWallet} tone={data.totals.unpaid > 0 ? "danger" : "success"} href="/admin/finance/payouts" />
      </section>

      {data.rows.length === 0 ? (
        <EmptyState icon={LuWallet} title={`No commissions for ${data.label}`} description="Commissions appear here as referred jobs earn them." className="py-10" />
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {data.rows.map((r) => (
              <li key={r.id} className="surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/admin/ambassadors/${r.id}`} className="min-w-0 truncate text-sm font-medium text-foreground hover:text-primary">
                    {r.name}
                  </Link>
                  <TierBadge tier={r.tier} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.school ?? "—"} · {r.code}
                </p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="meta-label">Personal</dt>
                    <dd className="font-mono text-foreground">{formatNaira(r.personal)}</dd>
                  </div>
                  <div>
                    <dt className="meta-label">Override</dt>
                    <dd className="font-mono text-foreground">{r.override ? formatNaira(r.override) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="meta-label">Total</dt>
                    <dd className="font-mono font-semibold text-foreground">{formatNaira(r.total)}</dd>
                  </div>
                </dl>
                <p className="mt-2">
                  <PayStatus status={r.status} paidAt={r.paidAt} />
                </p>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Ambassador</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Personal</TableHead>
                  <TableHead className="text-right">Override</TableHead>
                  <TableHead className="text-right">Bonus</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/admin/ambassadors/${r.id}`} className="text-sm font-medium text-foreground hover:text-primary">
                        {r.name}
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{r.school ?? "—"}</span>
                        <ActivityBadge status={r.activity} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <TierBadge tier={r.tier} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatNaira(r.personal)}
                      <span className="block text-xs text-muted-foreground">{r.personalCount} referral{r.personalCount === 1 ? "" : "s"}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{r.override ? formatNaira(r.override) : <span className="text-subtle">—</span>}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{r.bonus ? formatNaira(r.bonus) : <span className="text-subtle">—</span>}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">{formatNaira(r.total)}</TableCell>
                    <TableCell>
                      <PayStatus status={r.status} paidAt={r.paidAt} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <dl className="ml-auto max-w-sm space-y-1.5 text-sm">
            <Line label="Total commissions" value={formatNaira(data.totals.total)} strong />
            <Line label="Personal referrals" value={formatNaira(data.totals.personal)} />
            <Line label="Core overrides" value={formatNaira(data.totals.overrides)} />
            {data.totals.bonuses > 0 ? <Line label="Quarterly bonuses" value={formatNaira(data.totals.bonuses)} /> : null}
          </dl>
        </>
      )}
    </div>
  );
}

async function History({ flat }: { flat: Record<string, string | undefined> }) {
  const q = commissionHistoryQuerySchema.parse(flat);
  const data = await getCommissionHistory(q);
  return (
    <div className="space-y-5">
      <HistoryFilters />
      <p className="text-sm text-muted-foreground">
        <span className="font-mono text-foreground">{formatNaira(data.sums.owed)}</span> across {data.total} record{data.total === 1 ? "" : "s"} · <span className="font-mono text-foreground">{formatNaira(data.sums.paid)}</span> paid
      </p>
      {data.rows.length === 0 ? (
        <EmptyState icon={LuWallet} title="No payout records match" description="Change the filters, or wait for the next referred job." className="py-10" />
      ) : (
        <>
          <ul className="divide-y divide-border/80 md:hidden">
            {data.rows.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/admin/ambassadors/${r.ambassadorId}`} className="min-w-0 truncate text-sm font-medium text-foreground hover:text-primary">
                    {r.name}
                  </Link>
                  <span className="font-mono text-sm tabular-nums text-foreground">{formatNaira(r.amount)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.monthLabel} · {legLabel(r.leg)}
                  {r.projectCode ? ` · ${r.projectCode}` : ""}
                </p>
                <p className="mt-1">
                  <PayStatus status={r.status === "PAID" ? "PAID" : "UNPAID"} paidAt={r.paidAt} />
                </p>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Month</TableHead>
                  <TableHead>Ambassador</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Basis</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm text-muted-foreground">{r.monthLabel}</TableCell>
                    <TableCell>
                      <Link href={`/admin/ambassadors/${r.ambassadorId}`} className="text-sm font-medium text-foreground hover:text-primary">
                        {r.name}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">{r.code}</div>
                    </TableCell>
                    <TableCell>
                      <TierBadge tier={r.tier} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{legLabel(r.leg)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.projectCode ? (
                        <Link href={`/admin/projects/${r.projectCode}`} className="hover:text-primary">
                          {r.projectCode}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {r.clientName ? <span className="block font-sans">{r.clientName}</span> : null}
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate text-xs text-muted-foreground" title={r.basis}>
                      {r.basis}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(r.amount)}</TableCell>
                    <TableCell>
                      <PayStatus status={r.status === "PAID" ? "PAID" : "UNPAID"} paidAt={r.paidAt} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} noun="record" />
        </>
      )}
    </div>
  );
}

async function Quarterly({ quarter }: { quarter: string }) {
  const data = await getQuarterTracker(quarter);
  const options = recentQuarterKeys();
  const locked = data.rows.reduce((s, r) => s + (r.platinum.state === "LOCKED_IN" ? r.platinum.earned : 0) + (r.challenge.state === "LOCKED_IN" ? r.challenge.bonus : 0), 0);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Quarter" className="no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-zone p-1">
          {options.map((o) => (
            <Link key={o.key} href={`/admin/ambassadors/commissions?tab=quarterly&quarter=${o.key}`} scroll={false} aria-current={o.key === quarter ? "page" : undefined} className={cn("inline-flex min-h-10 shrink-0 items-center rounded-lg px-3 text-sm font-medium transition-colors", o.key === quarter ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")}>
              {o.label}
            </Link>
          ))}
        </nav>
        {data.canProcess ? <ProcessBonusesButton quarter={quarter} label={data.quarter.label} amount={locked} /> : <span className="text-xs text-muted-foreground">{data.ended ? (data.totals.processed > 0 ? "Bonuses processed — paid from the finance payout queue" : "Nothing left to process") : `Process button appears on ${formatDate(data.quarter.end)}`}</span>}
      </div>

      <section className={STATS_GRID} aria-label="Quarter totals">
        <StatsCard label="Platinum per-client bonus" value={formatNaira(data.totals.platinumEarned)} detail={`${formatNaira(PLATINUM_QUARTERLY_BONUS_PER_CLIENT)} per client referred in ${data.quarter.label}`} icon={LuTrophy} tone="gold" wrapLabel />
        <StatsCard label="Challenge bonuses" value={formatNaira(data.totals.challengeEarned)} detail={`${formatNaira(CHALLENGE_BONUS)} for 10+ clients in the quarter`} icon={LuTrophy} wrapLabel />
        <StatsCard label="In the challenge" value={String(data.totals.ambassadorsInChallenge)} detail="Ambassadors with a conversion this quarter" icon={LuUsers} wrapLabel />
        <StatsCard label="Processed" value={String(data.totals.processed)} detail="Bonus payouts created for finance" icon={LuWallet} tone="success" wrapLabel />
      </section>

      {data.rows.length === 0 ? (
        <EmptyState icon={LuTrophy} title={`No conversions in ${data.quarter.label} yet`} description="Ambassadors appear here as soon as one of their referrals pays." className="py-10" />
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {data.rows.map((r) => (
              <li key={r.id} className="surface p-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/admin/ambassadors/${r.id}`} className="min-w-0 truncate font-medium text-foreground hover:text-primary">
                    {r.name}
                  </Link>
                  <TierBadge tier={r.tier} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.quarterConversions} client{r.quarterConversions === 1 ? "" : "s"} this quarter
                </p>
                <p className="mt-2">
                  <span className="meta-label">Platinum bonus</span>
                  <PlatinumCell r={r} />
                </p>
                <p className="mt-2">
                  <span className="meta-label">Challenge</span>
                  <ChallengeCell r={r} quarter={quarter} />
                </p>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Ambassador</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">{data.quarter.label.split(" ")[0]} referrals</TableHead>
                  <TableHead>Platinum bonus</TableHead>
                  <TableHead>Quarterly challenge</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/admin/ambassadors/${r.id}`} className="text-sm font-medium text-foreground hover:text-primary">
                        {r.name}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">{r.code}</div>
                    </TableCell>
                    <TableCell>
                      <TierBadge tier={r.tier} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {r.quarterConversions} client{r.quarterConversions === 1 ? "" : "s"}
                    </TableCell>
                    <TableCell className="text-sm">
                      <PlatinumCell r={r} />
                    </TableCell>
                    <TableCell className="text-sm">
                      <ChallengeCell r={r} quarter={quarter} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Two different bonuses: the Platinum quarterly bonus is {formatNaira(PLATINUM_QUARTERLY_BONUS_PER_CLIENT)} per client referred in the quarter (Platinum only, paid quarterly); the quarterly challenge is a flat {formatNaira(CHALLENGE_BONUS)} for 10 or more clients in the quarter window, open to every tier, with one one-week extension the HOG can grant.
      </p>
    </div>
  );
}

function PlatinumCell({ r }: { r: TrackerRow }) {
  if (!r.platinum.eligible) return <span className="text-muted-foreground">Not Platinum{r.platinum.toPlatinum != null ? ` · ${r.platinum.toPlatinum} more conversion${r.platinum.toPlatinum === 1 ? "" : "s"}` : ""}</span>;
  return (
    <span className="block">
      <span className="font-mono tabular-nums text-foreground">{formatNaira(r.platinum.earned)}</span>
      <span className="block text-xs">
        <StateLabel state={r.platinum.state} />
      </span>
    </span>
  );
}

function ChallengeCell({ r, quarter }: { r: TrackerRow; quarter: string }) {
  const c = r.challenge;
  return (
    <span className="block">
      <span className="text-foreground">
        {c.count}/{c.target}
        {c.completed ? <span className="ml-1.5 font-mono text-success">{formatNaira(c.bonus)}</span> : null}
      </span>
      <span className="block text-xs">
        {c.completed ? (
          <StateLabel state={c.state} />
        ) : c.state === "NOT_EARNED" ? (
          <span className="text-muted-foreground">Not reached by {formatDate(c.lastDay)}</span>
        ) : (
          <span className="text-gold">
            In progress — needs {Math.max(0, c.target - c.count)} more by {formatDate(c.lastDay)}
            {c.extensionGranted ? " (extended)" : ""}
          </span>
        )}
      </span>
      {c.canExtend ? <ExtendChallengeButton ambassadorId={r.id} quarter={quarter} name={r.name} /> : null}
    </span>
  );
}

function StateLabel({ state }: { state: BonusState }) {
  const map: Record<BonusState, { label: string; className: string }> = {
    IN_PROGRESS: { label: "In progress — earned so far", className: "text-gold" },
    LOCKED_IN: { label: "Locked in — ready to process", className: "text-success" },
    PENDING_PAYOUT: { label: "Pending payout", className: "text-gold" },
    PAID: { label: "Paid", className: "text-success" },
    NOT_EARNED: { label: "Nothing earned", className: "text-muted-foreground" },
  };
  const s = map[state];
  return <span className={s.className}>{s.label}</span>;
}

function PayStatus({ status, paidAt }: { status: "PAID" | "UNPAID" | "PARTLY"; paidAt: string | null }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", status === "PAID" ? "bg-success/15 text-success" : status === "PARTLY" ? "bg-gold/15 text-gold" : "bg-zone text-muted-foreground")}>
      {status === "PAID" ? `Paid${paidAt ? ` ${formatDate(paidAt)}` : ""}` : status === "PARTLY" ? "Partly paid" : "Pending"}
    </span>
  );
}

function legLabel(leg: string): string {
  return leg === "AMBASSADOR" ? "Personal referral" : leg === "PARENT" ? "Core override" : leg === "BONUS" ? "Quarterly bonus" : leg;
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-1.5 last:border-0">
      <dt className={strong ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</dt>
      <dd className={cn("font-mono tabular-nums", strong ? "font-semibold text-foreground" : "text-foreground")}>{value}</dd>
    </div>
  );
}
