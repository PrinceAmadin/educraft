import type { Metadata } from "next";
import {
  LuTrendingUp,
  LuWallet,
  LuPiggyBank,
  LuFolderKanban,
  LuCircleCheck,
  LuCircleX,
  LuClock,
  LuShieldCheck,
  LuUserCog,
  LuMegaphone,
  LuUserPlus,
  LuLock,
} from "react-icons/lu";
import { auth } from "@/lib/auth";
import { StatsCard, STATS_GRID } from "@/components/dashboard/StatsCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { MonthPicker } from "@/components/reports/MonthPicker";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import { getMonthlyReport, resolveMonth } from "@/lib/services/reports";
import { formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-zone px-6 py-16 text-center">
        <span className="rounded-lg bg-elevated p-2.5 text-muted-foreground">
          <LuLock className="size-6" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-medium text-foreground">Founder financials</p>
          <p className="mx-auto mt-1 max-w-[42ch] text-xs text-muted-foreground">
            Reports show company-wide revenue and profit. Ask a Super Admin for access.
          </p>
        </div>
      </div>
    );
  }

  const report = await getMonthlyReport(searchParams.month);
  const { month: currentMonth } = resolveMonth(undefined);

  return (
    <div className="space-y-12">
      <PageHeader
        title="Reports"
        description={`${report.monthLabel} — generated from the database.`}
        actions={
          <>
            <MonthPicker month={report.month} currentMonth={currentMonth} />
            <ReportExportButtons report={report} />
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
          <StatsCard
            label="Expenses"
            value={formatNaira(report.revenue.expenses)}
            icon={LuWallet}
            tone="danger"
          />
        </div>
        <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-3 rounded-2xl bg-zone p-5 text-sm sm:grid-cols-2">
          <BreakdownRow label="Worker payouts" value={formatNaira(report.revenue.workerPayouts)} />
          <BreakdownRow label="Ambassador commissions" value={formatNaira(report.revenue.ambassadorCommissions)} />
        </div>
      </section>

      <section>
        <h2 className="mb-5 text-[15px] font-semibold text-foreground">Project summary</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-5 lg:gap-x-10">
          <StatsCard label="Created" value={String(report.projects.created)} icon={LuFolderKanban} />
          <StatsCard label="Completed" value={String(report.projects.completed)} icon={LuCircleCheck} tone="success" />
          <StatsCard label="Cancelled" value={String(report.projects.cancelled)} icon={LuCircleX} tone="danger" />
          <StatsCard
            label="Avg. delivery time"
            value={report.projects.avgDeliveryDays != null ? `${report.projects.avgDeliveryDays}d` : "—"}
            icon={LuClock}
          />
          <StatsCard
            label="QA first-pass rate"
            value={report.projects.qaFirstPassRate != null ? `${report.projects.qaFirstPassRate}%` : "—"}
            icon={LuShieldCheck}
            tone="gold"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-5 text-[15px] font-semibold text-foreground">People summary</h2>
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-3">
          <StatsCard
            label="Active workers"
            value={String(report.people.activeWorkers)}
            detail={
              report.people.topWorker
                ? `Top: ${report.people.topWorker.name} (${formatNaira(report.people.topWorker.amount)})`
                : "No completions this period"
            }
            icon={LuUserCog}
          />
          <StatsCard
            label="Active ambassadors"
            value={String(report.people.activeAmbassadors)}
            detail={
              report.people.topAmbassador
                ? `Top: ${report.people.topAmbassador.name} (${formatNaira(report.people.topAmbassador.amount)})`
                : "No completions this period"
            }
            icon={LuMegaphone}
          />
          <StatsCard label="New clients" value={String(report.people.newClients)} icon={LuUserPlus} />
        </div>
      </section>
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
