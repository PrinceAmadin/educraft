import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { listQaQueueOps } from "@/lib/services/operations/qa-reviews";
import { qaQueueQuerySchema } from "@/lib/validations/operations";
import { opsError, parseQuery } from "@/lib/services/operations/route-helpers";

export const dynamic = "force-dynamic";

/** GET ?status=unassigned|assigned|reviewing|overdue — the QA queue and its counts. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const { status } = parseQuery(req, qaQueueQuerySchema);
    const queue = await listQaQueueOps();
    const rows =
      !status || status === "all" ? queue.rows : status === "overdue" ? queue.rows.filter((r) => r.overdue) : queue.rows.filter((r) => r.bucket === status);
    return NextResponse.json({ rows, counts: queue.counts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return opsError("GET /api/admin/qa", error);
  }
}
