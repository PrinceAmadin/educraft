import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { getWorkerMetrics } from "@/lib/operations/worker-metrics";
import { opsError } from "@/lib/services/operations/route-helpers";

export const dynamic = "force-dynamic";

/** GET ?days=90 — the worker's performance over the period. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const raw = Number(new URL(req.url).searchParams.get("days"));
  const days = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 365) : 90;
  try {
    const metrics = await getWorkerMetrics(params.id, days);
    if (!metrics) return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    return NextResponse.json(metrics, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return opsError("GET /api/admin/workers/[id]/metrics", error);
  }
}
