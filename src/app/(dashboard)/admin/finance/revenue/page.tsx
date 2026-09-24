import type { Metadata } from "next";
import { LuBanknote, LuClock, LuCopy, LuReceipt } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { canVerifyPayments } from "@/lib/rbac";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatsCard, STATS_GRID } from "@/components/dashboard/StatsCard";
import { RevenueViewTabs } from "@/components/finance/revenue/RevenueViewTabs";
import { RevenueFilterBar } from "@/components/finance/revenue/RevenueFilterBar";
import { RevenueTable } from "@/components/finance/revenue/RevenueTable";
import { RevenuePager } from "@/components/finance/revenue/RevenuePager";
import { RecordPaymentDialog } from "@/components/finance/revenue/RecordPaymentDialog";
import { OutstandingBalances } from "@/components/finance/revenue/OutstandingBalances";
import { getRevenueFilterOptions, getRevenueSummary, listOutstandingBalances, listRevenue } from "@/lib/services/finance/revenue";
import { revenueQuerySchema } from "@/lib/validations/finance";
import { formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Revenue tracker" };
export const dynamic = "force-dynamic";

/**
 * Every naira that comes in from clients. The month's net figure leads; the
 * payments table (filters, sort, confirm / refuse) or the outstanding-balance
 * chase list follows, chosen by `?view=`.
 */
export default async function RevenuePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const session = await auth();
  const canAct = canVerifyPayments(session?.user?.role);
  const view = searchParams.view === "outstanding" ? "outstanding" : "payments";
  const parsed = revenueQuerySchema.safeParse(searchParams);
  const query = parsed.success ? parsed.data : {};

  const [summary, outstanding, options, list] = await Promise.all([
    getRevenueSummary(),
    listOutstandingBalances(),
    getRevenueFilterOptions(),
    view === "payments" ? listRevenue(query) : null,
  ]);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Revenue tracker"
        description="Every payment from a client. Confirming one moves EduCraft's retained share into the four buckets; only confirmed money counts."
        back={{ href: "/admin/finance", label: "Finance" }}
        actions={canAct ? <RecordPaymentDialog /> : null}
      />

      <section aria-label="This month" className={STATS_GRID}>
        <StatsCard
          label="Revenue this month"
          value={formatNaira(summary.netThisMonth)}
          detail={summary.refundsThisMonth > 0 ? `${formatNaira(summary.confirmedThisMonth)} in, ${formatNaira(summary.refundsThisMonth)} refunded` : "Confirmed client payments, net of refunds"}
          icon={LuBanknote}
          tone="success"
        />
        <StatsCard
          label="Awaiting verification"
          value={formatNaira(summary.awaiting.amount)}
          detail={`${summary.awaiting.count} payment${summary.awaiting.count === 1 ? "" : "s"} marked paid`}
          detailTone={summary.awaiting.count > 0 ? "gold" : "muted"}
          icon={LuClock}
          tone="gold"
          href="/admin/finance/revenue?status=Pending"
        />
        <StatsCard
          label="Outstanding balances"
          value={formatNaira(outstanding.total.amount)}
          detail={`${outstanding.total.count} project${outstanding.total.count === 1 ? "" : "s"} owe a balance`}
          detailTone={outstanding.bands.escalate.count > 0 ? "danger" : "muted"}
          icon={LuReceipt}
          href="/admin/finance/revenue?view=outstanding"
        />
        <StatsCard
          label="Held as duplicate"
          value={formatNaira(summary.duplicates.amount)}
          detail={summary.duplicates.count > 0 ? `${summary.duplicates.count} to refund` : "No double payments"}
          detailTone={summary.duplicates.count > 0 ? "danger" : "muted"}
          icon={LuCopy}
          tone={summary.duplicates.count > 0 ? "danger" : "primary"}
          href="/admin/finance/revenue?status=Duplicate"
        />
      </section>

      <RevenueViewTabs active={view} outstandingCount={outstanding.total.count} />

      {view === "payments" && list ? (
        <section className="space-y-5" aria-label="Payments">
          <RevenueFilterBar options={options} />
          {list.filtered.pendingCount > 0 || list.filtered.refundsOut > 0 ? (
            <p className="text-[13px] text-muted-foreground">
              In this view: {formatNaira(list.filtered.confirmedIn)} confirmed
              {list.filtered.refundsOut > 0 ? `, ${formatNaira(list.filtered.refundsOut)} refunded` : ""}
              {list.filtered.pendingCount > 0
                ? `, ${formatNaira(list.filtered.pendingAmount)} awaiting verification (${list.filtered.pendingCount})`
                : ""}
              .
            </p>
          ) : null}
          <RevenueTable rows={list.rows} canAct={canAct} />
          <RevenuePager page={list.page} pageCount={list.pageCount} total={list.total} pageSize={list.pageSize} />
        </section>
      ) : (
        <section aria-label="Outstanding balances">
          <OutstandingBalances data={outstanding} />
        </section>
      )}
    </div>
  );
}
