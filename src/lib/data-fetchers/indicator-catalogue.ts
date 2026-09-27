/**
 * The variables a Mode 5 dataset can be fetched for (Phase D5), and where each
 * one comes from. Pure data.
 *
 * Two sources only (founder, 27 Sept): the World Bank's World Development
 * Indicators API (annual, Nigeria = NGA) and the Central Bank of Nigeria's own
 * data API (monthly, turned into years here). NBS has no public API and the
 * NSE/NGX has no open one, so anything only they publish is left for the
 * specialist.
 *
 * Every World Bank code below was queried live for Nigeria, 2000–2023, on
 * 27 Sept 2026 and returned data. Codes that returned nothing for Nigeria are
 * deliberately absent (trade openness, exports, imports, gross fixed capital
 * formation, government consumption, tax revenue, government expense, central
 * government debt: all null), and external debt stocks (DT.DOD.DECT.CD) timed
 * out every time, even alone.
 *
 * A variable lists its sources in order: the first is tried first, the next
 * only if it fails. A series is never pieced together from two sources.
 */

export type CbnEndpoint = "GetAllInflationRates" | "GetAllMoneyMarketIndicators";

export type SeriesSource =
  | { source: "WB"; code: string }
  | {
      source: "CBN";
      endpoint: CbnEndpoint;
      field: string;
      /** december = the December value (a 12-month average is already a yearly figure); mean = the average of all 12 months. */
      annual: "december" | "mean";
      /** A zero means "not in use" (the MPR before December 2006), not a rate of zero. */
      zeroIsMissing?: boolean;
      /** How the series is described in the notes and citations. */
      label: string;
    };

export interface CatalogueIndicator {
  key: string;
  /** Plain name, as the notes print it. */
  name: string;
  /** The unit of the numbers in the CSV (after `scale`). */
  unit: string;
  /** Raw values are divided by this (1e9: US dollars to US$ billions). */
  scale: number;
  decimals: number;
  /** What Claude reads when matching a Chapter 3 variable to this entry. */
  hint: string;
  sources: SeriesSource[];
}

const WB = (code: string): SeriesSource => ({ source: "WB", code });

