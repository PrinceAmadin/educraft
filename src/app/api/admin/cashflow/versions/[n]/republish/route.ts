import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { requireSuperAdmin, serverError } from "@/lib/api";
import { rateLimited } from "@/lib/rate-limit";
import { CashflowPublishError, republishCashflow } from "@/lib/services/cashflow";
import { refreshAllTiers } from "@/lib/services/ambassador-platform/conversions";
import { revalidateCommandCenter } from "@/lib/services/command-center/cache";

/** Republish an old cashflow version as the new active one (the founder only). */
export async function POST(_req: NextRequest, { params }: { params: { n: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const limited = await rateLimited(guard.session.userId, "cashflow-settings", 10);
  if (limited) return limited;
  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const result = await republishCashflow(n, guard.session.userId);
    revalidateCommandCenter();
    if (result.tiersChanged) {
      waitUntil(refreshAllTiers().catch((error) => console.error("[cashflow] tier refresh after republish failed", error)));
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof CashflowPublishError) {
      return NextResponse.json({ error: error.message, violations: error.violations }, { status: error.status });
    }
    return serverError("POST /api/admin/cashflow/versions/[n]/republish", error);
  }
}
