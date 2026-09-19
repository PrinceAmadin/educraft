/**
 * ISO-3166-2 subdivision code → readable name.
 *
 * Vercel hands us `x-vercel-ip-country-region` as a bare code ("LA", "ED").
 * On its own that is useless in a report — nobody reads "NG / ED" as "Edo
 * State". The regions Traqly's users actually operate in are enumerated here;
 * everywhere else falls back to the code, which is still a stable grouping key
 * even when we cannot label it.
 *
 * Codes are the source of truth for grouping. Names are presentation only, so
 * adding a country below never changes how historical data aggregates.
 */

type RegionMap = Record<string, string>;

/** Nigeria — 36 states plus the Federal Capital Territory. */
const NG: RegionMap = {
  AB: "Abia State", AD: "Adamawa State", AK: "Akwa Ibom State", AN: "Anambra State",
  BA: "Bauchi State", BY: "Bayelsa State", BE: "Benue State", BO: "Borno State",
  CR: "Cross River State", DE: "Delta State", EB: "Ebonyi State", ED: "Edo State",
  EK: "Ekiti State", EN: "Enugu State", GO: "Gombe State", IM: "Imo State",
  JI: "Jigawa State", KD: "Kaduna State", KN: "Kano State", KT: "Katsina State",
  KE: "Kebbi State", KO: "Kogi State", KW: "Kwara State", LA: "Lagos State",
  NA: "Nasarawa State", NI: "Niger State", OG: "Ogun State", ON: "Ondo State",
  OS: "Osun State", OY: "Oyo State", PL: "Plateau State", RI: "Rivers State",
  SO: "Sokoto State", TA: "Taraba State", YO: "Yobe State", ZA: "Zamfara State",
  FC: "Federal Capital Territory",
};

/** Ghana — the 16 regions after the 2018 reorganisation. */
const GH: RegionMap = {
  AF: "Ahafo Region", AH: "Ashanti Region", BA: "Brong-Ahafo Region", BE: "Bono East Region",
  BO: "Bono Region", CP: "Central Region", EP: "Eastern Region", AA: "Greater Accra Region",
  NE: "North East Region", NP: "Northern Region", OT: "Oti Region", SV: "Savannah Region",
  TV: "Volta Region", UE: "Upper East Region", UW: "Upper West Region", WP: "Western Region",
  WN: "Western North Region",
};

/** Kenya — the 47 counties. */
const KE: RegionMap = {
  "01": "Mombasa County", "02": "Kwale County", "03": "Kilifi County",
  "04": "Tana River County", "05": "Lamu County", "06": "Taita-Taveta County",
  "07": "Garissa County", "08": "Wajir County", "09": "Mandera County",
  "10": "Marsabit County", "11": "Isiolo County", "12": "Meru County",
  "13": "Tharaka-Nithi County", "14": "Embu County", "15": "Kitui County",
  "16": "Machakos County", "17": "Makueni County", "18": "Nyandarua County",
  "19": "Nyeri County", "20": "Kirinyaga County", "21": "Murang'a County",
  "22": "Kiambu County", "23": "Turkana County", "24": "West Pokot County",
  "25": "Samburu County", "26": "Trans Nzoia County", "27": "Uasin Gishu County",
  "28": "Elgeyo-Marakwet County", "29": "Nandi County", "30": "Baringo County",
  "31": "Laikipia County", "32": "Nakuru County", "33": "Narok County",
  "34": "Kajiado County", "35": "Kericho County", "36": "Bomet County",
  "37": "Kakamega County", "38": "Vihiga County", "39": "Bungoma County",
  "40": "Busia County", "41": "Siaya County", "42": "Kisumu County",
  "43": "Homa Bay County", "44": "Migori County", "45": "Kisii County",
  "46": "Nyamira County", "47": "Nairobi County",
};

/** South Africa — the 9 provinces. */
const ZA: RegionMap = {
  EC: "Eastern Cape", FS: "Free State", GP: "Gauteng", KZN: "KwaZulu-Natal",
  LP: "Limpopo", MP: "Mpumalanga", NC: "Northern Cape", NW: "North West", WC: "Western Cape",
};

/** United States — states and DC, since a lot of traffic lands here. */
const US: RegionMap = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

/** United Kingdom — the four nations, as the edge reports them. */
const GB: RegionMap = {
  ENG: "England", SCT: "Scotland", WLS: "Wales", NIR: "Northern Ireland",
};

const REGIONS: Record<string, RegionMap> = { NG, GH, KE, ZA, US, GB };

/**
 * Readable region name, or the code itself when we have no mapping.
 *
 * Returning the code rather than null is deliberate: an unmapped region should
 * still appear in a breakdown as its own row, not collapse into "Unknown"
 * alongside genuinely missing data.
 */
export function getRegionName(
  country: string | null | undefined,
  regionCode: string | null | undefined
): string | null {
  if (!regionCode) return null;
  const code = regionCode.trim().toUpperCase();
  if (!code) return null;

  const table = country ? REGIONS[country.trim().toUpperCase()] : undefined;
  return table?.[code] ?? code;
}

/**
 * Country name from its ISO code, via the platform's own CLDR data — no table
 * to maintain and correct in every language the runtime supports.
 */
export function getCountryName(country: string | null | undefined): string | null {
  if (!country) return null;
  const code = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return code || null;

  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** True when we have named regions for this country, so the UI knows whether
 *  a drill-down will show labels or bare codes. */
export function hasRegionNames(country: string | null | undefined): boolean {
  return !!country && REGIONS[country.trim().toUpperCase()] !== undefined;
}
