import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { getRawLog, parseRange } from "@/lib/services/ambassador-analytics";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ambassadors/[id]/analytics/log?page=1&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Admin view of one ambassador's click log. Unlike the ambassador route, the
 * ambassador comes from the URL, so this is admin-only (requireAdmin) and
 * checks the ambassador exists.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const q = req.nextUrl.searchParams;
  const raw = q.get("page");
  const page = raw === null ? 1 : Number(raw);
  if (!Number.isInteger(page) || page < 1 || page > 100_000) {
    return NextResponse.json({ error: "page must be a positive whole number" }, { status: 400 });
  }

  try {
    const exists = await db.ambassador.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "Ambassador not found" }, { status: 404 });
    const log = await getRawLog(params.id, page, parseRange(q.get("from"), q.get("to")));
    return NextResponse.json(log, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("GET /api/admin/ambassadors/[id]/analytics/log", error);
  }
}
