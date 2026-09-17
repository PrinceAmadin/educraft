/**
 * CrossRef is the real bibliographic registry DOIs live in — every candidate
 * paper Claude proposes gets checked here before it's trusted. This is the
 * hard defense against DOI hallucination: a candidate only survives if
 * CrossRef has a record whose title closely matches what was proposed.
 */

const CROSSREF_BASE_URL = "https://api.crossref.org";

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

/** Case/punctuation/whitespace-insensitive similarity in [0, 1] via word overlap (Dice coefficient). */
export function titleSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

  const wordsA = normalize(a);
  const wordsB = normalize(b);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  let overlap = 0;
  for (const w of setA) if (setB.has(w)) overlap++;

  return (2 * overlap) / (setA.size + setB.size);
}

const TITLE_MATCH_THRESHOLD = 0.75;

function stripJatsTags(abstract: string | undefined): string | null {
  if (!abstract) return null;
  return abstract.replace(/<[^>]+>/g, "").trim() || null;
}

function toWork(item: any): CrossRefWork {
  const authors = Array.isArray(item.author)
    ? item.author
        .map((a: any) => [a.family, a.given ? a.given[0] + "." : null].filter(Boolean).join(", "))
        .join("; ")
    : "";

  const year =
    item["published-print"]?.["date-parts"]?.[0]?.[0] ??
    item["published-online"]?.["date-parts"]?.[0]?.[0] ??
    item.issued?.["date-parts"]?.[0]?.[0] ??
    null;

  return {
    doi: item.DOI,
    title: item.title?.[0] ?? "",
    authors,
    year: year ?? null,
    journal: item["container-title"]?.[0] ?? null,
    abstract: stripJatsTags(item.abstract),
  };
}

/**
 * Searches CrossRef by title and returns the best match, but only if it's
 * confidently the same paper (word-overlap similarity above threshold).
 * Returns null — meaning "reject this candidate" — on no confident match.
 */
export async function findWorkByTitle(proposedTitle: string): Promise<CrossRefWork | null> {
  const qs = new URLSearchParams({
    "query.bibliographic": proposedTitle,
    rows: "3",
    mailto: contactEmail(),
  });

  let res: Response;
  try {
    res = await fetch(`${CROSSREF_BASE_URL}/works?${qs.toString()}`);
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const json = await res.json().catch(() => null);
  const items: any[] = json?.message?.items ?? [];

  let best: { work: CrossRefWork; score: number } | null = null;
  for (const item of items) {
    const candidateTitle = item.title?.[0];
    if (!candidateTitle || !item.DOI) continue;
    const score = titleSimilarity(proposedTitle, candidateTitle);
    if (score >= TITLE_MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { work: toWork(item), score };
    }
  }

  return best?.work ?? null;
}
