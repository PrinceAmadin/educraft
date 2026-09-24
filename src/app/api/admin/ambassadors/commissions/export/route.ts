import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { getCommissionMonth } from "@/lib/services/ambassador-platform/commissions";
import { currentMonthKey } from "@/lib/services/finance/surplus";
import { commissionMonthQuerySchema } from "@/lib/validations/ambassador-platform";

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The month's ambassador commissions as CSV, one row per ambassador. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const q = commissionMonthQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const month = q.month ?? currentMonthKey();
  try {
    const data = await getCommissionMonth(month);
    const rows: string[][] = [["Month", "Ambassador", "Code", "Tier", "School", "Personal (NGN)", "Personal referrals", "Core override (NGN)", "Override referrals", "Bonus (NGN)", "Total (NGN)", "Paid (NGN)", "Status", "Paid on"]];
    for (const r of data.rows) rows.push([month, r.name, r.code, r.tier, r.school ?? "", String(r.personal), String(r.personalCount), String(r.override), String(r.overrideCount), String(r.bonus), String(r.total), String(r.paid), r.status, r.paidAt ? r.paidAt.slice(0, 10) : ""]);
    rows.push([month, "TOTAL", "", "", "", String(data.totals.personal), "", String(data.totals.overrides), "", String(data.totals.bonuses), String(data.totals.total), String(data.totals.paid), "", ""]);
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="educraft-ambassador-commissions-${month}.csv"`, "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("GET /api/admin/ambassadors/commissions/export", error);
  }
}
