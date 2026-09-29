/**
 * Central Bank of Nigeria data API (www.cbn.gov.ng/api, allowed by its
 * robots.txt; no terms of use are published). Each endpoint answers every
 * month it holds in one JSON array, newest first, numbers as strings:
 *
 *   GetAllInflationRates          from January 2003: tyear, tmonth (1-12), period,
 *                                 allItemsYearOn, allItemsAverage, foodYearOn, foodAverage, ...
 *   GetAllMoneyMarketIndicators   from January 2006: tyear, tmonth, interBankCallRate, mrr,
 *                                 mpr, treasuryBill, savingsDeposit, primeLending, maxLending, ...
 *
 * GetAllExchangeRates is not used: it is 8 MB of daily rates for every currency
 * and took 9.2 s (over the 8 s limit) when tested, so the exchange rate comes
 * from the World Bank.
 */

import type { AnnualSeries } from "../series";
import type { SourceModule } from "../source-module";
import type { CbnEndpoint } from "../source-types";
import { FetchFailure, timedGetJson, type FetchLike, type RequestLogEntry } from "../timed-fetch";

export const CBN_BASE = "https://www.cbn.gov.ng/api";

export function cbnUrl(endpoint: CbnEndpoint): string {
  return `${CBN_BASE}/${endpoint}`;
}

export interface CbnMonth {
  year: number;
  month: number;
  fields: Record<string, unknown>;
}

/** Pure: the months in an answer (rows without a real year and month are skipped). */
export function parseCbnMonthly(json: unknown): CbnMonth[] {
  if (!Array.isArray(json)) throw new FetchFailure("CBN sent an unexpected answer");
  const months: CbnMonth[] = [];
  for (const raw of json) {
    const row = raw as Record<string, unknown>;
    const year = Number(row.tyear);
    const month = Number(row.tmonth);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) continue;
    months.push({ year, month, fields: row });
  }
  if (months.length === 0) throw new FetchFailure("CBN sent no months");
  return months;
}

function numberFrom(value: unknown, zeroIsMissing: boolean): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value.replace(/,/g, "")) : NaN;
  if (!Number.isFinite(n)) return null;
  if (zeroIsMissing && n === 0) return null;
  return n;
}

/**
 * Pure: one field turned into years. "december" keeps December's value (the
 * 12-month average change is already the year's figure); "mean" averages the
 * 12 months and leaves a year out unless all 12 have a value.
 */
export function cbnAnnual(months: CbnMonth[], field: string, annual: "december" | "mean", zeroIsMissing = false): Record<number, number> {
  const byYear = new Map<number, Map<number, number>>();
  for (const m of months) {
    const v = numberFrom(m.fields[field], zeroIsMissing);
    if (v === null) continue;
    const year = byYear.get(m.year) ?? new Map<number, number>();
    year.set(m.month, v);
    byYear.set(m.year, year);
  }
  const out: Record<number, number> = {};
  for (const [year, values] of byYear) {
    if (annual === "december") {
      const dec = values.get(12);
      if (dec !== undefined) out[year] = dec;
    } else if (values.size === 12) {
      let sum = 0;
      for (const v of values.values()) sum += v;
      out[year] = Math.round((sum / 12) * 10_000) / 10_000;
    }
  }
  return out;
}

export async function fetchCbnMonths(
  endpoint: CbnEndpoint,
  log: RequestLogEntry[],
  opts: { fetchImpl?: FetchLike; timeoutMs?: number; print?: (line: string) => void } = {}
): Promise<CbnMonth[]> {
  return parseCbnMonthly(await timedGetJson("CBN", cbnUrl(endpoint), log, opts));
}

/** The years of one field within a period; "last updated" is the latest month the CBN holds ("data to August 2026"). */
export function cbnSeries(months: CbnMonth[], field: string, annual: "december" | "mean", zeroIsMissing: boolean, start: number, end: number): AnnualSeries {
  const all = cbnAnnual(months, field, annual, zeroIsMissing);
  const values: Record<number, number> = {};
  for (const [y, v] of Object.entries(all)) {
    const year = Number(y);
    if (year >= start && year <= end) values[year] = v;
  }
  const latest = months.reduce<CbnMonth | null>((a, m) => (!a || m.year * 12 + m.month > a.year * 12 + a.month ? m : a), null);
  const period = latest && typeof latest.fields.period === "string" ? latest.fields.period.trim() : null;
  return { values, lastUpdated: period ? `data to ${period}` : null };
}

export const cbnModule: SourceModule<"CBN"> = {
  name: "CBN",
  shortName: "CBN",
  label: "Central Bank of Nigeria",
  // Two endpoints, each requested once per run and shared by every rate it carries.
  concurrency: 6,
  retry: "none",
  fetchSeries: async (s, ctx) => {
    const months = await ctx.once(`CBN:${s.endpoint}`, () => fetchCbnMonths(s.endpoint, ctx.log, ctx.http));
    return cbnSeries(months, s.field, s.annual, s.zeroIsMissing ?? false, ctx.period.start, ctx.period.end);
  },
  cacheKey: (s) => `secondary_data_cache:CBN:${s.endpoint}:${s.field}:${s.annual}`,
  code: (s) => `${s.endpoint}.${s.field}`,
  note: (s, series) => [s.label, series.lastUpdated].filter(Boolean).join("; ") || null,
};
