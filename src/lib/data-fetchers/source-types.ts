/**
 * The shape of one series in one source (Mode 5 secondary data). Types only:
 * the catalogue lists these per variable, and each source module reads its own
 * kind. Adding a source = a new member here, a module in sources/, a line in
 * source-registry.ts.
 */

export type CbnEndpoint = "GetAllInflationRates" | "GetAllMoneyMarketIndicators";

/** World Bank, World Development Indicators (annual, Nigeria). */
export interface WbSource {
  source: "WB";
  code: string;
}

/** Central Bank of Nigeria data API (monthly, turned into years). */
export interface CbnSource {
  source: "CBN";
  endpoint: CbnEndpoint;
  field: string;
  /** december = the December value (a 12-month average is already a yearly figure); mean = the average of all 12 months. */
  annual: "december" | "mean";
  /** A zero means "not in use" (the MPR before December 2006), not a rate of zero. */
  zeroIsMissing?: boolean;
  /** How the series is described in the notes and citations. */
  label: string;
}

/** International Monetary Fund, World Economic Outlook (DataMapper API; annual). */
export interface ImfSource {
  source: "IMF";
  indicator: string;
  /** Raw IMF values are multiplied by this to reach the catalogue entry's raw unit (NGDPD is in US$ billions: 1e9). */
  multiplier?: number;
}

/** The DHS Program Indicator Data API: Nigeria's Demographic and Health Surveys and Malaria Indicator Surveys (survey years only). */
export interface DhsSource {
  source: "DHS";
  indicator: string;
}

/** Our World in Data: one column of a grapher chart, for Nigeria. Only charts whose every origin allows commercial reuse are used. */
export interface OwidSource {
  source: "OWID";
  /** The chart's slug (ourworldindata.org/grapher/{slug}). */
  slug: string;
  /** The column's short name in the chart's CSV. */
  column: string;
  multiplier?: number;
  /** The original producer, and any attribution its licence requires, for the notes. */
  origin: string;
}

/** NASA Langley POWER: one parameter's annual value at the geographic centre of Nigeria. */
export interface NasaPowerSource {
  source: "NASA_POWER";
  /** A POWER parameter (T2M, PRECTOTCORR, ALLSKY_SFC_SW_DWN, ...). */
  parameter: string;
}

export type SeriesSource = WbSource | CbnSource | ImfSource | DhsSource | OwidSource | NasaPowerSource;

export type SourceName = SeriesSource["source"];

export type SourceOf<N extends SourceName> = Extract<SeriesSource, { source: N }>;
