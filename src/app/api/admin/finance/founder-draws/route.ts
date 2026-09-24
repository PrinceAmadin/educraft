import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { drawsQuerySchema } from "@/lib/validations/finance-draws";
import { getAnnualPanel, getDrawHistory, getMonthlyDrawPanel, getSemesterPanel } from "@/lib/services/finance/founder-draws";
import { currentMonthKey } from "@/lib/services/finance/surplus";

/** Draw history for a year plus the month's draw panel, the semester bonus and the annual profit share. Founder and CFO. */
export async function GET(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  const parsed = drawsQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return badRequest("Check the query", parsed.error.flatten());
  const month = parsed.data.month || currentMonthKey();
  const year = parsed.data.year ?? Number(month.slice(0, 4));
  try {
    const [history, monthly, semester, annual] = await Promise.all([getDrawHistory(year), getMonthlyDrawPanel(month), getSemesterPanel(month), getAnnualPanel(year)]);
    return NextResponse.json({ year, month, history, monthly, semester, annual });
  } catch (error) {
    return serverError("GET /api/admin/finance/founder-draws", error);
  }
}
