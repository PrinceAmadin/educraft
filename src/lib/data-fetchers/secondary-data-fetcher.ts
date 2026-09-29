/**
 * Mode 5: fetches a project's dataset for the model its Chapter 3 specifies
 * (see model-spec.ts), from whichever sources the catalogue names for each
 * variable. The fetcher knows no source by name: every request goes through
 * the module in source-registry.ts.
 *
 * For each variable, in model order:
 *   1. its first source in the catalogue (8 s at most; a source with a retry
 *      policy is asked once more within the same 8 s when the first try times
 *      out or fails in passing: 5 s for the first try, the rest for the retry);
 *   2. its next source, if it has one (8 s);
 *   3. the last good copy of that same series EduCraft saved (the cache);
 *   4. otherwise it is missing: an empty column, listed with the reason.
 * A series always comes whole from one source, never pieced together.
 *
 * No database access here: the cache is passed in (the service keeps it in
 * Setting rows), so the check script can run this with fake sources.
 */

import { indicatorFor, type CatalogueIndicator } from "./indicator-catalogue";
import { roundTo, type Dataset, type DatasetColumn, type MissingItem, missingYears, yearRanges } from "./dataset-csv";
import type { ModelSpec } from "./model-spec";
import type { AnnualSeries } from "./series";
import type { SourceContext, SourceModule } from "./source-module";
import { moduleFor, seriesCacheKey, sourceCode, sourceLabel } from "./source-registry";
import type { SeriesSource, SourceName } from "./source-types";
import { FETCH_TIMEOUT_MS, FetchFailure, limiter, type FetchLike, type RequestLogEntry } from "./timed-fetch";

/**
 * A source with a retry policy gets one retry inside the same 8-second window:
 * the first attempt gets 5/8 of it, the retry whatever is left.
 */
export const FIRST_ATTEMPT_SHARE = 5 / 8;
/** Below this the retry is not worth starting. */
const MIN_RETRY_MS = 250;

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
  const budgetMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;

  // One payload per key per run (a CBN endpoint serves several rates).
  const payloads = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, load: () => Promise<T>): Promise<T> => {
    let call = payloads.get(key);
    if (!call) {
      call = load();
      payloads.set(key, call);
    }
    return call as Promise<T>;
  };
  const context = (timeoutMs: number | undefined): SourceContext => ({
    period: { start, end },
    log: requests,
    http: { fetchImpl: opts.fetchImpl, timeoutMs, print: opts.print },
    once,
  });

  const slots = new Map<SourceName, ReturnType<typeof limiter>>();
  const slotFor = (m: SourceModule) => {
    let slot = slots.get(m.name);
    if (!slot) {
      slot = limiter(m.concurrency);
      slots.set(m.name, slot);
    }
    return slot;
  };

  /** One series from one source: an attempt, and (per the module's policy) one retry within the same budget. */
  const attempt = async (m: SourceModule, s: SeriesSource): Promise<AnnualSeries> => {
    if (m.retry === "none") return m.fetchSeries(s, context(opts.timeoutMs));
    const started = Date.now();
    let first: AnnualSeries | null = null;
    try {
      first = await m.fetchSeries(s, context(Math.round(budgetMs * FIRST_ATTEMPT_SHARE)));
      if (Object.keys(first.values).length > 0 || m.retry !== "transient-or-empty") return first;
    } catch (error) {
      // A refused code or someone else's series will not change on a second try.
      if (!(error instanceof FetchFailure) || !error.transient) throw error;
    }
    const remaining = budgetMs - (Date.now() - started);
    if (remaining < MIN_RETRY_MS) {
      if (first) return first;
      throw new FetchFailure(`${m.shortName} did not answer within ${Math.round(budgetMs / 1000)} seconds`, true, null, true);
    }
    return m.fetchSeries(s, context(remaining));
  };

  const live = (s: SeriesSource): Promise<AnnualSeries> => {
    const m = moduleFor(s);
    return slotFor(m)(() => attempt(m, s));
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
        const note = moduleFor(s).note(s, series);
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
