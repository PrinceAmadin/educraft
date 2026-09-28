import { NextResponse } from "next/server";
import { requireAdminRoles, serverError } from "@/lib/api";
import { getMonthlySummary, getPerProjectCosts, getSubsystemBreakdown, getUsageByWorker } from "@/lib/services/ai-usage";

export const dynamic = "force-dynamic";

/**
 * D10: the token-usage dashboard's read. Returns everything the four new panels
 * need in the shape the brief asked for:
 *
 *   { perProject[], perWorker[], perSubsystem[], monthlyTotal, burnRate,
 *     projectedMonthEnd, daysRemaining, thresholdNaira }
 *
 * Super Admin and CFO only (rbac.ts).
 */
export async function GET() {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  try {
    const [perProject, perWorker, perSubsystem, monthly] = await Promise.all([
      getPerProjectCosts("month"),
      getUsageByWorker("month"),
      getSubsystemBreakdown("month"),
      getMonthlySummary(),
    ]);
    return NextResponse.json(
      {
        perProject,
        perWorker: perWorker.map((w) => ({ workerId: w.code, workerName: w.name, projectCount: w.projects, costNaira: w.cost })),
        perSubsystem,
        monthlyTotal: monthly.monthlyTotal,
        burnRate: monthly.dailyBurn,
        projectedMonthEnd: monthly.projectedMonthEnd,
        daysRemaining: monthly.daysRemaining,
        thresholdNaira: monthly.thresholdNaira,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return serverError("GET /api/admin/token-usage", error);
  }
}
