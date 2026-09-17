import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { listWorkerApplications } from "@/lib/services/worker-applications";

const VALID = new Set(["PENDING", "APPROVED", "REJECTED", "all"]);

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const statusParam = req.nextUrl.searchParams.get("status") ?? "PENDING";
  const status = VALID.has(statusParam) ? (statusParam as "PENDING" | "APPROVED" | "REJECTED" | "all") : "PENDING";

  try {
    const rows = await listWorkerApplications(status);
    return NextResponse.json({ rows });
  } catch (error) {
    return serverError("GET /api/admin/workers/applications", error);
  }
}
