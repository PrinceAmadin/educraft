import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/PageHeader";
import { ReportControls } from "@/components/finance/reports/ReportControls";
import { ReportView } from "@/components/finance/reports/ReportView";
import { getFinanceReport, parsePeriod, ReportError, type ReportType } from "@/lib/services/finance/reports";

export const metadata: Metadata = { title: "Finance reports" };
export const dynamic = "force-dynamic";

const TYPES: ReportType[] = ["monthly", "semester", "annual"];

/** Monthly, semester and annual statements, on screen and as .docx for the executive team. */
export default async function FinanceReportsPage({ searchParams }: { searchParams: { type?: string; period?: string } }) {
  const type = TYPES.includes(searchParams.type as ReportType) ? (searchParams.type as ReportType) : "monthly";
  let report;
  let error: string | null = null;
  try {
    report = await getFinanceReport(type, searchParams.period);
  } catch (e) {
    if (e instanceof ReportError) {
      error = e.message;
      report = await getFinanceReport(type);
    } else throw e;
  }
  const latest = parsePeriod(type).key;
  const descriptions: Record<ReportType, string> = {
    monthly: "Revenue, payouts, what was retained, bucket movements, expenses, founder draws and outstanding balances, against the month before.",
    semester: "Every month of the semester, cumulative figures, the bucket surplus analysis and the semester bonus.",
    annual: "The full year, the annual profit share and the tax-relevant totals.",
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Finance reports" description={descriptions[type]} />
      <ReportControls type={type} period={report.data.period.key} latest={latest} />
      {error ? <p className="text-sm text-danger">{error} — showing the current period instead.</p> : null}
      <ReportView report={report} />
    </div>
  );
}
