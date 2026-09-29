/**
 * One outbound GET for the secondary data fetcher (Phase D5): at most 8 seconds
 * from the request to the last byte, an honest User-Agent, and a line in the
 * run's request log. The browser never sees these calls (the server makes
 * them), so the log is what shows which sources were asked and how fast they
 * answered.
 */

export const FETCH_TIMEOUT_MS = 8_000;
export const USER_AGENT = "EduCraftHQ/1.0 (academic research data; educraft611@gmail.com)";

export type DataSourceName = "World Bank" | "CBN" | "FX" | "IMF";

export interface RequestLogEntry {
  source: DataSourceName;
  url: string;
  /** HTTP status, or null when no answer came (timeout, network error). */
  status: number | null;
  ms: number;
  bytes: number;
  timedOut: boolean;
  ok: boolean;
  error?: string;
}

/** The part of fetch this module uses, so the check script can stand in for the network. */
export type FetchLike = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> }
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export class FetchFailure extends Error {
  constructor(
    message: string,
    readonly timedOut = false,
    /** The HTTP status when the source answered with an error; null when no answer came or the answer was unusable. */
    readonly status: number | null = null,
    /** Worth one retry: no answer, a network error, 429 or a 5xx. A refused code or someone else's series is not. */
    readonly transient = false
  ) {
    super(message);
  }
}

export interface TimedGetOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  print?: (line: string) => void;
}

/** A web page where data was expected: a gateway error or a bot-check page, worth one retry. */
export function looksLikeHtml(text: string): boolean {
  return /^\s*(<!doctype html|<html|<head|<body)/i.test(text);
}

/**
 * One GET: logs it, and hands the body to `parse`. A FetchFailure thrown by
 * `parse` is logged under `unreadable` and passed on. Throws FetchFailure on a
 * timeout, a network error or a non-2xx status.
 */
async function timedGet<T>(source: DataSourceName, url: string, log: RequestLogEntry[], opts: TimedGetOptions, accept: string, unreadable: string, parse: (text: string) => T): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const print = opts.print ?? ((line: string) => console.log(line));
  const started = Date.now();
  const signal = AbortSignal.timeout(timeoutMs);
  const entry: RequestLogEntry = { source, url, status: null, ms: 0, bytes: 0, timedOut: false, ok: false };
  const finish = (error?: string) => {
    entry.ms = Date.now() - started;
    if (error) entry.error = error;
    log.push(entry);
    print(`[secondary-data] GET ${url} -> ${entry.status ?? (entry.timedOut ? "timeout" : "error")} ${entry.ms} ms${error ? ` (${error})` : ""}`);
  };
  try {
    const res = await fetchImpl(url, { signal, headers: { Accept: accept, "User-Agent": USER_AGENT } });
    entry.status = res.status;
    // The body read counts against the same 8 seconds (the signal aborts it too).
    const text = await res.text();
    entry.bytes = text.length;
    if (!res.ok) {
      finish(`HTTP ${res.status}`);
      throw new FetchFailure(`${source} answered ${res.status}`, false, res.status, res.status === 429 || res.status >= 500);
    }
    let value: T;
    try {
      value = parse(text);
    } catch (error) {
      finish(unreadable);
      throw error instanceof FetchFailure ? error : new FetchFailure(`${source} sent an answer that could not be read`);
    }
    entry.ok = true;
    finish();
    return value;
  } catch (error) {
    if (error instanceof FetchFailure) throw error;
    const name = (error as Error)?.name;
    entry.timedOut = name === "TimeoutError" || name === "AbortError" || signal.aborted;
    finish(entry.timedOut ? `no answer within ${Math.round(timeoutMs / 1000)} s` : (error as Error)?.message ?? "network error");
    throw new FetchFailure(entry.timedOut ? `${source} did not answer within ${Math.round(timeoutMs / 1000)} seconds` : `${source} could not be reached`, entry.timedOut, null, true);
  }
}

/**
 * Fetches and parses JSON. Throws FetchFailure (after logging it) on a timeout,
 * a network error, a non-2xx status or a body that is not JSON (transient when
 * the body is a web page).
 */
export function timedGetJson(source: DataSourceName, url: string, log: RequestLogEntry[], opts: TimedGetOptions = {}): Promise<unknown> {
  return timedGet(source, url, log, opts, "application/json", "not JSON", (text) => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new FetchFailure(`${source} did not send JSON`, false, null, looksLikeHtml(text));
    }
  });
}

/** Fetches a text body (a CSV). A web page instead of the text is a transient failure. */
export function timedGetText(source: DataSourceName, url: string, log: RequestLogEntry[], opts: TimedGetOptions = {}, accept = "text/csv"): Promise<string> {
  return timedGet(source, url, log, opts, accept, "a web page, not data", (text) => {
    if (looksLikeHtml(text)) throw new FetchFailure(`${source} sent a web page instead of data`, false, null, true);
    return text;
  });
}

/** Runs at most `limit` tasks at once (the World Bank API times out when asked for many series at the same moment). */
export function limiter(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= limit) return;
    const run = queue.shift();
    if (run) run();
  };
  return function schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        active++;
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}
