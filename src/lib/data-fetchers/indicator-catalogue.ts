/**
 * The variables a Mode 5 dataset can be fetched for, where each one comes
 * from, and which departments may use it. Pure data.
 *
 * Every entry belongs to one or more DOMAINS (domain-map.ts); a project is
 * offered only the entries of its department's domains. The standard macro
 * controls (GDP, growth, income per head, inflation, unemployment,
 * population) are in every domain: nearly every Mode 5 model uses them,
 * whatever the department.
 *
 * Every series below was queried live for Nigeria before it was added (the
 * World Bank codes on 27 Sept 2026, 2000–2023). Codes that returned nothing
 * for Nigeria are deliberately absent (trade openness, exports, imports,
 * gross fixed capital formation, government consumption, tax revenue,
 * government expense, central government debt: all null), and external debt
 * stocks (DT.DOD.DECT.CD) timed out every time, even alone. NBS has no public
 * API and the NSE/NGX has no open one, so anything only they publish is left
 * for the specialist.
 *
 * A variable lists its sources in order: the first is tried first, the next
 * only if it fails. A series is never pieced together from two sources.
 */

import { DOMAINS, type Domain } from "./domain-map";
import type { SeriesSource, SourceName } from "./source-types";

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
  /** The departments' domains this entry is offered to. */
  domains: Domain[];
  sources: SeriesSource[];
}

const WB = (code: string): SeriesSource => ({ source: "WB", code });
const IMF = (indicator: string, multiplier?: number): SeriesSource => ({ source: "IMF", indicator, ...(multiplier ? { multiplier } : {}) });

const ALL: Domain[] = [...DOMAINS];
const MACRO: Domain[] = ["MACRO_FINANCE"];

