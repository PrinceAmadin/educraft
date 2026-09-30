/**
 * Standard sources Nigerian reports cite by habit whether or not the research
 * step found them (FIX 2 of D8). Cited but missing from the verified
 * references, they are a WARN for the COO (add the entry by hand), never a
 * failure, and never cost a point. Pure: the quality gate and the chapter
 * read-back share it.
 */

import { nameKey } from "@/lib/assembly/text-rules";

export interface KnownCitation {
  surname: string;
  year: number;
  /** What the work is, for the note to the COO. */
  work: string;
}

export const KNOWN_COMMON_CITATIONS: readonly KnownCitation[] = [
  { surname: "Davis", year: 1989, work: "the Technology Acceptance Model (MIS Quarterly)" },
  { surname: "Yamane", year: 1967, work: "Statistics: An Introductory Analysis, the sample-size formula" },
];

/** The known citation an author-date citation names ("Davis", "1989a"), or null. */
export function knownCommonCitation(author: string, year: string): KnownCitation | null {
  const y = Number(year.slice(0, 4));
  const key = nameKey(author);
  return KNOWN_COMMON_CITATIONS.find((k) => k.year === y && nameKey(k.surname) === key) ?? null;
}
