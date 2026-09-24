import type { Metadata } from "next";
import { LuPiggyBank, LuTrendingUp, LuWallet } from "react-icons/lu";
import { StatsCard, STATS_GRID } from "@/components/dashboard/StatsCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { InProgressNotice } from "@/components/shared/InProgressNotice";
import { MonthPicker } from "@/components/reports/MonthPicker";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import { getMonthlyReport, resolveMonth } from "@/lib/services/reports";
import { formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Finance reports" };
export const dynamic = "force-dynamic";

/** The CFO's report: the revenue side of the monthly report, with the Phase 2 platform still to come. */
export default async function FinanceReportsPage({ searchParams }: { searchParams: { month?: string } }) {
  const report = await getMonthlyReport(searchParams.month);
  const { month: currentMonth } = resolveMonth(undefined);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Finance reports"
        description={`${report.monthLabel} — revenue, payouts and profit, generated from the database.`}
        actions={
          <>
            <MonthPicker month={report.month} currentMonth={currentMonth} basePath="/admin/reports/finance" />
            <ReportExportButtons report={report} include={["revenue"]} domain="finance" />
          </>
        }
      />

      <section>
        <h2 className="mb-5 text-[15px] font-semibold text-foreground">Revenue summary</h2>
        <div className={STATS_GRID}>
          <StatsCard label="Total revenue" value={formatNaira(report.revenue.totalRevenue)} icon={LuTrendingUp} />
          <StatsCard
            label="EduCraft share"
            value={formatNaira(report.revenue.educraftShare)}
            detail="after worker + ambassador payouts"
            icon={LuWallet}
            tone="gold"
          />
          <StatsCard
            label="Net profit"
            value={formatNaira(report.revenue.netProfit)}
            detail="after expenses"
            icon={LuPiggyBank}
            tone={report.revenue.netProfit >= 0 ? "success" : "danger"}
          />
          <StatsCard label="Expenses" value={formatNaira(report.revenue.expenses)} icon={LuWallet} tone="danger" />
        </div>
        <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-3 rounded-2xl bg-zone p-5 text-sm sm:grid-cols-2">
          <BreakdownRow label="Worker payouts" value={formatNaira(report.revenue.workerPayouts)} />
          <BreakdownRow label="Ambassador commissions (in expenses)" value={formatNaira(report.revenue.ambassadorCommissions)} />
        </div>
      </section>

      <InProgressNotice
        phase="Phase 2 — Finance Platform"
        summary="This report grows into the CFO's full monthly, semester and annual statements."
        items={[
          "Revenue tracker: every confirmed payment by client, project, service and method",
          "Payout engine totals: workers (40%), ambassadors by tier, HOG and COO commissions (2.5% each)",
          "Bucket balances from EduCraft's retained share: Operations Reserve, Growth Fund, Reinvestment, Founder Distribution",
          "Founder draws against the month's revenue tier",
          "Outstanding balances still to chase",
        ]}
      />
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}
