/**
 * Referencing styles and citation placement: the rules the D1 prompt loader
 * applies and the D3 mode card offers. Pure (types only from Prisma), so the
 * card, the mode service and the loader share one definition.
 */
import type { ReferencingStyle } from "@prisma/client";
import type { SectionKey } from "./department-map";

/** The stored styles plus the ones B2 adds (NALT, NMCN and the two Chicago variants).
 *  "CHICAGO" (no variant) is a legacy intake value: the COO must pick a variant. */
export type ReferencingStyleKey = ReferencingStyle | "NALT" | "NMCN" | "CHICAGO_AUTHOR_DATE" | "CHICAGO_NOTES_BIBLIOGRAPHY";
export type CitationPlacement = "MODE_A" | "MODE_B" | "MODE_C" | "NOT_APPLICABLE";

/** The wording Chapter 1 uses for each style, so comparisons like "= NALT" read correctly. */
export const STYLE_LABEL: Record<Exclude<ReferencingStyleKey, "CUSTOM" | "CHICAGO">, string> = {
  APA_7TH: "APA 7th Edition",
  APA_6TH: "APA 6th Edition",
  HARVARD: "Harvard",
  IEEE: "IEEE",
  MLA: "MLA 9th Edition",
  CHICAGO_AUTHOR_DATE: "Chicago 17th (Author-Date)",
  CHICAGO_NOTES_BIBLIOGRAPHY: "Chicago 17th (Notes-Bibliography)",
  NALT: "NALT",
  NMCN: "NMCN Style",
};

/** What the COO can confirm on the mode card: every named style, or the supervisor's own format. */
export const REFERENCING_STYLE_CHOICES: { value: Exclude<ReferencingStyleKey, "CHICAGO">; label: string }[] = [
  ...(Object.entries(STYLE_LABEL) as [Exclude<ReferencingStyleKey, "CUSTOM" | "CHICAGO">, string][]).map(([value, label]) => ({ value, label })),
  { value: "CUSTOM", label: "Custom (the supervisor's own format)" },
];

export function isReferencingStyleKey(value: unknown): value is ReferencingStyleKey {
  return typeof value === "string" && (value === "CUSTOM" || value === "CHICAGO" || value in STYLE_LABEL);
}

export const CITATION_PLACEMENTS: CitationPlacement[] = ["MODE_A", "MODE_B", "MODE_C", "NOT_APPLICABLE"];

/** Short names for the three note placements (the in-text wording lives with the loader). */
export const PLACEMENT_NAME: Record<Exclude<CitationPlacement, "NOT_APPLICABLE">, string> = {
  MODE_A: "MODE A (chapter endnotes)",
  MODE_B: "MODE B (document endnotes)",
  MODE_C: "MODE C (page footnotes)",
};

/**
 * Where citations go. NALT always uses page footnotes (MODE C), and so does doctrinal Law.
 * B3: every other thematic (Template B) report uses MODE B, document endnotes, in every
 * chapter. Chapter 1 would default Humanities to MODE A, but Chapters 3–5 hard-code
 * MODE B, and one mode for the whole report beats following Chapter 1 alone. Thematic
 * placement is fixed; the COO may override it on standard (Template A) reports only.
 * Standard reports cite in the text, except Chicago notes-bibliography, which is a notes style (MODE C).
 *
 * Returns the placement, or the reason the override is refused.
 */
export function citationPlacementFor(
  style: ReferencingStyleKey,
  template: "A" | "B",
  section: SectionKey,
  override?: CitationPlacement | null,
): { placement: CitationPlacement } | { refused: string } {
  if (style === "NALT") {
    if (override && override !== "MODE_C") return { refused: "NALT always uses page footnotes (MODE C); it cannot be overridden." };
    return { placement: "MODE_C" };
  }
  if (template === "B") {
    const fixed = section === "LAW_DOCTRINAL" ? "MODE_C" : "MODE_B";
    if (override && override !== fixed) {
      return { refused: `Thematic reports use ${PLACEMENT_NAME[fixed]} in every chapter; the placement cannot be changed.` };
    }
    return { placement: fixed };
  }
  if (style === "CHICAGO_NOTES_BIBLIOGRAPHY" && override === "NOT_APPLICABLE") {
    return { refused: "Chicago notes-bibliography is a notes style; its citations cannot be switched to in-text." };
  }
  if (override) return { placement: override };
  return { placement: style === "CHICAGO_NOTES_BIBLIOGRAPHY" ? "MODE_C" : "NOT_APPLICABLE" };
}
