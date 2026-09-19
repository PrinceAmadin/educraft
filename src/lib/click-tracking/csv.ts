import type { RawLogRow } from "@/lib/services/ambassador-analytics";

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

export function toCsv(rows: RawLogRow[]): string {
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

