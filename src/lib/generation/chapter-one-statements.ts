/**
 * Phase D9 — Chapter One's research questions and hypotheses, read from its
 * finished text. Chapters Four and Five are written from them (their prompts
 * refuse to assemble without them), the quality gate's ST10 traces them, and a
 * re-generated chapter gets the same lists, so all three read them here. Pure.
 */

import { parseChapter, type Block } from "@/lib/assembly/parse-chapter";

/** Italic markers out; the text as a reader sees it. */
const plain = (s: string) => s.replace(/\*+/g, "").replace(/\s+/g, " ").trim();

const LABEL = /^(?:H[oO0₀]?\s?\d+|H[₀0]\d+|RQ\s?\d+)\s*[:.)-]?\s*/;
const LABELLED = /^(?:H[oO0₀]?\s?\d|H[₀0]\d|RQ\s?\d)/;
const ASKS = /\?\s*$/;
const QUESTION_WORD = /^(?:what|how|to what|is|are|does|do|which|why)\b/i;

/**
 * Lines stated under a Chapter One heading (research questions, hypotheses):
 * its list items, its labelled lines (RQ1, H01) and its questions. A
 * sub-section under the heading still belongs to it.
 */
export function extractStatements(chapter: { blocks: Block[] } | undefined, heading: RegExp): string[] {
  if (!chapter) return [];
  const out: string[] = [];
  let inside = false;
  let level = 2;
  for (const b of chapter.blocks) {
    if (b.kind === "heading") {
      if (heading.test(b.text)) {
        inside = true;
        level = b.level;
      } else if (!(inside && b.level > level)) {
        inside = false;
      }
      continue;
    }
    if (!inside) continue;
    if (b.kind === "list") out.push(...b.items.map((i) => plain(i.text)));
    if (b.kind === "paragraph") {
      for (const line of b.text.split(/\n/)) {
        const t = plain(line);
        if (LABELLED.test(t) || ASKS.test(t)) out.push(t.replace(LABEL, ""));
      }
    }
  }
  return out.filter((s) => s.length > 10);
}

/** The research questions: what sits under the heading and reads as a question. */
export function researchQuestionsOf(chapter: { blocks: Block[] } | undefined): string[] {
  return extractStatements(chapter, /research questions?/i).filter((q) => ASKS.test(q) || QUESTION_WORD.test(q));
}

/**
 * The hypotheses. Under a joint heading ("Research Questions and Hypotheses")
 * the questions are left to researchQuestionsOf.
 */
export function hypothesesOf(chapter: { blocks: Block[] } | undefined): string[] {
  return extractStatements(chapter, /hypothes[ie]s/i).filter((h) => !ASKS.test(h));
}

export interface ChapterOneStatements {
  researchQuestions: string[];
  hypotheses: string[];
  /** True when Chapter One has a heading for them, whether or not anything could be read under it. */
  hasQuestionsHeading: boolean;
  hasHypothesesHeading: boolean;
}

/** Both lists from Chapter One's text (D2's markup), de-duplicated, in the order stated. */
export function readChapterOneStatements(chapterOneText: string): ChapterOneStatements {
  const parsed = parseChapter(chapterOneText, 1);
  const headings = parsed.blocks.filter((b): b is Extract<Block, { kind: "heading" }> => b.kind === "heading").map((b) => b.text);
  const unique = (list: string[]) => [...new Set(list)];
  return {
    researchQuestions: unique(researchQuestionsOf(parsed)),
    hypotheses: unique(hypothesesOf(parsed)),
    hasQuestionsHeading: headings.some((h) => /research questions?/i.test(h)),
    hasHypothesesHeading: headings.some((h) => /hypothes[ie]s/i.test(h)),
  };
}

/**
 * Chapter One promises research questions or hypotheses (it has the heading)
 * but none could be read. The orchestrator stops for a person then, rather
 * than tell Chapters Four and Five that there are none.
 */
export function statementsUnreadable(s: ChapterOneStatements): boolean {
  return (s.hasQuestionsHeading && s.researchQuestions.length === 0) || (s.hasHypothesesHeading && s.hypotheses.length === 0 && s.researchQuestions.length === 0);
}
