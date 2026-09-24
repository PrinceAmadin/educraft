import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { buildFinanceReportDocx, reportFilename } from "@/lib/finance/report-docx";
import { getFinanceReport, ReportError, type ReportType } from "@/lib/services/finance/reports";

const TYPES: ReportType[] = ["monthly", "semester", "annual"];

async function exportReport(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  const type = (req.nextUrl.searchParams.get("type") ?? "monthly") as ReportType;
  if (!TYPES.includes(type)) return badRequest("type must be monthly, semester or annual");
  try {
    const report = await getFinanceReport(type, req.nextUrl.searchParams.get("period"));
    const buffer = await buildFinanceReportDocx(report);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${reportFilename(report)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ReportError) return badRequest(error.message);
    return serverError("POST /api/admin/finance/reports/export", error);
  }
}

/** The report as a .docx for the executive team. The spec names POST; GET works too so a plain link can download it. */
export async function POST(req: NextRequest) {
  return exportReport(req);
}

export async function GET(req: NextRequest) {
  return exportReport(req);
}
