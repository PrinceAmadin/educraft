/**
 * CrossRef is the real bibliographic registry DOIs live in — every candidate
 * paper Claude proposes gets checked here before it's trusted. This is the
 * hard defense against DOI hallucination: a candidate only survives if
 * CrossRef has a real record for it.
 *
 * Loosening the title match can't let a fabricated citation through: once a
 * match is accepted, every field that ends up in the reference list (title,
 * authors, year, journal, DOI) is CrossRef's own record, never Claude's
 * recollection. The worst a loose match can do is pick a different real
 * paper on the same topic — and Tier 2 relevance classification still
 * judges whatever was matched.
 */

const CROSSREF_BASE_URL = "https://api.crossref.org";
const REQUEST_TIMEOUT_MS = 10_000;

function contactEmail(): string {
  return process.env.RESEARCH_CONTACT_EMAIL || "educraft611@gmail.com";
}

export interface CrossRefWork {
  doi: string;
  title: string;
  authors: string; // "Family, G.; Family2, G2."
  year: number | null;
  journal: string | null;
  abstract: string | null;
}

function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    // Crude plural folding so "antenna"/"antennas", "network"/"networks" count as the same word.
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/** Word-overlap Dice coefficient — order-insensitive, so reordered titles still score high. */
function wordSimilarity(a: string, b: string): number {
  const setA = new Set(normalizeWords(a));
  const setB = new Set(normalizeWords(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let overlap = 0;
  for (const w of setA) if (setB.has(w)) overlap++;
  return (2 * overlap) / (setA.size + setB.size);
}

/** Character-bigram Dice coefficient — tolerant of word-form changes ("Design" vs "Designing"). */
function bigramSimilarity(a: string, b: string): number {
  const bigrams = (s: string) => {
    const clean = normalizeWords(s).join(" ");
    const counts = new Map<string, number>();
    for (let i = 0; i < clean.length - 1; i++) {
      const bg = clean.slice(i, i + 2);
      counts.set(bg, (counts.get(bg) ?? 0) + 1);
    }
    return { counts, total: Math.max(clean.length - 1, 0) };
  };
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.total === 0 || B.total === 0) return 0;
  let overlap = 0;
  for (const [bg, n] of A.counts) overlap += Math.min(n, B.counts.get(bg) ?? 0);
  return (2 * overlap) / (A.total + B.total);
}

/** Similarity in [0, 1] — the better of word-overlap and character-bigram scores. */
export function titleSimilarity(a: string, b: string): number {
  return Math.max(wordSimilarity(a, b), bigramSimilarity(a, b));
}

/** Title-only match: the top 5 results are checked and the best one at or above this wins. */
const TITLE_MATCH_THRESHOLD = 0.7;
/**
 * Fallback match, used only when the title alone doesn't clear the bar: a
 * looser title score is accepted when two independent signals also agree —
 * the first author's surname and the publication year (±1).
 */
const FALLBACK_TITLE_THRESHOLD = 0.55;
const RESULT_ROWS = "5";

/** Record types that are citable works — excludes journal issues, datasets, peer reviews, grants, etc. */
const CITABLE_TYPES = new Set([
  "journal-article",
  "proceedings-article",
  "book-chapter",
  "book",
  "monograph",
  "edited-book",
  "reference-book",
  "posted-content",
  "report",
  "dissertation",
  "standard",
]);

function stripJatsTags(abstract: string | undefined): string | null {
  if (!abstract) return null;
  return abstract.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || null;
}

function itemYear(item: any): number | null {
  return (
    item["published-print"]?.["date-parts"]?.[0]?.[0] ??
    item["published-online"]?.["date-parts"]?.[0]?.[0] ??
    item.issued?.["date-parts"]?.[0]?.[0] ??
    null
  );
}

function toWork(item: any): CrossRefWork {
  const authors = Array.isArray(item.author)
    ? item.author
        .map((a: any) => [a.family, a.given ? a.given[0] + "." : null].filter(Boolean).join(", "))
        .filter(Boolean)
        .join("; ")
    : "";

  return {
    doi: item.DOI,
    title: item.title?.[0] ?? "",
    authors,
    year: itemYear(item),
    journal: item["container-title"]?.[0] ?? null,
    abstract: stripJatsTags(item.abstract),
  };
}

function isCitable(item: any): boolean {
  const title: string | undefined = item.title?.[0];
  if (!title || !item.DOI) return false;
  if (item.type && !CITABLE_TYPES.has(item.type)) return false;
  // A record with no named author can't be cited properly in the reference list.
  const hasAuthor = Array.isArray(item.author) && item.author.some((a: any) => typeof a.family === "string" && a.family);
  if (!hasAuthor) return false;
  return normalizeWords(title).length >= 3;
}

/**
 * CrossRef couldn't be reached (rate limit, outage, timeout) — distinct from
 * "no matching record". The caller must leave the candidate to retry rather
 * than rejecting it: silently treating a 429 as "not a real paper" is exactly
 * how real papers used to get thrown away.
 */
export class CrossRefUnavailableError extends Error {}

const MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function searchWorks(params: Record<string, string>): Promise<any[]> {
  const qs = new URLSearchParams({ ...params, rows: RESULT_ROWS, mailto: contactEmail() });
  let lastProblem = "unknown error";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${CROSSREF_BASE_URL}/works?${qs.toString()}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        return (json?.message?.items ?? []).filter(isCitable);
      }
      // The polite pool allows ~3 requests/second, 3 at a time.
      if (res.status === 429 || res.status >= 500) {
        lastProblem = `HTTP ${res.status}`;
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 5) * 1000 : 1000 * attempt);
        continue;
      }
      return []; // other 4xx: a query CrossRef won't answer — treat as no match
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : String(error);
      await sleep(1000 * attempt);
    }
  }
  throw new CrossRefUnavailableError(`CrossRef unavailable (${lastProblem})`);
}

