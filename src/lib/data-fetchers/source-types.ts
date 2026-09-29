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

export type SeriesSource = WbSource | CbnSource;

export type SourceName = SeriesSource["source"];

export type SourceOf<N extends SourceName> = Extract<SeriesSource, { source: N }>;
