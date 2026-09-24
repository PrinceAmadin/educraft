import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { canMarkPayoutsPaid, effectiveRole } from "@/lib/rbac";
import { PageHeader } from "@/components/shared/PageHeader";
import { MonthPicker } from "@/components/reports/MonthPicker";
import { PayoutSection, type PayoutGroupView } from "@/components/finance/payouts/PayoutSection";
import { BonusPanel } from "@/components/finance/payouts/BonusPanel";
import { CooPayoutPanel } from "@/components/finance/payouts/CooPayoutPanel";
import { calculateMonthlyPayouts, getCooPayoutView, getPayoutMonth, type Bank } from "@/lib/services/finance/payouts-engine";
import { currentMonthKey } from "@/lib/services/finance/surplus";
import { payoutsQuerySchema } from "@/lib/validations/finance-payouts";
import { cn, formatDateTime, formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Payout engine" };
export const dynamic = "force-dynamic";

function bankLine(b: Bank): string | null {
  if (!b.bankName && !b.accountNumber) return null;
  return [b.bankName ?? "Bank not set", b.accountNumber, b.accountName].filter(Boolean).join(" · ");
}

function tierLabel(tier: string): string {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

/**
 * The payout engine. The founder and the CFO see every leg owed for the
 * month — workers, ambassadors, executives, bonuses — calculated from
 * completed projects, and record the transfers. The COO sees only the
 * worker list and submits it.
 */
export default async function PayoutsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const session = await auth();
  const role = session?.user?.role;
  const parsed = payoutsQuerySchema.safeParse(searchParams);
  const currentMonth = currentMonthKey();
  const requested = parsed.success ? parsed.data.month : undefined;
  const month = requested && requested <= currentMonth ? requested : currentMonth;

  await calculateMonthlyPayouts(month);

  if (effectiveRole(role) === "COO") {
    const view = await getCooPayoutView(month);
    return (
      <div className="space-y-8">
        <PageHeader
          title="Submit monthly payout list"
          description="The worker payouts the engine calculated from this month's completed projects. Review them and submit the list to the CFO, who records the transfers."
          actions={<MonthPicker month={month} currentMonth={currentMonth} basePath="/admin/finance/payouts" />}
        />
        <CooPayoutPanel data={view} />
      </div>
    );
  }

  const data = await getPayoutMonth(month);
  const canMarkPaid = canMarkPayoutsPaid(role);
  const exportHref = `/api/admin/finance/payouts/export?month=${month}`;

  const workers: PayoutGroupView[] = data.workers.map((g) => ({
    recipientId: g.recipientId,
    name: g.name,
    code: g.code,
    href: `/admin/workers/${g.recipientId}`,
    details: [`${g.projectCount} project${g.projectCount === 1 ? "" : "s"}`],
    bank: bankLine(g.bank),
    total: g.total,
    paid: g.paid,
    unpaid: g.unpaid,
    status: g.status,
    paidAt: g.paidAt,
    lines: g.lines,
  }));
  const ambassadors: PayoutGroupView[] = data.ambassadors.map((g) => ({
    recipientId: g.recipientId,
    name: g.name,
    code: g.code,
    href: `/admin/ambassadors/${g.recipientId}`,
    chip: `${tierLabel(g.tier)} tier`,
    details: [
      g.personal.count > 0 ? `${g.personal.count} client${g.personal.count === 1 ? "" : "s"} referred${g.personal.rate != null ? ` · ${g.personal.rate}%` : ""} · ${formatNaira(g.personal.amount)}` : null,
      g.overrides.count > 0 ? `${g.overrides.count} Core override${g.overrides.count === 1 ? "" : "s"} from sub-ambassadors · ${formatNaira(g.overrides.amount)}` : null,
    ].filter((x): x is string => x != null),
    bank: bankLine(g.bank),
    total: g.total,
    paid: g.paid,
    unpaid: g.unpaid,
    status: g.status,
    paidAt: g.paidAt,
    lines: g.lines,
  }));
  const executives: PayoutGroupView[] = data.executives.map((g) => ({
    recipientId: g.recipientId,
    name: g.name,
    code: g.recipientId,
    href: null,
    chip: `${g.rate}%`,
    details: [g.recipientId === "HOG" ? `${g.projectCount} ambassador-driven project${g.projectCount === 1 ? "" : "s"}` : `${g.projectCount} project${g.projectCount === 1 ? "" : "s"} delivered`],
    bank: null,
    total: g.total,
    paid: g.paid,
    unpaid: g.unpaid,
    status: g.status,
    paidAt: g.paidAt,
    lines: g.lines,
  }));

  const s = data.submission;
  const stale = s != null && (s.workerTotal !== data.totals.workers.owed || s.workerCount !== data.totals.workers.recipients);

  return (
    <div className="space-y-12">
      <PageHeader
        title="Payout engine"
        description={
          canMarkPaid
            ? "Everything owed on the month's completed projects, calculated automatically. Review, then mark transfers as paid."
            : "Everything owed on the month's completed projects, calculated automatically."
        }
        back={{ href: "/admin/finance", label: "Finance" }}
        actions={<MonthPicker month={month} currentMonth={currentMonth} basePath="/admin/finance/payouts" />}
      />

      <section aria-label="Month totals" className="grid gap-x-10 gap-y-6 rounded-2xl bg-zone p-5 sm:grid-cols-3 sm:p-7">
        <div>
          <p className="meta-label">Owed in {data.monthLabel}</p>
          <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-foreground">{formatNaira(data.totals.grand.owed)}</p>
        </div>
        <div>
          <p className="meta-label">Paid</p>
          <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-success">{formatNaira(data.totals.grand.paid)}</p>
        </div>
        <div>
          <p className="meta-label">Still unpaid</p>
          <p className={cn("mt-1 font-mono text-2xl font-medium tabular-nums", data.totals.grand.unpaid > 0 ? "text-gold" : "text-foreground")}>
            {formatNaira(data.totals.grand.unpaid)}
          </p>
        </div>
        {s ? (
          <p className={cn("sm:col-span-3 text-[13px]", stale ? "text-gold" : "text-muted-foreground")}>
            COO submission by {s.submittedByName}, {formatDateTime(s.submittedAt)}: {formatNaira(s.workerTotal)} across {s.workerCount} worker{s.workerCount === 1 ? "" : "s"}
            {s.note ? ` — “${s.note}”` : ""}
            {stale ? ` · the engine now says ${formatNaira(data.totals.workers.owed)} across ${data.totals.workers.recipients}` : " · matches the engine"}
            {s.revisions > 0 ? ` · ${s.revisions} earlier version${s.revisions === 1 ? "" : "s"}` : ""}
          </p>
        ) : (
          <p className="sm:col-span-3 text-[13px] text-muted-foreground">The COO has not submitted this month&apos;s list yet. The figures below are the engine&apos;s own.</p>
        )}
      </section>

      <PayoutSection
        title={`Worker payouts — ${data.monthLabel}`}
        month={month}
        recipientType="WORKER"
        groups={workers}
        totals={data.totals.workers}
        canMarkPaid={canMarkPaid}
        emptyLabel="No worker payouts this month: none of the month's projects has reached Completed."
        exportHref={exportHref}
      />

      <PayoutSection
        title={`Ambassador commissions — ${data.monthLabel}`}
        month={month}
        recipientType="AMBASSADOR"
        groups={ambassadors}
        totals={data.totals.ambassadors}
        canMarkPaid={canMarkPaid}
        emptyLabel="No ambassador commissions this month."
        countNoun="referral"
      />

      <PayoutSection
        title={`Executive commissions — ${data.monthLabel}`}
        month={month}
        recipientType="EXECUTIVE"
        groups={executives}
        totals={data.totals.executives}
        canMarkPaid={canMarkPaid}
        emptyLabel="No executive commissions this month."
      />

      <BonusPanel month={month} metrics={data.metrics} bonuses={data.bonuses} canAct={canMarkPaid} />
    </div>
  );
}
