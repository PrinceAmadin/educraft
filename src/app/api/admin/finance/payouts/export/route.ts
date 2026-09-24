import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { payoutsQuerySchema } from "@/lib/validations/finance-payouts";
import { getPayoutMonth, type PayoutLine } from "@/lib/services/finance/payouts-engine";
import { currentMonthKey } from "@/lib/services/finance/surplus";

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The month's payout records as CSV, one row per record. Founder and CFO. */
export async function GET(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  const parsed = payoutsQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return badRequest("Use YYYY-MM");
  const month = parsed.data.month || currentMonthKey();
  try {
    const data = await getPayoutMonth(month);
    const rows: string[][] = [["Month", "Recipient type", "Recipient", "Code", "Project", "Client", "Service", "Leg", "Basis", "Amount (NGN)", "Status", "Paid on"]];
    const push = (type: string, name: string, code: string, line: PayoutLine) =>
      rows.push([month, type, name, code, line.projectCode, line.clientName, line.serviceName, line.leg, line.basis, String(line.amount), line.status, line.paidAt ? line.paidAt.slice(0, 10) : ""]);
    for (const g of data.workers) for (const l of g.lines) push("Worker", g.name, g.code, l);
    for (const g of data.ambassadors) for (const l of g.lines) push("Ambassador", g.name, g.code, l);
    for (const g of data.executives) for (const l of g.lines) push("Executive", g.name, g.recipientId, l);
    for (const b of data.bonuses) rows.push([month, "Executive bonus", b.recipientName, b.recipientId, "", "", "", "BONUS", b.reason, String(b.amount), b.status, b.paidAt ? b.paidAt.slice(0, 10) : ""]);
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="educraft-payouts-${month}.csv"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return serverError("GET /api/admin/finance/payouts/export", error);
  }
}
