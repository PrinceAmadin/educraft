/**
 * NASA Langley Research Center, POWER project: climate at ONE point, the
 * geographic centre of Nigeria (9.08°N, 8.68°E). Not a national average: the
 * notes say so, and national temperature and rainfall come first from
 * Copernicus ERA5 through Our World in Data.
 *
 *   GET https://power.larc.nasa.gov/api/temporal/monthly/point?parameters={P}&community=AG&longitude=8.6753&latitude=9.0820&start=YYYY&end=YYYY&format=JSON
 *
 * The annual endpoint is gone (404 on 29 Sept 2026); the monthly one answers
 * {properties: {parameter: {P: {"200001": v, ..., "200013": v}}}}, where
 * month 13 is the year's figure (the annual mean, or the year's extreme for
 * T2M_MAX / T2M_MIN). -999 is POWER's missing value. 2000–2025 answered in
 * about 2 s; data start in 1981.
 *
 * Terms: no restriction on use is stated; the referencing page asks for
 * "The data was obtained from National Aeronautics and Space Administration
 * (NASA) Langley Research Center's Prediction Of Worldwide Energy Resources
 * (POWER) project funded through the NASA Earth Science Division." (and asks,
 * as a courtesy, to hear of uses).
 */

import type { AnnualSeries } from "../series";
import type { SourceModule } from "../source-module";
import { FetchFailure, timedGetJson } from "../timed-fetch";

export const NIGERIA_CENTRE = { latitude: 9.082, longitude: 8.6753 } as const;
export const POWER_FIRST_YEAR = 1981;

export function nasaPowerUrl(parameter: string, start: number, end: number): string {
  const from = Math.max(start, POWER_FIRST_YEAR);
  return `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=${encodeURIComponent(parameter)}&community=AG&longitude=${NIGERIA_CENTRE.longitude}&latitude=${NIGERIA_CENTRE.latitude}&start=${from}&end=${Math.max(end, from)}&format=JSON`;
}

/** Pure: the month-13 (annual) values of one parameter, in the period; -999 is missing. */
export function parseNasaPower(json: unknown, parameter: string, start: number, end: number): AnnualSeries {
  const params = (json as { properties?: { parameter?: Record<string, Record<string, unknown>> } } | null)?.properties?.parameter;
  if (!params || typeof params !== "object") throw new FetchFailure("NASA POWER sent an unexpected answer");
  const series = params[parameter];
  if (!series || typeof series !== "object") throw new FetchFailure(`NASA POWER does not publish the parameter ${parameter}`);
  const values: Record<number, number> = {};
  for (const [key, v] of Object.entries(series)) {
    const m = /^(\d{4})13$/.exec(key);
    if (!m) continue;
    const year = Number(m[1]);
    if (year >= start && year <= end && typeof v === "number" && Number.isFinite(v) && v !== -999) values[year] = v;
  }
  return { values, lastUpdated: null };
}

export const nasaPowerModule: SourceModule<"NASA_POWER"> = {
  name: "NASA_POWER",
  shortName: "NASA POWER",
  label: "NASA Langley Research Center, POWER project",
  concurrency: 2,
  retry: "transient",
  fetchSeries: async (s, ctx) =>
    parseNasaPower(await timedGetJson("NASA POWER", nasaPowerUrl(s.parameter, ctx.period.start, ctx.period.end), ctx.log, ctx.http), s.parameter, ctx.period.start, ctx.period.end),
  cacheKey: (s) => `secondary_data_cache:NASA_POWER:${s.parameter}`,
  code: (s) => s.parameter,
  note: () => "at the geographic centre of Nigeria (9.08°N, 8.68°E), not a national average; the data was obtained from NASA Langley Research Center's POWER project, funded through the NASA Earth Science Division",
};
