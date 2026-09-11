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
import { StatsCard } from "@/components/dashboard/StatsCard";
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
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">{report.monthLabel} — auto-generated from the database.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker month={report.month} currentMonth={currentMonth} />
          <ReportExportButtons report={report} />
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Revenue summary
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
        <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-2">
          <BreakdownRow label="Worker payouts" value={formatNaira(report.revenue.workerPayouts)} />
          <BreakdownRow label="Ambassador commissions" value={formatNaira(report.revenue.ambassadorCommissions)} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Project summary
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          People summary
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
