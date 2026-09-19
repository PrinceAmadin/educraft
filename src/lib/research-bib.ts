/**
 * BibTeX export of a project's kept references, built straight from the
 * stored OpenAlex metadata. Zotero, Mendeley, Word and LaTeX all import .bib,
 * so a worker who prefers a reference manager is one import away from having
 * the same list — without it being a step in the pipeline.
 */

export interface BibReference {
  title: string | null;
  proposedTitle: string;
  authors: string | null; // "Family, G.; Family2, G2."
  year: number | null;
  journal: string | null;
  doi: string | null;
  abstract: string | null;
  classification: string | null;
}

/** Makes a value safe inside a BibTeX field: no stray braces or backslashes, special characters escaped. */
function escapeBib(value: string): string {
  return value
    .replace(/[{}\\]/g, "")
    .replace(/([&%$#_])/g, "\\$1")
    .replace(/\s+/g, " ")
    .trim();
}

function ascii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const STOP_WORDS = new Set(["a", "an", "the", "of", "on", "in", "for", "and", "to", "towards", "toward", "with", "using"]);

function citeKey(ref: BibReference, used: Set<string>): string {
  const first = ref.authors?.split(";")[0]?.split(",")[0] ?? "";
  const surname = ascii(first) || "anon";
  const word = (ref.title ?? ref.proposedTitle).split(/\s+/).map(ascii).find((w) => w && !STOP_WORDS.has(w)) ?? "";
  const base = `${surname}${ref.year ?? "nd"}${word}`;
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}${n}`;
  used.add(key);
  return key;
}

export function buildBibtex(refs: BibReference[]): string {
  const used = new Set<string>();
  const entries = refs.map((ref) => {
    const title = ref.title ?? ref.proposedTitle;
    const authors = (ref.authors ?? "")
      .split(";")
      .map((a) => escapeBib(a))
      .filter(Boolean)
      .join(" and ");

    const fields: [string, string | null][] = [
      ["author", authors || null],
      // Double braces keep the title's capitalisation exactly as published.
      ["title", `{${escapeBib(title)}}`],
      ["journal", ref.journal ? escapeBib(ref.journal) : null],
      ["year", ref.year ? String(ref.year) : null],
      ["doi", ref.doi],
      ["url", ref.doi ? `https://doi.org/${ref.doi}` : null],
      ["abstract", ref.abstract ? escapeBib(ref.abstract) : null],
      ["keywords", ref.classification ? ref.classification.toLowerCase().replace("_", " ") : null],
    ];

    const body = fields
      .filter((f): f is [string, string] => Boolean(f[1]))
      .map(([k, v]) => `  ${k} = {${v}}`)
      .join(",\n");
    return `@article{${citeKey(ref, used)},\n${body}\n}`;
  });
  return entries.join("\n\n") + "\n";
}