export const INDICATOR_CATALOGUE: CatalogueIndicator[] = [
  // ── Output ──
  { key: "gdp_current_usd", name: "Gross domestic product (current US$)", unit: "US$ billion", scale: 1e9, decimals: 2, hint: "nominal GDP in US dollars", domains: ALL, sources: [WB("NY.GDP.MKTP.CD"), IMF("NGDPD", 1e9)] },
  { key: "gdp_constant_usd", name: "Gross domestic product (constant 2015 US$)", unit: "US$ billion (2015 prices)", scale: 1e9, decimals: 2, hint: "real GDP in US dollars", domains: ALL, sources: [WB("NY.GDP.MKTP.KD")] },
  { key: "gdp_current_naira", name: "Gross domestic product (current naira)", unit: "₦ billion", scale: 1e9, decimals: 2, hint: "nominal GDP in naira, GDP at current market prices", domains: ALL, sources: [WB("NY.GDP.MKTP.CN")] },
  { key: "gdp_constant_naira", name: "Gross domestic product (constant naira prices)", unit: "₦ billion (constant prices)", scale: 1e9, decimals: 2, hint: "real GDP in naira, RGDP at constant (basic) prices", domains: ALL, sources: [WB("NY.GDP.MKTP.KN")] },
  { key: "gdp_growth", name: "GDP growth (annual %)", unit: "%", scale: 1, decimals: 2, hint: "economic growth rate, real GDP growth", domains: ALL, sources: [WB("NY.GDP.MKTP.KD.ZG"), IMF("NGDP_RPCH")] },
  { key: "gdp_per_capita_usd", name: "GDP per capita (current US$)", unit: "US$", scale: 1, decimals: 2, hint: "income per head, nominal", domains: ALL, sources: [WB("NY.GDP.PCAP.CD"), IMF("NGDPDPC")] },
  { key: "gdp_per_capita_constant_usd", name: "GDP per capita (constant 2015 US$)", unit: "US$ (2015 prices)", scale: 1, decimals: 2, hint: "real income per head, living standard proxy", domains: ALL, sources: [WB("NY.GDP.PCAP.KD")] },
  { key: "gdp_per_capita_ppp", name: "GDP per capita, PPP (current international $)", unit: "international $", scale: 1, decimals: 2, hint: "income per head at purchasing power parity", domains: ["MACRO_FINANCE", "HEALTH"], sources: [IMF("PPPPC")] },

  // ── Prices ──
  {
    key: "inflation",
    name: "Inflation, consumer prices (annual %)",
    unit: "%",
    scale: 1,
    decimals: 2,
    hint: "headline inflation rate, CPI inflation",
    domains: ALL,
    sources: [WB("FP.CPI.TOTL.ZG"), { source: "CBN", endpoint: "GetAllInflationRates", field: "allItemsAverage", annual: "december", label: "headline inflation, all items, 12-month average change, December" }, IMF("PCPIPCH")],
  },
  { key: "inflation_end_of_period", name: "Inflation, end of period consumer prices (annual %)", unit: "%", scale: 1, decimals: 2, hint: "December-on-December inflation, end-of-year inflation", domains: MACRO, sources: [IMF("PCPIEPCH")] },
  {
    key: "food_inflation",
    name: "Food inflation (12-month average change, %)",
    unit: "%",
    scale: 1,
    decimals: 2,
    hint: "food price inflation",
    domains: ["MACRO_FINANCE", "SCIENCE_ENV_AG"],
    sources: [{ source: "CBN", endpoint: "GetAllInflationRates", field: "foodAverage", annual: "december", label: "food inflation, 12-month average change, December" }],
  },
  { key: "cpi_index", name: "Consumer price index (2010 = 100)", unit: "index", scale: 1, decimals: 2, hint: "price level, CPI index", domains: MACRO, sources: [WB("FP.CPI.TOTL")] },
  { key: "inflation_deflator", name: "Inflation, GDP deflator (annual %)", unit: "%", scale: 1, decimals: 2, hint: "GDP deflator inflation", domains: MACRO, sources: [WB("NY.GDP.DEFL.KD.ZG")] },

  // ── Exchange and interest rates ──
  { key: "exchange_rate", name: "Official exchange rate (naira per US$, period average)", unit: "₦ per US$", scale: 1, decimals: 2, hint: "naira/dollar exchange rate, EXR", domains: MACRO, sources: [WB("PA.NUS.FCRF")] },
  {
    key: "monetary_policy_rate",
    name: "Monetary policy rate (%)",
    unit: "%",
    scale: 1,
    decimals: 2,
    hint: "MPR, CBN policy rate (introduced December 2006)",
    domains: MACRO,
    sources: [{ source: "CBN", endpoint: "GetAllMoneyMarketIndicators", field: "mpr", annual: "mean", zeroIsMissing: true, label: "monetary policy rate, average of the monthly rates" }],
  },
  {
    key: "lending_rate",
    name: "Lending interest rate (%)",
    unit: "%",
    scale: 1,
    decimals: 2,
    hint: "prime lending rate, bank lending rate, interest rate on loans",
    domains: MACRO,
    sources: [WB("FR.INR.LEND"), { source: "CBN", endpoint: "GetAllMoneyMarketIndicators", field: "primeLending", annual: "mean", label: "prime lending rate, average of the monthly rates" }],
  },
  {
    key: "maximum_lending_rate",
    name: "Maximum lending rate (%)",
    unit: "%",
    scale: 1,
    decimals: 2,
    hint: "maximum lending rate",
    domains: MACRO,
    sources: [{ source: "CBN", endpoint: "GetAllMoneyMarketIndicators", field: "maxLending", annual: "mean", label: "maximum lending rate, average of the monthly rates" }],
  },
  { key: "deposit_rate", name: "Deposit interest rate (%)", unit: "%", scale: 1, decimals: 2, hint: "savings/deposit rate", domains: MACRO, sources: [WB("FR.INR.DPST")] },
  { key: "real_interest_rate", name: "Real interest rate (%)", unit: "%", scale: 1, decimals: 2, hint: "lending rate adjusted for inflation", domains: MACRO, sources: [WB("FR.INR.RINR")] },
  {
    key: "treasury_bill_rate",
    name: "Treasury bill rate (%)",
    unit: "%",
    scale: 1,
    decimals: 2,
    hint: "91-day treasury bill rate",
    domains: MACRO,
    sources: [{ source: "CBN", endpoint: "GetAllMoneyMarketIndicators", field: "treasuryBill", annual: "mean", label: "treasury bill rate, average of the monthly rates" }],
  },
  {
    key: "interbank_rate",
    name: "Interbank call rate (%)",
    unit: "%",
    scale: 1,
    decimals: 2,
    hint: "interbank rate, call money rate",
    domains: MACRO,
    sources: [{ source: "CBN", endpoint: "GetAllMoneyMarketIndicators", field: "interBankCallRate", annual: "mean", label: "interbank call rate, average of the monthly rates" }],
  },

  // ── Money and finance ──
  { key: "broad_money_naira", name: "Broad money, M2 (current naira)", unit: "₦ billion", scale: 1e9, decimals: 2, hint: "money supply M2", domains: MACRO, sources: [WB("FM.LBL.BMNY.CN")] },
  { key: "broad_money_gdp", name: "Broad money (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "financial deepening, M2/GDP", domains: MACRO, sources: [WB("FM.LBL.BMNY.GD.ZS")] },
  { key: "private_credit_gdp", name: "Domestic credit to private sector (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "credit to the private sector, bank credit", domains: MACRO, sources: [WB("FS.AST.PRVT.GD.ZS")] },
  { key: "market_cap_gdp", name: "Market capitalisation of listed domestic companies (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "stock market capitalisation", domains: MACRO, sources: [WB("CM.MKT.LCAP.GD.ZS")] },
  { key: "reserves_usd", name: "Total reserves including gold (current US$)", unit: "US$ billion", scale: 1e9, decimals: 2, hint: "external reserves, foreign reserves", domains: MACRO, sources: [WB("FI.RES.TOTL.CD")] },

  // ── Public finance ──
  { key: "government_debt_gdp", name: "General government gross debt (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "public debt, government debt to GDP ratio", domains: MACRO, sources: [IMF("GGXWDG_NGDP")] },
  { key: "fiscal_balance_gdp", name: "General government net lending/borrowing (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "fiscal balance, budget deficit or surplus", domains: MACRO, sources: [IMF("GGXCNL_NGDP")] },

  // ── External sector ──
  { key: "fdi_usd", name: "Foreign direct investment, net inflows (current US$)", unit: "US$ billion", scale: 1e9, decimals: 3, hint: "FDI inflows in dollars", domains: MACRO, sources: [WB("BX.KLT.DINV.CD.WD")] },
  { key: "fdi_gdp", name: "Foreign direct investment, net inflows (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "FDI as a share of GDP", domains: MACRO, sources: [WB("BX.KLT.DINV.WD.GD.ZS")] },
  { key: "remittances_usd", name: "Personal remittances received (current US$)", unit: "US$ billion", scale: 1e9, decimals: 2, hint: "diaspora remittances", domains: MACRO, sources: [WB("BX.TRF.PWKR.CD.DT")] },
  { key: "current_account_gdp", name: "Current account balance (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "balance of payments current account", domains: MACRO, sources: [WB("BN.CAB.XOKA.GD.ZS"), IMF("BCA_NGDPD")] },
  { key: "oil_rents_gdp", name: "Oil rents (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "oil revenue proxy, oil sector", domains: ["MACRO_FINANCE", "SCIENCE_ENV_AG"], sources: [WB("NY.GDP.PETR.RT.ZS")] },

  // ── Structure, labour, society ──
  { key: "agriculture_gdp", name: "Agriculture, forestry and fishing, value added (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "agricultural output share", domains: ["MACRO_FINANCE", "SCIENCE_ENV_AG"], sources: [WB("NV.AGR.TOTL.ZS")] },
  { key: "manufacturing_gdp", name: "Manufacturing, value added (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "manufacturing output share, industrialisation", domains: ["MACRO_FINANCE", "SCIENCE_ENV_AG"], sources: [WB("NV.IND.MANF.ZS")] },
  { key: "unemployment", name: "Unemployment, total (% of labour force, modelled ILO estimate)", unit: "%", scale: 1, decimals: 2, hint: "unemployment rate", domains: ALL, sources: [WB("SL.UEM.TOTL.ZS")] },
  { key: "population", name: "Population, total", unit: "million", scale: 1e6, decimals: 2, hint: "population size", domains: ALL, sources: [WB("SP.POP.TOTL"), IMF("LP", 1e6)] },
  { key: "electricity_access", name: "Access to electricity (% of population)", unit: "%", scale: 1, decimals: 2, hint: "electricity access, energy access", domains: ["MACRO_FINANCE", "SCIENCE_ENV_AG", "TECH_CYBER"], sources: [WB("EG.ELC.ACCS.ZS")] },
  { key: "health_expenditure_gdp", name: "Current health expenditure (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "health spending", domains: ["MACRO_FINANCE", "HEALTH"], sources: [WB("SH.XPD.CHEX.GD.ZS")] },
  { key: "education_expenditure_gdp", name: "Government expenditure on education (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "education spending (World Bank has 2012 onwards only)", domains: MACRO, sources: [WB("SE.XPD.TOTL.GD.ZS")] },
];

export const CATALOGUE_KEYS: string[] = INDICATOR_CATALOGUE.map((i) => i.key);

export function indicatorFor(key: string | null | undefined): CatalogueIndicator | null {
  return key ? INDICATOR_CATALOGUE.find((i) => i.key === key) ?? null : null;
}

/** The entries a project whose department reaches these domains is offered, in catalogue order. */
export function indicatorsForDomains(domains: readonly Domain[]): CatalogueIndicator[] {
  return INDICATOR_CATALOGUE.filter((i) => i.domains.some((d) => domains.includes(d)));
}

export function catalogueKeysForDomains(domains: readonly Domain[]): string[] {
  return indicatorsForDomains(domains).map((i) => i.key);
}

/** The sources a project whose department reaches these domains can be fetched from, in first-use order. */
export function sourceNamesForDomains(domains: readonly Domain[]): SourceName[] {
  const names: SourceName[] = [];
  for (const i of indicatorsForDomains(domains)) for (const s of i.sources) if (!names.includes(s.source)) names.push(s.source);
  return names;
}
