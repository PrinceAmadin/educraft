/**
 * Phase D5: fetches a Mode 5 project's dataset from the model its Chapter 3
 * specifies (see model-spec.ts), from the World Bank and the CBN.
 *
 * For each variable, in model order:
 *   1. its first source in the catalogue (8 s at most per request);
 *   2. its next source, if it has one (8 s);
 *   3. the last good copy of that same series EduCraft saved (the cache);
 *   4. otherwise it is missing: an empty column, listed with the reason.
 * A series always comes whole from one source, never pieced together.
 *
 * No database access here: the cache is passed in (the service keeps it in
 * Setting rows), so the check script can run this with fake sources.
 */

import { indicatorFor, seriesCacheKey, sourceCode, sourceLabel, type CbnEndpoint, type CatalogueIndicator, type SeriesSource } from "./indicator-catalogue";
import { roundTo, type Dataset, type DatasetColumn, type MissingItem, missingYears, yearRanges } from "./dataset-csv";
import type { ModelSpec } from "./model-spec";
import { cbnSeries, fetchCbnMonths, type CbnMonth } from "./sources/cbn";
import { fetchWorldBankSeries, type AnnualSeries } from "./sources/world-bank";
import { limiter, type FetchLike, type RequestLogEntry } from "./timed-fetch";

/** The World Bank API timed out on 22 of 42 series asked for at once (27 Sept); three at a time answered every one in under a second. */
export const WORLD_BANK_CONCURRENCY = 3;

export interface CachedSeries {
  /** year -> raw value (before display scaling). */
  values: Record<number, number>;
  savedAt: string;
  lastUpdated: string | null;
}

export interface SeriesCache {
  get(key: string): Promise<CachedSeries | null>;
  set(key: string, series: CachedSeries): Promise<void>;
}

export interface FetchSecondaryOptions {
  cache?: SeriesCache;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  now?: Date;
  print?: (line: string) => void;
}

export interface SecondaryDataResult {
  dataset: Dataset;
  missing: MissingItem[];
  requests: RequestLogEntry[];
}

const noCache: SeriesCache = { get: async () => null, set: async () => {} };

const formatDay = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function scaled(ind: CatalogueIndicator, raw: Record<number, number>, start: number, end: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [y, v] of Object.entries(raw)) {
    const year = Number(y);
    if (year >= start && year <= end) out[year] = roundTo(v / ind.scale, ind.decimals);
  }
  return out;
}

export async function fetchSecondaryData(spec: ModelSpec, opts: FetchSecondaryOptions = {}): Promise<SecondaryDataResult> {
  const { start, end } = spec.period;
  const cache = opts.cache ?? noCache;
  const requests: RequestLogEntry[] = [];
  const http = { fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs, print: opts.print };
  const worldBankSlot = limiter(WORLD_BANK_CONCURRENCY);
  // One request per CBN endpoint per run, shared by every variable that reads it.
  const cbnCalls = new Map<CbnEndpoint, Promise<CbnMonth[]>>();
  const cbnMonths = (endpoint: CbnEndpoint) => {
    let call = cbnCalls.get(endpoint);
    if (!call) {
      call = fetchCbnMonths(endpoint, requests, http);
      cbnCalls.set(endpoint, call);
    }
    return call;
  };

  const live = async (s: SeriesSource): Promise<AnnualSeries> => {
    if (s.source === "WB") return worldBankSlot(() => fetchWorldBankSeries(s.code, start, end, requests, http));
    const months = await cbnMonths(s.endpoint);
    return cbnSeries(months, s.field, s.annual, s.zeroIsMissing ?? false, start, end);
  };

  const saveToCache = async (s: SeriesSource, series: AnnualSeries) => {
    try {
      const key = seriesCacheKey(s);
      const before = await cache.get(key);
      await cache.set(key, { values: { ...(before?.values ?? {}), ...series.values }, savedAt: (opts.now ?? new Date()).toISOString(), lastUpdated: series.lastUpdated });
    } catch (error) {
      // The cache is a fallback only; failing to save it never fails the fetch.
      (opts.print ?? console.warn)(`[secondary-data] cache save failed: ${(error as Error).message}`);
    }
  };

  const columnFor = async (v: ModelSpec["variables"][number]): Promise<{ column: DatasetColumn; missing: MissingItem[] }> => {
    const ind = indicatorFor(v.catalogueKey);
    const base = { symbol: v.symbol, name: v.name, role: v.role, catalogueKey: v.catalogueKey, decimals: ind?.decimals ?? 2 };
    if (!ind) {
      return {
        column: { ...base, unit: null, source: null, code: null, sourceNote: null, values: {} },
        missing: [{ symbol: v.symbol, name: v.name, reason: "Not available from the World Bank or the CBN automatically. The specialist supplies it (for example from the CBN Statistical Bulletin or NBS)." }],
      };
    }
    const failures: string[] = [];
    for (const s of ind.sources) {
      try {
        const series = await live(s);
        if (Object.keys(series.values).length === 0) {
          failures.push(`${sourceLabel(s)} has no value for ${start}–${end}`);
          continue;
        }
        await saveToCache(s, series);
        const note = [s.source === "CBN" ? s.label : null, series.lastUpdated ? (s.source === "WB" ? `last updated ${series.lastUpdated}` : series.lastUpdated) : null].filter(Boolean).join("; ");
        return {
          column: { ...base, name: v.name || ind.name, unit: ind.unit, source: sourceLabel(s), code: sourceCode(s), sourceNote: note || null, values: scaled(ind, series.values, start, end) },
          missing: [],
        };
      } catch (error) {
        failures.push((error as Error).message);
      }
    }
    // Every live source failed: the last good copy EduCraft saved, if it covers the period.
    for (const s of ind.sources) {
      const saved = await cache.get(seriesCacheKey(s)).catch(() => null);
      const values = saved ? scaled(ind, saved.values, start, end) : {};
      if (saved && Object.keys(values).length > 0) {
        return {
          column: {
            ...base,
            unit: ind.unit,
            source: sourceLabel(s),
            code: sourceCode(s),
            sourceNote: `from EduCraft's saved copy of ${formatDay(new Date(saved.savedAt))} (the live source did not answer: ${failures.join("; ")})`,
            values,
          },
          missing: [],
        };
      }
    }
    return {
      column: { ...base, unit: ind.unit, source: null, code: null, sourceNote: null, values: {} },
      missing: [{ symbol: v.symbol, name: v.name, reason: `Could not be fetched: ${failures.join("; ")}.` }],
    };
  };

  const results = await Promise.all(spec.variables.map(columnFor));
  const dataset: Dataset = { start, end, frequency: "annual", columns: results.map((r) => r.column) };
  const missing = results.flatMap((r) => r.missing);
  for (const c of dataset.columns) {
    if (!c.source) continue;
    const gaps = missingYears(dataset, c);
    if (gaps.length) missing.push({ symbol: c.symbol, name: c.name, reason: `${c.source} has no value for ${yearRanges(gaps)}. The specialist fills these years or the COO shortens the period.` });
  }
  return { dataset, missing, requests };
}
