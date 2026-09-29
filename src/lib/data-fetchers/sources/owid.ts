/**
 * Our World in Data grapher charts, one column for Nigeria.
 *
 *   GET https://ourworldindata.org/grapher/{slug}.csv?v=1&csvType=full&useColumnShortNames=true
 *
 * Answers a CSV "entity,code,year,<column>,..." for EVERY country (a Nigeria
 * filter only works on a chart's default view, one year): 160 KB–1 MB, 0.4–2 s
 * when probed from Lagos on 29 Sept 2026 (OWID is behind a CDN).
 *
 * Licences: OWID's own licence (CC BY 4.0) does not replace its sources', so
 * each chart was checked origin by origin in its indicator metadata
 * (api.ourworldindata.org/v1/indicators/{id}.metadata.json) and only charts
 * whose every origin allows commercial reuse are in the catalogue: Global
 * Carbon Project (CC BY 4.0), Ember (CC BY 4.0), Copernicus ERA5 (the
 * Copernicus Licence: "for any purpose in so far as it is lawful"), and FAO's
 * crop statistics: OWID still tags them CC BY-NC-SA 3.0 IGO, but FAO's own
 * database terms (fao.org/contact-us/terms/db-terms-of-use) now license "all
 * datasets disseminated through FAO corporate statistical databases" under CC
 * BY 4.0, and FAO's page is the one that counts. Left out: energy use,
 * electricity generation and renewables share (they mix in "© Energy
 * Institute" data) and forest area (publisher-copyright origins); cereal yield
 * comes from the World Bank.
 */

import { parseCsv } from "../csv";
import type { AnnualSeries } from "../series";
import type { SourceModule } from "../source-module";
import { FetchFailure, timedGetText } from "../timed-fetch";

export function owidUrl(slug: string): string {
  return `https://ourworldindata.org/grapher/${encodeURIComponent(slug)}.csv?v=1&csvType=full&useColumnShortNames=true`;
}

/** Pure: Nigeria's (code NGA) values in the named column, for the period, times `multiplier`. */
export function parseOwid(csv: string, column: string, start: number, end: number, multiplier = 1): AnnualSeries {
  const rows = parseCsv(csv);
  const header = (rows[0] ?? []).map((h) => h.trim());
  const code = header.findIndex((h) => h.toLowerCase() === "code");
  const year = header.findIndex((h) => h.toLowerCase() === "year");
  const col = header.indexOf(column);
  if (code < 0 || year < 0) throw new FetchFailure("OWID sent a CSV without code and year columns");
  if (col < 0) throw new FetchFailure(`OWID's chart no longer has the column ${column}`);
  const values: Record<number, number> = {};
  for (const r of rows.slice(1)) {
    if (r[code] !== "NGA") continue;
    const y = Number(r[year]);
    const v = r[col]?.trim() ? Number(r[col]) : NaN;
    if (Number.isInteger(y) && y >= start && y <= end && Number.isFinite(v)) values[y] = v * multiplier;
  }
  return { values, lastUpdated: null };
}

export const owidModule: SourceModule<"OWID"> = {
  name: "OWID",
  shortName: "Our World in Data",
  label: "Our World in Data",
  concurrency: 2,
  retry: "transient",
  fetchSeries: async (s, ctx) => parseOwid(await timedGetText("OWID", owidUrl(s.slug), ctx.log, ctx.http), s.column, ctx.period.start, ctx.period.end, s.multiplier ?? 1),
  cacheKey: (s) => `secondary_data_cache:OWID:${s.slug}:${s.column}`,
  code: (s) => `${s.slug}.${s.column}`,
  note: (s) => `${s.origin}; processed by Our World in Data`,
};