/** "Smith, J.; Doe, A." / "John Smith and Ann Doe" → "smith" (best effort). */
export function firstAuthorSurname(authors: string | null | undefined): string | null {
  if (!authors) return null;
  const first = authors.split(/;| and /i)[0]?.trim();
  if (!first) return null;
  const surname = first.includes(",") ? first.split(",")[0] : first.split(/\s+/).pop();
  const clean = (surname ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return clean.length >= 2 ? clean : null;
}

function hasAuthorSurname(item: any, surname: string): boolean {
  if (!Array.isArray(item.author)) return false;
  return item.author.some(
    (a: any) => typeof a.family === "string" && a.family.toLowerCase().replace(/[^a-z]/g, "") === surname
  );
}

function bestByTitle(items: any[], proposedTitle: string, threshold: number, accept?: (item: any) => boolean) {
  let best: { item: any; score: number } | null = null;
  for (const item of items) {
    if (accept && !accept(item)) continue;
    const score = titleSimilarity(proposedTitle, item.title[0]);
    if (score >= threshold && (!best || score > best.score)) best = { item, score };
  }
  return best;
}

/**
 * Finds the CrossRef record for a candidate paper. Returns null — meaning
 * "reject this candidate" — when there's no confident match.
 *
 * 1. Title search, top 5 results, best similarity ≥ 0.70 wins.
 * 2. If that fails and the candidate has an author or year, a second search
 *    that includes them, accepting a looser title score (≥ 0.55) only when the
 *    first author's surname appears on the record AND the year is within ±1.
 */
export async function findWorkByTitle(
  proposedTitle: string,
  hints: { authors?: string | null; year?: number | null } = {}
): Promise<CrossRefWork | null> {
  const surname = firstAuthorSurname(hints.authors);
  const year = hints.year ?? null;

  // Same words, different paper: "Attention Is All You Need" (Vaswani, 2017)
  // scores 1.00 against "Is Attention All You Need?" (Mineault, 2025). When
  // the candidate came with an author and a year, a record that contradicts
  // BOTH is a different paper — skip it. Either one alone is allowed to be
  // off, since recalled years and author lists are often slightly wrong.
  const consistentWithHints = (item: any) => {
    if (!surname || !year) return true;
    const y = itemYear(item);
    const yearAgrees = y != null && Math.abs(y - year) <= 2;
    return hasAuthorSurname(item, surname) || yearAgrees;
  };

  const titleHits = await searchWorks({ "query.bibliographic": proposedTitle });
  const byTitle = bestByTitle(titleHits, proposedTitle, TITLE_MATCH_THRESHOLD, consistentWithHints);
  if (byTitle) return toWork(byTitle.item);

  if (!surname || !year) return null;

  const fallbackHits = await searchWorks({
    "query.bibliographic": `${proposedTitle} ${year}`,
    "query.author": surname,
  });
  const byAuthorYear = bestByTitle(fallbackHits, proposedTitle, FALLBACK_TITLE_THRESHOLD, (item) => {
    const y = itemYear(item);
    return hasAuthorSurname(item, surname) && y != null && Math.abs(y - year) <= 1;
  });
  return byAuthorYear ? toWork(byAuthorYear.item) : null;
}
