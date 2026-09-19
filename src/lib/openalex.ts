/**
 * OpenAlex — a free, open scholarly index (250M+ works, sourced largely from
 * CrossRef). Two uses:
 *
 * 1. Candidate discovery. Searching a real index means every candidate is a
 *    real, published work with a DOI from the start. Asking Claude to recall
 *    exact titles instead verified only ~4% of the time on a live test —
 *    most recalled titles simply don't exist.
 * 2. A fallback abstract source for works CrossRef has no abstract for.
 *
 * OpenAlex stores abstracts as an inverted index (word → positions); this
 * rebuilds the plain text.
 */

const OPENALEX_BASE_URL = "https://api.openalex.org";
const REQUEST_TIMEOUT_MS = 8_000;

function contactEmail(): string {
  return process.env.RESEARCH_CONTACT_EMAIL || "educraft611@gmail.com";
}

function rebuildAbstract(index: Record<string, number[]> | null | undefined): string | null {
  if (!index || typeof index !== "object") return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) words[pos] = word;
  }
  const text = words.filter(Boolean).join(" ").trim();
  return text || null;
}

export interface OpenAlexWork {
  doi: string; // bare, lowercase — "10.1234/abc"
  title: string;
  authors: string; // "Family, G.; Family2, G2." — same shape as CrossRefWork
  year: number | null;
  journal: string | null;
  abstract: string | null;
  /** OpenAlex's own OA PDF location, if any — probed later alongside Unpaywall's. */
  pdfUrl: string | null;
}

/** "Maria Bada" → "Bada, M."; "Ana María de la Cruz" → "Cruz, A. M. d. l." (good enough for a creator entry). */
function toSurnameInitials(displayName: string): string | null {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const surname = parts.pop() as string;
  const initials = parts.map((p) => `${p[0].toUpperCase()}.`).join(" ");
  return initials ? `${surname}, ${initials}` : surname;
}

function toWork(w: any): OpenAlexWork | null {
  const doi = typeof w?.doi === "string" ? w.doi.replace(/^https?:\/\/doi\.org\//i, "").toLowerCase() : null;
  const title: string | null = w?.title ?? w?.display_name ?? null;
  const authors = (w?.authorships ?? [])
    .map((a: any) => (a?.author?.display_name ? toSurnameInitials(a.author.display_name) : null))
    .filter(Boolean)
    .join("; ");
  if (!doi || !title || !authors) return null;
  if (title.trim().split(/\s+/).length < 3) return null;

  return {
    doi,
    title: title.replace(/<[^>]+>/g, "").trim(),
    authors,
    year: typeof w.publication_year === "number" ? w.publication_year : null,
    journal: w.primary_location?.source?.display_name ?? null,
    abstract: rebuildAbstract(w.abstract_inverted_index),
    pdfUrl: w.best_oa_location?.pdf_url ?? w.primary_location?.pdf_url ?? null,
  };
}

/**
 * Searches OpenAlex for citable, non-retracted, English works with a DOI.
 * `foundational` drops the date filter and sorts by citation count, for the
 * landmark papers a report should build on; otherwise results are limited
 * to the last `recentYears` years and sorted by relevance.
 * Returns [] on failure — a failed search just contributes no candidates.
 */
export async function searchWorks(
  query: string,
  { foundational = false, recentYears = 7, perPage = 25 }: { foundational?: boolean; recentYears?: number; perPage?: number } = {}
): Promise<OpenAlexWork[]> {
  const filters = [
    "has_doi:true",
    "is_retracted:false",
    "language:en",
    "type:article|review|book-chapter|preprint",
  ];
  if (!foundational) filters.push(`from_publication_date:${new Date().getFullYear() - recentYears}-01-01`);

  const params = new URLSearchParams({
    search: query,
    filter: filters.join(","),
    "per-page": String(perPage),
    mailto: contactEmail(),
  });
  if (foundational) params.set("sort", "cited_by_count:desc");

  try {
    const res = await fetch(`${OPENALEX_BASE_URL}/works?${params.toString()}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    return (json?.results ?? []).map(toWork).filter((w: OpenAlexWork | null): w is OpenAlexWork => Boolean(w));
  } catch {
    return [];
  }
}

/** Best-effort — returns null on any miss or failure; never throws. */
export async function fetchAbstractByDoi(doi: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${OPENALEX_BASE_URL}/works/doi:${encodeURIComponent(doi)}?mailto=${encodeURIComponent(contactEmail())}`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return rebuildAbstract(json?.abstract_inverted_index);
  } catch {
    return null;
  }
}
