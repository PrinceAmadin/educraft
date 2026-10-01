import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoles, serverError } from "@/lib/api";
import { getStatement } from "@/lib/services/finance/weekly-statement";
import { buildStatementPdf, statementFilename } from "@/lib/finance/statement-pdf";
import { buildStatementXlsx, statementXlsxFilename } from "@/lib/finance/statement-xlsx";
import { getHqContact } from "@/lib/services/hq-contact";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** Download a weekly statement as PDF or .xlsx, rendered on demand. Founder + CFO. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;

  const format = new URL(req.url).searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";
  try {
    const statement = await getStatement(params.id);
    if (!statement) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (format === "xlsx") {
      const buf = await buildStatementXlsx(statement.data);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${statementXlsxFilename(statement.data)}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    const hq = await getHqContact();
    const buf = buildStatementPdf(statement.data, { phone: hq.phone, email: hq.email });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${statementFilename(statement.data)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return serverError("GET /api/admin/finance/statements/[id]/download", error);
  }
}
