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
const DHS = (indicator: string): SeriesSource => ({ source: "DHS", indicator });

const ALL: Domain[] = [...DOMAINS];
const MACRO: Domain[] = ["MACRO_FINANCE"];
const HEALTH: Domain[] = ["HEALTH"];
const HEALTH_AND_MACRO: Domain[] = ["HEALTH", "MACRO_FINANCE"];
const HEALTH_AND_SCIENCE: Domain[] = ["HEALTH", "SCIENCE_ENV_AG"];

export const INDICATOR_CATALOGUE: CatalogueIndicator[] = [
  // ── Output ──
  { key: "gdp_current_usd", name: "Gross domestic product (current US$)", unit: "US$ billion", scale: 1e9, decimals: 2, hint: "nominal GDP in US dollars", domains: ALL, sources: [WB("NY.GDP.MKTP.CD"), IMF("NGDPD", 1e9)] },
  { key: "gdp_constant_usd", name: "Gross domestic product (constant 2015 US$)", unit: "US$ billion (2015 prices)", scale: 1e9, decimals: 2, hint: "real GDP in US dollars", domains: ALL, sources: [WB("NY.GDP.MKTP.KD")] },
  { key: "gdp_current_naira", name: "Gross domestic product (current naira)", unit: "₦ billion", scale: 1e9, decimals: 2, hint: "nominal GDP in naira, GDP at current market prices", domains: ALL, sources: [WB("NY.GDP.MKTP.CN")] },
  { key: "gdp_constant_naira", name: "Gross domestic product (constant naira prices)", unit: "₦ billion (constant prices)", scale: 1e9, decimals: 2, hint: "real GDP in naira, RGDP at constant (basic) prices", domains: ALL, sources: [WB("NY.GDP.MKTP.KN")] },
  { key: "gdp_growth", name: "GDP growth (annual %)", unit: "%", scale: 1, decimals: 2, hint: "economic growth rate, real GDP growth", domains: ALL, sources: [WB("NY.GDP.MKTP.KD.ZG"), IMF("NGDP_RPCH")] },
  { key: "gdp_per_capita_usd", name: "GDP per capita (current US$)", unit: "US$", scale: 1, decimals: 2, hint: "income per head, nominal", domains: ALL, sources: [WB("NY.GDP.PCAP.CD"), IMF("NGDPDPC")] },
  { key: "gdp_per_capita_constant_usd", name: "GDP per capita (constant 2015 US$)", unit: "US$ (2015 prices)", scale: 1, decimals: 2, hint: "real income per head, living standard proxy", domains: ALL, sources: [WB("NY.GDP.PCAP.KD")] },
  { key: "gdp_per_capita_ppp", name: "GDP per capita, PPP (current international $)", unit: "international $", scale: 1, decimals: 2, hint: "income per head at purchasing power parity", domains: ["MACRO_FINANCE", "HEALTH"], sources: [WB("NY.GDP.PCAP.PP.CD"), IMF("PPPPC")] },

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

  // ── Health (the World Bank's copies of the WHO / UN series, each CC BY 4.0 in its own metadata; probed for Nigeria 29 Sept 2026).
  //    Not offered: TB incidence (a constant 219 for every year), nurses and midwives (a reporting break in 2020), hospital beds (one year).
  //    WHO's own Global Health Observatory is not used: its dataset licence is for public health purposes and forbids selling the data on.
  { key: "life_expectancy", name: "Life expectancy at birth, total (years)", unit: "years", scale: 1, decimals: 2, hint: "life expectancy, longevity", domains: HEALTH_AND_MACRO, sources: [WB("SP.DYN.LE00.IN")] },
  { key: "under_five_mortality", name: "Mortality rate, under-5 (per 1,000 live births)", unit: "per 1,000 live births", scale: 1, decimals: 1, hint: "child mortality, under-five mortality rate (U5MR)", domains: HEALTH_AND_MACRO, sources: [WB("SH.DYN.MORT")] },
  { key: "infant_mortality", name: "Mortality rate, infant (per 1,000 live births)", unit: "per 1,000 live births", scale: 1, decimals: 1, hint: "infant mortality rate (IMR), deaths before age one", domains: HEALTH_AND_MACRO, sources: [WB("SP.DYN.IMRT.IN")] },
  { key: "neonatal_mortality", name: "Mortality rate, neonatal (per 1,000 live births)", unit: "per 1,000 live births", scale: 1, decimals: 1, hint: "neonatal mortality, deaths in the first 28 days", domains: HEALTH, sources: [WB("SH.DYN.NMRT")] },
  { key: "maternal_mortality_ratio", name: "Maternal mortality ratio (modelled estimate, per 100,000 live births)", unit: "per 100,000 live births", scale: 1, decimals: 0, hint: "maternal mortality ratio (MMR), maternal deaths", domains: HEALTH, sources: [WB("SH.STA.MMRT")] },
  { key: "immunization_dpt", name: "Immunisation, DPT (% of children ages 12–23 months)", unit: "% of children 12–23 months", scale: 1, decimals: 0, hint: "DPT3 / DTP3 / pentavalent vaccine coverage, routine immunisation", domains: HEALTH, sources: [WB("SH.IMM.IDPT")] },
  { key: "immunization_measles", name: "Immunisation, measles (% of children ages 12–23 months)", unit: "% of children 12–23 months", scale: 1, decimals: 0, hint: "measles vaccine coverage (MCV1)", domains: HEALTH, sources: [WB("SH.IMM.MEAS")] },
  { key: "hiv_prevalence", name: "Prevalence of HIV, total (% of population ages 15–49)", unit: "% of population aged 15–49", scale: 1, decimals: 2, hint: "HIV prevalence, HIV/AIDS", domains: HEALTH, sources: [WB("SH.DYN.AIDS.ZS")] },
  { key: "malaria_incidence", name: "Incidence of malaria (per 1,000 population at risk)", unit: "per 1,000 population at risk", scale: 1, decimals: 2, hint: "malaria incidence, malaria cases", domains: HEALTH, sources: [WB("SH.MLR.INCD.P3")] },
  { key: "basic_sanitation", name: "People using at least basic sanitation services (% of population)", unit: "% of population", scale: 1, decimals: 2, hint: "access to sanitation, toilet facilities", domains: HEALTH_AND_SCIENCE, sources: [WB("SH.STA.BASS.ZS")] },
  { key: "safely_managed_sanitation", name: "People using safely managed sanitation services (% of population)", unit: "% of population", scale: 1, decimals: 2, hint: "safely managed sanitation (SDG 6.2)", domains: HEALTH_AND_SCIENCE, sources: [WB("SH.STA.SMSS.ZS")] },
  { key: "basic_drinking_water", name: "People using at least basic drinking water services (% of population)", unit: "% of population", scale: 1, decimals: 2, hint: "access to safe or improved drinking water", domains: HEALTH_AND_SCIENCE, sources: [WB("SH.H2O.BASW.ZS")] },
  { key: "physicians_per_1000", name: "Physicians (per 1,000 people)", unit: "per 1,000 people", scale: 1, decimals: 2, hint: "doctors per population, health workforce density", domains: HEALTH, sources: [WB("SH.MED.PHYS.ZS")] },
  { key: "health_expenditure_per_capita", name: "Current health expenditure per capita (current US$)", unit: "US$", scale: 1, decimals: 2, hint: "health spending per head", domains: HEALTH_AND_MACRO, sources: [WB("SH.XPD.CHEX.PC.CD")] },
  { key: "government_health_expenditure_gdp", name: "Domestic general government health expenditure (% of GDP)", unit: "% of GDP", scale: 1, decimals: 2, hint: "public or government health spending", domains: HEALTH_AND_MACRO, sources: [WB("SH.XPD.GHED.GD.ZS")] },
  { key: "out_of_pocket_share", name: "Out-of-pocket expenditure (% of current health expenditure)", unit: "% of current health expenditure", scale: 1, decimals: 2, hint: "out-of-pocket health spending by households", domains: HEALTH_AND_MACRO, sources: [WB("SH.XPD.OOPC.CH.ZS")] },
  { key: "fertility_rate", name: "Fertility rate, total (births per woman)", unit: "births per woman", scale: 1, decimals: 2, hint: "total fertility rate (TFR)", domains: HEALTH_AND_MACRO, sources: [WB("SP.DYN.TFRT.IN")] },
  { key: "crude_birth_rate", name: "Birth rate, crude (per 1,000 people)", unit: "per 1,000 people", scale: 1, decimals: 2, hint: "crude birth rate", domains: HEALTH_AND_MACRO, sources: [WB("SP.DYN.CBRT.IN")] },
  { key: "crude_death_rate", name: "Death rate, crude (per 1,000 people)", unit: "per 1,000 people", scale: 1, decimals: 2, hint: "crude death rate, mortality", domains: HEALTH_AND_MACRO, sources: [WB("SP.DYN.CDRT.IN")] },
  { key: "undernourishment", name: "Prevalence of undernourishment (% of population)", unit: "% of population", scale: 1, decimals: 1, hint: "hunger, food insecurity", domains: HEALTH_AND_SCIENCE, sources: [WB("SN.ITK.DEFC.ZS")] },
  { key: "anaemia_children", name: "Prevalence of anaemia among children (% of children ages 6–59 months)", unit: "% of children 6–59 months", scale: 1, decimals: 1, hint: "child anaemia", domains: HEALTH, sources: [WB("SH.ANM.CHLD.ZS")] },
  { key: "stunting", name: "Prevalence of stunting, height for age (% of children under 5)", unit: "% of children under 5", scale: 1, decimals: 1, hint: "child stunting, chronic malnutrition (survey years only)", domains: HEALTH, sources: [WB("SH.STA.STNT.ZS"), DHS("CN_NUTS_C_HA2")] },
  { key: "wasting", name: "Prevalence of wasting, weight for height (% of children under 5)", unit: "% of children under 5", scale: 1, decimals: 1, hint: "child wasting, acute malnutrition (survey years only)", domains: HEALTH, sources: [WB("SH.STA.WAST.ZS"), DHS("CN_NUTS_C_WH2")] },
  { key: "skilled_birth_attendance", name: "Births attended by skilled health staff (% of total)", unit: "% of births", scale: 1, decimals: 1, hint: "skilled birth attendance, delivery by a doctor, nurse or midwife (survey years only)", domains: HEALTH, sources: [WB("SH.STA.BRTC.ZS"), DHS("RH_DELA_C_SKP")] },
  { key: "antenatal_care", name: "Pregnant women receiving prenatal care (%)", unit: "% of pregnant women", scale: 1, decimals: 1, hint: "antenatal (prenatal) care coverage, at least one visit (survey years only)", domains: HEALTH, sources: [WB("SH.STA.ANVC.ZS")] },
  { key: "contraceptive_prevalence", name: "Contraceptive prevalence, any method (% of married women ages 15–49)", unit: "% of married women 15–49", scale: 1, decimals: 1, hint: "contraceptive use, family planning uptake (survey years only)", domains: HEALTH, sources: [WB("SP.DYN.CONU.ZS"), DHS("FP_CUSM_W_ANY")] },

  // ── Health: Nigeria Demographic and Health Surveys (DHS Program API; survey years 1990, 2003, 2008, 2013, 2018, 2024, plus MIS 2010, 2015, 2021 where measured).
  { key: "modern_contraceptive_prevalence", name: "Married women using a modern method of contraception (%), NDHS", unit: "% of currently married women", scale: 1, decimals: 1, hint: "modern contraceptive prevalence rate (mCPR), NDHS", domains: HEALTH, sources: [DHS("FP_CUSM_W_MOD")] },
  { key: "antenatal_4plus", name: "Women with four or more antenatal visits (%), NDHS", unit: "% of women with a recent live birth", scale: 1, decimals: 1, hint: "ANC4+, at least four antenatal care visits, NDHS", domains: HEALTH, sources: [DHS("RH_ANCN_W_N4P")] },
  { key: "facility_delivery", name: "Births delivered in a health facility (%), NDHS", unit: "% of recent live births", scale: 1, decimals: 1, hint: "institutional delivery, hospital or clinic births, NDHS", domains: HEALTH, sources: [DHS("RH_DELP_C_DHF")] },
  { key: "fully_vaccinated_children", name: "Children fully vaccinated, all basic antigens (%), NDHS", unit: "% of children 12–23 months", scale: 1, decimals: 1, hint: "full immunisation coverage, all basic vaccinations, NDHS", domains: HEALTH, sources: [DHS("CH_VACC_C_BAS")] },
  { key: "zero_dose_children", name: "Children who received no vaccinations (%), NDHS", unit: "% of children 12–23 months", scale: 1, decimals: 1, hint: "zero-dose children, unvaccinated, NDHS", domains: HEALTH, sources: [DHS("CH_VACC_C_NON")] },
  { key: "underweight_children", name: "Children underweight, weight for age (% of children under 5), NDHS", unit: "% of children under 5", scale: 1, decimals: 1, hint: "child underweight, NDHS", domains: HEALTH, sources: [DHS("CN_NUTS_C_WA2")] },
  { key: "households_with_itn", name: "Households with at least one insecticide-treated net (%), NDHS and MIS", unit: "% of households", scale: 1, decimals: 1, hint: "ITN ownership, mosquito nets, malaria prevention", domains: HEALTH, sources: [DHS("ML_NETP_H_ITN")] },
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
