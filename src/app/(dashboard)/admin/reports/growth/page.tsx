import type { Metadata } from "next";
import { LuMegaphone, LuUserPlus } from "react-icons/lu";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { InProgressNotice } from "@/components/shared/InProgressNotice";
import { MonthPicker } from "@/components/reports/MonthPicker";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import { getMonthlyReport, resolveMonth } from "@/lib/services/reports";
import { formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Growth reports" };
export const dynamic = "force-dynamic";

/** The Head of Growth's report: ambassadors and new clients from the monthly report, with Phase 3 still to come. */
export default async function GrowthReportsPage({ searchParams }: { searchParams: { month?: string } }) {
  const report = await getMonthlyReport(searchParams.month);
  const { month: currentMonth } = resolveMonth(undefined);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Growth reports"
        description={`${report.monthLabel} — ambassadors and new clients, generated from the database.`}
        actions={
          <>
            <MonthPicker month={report.month} currentMonth={currentMonth} basePath="/admin/reports/growth" />
            <ReportExportButtons report={report} include={["people"]} domain="growth" />
          </>
        }
      />

      <section>
        <h2 className="mb-5 text-[15px] font-semibold text-foreground">Ambassadors and clients</h2>
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-3">
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

      <InProgressNotice
        phase="Phase 3 — Ambassador Platform"
        summary="This report grows into the Head of Growth's full monthly statement."
        items={[
          "Activation rate: ambassadors who referred a paying client this month, against the 30% target",
          "Paying clients referred per ambassador and per tier (Bronze, Silver, Gold, Platinum)",
          "School by school reach and the schools approaching 10+ active clients",
          "Referral link clicks against orders, from the click analytics",
          "The Head of Growth's bonus tracker, calculated from all of the above",
        ]}
      />
    </div>
  );
}
