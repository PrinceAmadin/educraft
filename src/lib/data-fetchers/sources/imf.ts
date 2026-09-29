/**
 * International Monetary Fund, World Economic Outlook, through the DataMapper API.
 *
 *   GET https://www.imf.org/external/datamapper/api/v1/{INDICATOR}/NGA
 *
 * Answers {values: {INDICATOR: {ISO3: {"1990": number, ...}}}, api: {...}} for
 * EVERY country whatever the path asks (100–180 KB, 0.4–3.6 s when probed on
 * 29 Sept 2026); an unknown indicator answers a country list with no `values`.
 * Series run into IMF projections (to 2031): the model's period already stops
 * at the last complete year, and the latest of those can be IMF estimates, so
 * the note says so.
 *
 * Probed for Nigeria (29 Sept 2026): real GDP growth, average and end-of-period
 * inflation, GDP and GDP per capita in US$, GDP per capita PPP, population,
 * general government gross debt and net lending, current account; its real GDP
 * growth matches the World Bank's (2020: −6.37 in both). Not usable for
 * Nigeria: unemployment (2010–2018 only), government revenue and expenditure,
 * investment and saving (no NGA values).
 *
 * Terms: the WEO FAQ: "You are welcome to use WEO data for written work as long
 * as you cite the publication/database accordingly." robots.txt does not
 * disallow /external/datamapper/api/.
 */

import type { AnnualSeries } from "../series";
import type { SourceModule } from "../source-module";
import { FetchFailure, timedGetJson } from "../timed-fetch";

export const IMF_BASE = "https://www.imf.org/external/datamapper/api/v1";

export function imfUrl(indicator: string): string {
  return `${IMF_BASE}/${encodeURIComponent(indicator)}/NGA`;
}

/** Pure: Nigeria's values for the period, times `multiplier`. An indicator the IMF publishes but not for Nigeria is an empty series. */
export function parseImf(json: unknown, indicator: string, start: number, end: number, multiplier = 1): AnnualSeries {
  const values = (json as { values?: Record<string, Record<string, Record<string, unknown>>> } | null)?.values;
  const series = values && typeof values === "object" ? values[indicator] : undefined;
  if (!series || typeof series !== "object") throw new FetchFailure(`IMF does not publish the indicator ${indicator}`);
  const nga = series.NGA;
  const out: Record<number, number> = {};
  if (nga && typeof nga === "object") {
    for (const [y, v] of Object.entries(nga)) {
      const year = Number(y);
      if (Number.isInteger(year) && year >= start && year <= end && typeof v === "number" && Number.isFinite(v)) out[year] = v * multiplier;
    }
  }
  return { values: out, lastUpdated: null };
}

export const imfModule: SourceModule<"IMF"> = {
  name: "IMF",
  shortName: "IMF",
  label: "International Monetary Fund, World Economic Outlook",
  // Each answer holds every country; two at a time is plenty.
  concurrency: 2,
  retry: "transient",
  fetchSeries: async (s, ctx) => {
    const json = await timedGetJson("IMF", imfUrl(s.indicator), ctx.log, ctx.http);
    return parseImf(json, s.indicator, ctx.period.start, ctx.period.end, s.multiplier ?? 1);
  },
  cacheKey: (s) => `secondary_data_cache:IMF:${s.indicator}`,
  code: (s) => s.indicator,
  note: () => "the latest years can be IMF estimates",
};
