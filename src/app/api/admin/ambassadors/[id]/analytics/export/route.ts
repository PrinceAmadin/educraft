import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/click-tracking/csv";
import { EXPORT_ROW_CAP, getExportRows, parseRange } from "@/lib/services/ambassador-analytics";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ambassadors/[id]/analytics/export?from=&to=
 * CSV of one ambassador's clicks (optionally within a date range). Admin only.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const q = req.nextUrl.searchParams;
  try {
    const amb = await db.ambassador.findUnique({ where: { id: params.id }, select: { ambassadorId: true } });
    if (!amb) return NextResponse.json({ error: "Ambassador not found" }, { status: 404 });
    const rows = await getExportRows(params.id, parseRange(q.get("from"), q.get("to")));
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse("﻿" + toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="clicks-${amb.ambassadorId}-${stamp}.csv"`,
        "Cache-Control": "no-store",
        "X-Row-Cap": String(EXPORT_ROW_CAP),
        "X-Row-Count": String(rows.length),
      },
    });
  } catch (error) {
    return serverError("GET /api/admin/ambassadors/[id]/analytics/export", error);
  }
}
