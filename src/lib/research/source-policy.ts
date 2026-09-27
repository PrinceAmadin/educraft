/**
 * The rules of the D3b source stage, in one place and with no I/O, so
 * `npm run check:sources` can prove them: which departments get a search for
 * cases or archival sources, which sources are switched on and why, the
 * 16-search cap, two attempts per point, and the checks that keep a source
 * honest (it must come from a page the search actually returned; a case is
 * only "confirmed" when the Supreme Court's own record matches it).
 *
 * Source verification (26–27 Sept 2026, live): judy.legal, vLex, the National
 * Library of Nigeria and the University of Ibadan repository forbid automated
 * or commercial use in their terms, so they are never searched. The National
 * Archives (UK) allows commercial use but asks API users to register their IP
 * first, so it stays off until they reply.
 */

import { matchDepartment } from "@/lib/generation/department-map";

/** Searches a project may ever spend on its source stage (web searches and archive queries together). */
export const SOURCE_SEARCH_LIMIT = 16;
/** Points (legal propositions or historical questions) a project's sources are searched for. */
export const MAX_POINTS = 8;
/** Searches for one point before it is left as a placeholder. */
export const ATTEMPTS_PER_POINT = 2;
/** Cases or records kept for one point. */
export const MAX_SOURCES_PER_POINT = 3;
/** Supreme Court lookups that confirm a case already found: free, and not counted as searches. */
export const OFFICIAL_LOOKUPS_PER_CASE = 2;
/** Enough to check every case a project can find (8 points × 3 cases × 2 lookups); one request a second to the court. */
export const OFFICIAL_LOOKUP_LIMIT = MAX_POINTS * MAX_SOURCES_PER_POINT * OFFICIAL_LOOKUPS_PER_CASE;

export type SourceKindKey = "CASE" | "ARCHIVE";

/** Law departments search for cases; History for archival sources; every other department skips the stage. */
export function sourceKindForDepartment(department: string | null | undefined): SourceKindKey | null {
  const match = matchDepartment(department);
  if (!match) return null;
  if (match.entry.section === "LAW") return "CASE";
  if (match.entry.name === "History") return "ARCHIVE";
  return null;
}

/** The placeholder a chapter writes where a point has no approved source. */
export function placeholderFor(kind: SourceKindKey): string {
  return kind === "CASE" ? "[CASE TO BE SUPPLIED]" : "[ARCHIVE TO BE SUPPLIED]";
}

// ─── The 16-search budget ────────────────────────────────────────────────────

export function searchesLeft(used: number): number {
  return Math.max(0, SOURCE_SEARCH_LIMIT - Math.max(0, used));
}

/** Web searches one point may make: two attempts, never past the project's cap. */
export function webSearchesForPoint(used: number): number {
  return Math.min(ATTEMPTS_PER_POINT, searchesLeft(used));
}

// ─── Where cases may be searched ─────────────────────────────────────────────

/**
 * Never searched, even through a search engine: their terms forbid automated
 * collection (judy.legal §6.2; vLex (e)), or the founder excluded them
 * (NigeriaLII). Subdomains are included by the API.
 */
export const LEGAL_BLOCKED_DOMAINS = ["judy.legal", "vlex.com", "nigerialii.org"] as const;

// ─── Archive sources ─────────────────────────────────────────────────────────

export type ArchiveSourceKey = "HANSARD" | "INTERNET_ARCHIVE" | "WELLCOME" | "UNILAG" | "ABU" | "NATIONAL_ARCHIVES" | "NATIONAL_LIBRARY" | "IBADAN";

export interface ArchiveSourceInfo {
  key: ArchiveSourceKey;
  label: string;
  /** Switched on for searches. */
  enabled: boolean;
  /** What it holds, told to the planner so it aims each query at the right place. */
  holds: string;
  /** Primary records, or theses (secondary studies). */
  recordType: "Primary" | "Thesis";
  /** Why it is on or off (from the 26–27 Sept verification). */
  basis: string;
}

export const ARCHIVE_SOURCES: Record<ArchiveSourceKey, ArchiveSourceInfo> = {
  HANSARD: {
    key: "HANSARD",
    label: "UK Hansard",
    enabled: true,
    holds: "debates of the UK Parliament since the 1800s, including colonial Nigeria (the Colonial Office, riots, taxation, administration, independence)",
    recordType: "Primary",
    basis: "Open Parliament Licence v3.0 allows commercial use with attribution.",
  },
  INTERNET_ARCHIVE: {
    key: "INTERNET_ARCHIVE",
    label: "Internet Archive",
    enabled: true,
    holds: "digitised books, colonial annual reports, gazettes, government papers and old periodicals",
    recordType: "Primary",
    basis: "Access is granted for scholarship and research; only catalogue records are read and cited.",
  },
  WELLCOME: {
    key: "WELLCOME",
    label: "Wellcome Collection",
    enabled: true,
    holds: "medicine and public health only: medical reports, manuscripts and archives, including tropical medicine in West Africa",
    recordType: "Primary",
    basis: "Catalogue API data it creates is CC0; no key or stated limits.",
  },
  UNILAG: {
    key: "UNILAG",
    label: "University of Lagos repository",
    enabled: true,
    holds: "theses, articles and book chapters by Nigerian scholars, especially on Lagos and south-western Nigeria",
    recordType: "Thesis",
    basis: "No terms of use published.",
  },
  ABU: {
    key: "ABU",
    label: "Ahmadu Bello University repository (Kubanni)",
    enabled: true,
    holds: "theses by Nigerian scholars, especially on northern Nigeria (Zaria, Kano, Sokoto, emirates, colonial administration)",
    recordType: "Thesis",
    basis: "Its user agreement page is placeholder text: no terms in force.",
  },
  NATIONAL_ARCHIVES: {
    key: "NATIONAL_ARCHIVES",
    label: "The National Archives (UK)",
    enabled: false,
    holds: "Colonial Office files on Nigeria (series CO 583 and others)",
    recordType: "Primary",
    basis: "Open Government Licence allows commercial use, but API users must first register their IP address; off until they reply.",
  },
  NATIONAL_LIBRARY: {
    key: "NATIONAL_LIBRARY",
    label: "National Library of Nigeria repository",
    enabled: false,
    holds: "books and documents on Nigerian history",
    recordType: "Primary",
    basis: "Its terms forbid commercial use and systematic retrieval without written permission.",
  },
  IBADAN: {
    key: "IBADAN",
    label: "University of Ibadan repository",
    enabled: false,
    holds: "theses and articles by University of Ibadan scholars",
    recordType: "Thesis",
    basis: "Its terms forbid commercial use and systematic retrieval without written permission.",
  },
};

