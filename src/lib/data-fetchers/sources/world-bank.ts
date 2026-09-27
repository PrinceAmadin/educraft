/**
 * World Bank, World Development Indicators API v2 (open data, CC BY 4.0).
 *
 *   GET https://api.worldbank.org/v2/country/NGA/indicator/{CODE}?format=json&date=2000:2023&per_page=100
 *
 * Answers [meta, rows]: meta = {page, pages, per_page, total, sourceid, lastupdated};
 * each row = {indicator: {id, value}, country: {id: "NG", value: "Nigeria"},
 * countryiso3code: "NGA", date: "2023", value: number | null, decimal}, newest
 * first. A bad code answers [{message: [{id, key, value}]}]. Annual only.
 */

import { FetchFailure, timedGetJson, type FetchLike, type RequestLogEntry } from "../timed-fetch";

export const WORLD_BANK_BASE = "https://api.worldbank.org/v2/country/NGA/indicator";

export function worldBankUrl(code: string, start: number, end: number): string {
  return `${WORLD_BANK_BASE}/${encodeURIComponent(code)}?format=json&date=${start}:${end}&per_page=100`;
}

export interface AnnualSeries {
  /** year -> value (raw, before any display scaling); years with no value are absent. */
  values: Record<number, number>;
  /** The source's own "last updated" date, when it gives one. */
  lastUpdated: string | null;
}

/** Pure: checks the answer really is Nigeria's series for this code and keeps the years in range. */
export function parseWorldBank(json: unknown, code: string, start: number, end: number): AnnualSeries {
  if (!Array.isArray(json)) throw new FetchFailure("World Bank sent an unexpected answer");
  const first = json[0] as { message?: { value?: string }[]; lastupdated?: string } | undefined;
  if (first?.message) throw new FetchFailure(`World Bank refused the indicator ${code}: ${first.message[0]?.value ?? "invalid value"}`);
  const rows = Array.isArray(json[1]) ? (json[1] as unknown[]) : [];
  const values: Record<number, number> = {};
  for (const raw of rows) {
    const row = raw as { indicator?: { id?: string }; countryiso3code?: string; date?: string; value?: unknown };
    if (row.countryiso3code !== "NGA" || row.indicator?.id !== code) {
      throw new FetchFailure(`World Bank sent a series other than Nigeria's ${code}`);
    }
    const year = Number(row.date);
    if (!Number.isInteger(year) || year < start || year > end) continue;
    if (typeof row.value === "number" && Number.isFinite(row.value)) values[year] = row.value;
  }
  return { values, lastUpdated: typeof first?.lastupdated === "string" ? first.lastupdated : null };
}

export async function fetchWorldBankSeries(
  code: string,
  start: number,
  end: number,
  log: RequestLogEntry[],
  opts: { fetchImpl?: FetchLike; timeoutMs?: number; print?: (line: string) => void } = {}
): Promise<AnnualSeries> {
  const json = await timedGetJson("World Bank", worldBankUrl(code, start, end), log, opts);
  return parseWorldBank(json, code, start, end);
}
