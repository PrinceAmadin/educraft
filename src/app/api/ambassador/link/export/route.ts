import { NextResponse } from "next/server";
import { requireAmbassador, serverError } from "@/lib/api";
import { EXPORT_ROW_CAP, getExportRows, type RawLogRow } from "@/lib/services/ambassador-analytics";

export const dynamic = "force-dynamic";

const HEADERS = ["Time (WAT)", "Country", "Region", "City", "Device", "OS", "Browser", "Source", "Quality", "Fraud"] as const;

/** Time in Nigerian time, "2026-09-19 08:30:15", so the sheet matches what the ambassador saw. */
const WAT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Africa/Lagos",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hourCycle: "h23",
});

/**
 * One CSV cell. Quotes when needed, and neutralises spreadsheet formulas: a
 * browser or city string starting with = + - @ would otherwise be executed by
 * Excel when the file is opened.
 */
function cell(value: string | number | boolean | null): string {
  let s = value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: RawLogRow[]): string {
  const lines = [HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        WAT.format(r.timestamp),
        r.country,
        r.region,
        r.city,
        r.device,
        r.os,
        r.browser,
        r.source,
        r.quality,
        r.isFraud ? "Yes" : "No",
      ]
        .map(cell)
        .join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}

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