/** One catalogue record from an archive or repository, the same shape whichever source returned it. */
export interface ArchiveRecord {
  source: ArchiveSourceKey;
  title: string;
  /** As the catalogue gives it: "1924-12-15", "1934-1943", "2015". */
  date: string | null;
  holder: string;
  /** The catalogue's own reference: CO 583/200/6, PP/AJD/B/1/3, a handle, an identifier. */
  reference: string | null;
  url: string;
  recordType: "Primary" | "Thesis";
  /** A short description or abstract, for the judge; never shown as a quotation. */
  description: string | null;
}

/**
 * The list under `key` in a tool reply. The model sometimes sends a list as a
 * JSON string, even one wrapping `{ "<key>": [...] }` (seen live on 27 Sept):
 * both are unwrapped; anything else is an empty list.
 */
export function listFrom(value: unknown, key: string): unknown[] {
  let v = value;
  for (let depth = 0; depth < 3; depth++) {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      try {
        v = JSON.parse(v);
        continue;
      } catch {
        return [];
      }
    }
    if (v && typeof v === "object" && key in (v as Record<string, unknown>)) {
      v = (v as Record<string, unknown>)[key];
      continue;
    }
    return [];
  }
  return Array.isArray(v) ? v : [];
}

/** Collapses whitespace, drops HTML tags, clips. */
export function plainText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

export function enabledArchiveSources(): ArchiveSourceInfo[] {
  return Object.values(ARCHIVE_SOURCES).filter((s) => s.enabled);
}

export function isEnabledArchiveSource(key: string): key is ArchiveSourceKey {
  return key in ARCHIVE_SOURCES && ARCHIVE_SOURCES[key as ArchiveSourceKey].enabled;
}

// ─── Honesty checks ──────────────────────────────────────────────────────────

/** Compare URLs by host and path only: scheme, "www.", a trailing slash, the query and the fragment do not matter. */
export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = decodeURIComponent(u.pathname).replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return null;
  }
}

/** A recorded case is kept only when its URL is one of the pages the search really returned. */
export function urlInResults(url: string, resultUrls: readonly string[]): boolean {
  const target = normalizeUrl(url);
  if (!target) return false;
  return resultUrls.some((r) => normalizeUrl(r) === target);
}

export function isBlockedDomain(url: string): boolean {
  const n = normalizeUrl(url);
  if (!n) return false;
  const host = n.split("/")[0];
  return LEGAL_BLOCKED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const n = normalizeUrl(url);
  return n ? n.split("/")[0] : null;
}

// ─── Matching a case to the Supreme Court's own record ───────────────────────

/** Words that never identify a party on their own. */
const PARTY_NOISE = new Set([
  "the", "of", "and", "v", "vs", "versus", "state", "states", "federal", "republic", "nigeria", "frn", "attorney", "general",
  "for", "ors", "sgd", "apc", "pdp",
  "a", "g", "ag", "ors", "others", "anor", "another", "ltd", "limited", "plc", "inc", "company", "co", "nig", "bank",
  "commission", "chief", "alhaji", "dr", "mr", "mrs", "prof", "hon", "sen", "senator", "col", "gen", "rtd", "in", "re",
  "commissioner", "police", "inspector", "cop", "igp", "people", "government", "governor", "lagos", "kano", "rivers", "ogun",
  "oyo", "edo", "delta", "enugu", "anambra", "kaduna", "plateau", "borno", "benue",
]);

/**
 * Distinctive words in a case name ("Federal Republic of Nigeria v. Igbinedion" → ["igbinedion"]),
 * longest first. Three-letter words count, because Nigerian parties are often acronyms
 * ("PML (Nig.) Ltd v. FRN" → ["pml"]).
 */
export function partyTokens(caseName: string): string[] {
  const words = caseName
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !PARTY_NOISE.has(w));
  return [...new Set(words)].sort((a, b) => b.length - a.length);
}

export interface JudgmentLike {
  petitioner: string | null;
  respondent: string | null;
  year: number | null;
}

/**
 * Does a court record match a case found on the web? Every distinctive party
 * word must appear in the record's parties (at least one word; a case named
 * only by generic words cannot be confirmed), and the year, when both give
 * one, must be within a year.
 */
export function matchJudgment(caseName: string, year: number | null, record: JudgmentLike): boolean {
  const tokens = partyTokens(caseName);
  if (tokens.length === 0) return false;
  const parties = `${record.petitioner ?? ""} ${record.respondent ?? ""}`.toLowerCase().replace(/[^a-z\s]/g, " ");
  const words = new Set(parties.split(/\s+/));
  if (!tokens.every((t) => words.has(t))) return false;
  if (year !== null && record.year !== null && Math.abs(year - record.year) > 1) return false;
  return true;
}
