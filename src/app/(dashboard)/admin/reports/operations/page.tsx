import type { Metadata } from "next";
import { LuCircleCheck, LuCircleX, LuClock, LuFolderKanban, LuShieldCheck, LuUserCog } from "react-icons/lu";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { InProgressNotice } from "@/components/shared/InProgressNotice";
import { MonthPicker } from "@/components/reports/MonthPicker";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import { getMonthlyReport, resolveMonth } from "@/lib/services/reports";
import { formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Operations reports" };
export const dynamic = "force-dynamic";

/** The COO's report: the project and worker side of the monthly report, with Phase 4 still to come. */
export default async function OperationsReportsPage({ searchParams }: { searchParams: { month?: string } }) {
  const report = await getMonthlyReport(searchParams.month);
  const { month: currentMonth } = resolveMonth(undefined);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Operations reports"
        description={`${report.monthLabel} — projects, delivery and QA, generated from the database.`}
        actions={
          <>
            <MonthPicker month={report.month} currentMonth={currentMonth} basePath="/admin/reports/operations" />
            <ReportExportButtons report={report} include={["projects"]} domain="operations" />
          </>
        }
      />

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
            detail="target 85%"
            icon={LuShieldCheck}
            tone="gold"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-5 text-[15px] font-semibold text-foreground">Workers</h2>
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
        </div>
      </section>

      <InProgressNotice
        phase="Phase 4 — Operations Platform"
        summary="This report grows into the COO's full production statement."
        items={[
          "On-time delivery rate against the 97% target",
          "Supervisor rejections and revision counts per project and per worker",
          "Worker capacity and throughput: assigned, in progress, submitted",
          "Client satisfaction from delivered projects",
          "The COO's bonus tracker, calculated from all of the above",
        ]}
      />
    </div>
  );
}