export const INDICATOR_CATALOGUE: CatalogueIndicator[] = [
  // ── Output ──
  { key: "gdp_current_usd", name: "Gross domestic product (current US$)", unit: "US$ billion", scale: 1e9, decimals: 2, hint: "nominal GDP in US dollars", sources: [WB("NY.GDP.MKTP.CD")] },
  { key: "gdp_constant_usd", name: "Gross domestic product (constant 2015 US$)", unit: "US$ billion (2015 prices)", scale: 1e9, decimals: 2, hint: "real GDP in US dollars", sources: [WB("NY.GDP.MKTP.KD")] },
  { key: "gdp_current_naira", name: "Gross domestic product (current naira)", unit: "₦ billion", scale: 1e9, decimals: 2, hint: "nominal GDP in naira, GDP at current market prices", sources: [WB("NY.GDP.MKTP.CN")] },
  { key: "gdp_constant_naira", name: "Gross domestic product (constant naira prices)", unit: "₦ billion (constant prices)", scale: 1e9, decimals: 2, hint: "real GDP in naira, RGDP at constant (basic) prices", sources: [WB("NY.GDP.MKTP.KN")] },
  { key: "gdp_growth", name: "GDP growth (annual %)", unit: "%", scale: 1, decimals: 2, hint: "economic growth rate, real GDP growth", sources: [WB("NY.GDP.MKTP.KD.ZG")] },
  { key: "gdp_per_capita_usd", name: "GDP per capita (current US$)", unit: "US$", scale: 1, decimals: 2, hint: "income per head, nominal", sources: [WB("NY.GDP.PCAP.CD")] },
  { key: "gdp_per_capita_constant_usd", name: "GDP per capita (constant 2015 US$)", unit: "US$ (2015 prices)", scale: 1, decimals: 2, hint: "real income per head, living standard proxy", sources: [WB("NY.GDP.PCAP.KD")] },

  // ── Prices ──
  {
    key: "inflation",
    name: "Inflation, consumer prices (annual %)",
    unit: "%",
    scale: 1,
    decimals: 2,
    hint: "headline inflation rate, CPI inflation",
    sources: [WB("FP.CPI.TOTL.ZG"), { source: "CBN", endpoint: "GetAllInflationRates", field: "allItemsAverage", annual: "december", label: "headline inflation, all items, 12-month average change, December" }],
  },
  {
    key: "food_inflation",
    name: "Food inflation (12-month average change, %)",
    unit: "%",
    scale: 1,
    decimals: 2,
    hint: "food price inflation",
    sources: [{ source: "CBN", endpoint: "GetAllInflationRates", field: "foodAverage", annual: "december", label: "food inflation, 12-month average change, December" }],
  },
  { key: "cpi_index", name: "Consumer price index (2010 = 100)", unit: "index", scale: 1, decimals: 2, hint: "price level, CPI index", sources: [WB("FP.CPI.TOTL")] },
  { key: "inflation_deflator", name: "Inflation, GDP deflator (annual %)", unit: "%", scale: 1, decimals: 2, hint: "GDP deflator inflation", sources: [WB("NY.GDP.DEFL.KD.ZG")] },

  // ── Exchange and interest rates ──
  { key: "exchange_rate", name: "Official exchange rate (naira per US$, period average)", unit: "₦ per US$", scale: 1, decimals: 2, hint: "naira/dollar exchange rate, EXR", sources: [WB("PA.NUS.FCRF")] },
  {
    key: "monetary_policy_rate",
    name: "Monetary policy rate (%)",
    unit: "%",
    scale: 1,
    decimals: 2,
    hint: "MPR, CBN policy rate (introduced December 2006)",
    sources: [{ source: "CBN", endpoint: "GetAllMoneyMarketIndicators", field: "mpr", annual: "mean", zeroIsMissing: true, label: "monetary policy rate, average of the monthly rates" }],
  },
  {
    key: "lending_rate",
    name: "Lending interest rate (%)",
    unit: "%",
    scale: 1,
    decimals: 2,
    hint: "prime lending rate, bank lending rate, interest rate on loans",
    sources: [WB("FR.INR.LEND"), { source: "CBN", endpoint: "GetAllMoneyMarketIndicators", field: "primeLending", annual: "mean", label: "prime lending rate, average of the monthly rates" }],
  },
  {
    key: "maximum_lending_rate",
    name: "Maximum lending rate (%)",
    unit: "%",
    scale: 1,
    decimals: 2,
    hint: "maximum lending rate",
    sources: [{ source: "CBN", endpoint: "GetAllMoneyMarketIndicators", field: "maxLending", annual: "mean", label: "maximum lending rate, average of the monthly rates" }],
  },
  { key: "deposit_rate", name: "Deposit interest rate (%)", unit: "%", scale: 1, decimals: 2, hint: "savings/deposit rate", sources: [WB("FR.INR.DPST")] },
  { key: "real_interest_rate", name: "Real interest rate (%)", unit: "%", scale: 1, decimals: 2, hint: "lending rate adjusted for inflation", sources: [WB("FR.INR.RINR")] },
  {
    key: "treasury_bill_rate",
    name: "Treasury bill rate (%)",
    unit: "%",
    scale: 1,
    decimals: 2,
    hint: "91-day treasury bill rate",
    sources: [{ source: "CBN", endpoint: "GetAllMoneyMarketIndicators", field: "treasuryBill", annual: "mean", label: "treasury bill rate, average of the monthly rates" }],
  },
  {
    key: "interbank_rate",
    name: "Interbank call rate (%)",
    unit: "%",
    scale: 1,
    decimals: 2,
    hint: "interbank rate, call money rate",
    sources: [{ source: "CBN", endpoint: "GetAllMoneyMarketIndicators", field: "interBankCallRate", annual: "mean", label: "interbank call rate, average of the monthly rates" }],
  },

  // ── Money and finance ──
  { key: "broad_money_naira", name: "Broad money, M2 (current naira)", unit: "₦ billion", scale: 1e9, decimals: 2, hint: "money supply M2", sources: [WB("FM.LBL.BMNY.CN")] },
  { key: "broad_money_gdp", name: "Broad money (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "financial deepening, M2/GDP", sources: [WB("FM.LBL.BMNY.GD.ZS")] },
  { key: "private_credit_gdp", name: "Domestic credit to private sector (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "credit to the private sector, bank credit", sources: [WB("FS.AST.PRVT.GD.ZS")] },
  { key: "market_cap_gdp", name: "Market capitalisation of listed domestic companies (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "stock market capitalisation", sources: [WB("CM.MKT.LCAP.GD.ZS")] },
  { key: "reserves_usd", name: "Total reserves including gold (current US$)", unit: "US$ billion", scale: 1e9, decimals: 2, hint: "external reserves, foreign reserves", sources: [WB("FI.RES.TOTL.CD")] },

  // ── External sector ──
  { key: "fdi_usd", name: "Foreign direct investment, net inflows (current US$)", unit: "US$ billion", scale: 1e9, decimals: 3, hint: "FDI inflows in dollars", sources: [WB("BX.KLT.DINV.CD.WD")] },
  { key: "fdi_gdp", name: "Foreign direct investment, net inflows (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "FDI as a share of GDP", sources: [WB("BX.KLT.DINV.WD.GD.ZS")] },
  { key: "remittances_usd", name: "Personal remittances received (current US$)", unit: "US$ billion", scale: 1e9, decimals: 2, hint: "diaspora remittances", sources: [WB("BX.TRF.PWKR.CD.DT")] },
  { key: "current_account_gdp", name: "Current account balance (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "balance of payments current account", sources: [WB("BN.CAB.XOKA.GD.ZS")] },
  { key: "oil_rents_gdp", name: "Oil rents (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "oil revenue proxy, oil sector", sources: [WB("NY.GDP.PETR.RT.ZS")] },

  // ── Structure, labour, society ──
  { key: "agriculture_gdp", name: "Agriculture, forestry and fishing, value added (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "agricultural output share", sources: [WB("NV.AGR.TOTL.ZS")] },
  { key: "manufacturing_gdp", name: "Manufacturing, value added (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "manufacturing output share, industrialisation", sources: [WB("NV.IND.MANF.ZS")] },
  { key: "unemployment", name: "Unemployment, total (% of labour force, modelled ILO estimate)", unit: "%", scale: 1, decimals: 2, hint: "unemployment rate", sources: [WB("SL.UEM.TOTL.ZS")] },
  { key: "population", name: "Population, total", unit: "million", scale: 1e6, decimals: 2, hint: "population size", sources: [WB("SP.POP.TOTL")] },
  { key: "electricity_access", name: "Access to electricity (% of population)", unit: "%", scale: 1, decimals: 2, hint: "electricity access, energy access", sources: [WB("EG.ELC.ACCS.ZS")] },
  { key: "health_expenditure_gdp", name: "Current health expenditure (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "health spending", sources: [WB("SH.XPD.CHEX.GD.ZS")] },
  { key: "education_expenditure_gdp", name: "Government expenditure on education (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "education spending (World Bank has 2012 onwards only)", sources: [WB("SE.XPD.TOTL.GD.ZS")] },
];

export const CATALOGUE_KEYS: string[] = INDICATOR_CATALOGUE.map((i) => i.key);

export function indicatorFor(key: string | null | undefined): CatalogueIndicator | null {
  return key ? INDICATOR_CATALOGUE.find((i) => i.key === key) ?? null : null;
}

/** The key a source is cached under (the same series, whatever project asked for it). */
export function seriesCacheKey(s: SeriesSource): string {
  return s.source === "WB" ? `secondary_data_cache:WB:${s.code}` : `secondary_data_cache:CBN:${s.endpoint}:${s.field}:${s.annual}`;
}

/** Where a series came from, as the notes and table sources say it. */
export function sourceLabel(s: SeriesSource): string {
  return s.source === "WB" ? "World Bank, World Development Indicators" : "Central Bank of Nigeria";
}

export function sourceCode(s: SeriesSource): string {
  return s.source === "WB" ? s.code : `${s.endpoint}.${s.field}`;
}
