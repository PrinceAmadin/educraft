import { parseCountry } from "@/lib/click-tracking/parse";
import { getRegionName } from "@/lib/click-tracking/region-names";

/**
 * Geo-location straight off the request headers (ported from Traqly's
 * lib/geo-headers.ts). Vercel sets these on every request at the edge, so
 * there is no IP-lookup API, no database and no cost, which is why full
 * city-level geography is affordable on the redirect path.
 */

export interface ClickGeo {
  country: string | null;
  city: string | null;
  /** Human-readable ("Edo State"), resolved from regionCode. */
  region: string | null;
  /** Raw ISO-3166-2 subdivision code ("ED"), the stable grouping key. */
  regionCode: string | null;
  latitude: number | null;
  longitude: number | null;
}

function decode(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

function coordinate(value: string | null, limit: number): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || Math.abs(n) > limit) return null;
  return n;
}

/**
 * Local-development sample, opt-in only (DEV_FAKE_GEO=1). Edge headers exist
 * only on Vercel; inventing a location by default would write fabricated data
 * into real analytics.
 */
function devSample(): ClickGeo | null {
  if (process.env.DEV_FAKE_GEO !== "1") return null;
  return {
    country: "NG",
    city: "Benin City",
    region: getRegionName("NG", "ED"),
    regionCode: "ED",
    latitude: 6.335,
    longitude: 5.6037,
  };
}

export function readGeo(headers: Headers): ClickGeo {
  const country = parseCountry(headers.get("x-vercel-ip-country") ?? null);
  const regionCode = decode(headers.get("x-vercel-ip-country-region"))?.toUpperCase() ?? null;

  if (!country && !headers.get("x-vercel-ip-city")) {
    const sample = devSample();
    if (sample) return sample;
  }

  return {
    country,
    city: decode(headers.get("x-vercel-ip-city")),
    region: getRegionName(country, regionCode),
    regionCode,
    latitude: coordinate(headers.get("x-vercel-ip-latitude"), 90),
    longitude: coordinate(headers.get("x-vercel-ip-longitude"), 180),
  };
}
