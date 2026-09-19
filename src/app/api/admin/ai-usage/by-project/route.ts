import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { getProjectUsage } from "@/lib/services/ai-usage";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(await getProjectUsage(req.nextUrl.searchParams.get("q") ?? ""));
  } catch (error) {
    return serverError("GET /api/admin/ai-usage/by-project", error);
  }
}
