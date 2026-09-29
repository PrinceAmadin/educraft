/**
 * The DHS Program Indicator Data API: the national figures of Nigeria's
 * Demographic and Health Surveys (1990, 2003, 2008, 2013, 2018, 2024) and
 * Malaria Indicator Surveys (2010, 2015, 2021). Survey years only.
 *
 *   GET https://api.dhsprogram.com/rest/dhs/data?countryIds=NG&indicatorIds={ID}&breakdown=national&perpage=1000&f=json
 *
 * Answers {Data: [{IndicatorId, SurveyId: "NG2024DHS", SurveyYear, SurveyType,
 * CharacteristicCategory: "Total", IsPreferred: 1 | 0, Value}], RecordCount, ...}.
 * A survey can carry more than one estimate; the one to use is IsPreferred 1
 * in the "Total" category (probed 29 Sept 2026: one per survey for every
 * indicator offered, 1–2 s an answer).
 *
 * Terms: the API's Terms & Conditions ask only for this citation on anything
 * that receives its data: "The DHS Program Indicator Data API, The Demographic
 * and Health Surveys (DHS) Program. ICF. ... Available from api.dhsprogram.com."
 * (The non-commercial clause on dhsprogram.com covers the registered microdata
 * downloads, which are not used.) Its robots.txt disallows /rest/dhs/ to
 * crawlers; the API is documented and offered for programmatic use.
 */

import type { AnnualSeries } from "../series";
import type { SourceModule } from "../source-module";
import { FetchFailure, timedGetJson } from "../timed-fetch";

export const DHS_BASE = "https://api.dhsprogram.com/rest/dhs/data";

export function dhsUrl(indicator: string): string {
  return `${DHS_BASE}?countryIds=NG&indicatorIds=${encodeURIComponent(indicator)}&breakdown=national&perpage=1000&f=json`;
}

interface DhsRow {
  IndicatorId?: unknown;
  SurveyId?: unknown;
  SurveyYear?: unknown;
  SurveyType?: unknown;
  CharacteristicCategory?: unknown;
  IsPreferred?: unknown;
  Value?: unknown;
}

/** Pure: the preferred national value of each Nigerian survey in the period (a DHS wins over an MIS in the same year). */
export function parseDhs(json: unknown, indicator: string, start: number, end: number): AnnualSeries {
  const data = (json as { Data?: unknown } | null)?.Data;
  if (!Array.isArray(data)) throw new FetchFailure("DHS sent an unexpected answer");
  const byYear = new Map<number, { type: string; value: number }[]>();
  for (const raw of data as DhsRow[]) {
    if (raw.IndicatorId !== indicator || raw.IsPreferred !== 1 || raw.CharacteristicCategory !== "Total") continue;
    if (typeof raw.SurveyId !== "string" || !raw.SurveyId.startsWith("NG")) throw new FetchFailure(`DHS sent a survey other than Nigeria's (${String(raw.SurveyId)})`);
    const year = Number(raw.SurveyYear);
    if (!Number.isInteger(year) || year < start || year > end || typeof raw.Value !== "number" || !Number.isFinite(raw.Value)) continue;
    const list = byYear.get(year) ?? [];
    list.push({ type: String(raw.SurveyType ?? ""), value: raw.Value });
    byYear.set(year, list);
  }
  const values: Record<number, number> = {};
  for (const [year, list] of byYear) {
    const dhs = list.filter((x) => x.type === "DHS");
    const pick = dhs.length ? dhs : list;
    if (new Set(pick.map((x) => x.value)).size > 1) throw new FetchFailure(`DHS has more than one national value for ${year} (${indicator})`);
    values[year] = pick[0].value;
  }
  return { values, lastUpdated: null };
}

export const dhsModule: SourceModule<"DHS"> = {
  name: "DHS",
  shortName: "DHS",
  label: "The DHS Program Indicator Data API, The Demographic and Health Surveys (DHS) Program, ICF",
  concurrency: 2,
  retry: "transient",
  fetchSeries: async (s, ctx) => parseDhs(await timedGetJson("DHS", dhsUrl(s.indicator), ctx.log, ctx.http), s.indicator, ctx.period.start, ctx.period.end),
  cacheKey: (s) => `secondary_data_cache:DHS:${s.indicator}`,
  code: (s) => s.indicator,
  note: () => "survey years only (Nigeria Demographic and Health Surveys and Malaria Indicator Surveys)",
};
