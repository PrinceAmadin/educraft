import { NextResponse } from "next/server";
import { requireAmbassador, serverError } from "@/lib/api";
import { toCsv } from "@/lib/click-tracking/csv";
import { EXPORT_ROW_CAP, getExportRows } from "@/lib/services/ambassador-analytics";

export const dynamic = "force-dynamic";

/**
 * GET /api/ambassador/link/export
 *
 * Every recorded click for the signed-in ambassador as a CSV (capped at
 * EXPORT_ROW_CAP rows, newest first). No id parameter: the ambassador comes
 * from the session, so an export can only ever contain their own clicks. The
 * visitor hash and coordinates are never included.
 */
export async function GET() {
  const guard = await requireAmbassador();
  if (!guard.ok) return guard.response;

  try {
    const rows = await getExportRows(guard.ambassadorId);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse("﻿" + toCsv(rows), {
      headers: {
        // BOM so Excel reads UTF-8 (city names with accents) correctly.
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="educraft-link-clicks-${stamp}.csv"`,
        "Cache-Control": "no-store",
        "X-Row-Cap": String(EXPORT_ROW_CAP),
        "X-Row-Count": String(rows.length),
      },
    });
  } catch (error) {
    return serverError("GET /api/ambassador/link/export", error);
  }
}
