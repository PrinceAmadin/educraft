import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { getWorkerUsageDetail, parsePeriod } from "@/lib/services/ai-usage";

export async function GET(req: NextRequest, { params }: { params: { workerId: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const period = parsePeriod(req.nextUrl.searchParams.get("period"));
    return NextResponse.json(await getWorkerUsageDetail(params.workerId, period));
  } catch (error) {
    return serverError("GET /api/admin/ai-usage/by-worker", error);
  }
}
