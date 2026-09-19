/**
 * OpenAlex — a free, open scholarly index (250M+ works) — is the pipeline's
 * single source of papers. Searching a real index means every candidate is a
 * real, published work with a DOI, title, authors, year, journal, abstract and
 * citation count from the start, so there's no separate DOI-verification step.
 * (Asking Claude to recall exact titles instead verified only ~4% of the time
 * on a live test — most recalled titles simply don't exist.)
 *
 * OpenAlex stores abstracts as an inverted index (word → positions); this
 * rebuilds the plain text.
 */

const OPENALEX_BASE_URL = "https://api.openalex.org";

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
  authors: string; // "Family, G.; Family2, G2." — the shape Reference.authors uses
  year: number | null;
  journal: string | null;
  abstract: string | null;
  /** OpenAlex's own OA PDF location, if any. Only a hint: on a live test it was
   *  present for 70 of 80 papers but actually served a PDF for just 14, so it's
   *  always probed (alongside Unpaywall's locations) before anything relies on it. */
  pdfUrl: string | null;
  citedByCount: number;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };
function decodeEntities(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m] ?? m);
}

/** Only the fields we use — the full work record is several times larger. */
const SELECT_FIELDS = [
  "doi",
  "title",
  "display_name",
  "publication_year",
  "authorships",
  "primary_location",
  "best_oa_location",
  "abstract_inverted_index",
  "cited_by_count",
].join(",");

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
    title: decodeEntities(title.replace(/<[^>]+>/g, "")).trim(),
    authors,
    year: typeof w.publication_year === "number" ? w.publication_year : null,
    journal: w.primary_location?.source?.display_name ? decodeEntities(w.primary_location.source.display_name) : null,
    abstract: rebuildAbstract(w.abstract_inverted_index),
    pdfUrl: w.best_oa_location?.pdf_url ?? w.primary_location?.pdf_url ?? null,
    citedByCount: typeof w.cited_by_count === "number" ? w.cited_by_count : 0,
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
    select: SELECT_FIELDS,
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
