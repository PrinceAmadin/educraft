/**
 * Phase D5 checks: the secondary data fetcher, with no database, no network
 * and no Claude call. The indicator catalogue, the World Bank and CBN answer
 * parsers (from the shapes seen live on 27 Sept), the 8-second timeout and the
 * request log, the World Bank concurrency cap, the fallback chain (primary →
 * alternate → saved copy → missing), the CSV, EViews-style statistics and
 * correlations, reading the model from Chapter 3, and the private-store rules.
 *
 *   npm run check:secondary
 */
import { CATALOGUE_KEYS, INDICATOR_CATALOGUE, catalogueKeysForDomains, indicatorFor, indicatorsForDomains } from "../src/lib/data-fetchers/indicator-catalogue";
import { DEPARTMENT_DOMAINS, DOMAINS, domainsForEntry, routeDepartment, routingKey } from "../src/lib/data-fetchers/domain-map";
import { DEPARTMENTS } from "../src/lib/generation/department-map";
import { SOURCE_NAMES, SOURCE_REGISTRY, seriesCacheKey, sourceCode } from "../src/lib/data-fetchers/source-registry";
import { parseWorldBank, worldBankUrl, WORLD_BANK_CONCURRENCY } from "../src/lib/data-fetchers/sources/world-bank";
import { cbnAnnual, cbnSeries, parseCbnMonthly } from "../src/lib/data-fetchers/sources/cbn";
import { FETCH_TIMEOUT_MS, FetchFailure, limiter, timedGetJson, type FetchLike, type RequestLogEntry } from "../src/lib/data-fetchers/timed-fetch";
import { correlationMatrix, datasetCsv, datasetNotes, describeColumn, pearson, statsTableText, yearRanges, type Dataset } from "../src/lib/data-fetchers/dataset-csv";
import { lastCompleteYear, relevantSections, statedPeriods, validateSpec, ModelSpecError, MODEL_SPEC_TOOL, type ModelSpec } from "../src/lib/data-fetchers/model-spec";
import { fetchSecondaryData, type CachedSeries, type SeriesCache } from "../src/lib/data-fetchers/secondary-data-fetcher";
import { contentTypeFor } from "../src/lib/files/policy";
import { buildPrivatePath, parsePrivatePath, parseStoredPath } from "../src/lib/files/paths";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failures.push(`${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}
async function throwsAsync(name: string, run: () => Promise<unknown>, pattern: RegExp) {
  try {
    await run();
    check(name, false, "no error");
  } catch (error) {
    check(name, pattern.test((error as Error).message), (error as Error).message);
  }
}
function throws(name: string, run: () => unknown, pattern: RegExp) {
  try {
    run();
    check(name, false, "no error");
  } catch (error) {
    check(name, pattern.test((error as Error).message), (error as Error).message);
  }
}

// ─── Fixtures: the shapes the live APIs sent on 27 Sept (values made up) ─────

function wbAnswer(code: string, start: number, end: number, value: (year: number) => number | null, country = "NGA") {
  const rows = [];
  for (let y = end; y >= start; y--) {
    rows.push({ indicator: { id: code, value: "x" }, country: { id: "NG", value: "Nigeria" }, countryiso3code: country, date: String(y), value: value(y), unit: "", obs_status: "", decimal: 1 });
  }
  return [{ page: 1, pages: 1, per_page: 100, total: rows.length, sourceid: "2", lastupdated: "2026-07-13" }, rows];
}
function cbnInflation() {
  const rows = [];
  for (let y = 2026; y >= 2003; y--) {
    for (let m = 12; m >= 1; m--) {
      if (y === 2026 && m > 8) continue;
      rows.push({ id: rows.length, tyear: y, tmonth: m, period: `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${y}`, allItemsYearOn: "10.00", allItemsAverage: (y - 2000 + m / 100).toFixed(2), foodYearOn: "12.00", foodAverage: "11.00" });
    }
  }
  return rows;
}
function cbnMoneyMarket() {
  const rows = [];
  for (let y = 2026; y >= 2006; y--) {
    for (let m = 12; m >= 1; m--) {
      if (y === 2026 && m > 8) continue;
      rows.push({ id: rows.length, tyear: y, tmonth: m, period: `M${m} ${y}`, interBankCallRate: "20.00", mrr: "", mpr: y === 2006 && m < 12 ? "0.00" : String(10 + m), treasuryBill: "8.00", primeLending: "17.00", maxLending: "25.00" });
    }
  }
  return rows;
}

type Route = (url: string, signal: AbortSignal) => Promise<{ status: number; body: string }>;
function fakeFetch(route: Route, seen: string[] = []): FetchLike {
  return async (url, init) => {
    seen.push(url);
    const r = await route(url, init.signal);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => r.body };
  };
}
/**
 * Never answers; rejects when the timeout signal fires, like fetch does. A real
 * request keeps Node running through its open socket; this stand-in holds a timer
 * instead, because AbortSignal.timeout alone does not keep the process alive.
 */
const hang = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => {
    const keepAlive = setInterval(() => {}, 1_000);
    signal.addEventListener("abort", () => {
      clearInterval(keepAlive);
      reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
    });
  });
const json = (v: unknown) => ({ status: 200, body: JSON.stringify(v) });
const quiet = () => {};

async function main() {
  // ─── The catalogue ─────────────────────────────────────────────────────────
  check("catalogue keys are unique", new Set(CATALOGUE_KEYS).size === CATALOGUE_KEYS.length);
  check("catalogue has the core Mode 5 variables", ["gdp_current_usd", "inflation", "exchange_rate", "monetary_policy_rate", "lending_rate", "treasury_bill_rate"].every((k) => CATALOGUE_KEYS.includes(k)));
  check("every entry has a source, a positive scale and 0–4 decimals", INDICATOR_CATALOGUE.every((i) => i.sources.length > 0 && i.scale > 0 && i.decimals >= 0 && i.decimals <= 4));
  check("World Bank codes look like WDI codes", INDICATOR_CATALOGUE.every((i) => i.sources.every((s) => s.source !== "WB" || /^[A-Z]{2}(\.[A-Z0-9]+){2,5}$/.test(s.code))));
  check("CBN endpoints are the two verified ones only", INDICATOR_CATALOGUE.every((i) => i.sources.every((s) => s.source !== "CBN" || s.endpoint === "GetAllInflationRates" || s.endpoint === "GetAllMoneyMarketIndicators")));
  const allCodes = INDICATOR_CATALOGUE.flatMap((i) => i.sources.map((s) => (s.source === "WB" ? s.code : s.endpoint)));
  check("series that were null for Nigeria are not offered", !["NE.TRD.GNFS.ZS", "NE.EXP.GNFS.ZS", "NE.IMP.GNFS.ZS", "NE.GDI.FTOT.ZS", "NE.CON.GOVT.ZS", "GC.TAX.TOTL.GD.ZS", "DT.DOD.DECT.CD"].some((c) => allCodes.includes(c)));
  check("the CBN exchange-rate feed (9.2 s) is not used", !allCodes.includes("GetAllExchangeRates" as never));
  check("the exchange rate comes from the World Bank official rate", indicatorFor("exchange_rate")?.sources[0].source === "WB" && (indicatorFor("exchange_rate")?.sources[0] as { code: string }).code === "PA.NUS.FCRF");
  const inf = indicatorFor("inflation")!;
  check("inflation: World Bank first, then the CBN", inf.sources[0].source === "WB" && inf.sources[1]?.source === "CBN");
  check("the MPR treats 0.00 as not in use", (indicatorFor("monetary_policy_rate")!.sources[0] as { zeroIsMissing?: boolean }).zeroIsMissing === true);
  check("cache keys name the exact series", seriesCacheKey(inf.sources[0]) === "secondary_data_cache:WB:FP.CPI.TOTL.ZG" && seriesCacheKey(inf.sources[1]) === "secondary_data_cache:CBN:GetAllInflationRates:allItemsAverage:december");
  check("the model tool offers exactly the catalogue keys plus none", JSON.stringify(MODEL_SPEC_TOOL.inputSchema.properties.dependent.properties.catalogueKey.enum) === JSON.stringify([...CATALOGUE_KEYS, "none"]));

  // ─── The source registry ───────────────────────────────────────────────────
  check("every registered module carries its own name", SOURCE_NAMES.every((n) => SOURCE_REGISTRY[n].name === n), SOURCE_NAMES);
  check("every source the catalogue names has a module", INDICATOR_CATALOGUE.every((i) => i.sources.every((s) => SOURCE_NAMES.includes(s.source))));
  check("every module caps its requests and has a retry policy", SOURCE_NAMES.every((n) => SOURCE_REGISTRY[n].concurrency >= 1 && ["none", "transient", "transient-or-empty"].includes(SOURCE_REGISTRY[n].retry)));
  check("modules sharing a payload through once() never retry (the payload is fetched once per run)", SOURCE_REGISTRY.CBN.retry === "none");
  check("cache keys are unique per series across the catalogue", (() => {
    const keys = new Map<string, string>();
    for (const i of INDICATOR_CATALOGUE) for (const s of i.sources) {
      const k = seriesCacheKey(s);
      const code = sourceCode(s);
      if (keys.has(k) && keys.get(k) !== code) return false;
      keys.set(k, code);
    }
    return true;
  })());

  // ─── Department → domains ──────────────────────────────────────────────────
  check("every catalogue entry belongs to at least one known domain", INDICATOR_CATALOGUE.every((i) => i.domains.length > 0 && i.domains.every((d) => (DOMAINS as readonly string[]).includes(d))));
  check("every domain offers at least one entry", DOMAINS.every((d) => indicatorsForDomains([d]).length > 0), DOMAINS.map((d) => [d, indicatorsForDomains([d]).length]));
  check("the macro controls are offered to every domain", DOMAINS.every((d) => ["gdp_growth", "gdp_per_capita_usd", "inflation", "unemployment", "population"].every((k) => catalogueKeysForDomains([d]).includes(k))));
  const unrouted = DEPARTMENTS.filter((e) => domainsForEntry(e) === null).map((e) => e.name);
  check("every Table A department routes to a domain list (a row with no section has an exception)", unrouted.length === 0, unrouted);
  const tableNames = new Set(DEPARTMENTS.map((e) => e.name));
  const orphans = Object.keys(DEPARTMENT_DOMAINS).filter((n) => !tableNames.has(n));
  check("every routing exception names a real Table A department", orphans.length === 0, orphans);
  const routes = (dept: string | null) => routeDepartment(dept).domains.join("+");
  check("Accounting (locked to Mode 5) routes to economics and finance", routes("Accounting") === "MACRO_FINANCE");
  check("Banking and Finance, and the alias Banking, route to economics and finance", routes("Banking and Finance") === "MACRO_FINANCE" && routes("Banking") === "MACRO_FINANCE");
  check("Cyber Security (and the alias Cybersecurity) routes to technology", routes("Cyber Security") === "TECH_CYBER" && routes("Cybersecurity") === "TECH_CYBER" && routes("Computer Science") === "TECH_CYBER");
  check("Nursing and Public Health route to health", routes("Nursing") === "HEALTH" && routes("Public Health") === "HEALTH");
  check("Agronomy and Civil Engineering route to science, environment and agriculture", routes("Agronomy") === "SCIENCE_ENV_AG" && routes("Civil Engineering") === "SCIENCE_ENV_AG");
  check("a pure science reaches science first, then health", routes("Chemistry") === "SCIENCE_ENV_AG+HEALTH");
  check("Agricultural Economics reaches economics and agriculture", routes("Agricultural Economics") === "MACRO_FINANCE+SCIENCE_ENV_AG");
  check("Education (a Mode 5 report is an economics study) routes to economics", routes("Education") === "MACRO_FINANCE" && routes("Economics Education") === "MACRO_FINANCE");
  check("History and Law have no automatic source", routes("History") === "" && routes("Law") === "" && /specialist supplies the data/.test(routeDepartment("History").basis));
  check("a social science filed under Humanities routes to economics", routes("International Relations") === "MACRO_FINANCE");
  check("an unknown department falls back to economics and says why", routes("Underwater Basket Weaving") === "MACRO_FINANCE" && /not in the department table/.test(routeDepartment("Underwater Basket Weaving").basis));
  check("no department recorded falls back to economics", routes(null) === "MACRO_FINANCE" && /No department is recorded/.test(routeDepartment(null).basis));
  check("routing keys ignore order", routingKey(["HEALTH", "MACRO_FINANCE"]) === routingKey(["MACRO_FINANCE", "HEALTH"]) && routingKey([]) === "none");

  // ─── World Bank ────────────────────────────────────────────────────────────
  const url = worldBankUrl("NY.GDP.MKTP.CD", 2000, 2023);
  check("World Bank URL: Nigeria, the code, the period, JSON, one page", url === "https://api.worldbank.org/v2/country/NGA/indicator/NY.GDP.MKTP.CD?format=json&date=2000:2023&per_page=100", url);
  const wb = parseWorldBank(wbAnswer("FP.CPI.TOTL.ZG", 2000, 2023, (y) => (y === 2001 ? null : y - 1990)), "FP.CPI.TOTL.ZG", 2000, 2023);
  check("World Bank: 23 values (the null year left out)", Object.keys(wb.values).length === 23 && wb.values[2001] === undefined && wb.values[2023] === 33);
  check("World Bank: last updated read from the meta", wb.lastUpdated === "2026-07-13");
  check("World Bank: years outside the period dropped", Object.keys(parseWorldBank(wbAnswer("X.Y.Z", 1995, 2023, () => 1), "X.Y.Z", 2000, 2023).values).length === 24);
  throws("World Bank: another country's series is refused", () => parseWorldBank(wbAnswer("X.Y.Z", 2000, 2001, () => 1, "GHA"), "X.Y.Z", 2000, 2001), /other than Nigeria/);
  throws("World Bank: another indicator is refused", () => parseWorldBank(wbAnswer("A.B.C", 2000, 2001, () => 1), "X.Y.Z", 2000, 2001), /other than Nigeria/);
  throws("World Bank: a bad code's message is a failure", () => parseWorldBank([{ message: [{ id: "120", key: "Invalid value", value: "The provided parameter value is not valid" }] }], "BAD", 2000, 2001), /refused the indicator BAD/);

  // ─── CBN ───────────────────────────────────────────────────────────────────
  const infMonths = parseCbnMonthly(cbnInflation());
  check("CBN: months parsed (Jan 2003 to Aug 2026)", infMonths.length === 23 * 12 + 8, infMonths.length);
  const decAvg = cbnAnnual(infMonths, "allItemsAverage", "december");
  check("CBN inflation: the December 12-month average is the year's figure", decAvg[2023] === 23.12 && decAvg[2003] === 3.12, decAvg[2023]);
  check("CBN inflation: a year without December (2026) is left out", decAvg[2026] === undefined);
  const mm = parseCbnMonthly(cbnMoneyMarket());
  const mpr = cbnAnnual(mm, "mpr", "mean", true);
  check("CBN MPR: 2006 has only December (0.00 = not in use), so the mean year is left out", mpr[2006] === undefined);
  check("CBN MPR: a full year is the mean of 12 months", mpr[2010] === 16.5, mpr[2010]);
  check("CBN: an empty string is missing, not zero", Object.keys(cbnAnnual(mm, "mrr", "mean")).length === 0);
  const tb = cbnSeries(mm, "treasuryBill", "mean", false, 2000, 2023);
  check("CBN series kept to the period and dated", Object.keys(tb.values).length === 18 && tb.lastUpdated === "data to M8 2026", tb.lastUpdated);
  throws("CBN: an answer with no months is a failure", () => parseCbnMonthly([]), /no months/);

  // ─── The 8-second request ──────────────────────────────────────────────────
  check("the timeout is 8 seconds", FETCH_TIMEOUT_MS === 8_000);
  {
    const log: RequestLogEntry[] = [];
    const t0 = Date.now();
    await throwsAsync("a source that never answers fails at the timeout", () => timedGetJson("World Bank", "https://api.worldbank.org/x", log, { fetchImpl: fakeFetch((_, s) => hang(s)), timeoutMs: 60, print: quiet }), /did not answer within/);
    check("…and stops on time", Date.now() - t0 < 1_000, Date.now() - t0);
    check("…and is logged as timed out", log.length === 1 && log[0].timedOut && log[0].status === null && !log[0].ok);
  }
  {
    const log: RequestLogEntry[] = [];
    await throwsAsync("a 500 is a failure", () => timedGetJson("CBN", "https://www.cbn.gov.ng/api/x", log, { fetchImpl: fakeFetch(async () => ({ status: 500, body: "oops" })), print: quiet }), /answered 500/);
    check("…logged with its status", log[0]?.status === 500 && !log[0].timedOut);
    await throwsAsync("HTML instead of JSON is a failure", () => timedGetJson("CBN", "https://www.cbn.gov.ng/api/y", log, { fetchImpl: fakeFetch(async () => ({ status: 200, body: "<html>" })), print: quiet }), /did not send JSON/);
    const ok = await timedGetJson("CBN", "https://www.cbn.gov.ng/api/z", log, { fetchImpl: fakeFetch(async () => json([1])), print: quiet });
    check("a good answer is parsed and logged ok", Array.isArray(ok) && log[2]?.ok === true && log[2].bytes === 3);
  }
  {
    const slot = limiter(WORLD_BANK_CONCURRENCY);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 10 }, () =>
        slot(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 10));
          active--;
        })
      )
    );
    check("World Bank requests run at most three at a time", WORLD_BANK_CONCURRENCY === 3 && peak === 3, peak);
  }

  // ─── The orchestrator and its fallbacks ────────────────────────────────────
  const spec = (vars: [string, string | null][], start = 2000, end = 2023): ModelSpec => ({
    variables: vars.map(([symbol, key], i) => ({ symbol, name: symbol, measure: "", role: i === 0 ? "dependent" : "independent", catalogueKey: key })),
    equation: "GDP = b0 + b1INF + b2EXR + e",
    period: { start, end },
    frequency: "annual",
    technique: "ARDL",
    sourcesNamed: [],
    notes: [],
  });
  const memoryCache = (): SeriesCache & { store: Map<string, CachedSeries> } => {
    const store = new Map<string, CachedSeries>();
    return { store, get: async (k) => store.get(k) ?? null, set: async (k, v) => void store.set(k, v) };
  };
  const wbRoute = (value: (code: string, y: number) => number | null): Route => async (u) => {
    const code = /indicator\/([^?]+)/.exec(u)![1];
    const [, s, e] = /date=(\d+):(\d+)/.exec(u)!;
    return json(wbAnswer(decodeURIComponent(code), Number(s), Number(e), (y) => value(code, y)));
  };
  {
    const seen: string[] = [];
    const cache = memoryCache();
    const r = await fetchSecondaryData(spec([["GDP", "gdp_current_usd"], ["INF", "inflation"], ["EXR", "exchange_rate"]]), {
      cache,
      fetchImpl: fakeFetch(wbRoute((code, y) => (code === "NY.GDP.MKTP.CD" ? 69_448_756_000 + (y - 2000) * 1e9 : y - 1990)), seen),
      print: quiet,
    });
    check("GDP, INF, EXR: three World Bank requests, all to Nigeria", seen.length === 3 && seen.every((u) => u.startsWith("https://api.worldbank.org/v2/country/NGA/indicator/")), seen);
    check("…for the right indicator codes", ["NY.GDP.MKTP.CD", "FP.CPI.TOTL.ZG", "PA.NUS.FCRF"].every((c) => seen.some((u) => u.includes(`/${c}?`))));
    check("…every column complete, nothing missing", r.dataset.columns.every((c) => Object.keys(c.values).length === 24) && r.missing.length === 0);
    check("…GDP scaled to US$ billion with 2 decimals", r.dataset.columns[0].values[2000] === 69.45 && r.dataset.columns[0].unit === "US$ billion", r.dataset.columns[0].values[2000]);
    check("…each good series saved as the fallback copy", cache.store.size === 3 && cache.store.has("secondary_data_cache:WB:NY.GDP.MKTP.CD"));
    check("…the request log has one line per request", r.requests.length === 3 && r.requests.every((q) => q.ok && q.status === 200));
    const csv = datasetCsv(r.dataset);
    check("CSV: header of Year and the model's symbols", csv.split("\n")[0] === "Year,GDP,INF,EXR");
    check("CSV: one row per year, 2000–2023", csv.trim().split("\n").length === 25 && csv.split("\n")[1] === "2000,69.45,10.00,10.00" && csv.trim().split("\n")[24].startsWith("2023,"), csv.split("\n")[1]);
  }
  {
    // Inflation: the World Bank times out twice (first try and retry), the CBN answers (from 2003 only).
    const seen: string[] = [];
    const t0 = Date.now();
    const r = await fetchSecondaryData(spec([["GDP", "gdp_current_usd"], ["INF", "inflation"]]), {
      fetchImpl: fakeFetch(async (u, signal) => (u.includes("FP.CPI.TOTL.ZG") ? hang(signal) : u.includes("cbn.gov.ng") ? json(cbnInflation()) : wbRoute(() => 5e9)(u, signal)), seen),
      timeoutMs: 800,
      print: quiet,
    });
    const elapsed = Date.now() - t0;
    const col = r.dataset.columns[1];
    check("fallback: a World Bank series that times out twice falls to the CBN", col.source === "Central Bank of Nigeria" && col.code === "GetAllInflationRates.allItemsAverage", col.source);
    check("…and the years the CBN lacks are listed as missing", r.missing.some((m) => m.symbol === "INF" && /2000–2002/.test(m.reason)), r.missing);
    const infTries = r.requests.filter((q) => q.url.includes("FP.CPI.TOTL.ZG"));
    check("…both timed-out attempts are in the request log", infTries.length === 2 && infTries.every((q) => q.timedOut), infTries.map((q) => q.ms));
    check("…the first try gets 5/8 of the budget and the retry the rest", infTries[0].ms >= 480 && infTries[0].ms < 650 && infTries[0].ms + infTries[1].ms < 900, infTries.map((q) => q.ms));
    check("…and the whole World Bank series stays within its 8 s budget (800 ms here)", elapsed < 1_100, elapsed);
  }
  {
    // A hang on the first try, an answer on the retry: the series still comes from the World Bank.
    const calls = new Map<string, number>();
    const r = await fetchSecondaryData(spec([["GDP", "gdp_current_usd"], ["EXR", "exchange_rate"]]), {
      fetchImpl: fakeFetch(async (u, signal) => {
        const n = (calls.get(u) ?? 0) + 1;
        calls.set(u, n);
        return u.includes("PA.NUS.FCRF") && n === 1 ? hang(signal) : wbRoute(() => 100)(u, signal);
      }),
      timeoutMs: 800,
      print: quiet,
    });
    const exr = r.requests.filter((q) => q.url.includes("PA.NUS.FCRF"));
    check("retry: a first try that times out, then an answer, keeps the World Bank series", r.dataset.columns[1].source === "World Bank, World Development Indicators" && Object.keys(r.dataset.columns[1].values).length === 24);
    check("…logged as one timeout and one success", exr.length === 2 && exr[0].timedOut && exr[1].ok, exr);
    check("…and the healthy series was asked once only", r.requests.filter((q) => q.url.includes("NY.GDP.MKTP.CD")).length === 1);
  }
  {
    // An answer with no values, then one with values.
    const calls = new Map<string, number>();
    const r = await fetchSecondaryData(spec([["GDP", "gdp_current_usd"], ["INF", "inflation"]]), {
      fetchImpl: fakeFetch(async (u, signal) => {
        const n = (calls.get(u) ?? 0) + 1;
        calls.set(u, n);
        return wbRoute((code) => (code === "FP.CPI.TOTL.ZG" && n === 1 ? null : 7))(u, signal);
      }),
      timeoutMs: 800,
      print: quiet,
    });
    check("retry: an empty World Bank answer is asked once more", r.requests.filter((q) => q.url.includes("FP.CPI.TOTL.ZG")).length === 2 && r.dataset.columns[1].source === "World Bank, World Development Indicators");
  }
  {
    // 503 then an answer: retried. 404: not.
    const calls = new Map<string, number>();
    const r = await fetchSecondaryData(spec([["GDP", "gdp_current_usd"], ["EXR", "exchange_rate"]]), {
      fetchImpl: fakeFetch(async (u, signal) => {
        const n = (calls.get(u) ?? 0) + 1;
        calls.set(u, n);
        if (u.includes("NY.GDP.MKTP.CD") && n === 1) return { status: 503, body: "busy" };
        if (u.includes("PA.NUS.FCRF")) return { status: 404, body: "gone" };
        return wbRoute(() => 5e9)(u, signal);
      }),
      timeoutMs: 800,
      print: quiet,
    });
    check("retry: a 503 is asked once more and then succeeds", r.requests.filter((q) => q.url.includes("NY.GDP.MKTP.CD")).length === 2 && r.dataset.columns[0].source !== null);
    check("retry: a 404 is not retried", r.requests.filter((q) => q.url.includes("PA.NUS.FCRF")).length === 1);
  }
  {
    // A refused indicator code: the same answer again would change nothing.
    const seen: string[] = [];
    await fetchSecondaryData(spec([["GDP", "gdp_current_usd"], ["INF", "inflation"]]), {
      fetchImpl: fakeFetch(async (u, signal) =>
        u.includes("FP.CPI.TOTL.ZG") ? json([{ message: [{ id: "120", key: "Invalid value", value: "The provided parameter value is not valid" }] }]) : u.includes("cbn.gov.ng") ? json(cbnInflation()) : wbRoute(() => 5e9)(u, signal),
      seen),
      timeoutMs: 800,
      print: quiet,
    });
    check("retry: a refused World Bank code is not retried", seen.filter((u) => u.includes("FP.CPI.TOTL.ZG")).length === 1, seen);
  }
  {
    // Both sources fail: the saved copy is used, and says so.
    const cache = memoryCache();
    await cache.set("secondary_data_cache:WB:FP.CPI.TOTL.ZG", { values: { 2000: 6.93, 2001: 18.87, 2023: 24.66 }, savedAt: "2026-09-27T10:00:00Z", lastUpdated: "2026-07-13" });
    const r = await fetchSecondaryData(spec([["INF", "inflation"], ["EXR", "exchange_rate"]]), {
      cache,
      fetchImpl: fakeFetch(async (u, signal) => (u.includes("PA.NUS.FCRF") ? wbRoute(() => 100)(u, signal) : { status: 503, body: "down" })),
      print: quiet,
    });
    const col = r.dataset.columns[0];
    check("fallback: with both sources down, the saved copy is used", col.values[2023] === 24.66 && /saved copy of 27 Sept 2026/.test(col.sourceNote ?? ""), col.sourceNote);
  }
  {
    const r = await fetchSecondaryData(spec([["INF", "inflation"], ["NSE", null]]), { fetchImpl: fakeFetch(async () => ({ status: 503, body: "down" })), print: quiet });
    check("fallback: nothing live and nothing saved → missing, with the reason", r.dataset.columns[0].source === null && r.missing.some((m) => m.symbol === "INF" && /Could not be fetched/.test(m.reason)));
    check("a variable outside the catalogue is an empty column for the specialist", r.dataset.columns[1].source === null && r.missing.some((m) => m.symbol === "NSE" && /specialist supplies it/.test(m.reason)));
  }
  {
    const seen: string[] = [];
    await fetchSecondaryData(spec([["MPR", "monetary_policy_rate"], ["TBR", "treasury_bill_rate"], ["INT", "interbank_rate"]], 2007, 2023), {
      fetchImpl: fakeFetch(async () => json(cbnMoneyMarket()), seen),
      print: quiet,
    });
    check("one CBN request serves every variable on that endpoint", seen.length === 1 && seen[0] === "https://www.cbn.gov.ng/api/GetAllMoneyMarketIndicators", seen);
  }

  // ─── Statistics (EViews formulas) ──────────────────────────────────────────
  const s = describeColumn("X", [1, 2, 3, 4, 5]);
  const near = (a: number | null, b: number, eps = 1e-4) => a !== null && Math.abs(a - b) < eps;
  check("mean, median, max, min", s.mean === 3 && s.median === 3 && s.maximum === 5 && s.minimum === 1);
  check("Std. Dev. with N−1", near(s.stdDev, 1.58114), s.stdDev);
  check("skewness 0 and kurtosis 1.7 (population σ)", near(s.skewness, 0) && near(s.kurtosis, 1.7), [s.skewness, s.kurtosis]);
  check("Jarque-Bera and its probability", near(s.jarqueBera, 0.352083) && near(s.probability, 0.838593), [s.jarqueBera, s.probability]);
  check("median of an even count", describeColumn("X", [4, 1, 3, 2]).median === 2.5);
  check("a constant series has no skewness", describeColumn("X", [2, 2, 2]).skewness === null);
  check("Pearson: perfect and inverse", near(pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1) && near(pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1));
  check("Pearson: fewer than three pairs is not computed", pearson([1, 2], [3, 4]) === null);
  const ds: Dataset = {
    start: 2000,
    end: 2004,
    frequency: "annual",
    columns: [
      { symbol: "Y", name: "y", role: "dependent", catalogueKey: "gdp_current_usd", unit: "US$ billion", decimals: 2, source: "World Bank, World Development Indicators", code: "NY.GDP.MKTP.CD", sourceNote: "last updated 2026-07-13", values: { 2000: 1, 2001: 2, 2002: 3, 2003: 4, 2004: 5 } },
      { symbol: "X", name: "x", role: "independent", catalogueKey: "inflation", unit: "%", decimals: 2, source: "Central Bank of Nigeria", code: "GetAllInflationRates.allItemsAverage", sourceNote: null, values: { 2001: 4, 2002: 6, 2003: 8, 2004: 10 } },
      { symbol: "Z", name: "z", role: "independent", catalogueKey: null, unit: null, decimals: 2, source: null, code: null, sourceNote: null, values: {} },
    ],
  };
  check("CSV: a missing value is an empty cell", datasetCsv(ds).split("\n")[1] === "2000,1.00,,");
  const corr = correlationMatrix(ds);
  check("correlations use the years both have, and skip unfetched columns", corr.symbols.join() === "Y,X" && near(corr.matrix[0][1], 1));
  const notes = datasetNotes(ds);
  check("notes: source, code, date and gaps per column", notes[1].includes("Source: World Bank, World Development Indicators (NY.GDP.MKTP.CD), last updated 2026-07-13") && notes[2].includes("No value for 2000.") && notes[3].includes("Not fetched"), notes);
  check("the statistics table has the EViews rows", /^Statistic \| Y \| X/.test(statsTableText([describeColumn("Y", [1, 2, 3]), describeColumn("X", [4, 6, 8])])) && statsTableText([describeColumn("Y", [1, 2, 3])]).includes("Jarque-Bera"));
  check("year ranges read naturally", yearRanges([2003, 2000, 2001, 2002, 2007]) === "2000–2003, 2007");

  // ─── Reading the model from Chapter 3 ──────────────────────────────────────
  const CH3 = [
    "[H1] CHAPTER THREE",
    "[H1] RESEARCH METHODOLOGY",
    "[H2] 3.1 Research Design",
    "The study adopts an ex post facto design. Ade (2019) used data from 1981 to 2016.",
    "[H2] 3.2 Sources of Data",
    "Annual time series data for Nigeria covering the period 2000 to 2023 were obtained from the World Bank World Development Indicators and the CBN Statistical Bulletin.",
    "[H3] 3.2.1 Description of Variables",
    "Gross domestic product (GDP) is measured in current US dollars. Inflation rate (INF) is the annual percentage change in consumer prices. Exchange rate (EXR) is the official naira to US dollar rate.",
    "[H2] 3.3 Model Specification",
    "GDP = β0 + β1INF + β2EXR + μ",
    "[H2] 3.4 Ethical Considerations",
    "Secondary data raise no ethical concerns.",
  ].join("\n");
  const excerpt = relevantSections(CH3 + "\n" + "x ".repeat(120));
  check("the excerpt keeps the data and model sections with their sub-sections", excerpt.includes("3.2 Sources of Data") && excerpt.includes("3.2.1 Description of Variables") && excerpt.includes("3.3 Model Specification"));
  check("…and leaves out the rest", !excerpt.includes("3.1 Research Design") && !excerpt.includes("Ethical"));
  check("a chapter with no headings is sent whole", relevantSections("plain text ".repeat(40)) === "plain text ".repeat(40));
  check("stated periods: both ranges found", JSON.stringify(statedPeriods(CH3)) === JSON.stringify([{ start: 1981, end: 2016 }, { start: 2000, end: 2023 }]));
  check("stated periods: 'between … and …' and dashes", statedPeriods("between 1990 and 2020").length === 1 && statedPeriods("2000–2023").length === 1 && statedPeriods("2000-2003").length === 0);
  const now = new Date("2026-09-27T12:00:00Z");
  check("the last complete year is last year", lastCompleteYear(now) === 2025);
  const good = validateSpec(
    {
      dependent: { symbol: "GDP", name: "Gross domestic product", measure: "current US$", catalogueKey: "gdp_current_usd" },
      independents: [
        { symbol: "INF", name: "Inflation rate", measure: "annual %", catalogueKey: "inflation" },
        { symbol: "lnEXR", name: "Exchange rate", measure: "naira per US$", catalogueKey: "exchange_rate" },
        { symbol: "INF", name: "Inflation rate", measure: "", catalogueKey: "inflation" },
        { symbol: "FDI", name: "Foreign direct investment", measure: "", catalogueKey: "fdi_usd" },
        { symbol: "UNR", name: "Unemployment", measure: "", catalogueKey: "made_up_key" },
      ],
      equation: "GDP = β0 + β1INF + β2EXR + μ",
      periodStart: 2000,
      periodEnd: 2023,
      frequency: "annual",
      technique: "ARDL",
      sourcesNamed: ["World Bank WDI", "CBN Statistical Bulletin"],
    },
    CH3 + " UNR",
    now
  );
  check("spec: GDP dependent, INF and EXR independent (log prefix removed)", good.variables.map((v) => `${v.symbol}:${v.role}:${v.catalogueKey}`).join() === "GDP:dependent:gdp_current_usd,INF:independent:inflation,EXR:independent:exchange_rate,UNR:independent:null", good.variables);
  check("spec: a duplicate and an invented variable are noted", good.notes.some((n) => /INF was listed twice/.test(n)) && good.notes.some((n) => /FDI .* is not in Chapter 3/.test(n)), good.notes);
  check("spec: an unknown catalogue key becomes unmatched", good.variables.find((v) => v.symbol === "UNR")?.catalogueKey === null);
  check("spec: period and technique kept", good.period.start === 2000 && good.period.end === 2023 && good.technique === "ARDL" && good.sourcesNamed.length === 2);
  const fixed = validateSpec({ dependent: { symbol: "GDP", catalogueKey: "gdp_current_usd" }, independents: JSON.stringify({ independents: [{ symbol: "INF", catalogueKey: "inflation" }] }), periodStart: 2001, periodEnd: 2022, frequency: "quarterly" }, CH3.replace("1981 to 2016", "earlier years"), now);
  check("spec: a list sent as a JSON string is unwrapped", fixed.variables.length === 2);
  check("spec: the period the chapter states wins over a misread one", fixed.period.start === 2000 && fixed.period.end === 2023 && fixed.notes.some((n) => /chapter's period is used/.test(n)), fixed.notes);
  check("spec: quarterly data is flagged (the dataset is annual)", fixed.frequency === "quarterly" && fixed.notes.some((n) => /dataset is annual/.test(n)));
  const future = validateSpec({ dependent: { symbol: "GDP", catalogueKey: "gdp_current_usd" }, independents: [{ symbol: "INF", catalogueKey: "inflation" }], periodStart: 2005, periodEnd: 2027 }, "GDP INF over 2005 to 2027 " + "x".repeat(200), now);
  check("spec: years not yet complete are cut, with a note", future.period.end === 2025 && future.notes.some((n) => /last complete year/.test(n)));
  throws("spec: no dependent variable is refused", () => validateSpec({ dependent: { symbol: "", catalogueKey: "none" }, independents: [], periodStart: 2000, periodEnd: 2023 }, CH3, now), /dependent variable/);
  throws("spec: no explanatory variable is refused", () => validateSpec({ dependent: { symbol: "GDP", catalogueKey: "gdp_current_usd" }, independents: [], periodStart: 2000, periodEnd: 2023 }, CH3, now), /explanatory variable/);
  throws("spec: no period is refused", () => validateSpec({ dependent: { symbol: "GDP" }, independents: [{ symbol: "INF" }] }, "GDP and INF " + "x".repeat(300), now), /period of the data/);
  check("spec errors are ModelSpecError", (() => {
    try {
      validateSpec({}, CH3, now);
      return false;
    } catch (e) {
      return e instanceof ModelSpecError;
    }
  })());

  // ─── The private store ─────────────────────────────────────────────────────
  check("a dataset CSV may be stored under source", contentTypeFor("source", "a.csv") === "text/csv" && contentTypeFor("source", "a.pdf") === "application/pdf");
  const p = buildPrivatePath({ projectDbId: "ckprojectid0000000000000", purpose: "source", targetId: "secondary-data", random: "a".repeat(24), ext: "csv" });
  check("the dataset path is a valid stored path", parseStoredPath(p)?.purpose === "source");
  check("…that no upload can use", parsePrivatePath(p) === null);

  if (failures.length) {
    console.error(`${failures.length} FAILED:\n  - ${failures.join("\n  - ")}`);
    console.error(`${passed} passed.`);
    process.exit(1);
  }
  console.log(`${passed} checks passed. The Phase D5 secondary data rules hold.`);
}

// If a stand-in ever leaves nothing pending, Node would exit quietly with 0 mid-run: make that a failure.
let finished = false;
process.on("exit", (code) => {
  if (!finished && code === 0) {
    console.error("check:secondary stopped before it finished (a pending promise with nothing keeping Node alive).");
    process.exitCode = 1;
  }
});

main()
  .then(() => {
    finished = true;
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
