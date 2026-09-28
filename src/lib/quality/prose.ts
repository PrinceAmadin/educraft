/**
 * The prose of a generated report, as the quality gate reads it: paragraphs
 * numbered per chapter (headings, tables, figures, equations and lists are left
 * out) and sentences that do not break on "et al.", "e.g." or an initial. Pure.
 */

import { parseChapter } from "@/lib/assembly/parse-chapter";

export interface ProseParagraph {
  chapter: number;
  /** 1-based among the chapter's prose paragraphs (the ¶ number the COO sees). */
  index: number;
  /** The heading the paragraph sits under, e.g. "2.3 Theoretical Framework". */
  section: string | null;
  text: string;
  /** First prose paragraph after its heading. */
  firstInSection: boolean;
}

/** Italic markers out; the text as a reader sees it. */
export const plainText = (s: string) => s.replace(/\*+/g, "").replace(/\s+/g, " ").trim();

export function proseParagraphs(chapters: { number: number; text: string }[]): ProseParagraph[] {
  const out: ProseParagraph[] = [];
  for (const ch of chapters) {
    let section: string | null = null;
    let index = 0;
    let fresh = true;
    for (const b of parseChapter(ch.text, ch.number).blocks) {
      if (b.kind === "heading") {
        section = b.text;
        fresh = true;
        continue;
      }
      if (b.kind !== "paragraph") continue;
      const text = plainText(b.text);
      if (!text) continue;
      out.push({ chapter: ch.number, index: ++index, section, text, firstInSection: fresh });
      fresh = false;
    }
  }
  return out;
}

/** D7b: the preliminary pages belong to no chapter; their prose is numbered under chapter 0. */
export const PRELIM_CHAPTER = 0;

/**
 * D7b: the Claude-written acknowledgement and abstract as prose, one list per
 * page (so the phrase scan reads each on its own), sections named as the
 * voice check words them ("… in the abstract").
 */
export function prelimProse(pages: { acknowledgement: string; abstract: string } | null | undefined): ProseParagraph[][] {
  if (!pages) return [];
  const sections: [string, string][] = [
    ["the acknowledgement", pages.acknowledgement],
    ["the abstract", pages.abstract],
  ];
  return sections.map(([section, body]) =>
    body
      .split(/\n\s*\n+/)
      .map(plainText)
      .filter(Boolean)
      .map((text, i) => ({ chapter: PRELIM_CHAPTER, index: i + 1, section, text, firstInSection: i === 0 })),
  );
}

/** Words a full stop does not end a sentence after. */
const ABBREVIATION = /(?:\bet\.?\s+al|\be\.g|\bi\.e|\bpp?|\bvs|\bDr|\bMr|\bMrs|\bMs|\bProf|\bNo|\bFig|\bEqs?|\bVol|\beds?|\bSt|\bJr|\bSr|\bLtd|\bInc|\bCo|\bviz|\bcf|\bapprox|\bca|(?:^|[\s(])\p{Lu})\.$/u;

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  // A note marker straight after the full stop (".^3", ".[3]", ".³") still ends the sentence.
  for (const m of text.matchAll(/[.!?]["”’)\]]*(?:\^\{\d{1,3}\}|\^\[\d{1,3}\]|\^\d{1,3}|\[\d{1,3}\]|[⁰¹²³⁴⁵⁶⁷⁸⁹]{1,3})?\s+(?=["“‘(\[]?[\p{Lu}\d])/gu)) {
    const end = (m.index ?? 0) + m[0].trimEnd().length;
    const candidate = text.slice(start, end);
    if (ABBREVIATION.test(candidate.replace(/["”’)\]]+$/, ""))) continue;
    out.push(candidate.trim());
    start = (m.index ?? 0) + m[0].length;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

/** Lower case, straight quotes and dashes, one space: for matching a quote against its paragraph. */
export function normaliseForMatch(s: string): string {
  return plainText(s)
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^["'\s.…]+|["'\s.…]+$/g, "");
}
