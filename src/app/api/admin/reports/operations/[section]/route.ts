import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { getOperationsReport } from "@/lib/services/operations/reports";
import { operationsReportDocx } from "@/lib/operations/report-docx";
import { operationsReportQuerySchema } from "@/lib/validations/operations";
import { opsError, parseQuery } from "@/lib/services/operations/route-helpers";

export const dynamic = "force-dynamic";

/**
 * One slice of the report:
 *   GET /pipeline-timing · GET /worker-performance · GET /department-breakdown (?month=)
 */
export async function GET(req: NextRequest, { params }: { params: { section: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const { month } = parseQuery(req, operationsReportQuerySchema);
    const report = await getOperationsReport(month);
    const base = { month: report.month, monthLabel: report.monthLabel };
    switch (params.section) {
      case "pipeline-timing":
        return NextResponse.json({ ...base, timing: report.timing });
      case "worker-performance":
        return NextResponse.json({ ...base, league: report.league, star: report.star });
      case "department-breakdown":
        return NextResponse.json({ ...base, departments: report.departments });
      case "supervisor-corrections":
        return NextResponse.json({ ...base, corrections: report.corrections });
      default:
        return NextResponse.json({ error: "Unknown section" }, { status: 404 });
    }
  } catch (error) {
    return opsError(`GET /api/admin/reports/operations/${params.section}`, error);
  }
}

/** POST /export { month } — the monthly report as a Word document. */
export async function POST(req: NextRequest, { params }: { params: { section: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  if (params.section !== "export") return NextResponse.json({ error: "Unknown section" }, { status: 404 });
  try {
    const raw = (await req.json().catch(() => ({}))) as { month?: unknown };
    const month = typeof raw.month === "string" && /^\d{4}-\d{2}$/.test(raw.month) ? raw.month : undefined;
    const report = await getOperationsReport(month);
    const buffer = await operationsReportDocx(report);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="educraft-operations-report-${report.month}.docx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return opsError("POST /api/admin/reports/operations/export", error);
  }
}
