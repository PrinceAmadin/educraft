/**
 * What every Mode 5 data source provides (sources/*.ts). The fetcher knows no
 * source by name: it looks the module up in source-registry.ts and applies the
 * module's concurrency cap and retry policy around fetchSeries.
 */

import type { AnnualSeries } from "./series";
import type { SourceName, SourceOf } from "./source-types";
import type { FetchLike, RequestLogEntry } from "./timed-fetch";

export interface SourceContext {
  /** The years the model needs (both ends included); keep only these. */
  period: { start: number; end: number };
  /** Every request goes in here (timedGetJson / timedGetText do it). */
  log: RequestLogEntry[];
  /** Pass straight to timedGetJson / timedGetText: the attempt's own timeout is already set. */
  http: { fetchImpl?: FetchLike; timeoutMs?: number; print?: (line: string) => void };
  /**
   * One request per payload per run, shared by every variable that reads it
   * (a CBN endpoint serves several rates). The first answer, or the first
   * failure, is what every later caller gets.
   */
  once<T>(key: string, load: () => Promise<T>): Promise<T>;
}

/**
 * A second attempt inside the same 8-second budget (the first gets 5/8 of it):
 * "transient" after a timeout, a network error, a 429 or a 5xx, or a web page
 * instead of data; "transient-or-empty" also after an answer with no values
 * (the World Bank sometimes sends one). Modules that share a payload through
 * `once` use "none".
 */
export type RetryPolicy = "none" | "transient" | "transient-or-empty";

export interface SourceModule<N extends SourceName = SourceName> {
  readonly name: N;
  /** Short name for failure reasons ("World Bank", "WHO"). */
  readonly shortName: string;
  /** How the notes and the chapters' table sources cite it. */
  readonly label: string;
  /** Requests to this source at once. */
  readonly concurrency: number;
  readonly retry: RetryPolicy;
  fetchSeries(s: SourceOf<N>, ctx: SourceContext): Promise<AnnualSeries>;
  /** The Setting key its last good copy is saved under. Never change an existing one: production rows use it. */
  cacheKey(s: SourceOf<N>): string;
  /** The source's own code for the series, as the notes print it. */
  code(s: SourceOf<N>): string;
  /** How it was measured and when the source last updated it, for the notes; null when there is nothing to say. */
  note(s: SourceOf<N>, series: AnnualSeries): string | null;
}
