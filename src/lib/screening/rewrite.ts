/**
 * The screening rewrite test: a candidate recasts an AI-sounding paragraph in
 * the plain EduCraft voice, and the free phrase scan scores it — how many of
 * the paragraph's banned constructions they cleared, with no credit for simply
 * deleting the content.
 *
 * Pure (no database, no Claude). It leans on the voice scan, which is itself
 * pure, so it lives apart from the minimal `rules.ts` to keep that file free of
 * the quality-layer import. The optional Claude voice rubric (off by default,
 * behind a Setting) is advisory and lives in the service, not here.
 */

import type { ProseParagraph } from "@/lib/quality/prose";
import { LITERAL_RULES, scanVoice, VOICE_FIX, type VoiceFinding, type VoiceRule } from "@/lib/quality/voice-scan";
import { ScreeningRuleError } from "./rules";

/** A piece of plain text as paragraphs the scan can read (no markup, numbered from 1). */
function paragraphsOf(text: string): ProseParagraph[] {
  return text
    .split(/\n\s*\n+/)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((t, i) => ({ chapter: 1, index: i + 1, section: null, text: t, firstInSection: i === 0 }));
}

const wordCount = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t ? t.split(/\s+/).length : 0;
};

/** The banned constructions a MAJOR literal rule catches in a piece of text (an opener, promotional word, transition, meta-commentary, cross-reference or first person). */
export function bannedConstructions(text: string): VoiceFinding[] {
  return scanVoice(paragraphsOf(text)).filter((f) => f.severity === "MAJOR" && LITERAL_RULES.has(f.rule));
}

/** A readable list of the rules still present, for the COO's review. */
export function rewriteRulesLeft(text: string): { rule: VoiceRule; label: string; quote: string; fix: string }[] {
  const LABEL: Record<VoiceRule, string> = {
    opener: "Stock opener",
    promotional: "Promotional language",
    transition: "Filler transition",
    meta: "Meta-commentary",
    cross_reference: "Cross-reference",
    first_person: "First person",
    vague: "Vague qualifier",
    weak_verb: "Weak verb",
    thin: "Thin",
    unsupported_claim: "Unsupported claim",
    hollow: "Hollow statement",
    uniform_rhythm: "Uniform rhythm",
    other: "Voice",
  };
  return bannedConstructions(text).map((f) => ({ rule: f.rule, label: LABEL[f.rule], quote: f.quote, fix: VOICE_FIX[f.rule] }));
}

/** Keep at least this fraction of the original's length, and this many words — so a candidate cannot score by deleting the problem. */
export const REWRITE_MIN_WORD_RATIO = 0.5;
export const REWRITE_MIN_WORDS = 20;
/** A bank paragraph must carry at least this many banned constructions to be a fair test. */
export const REWRITE_MIN_PLANTED = 2;

export interface RewriteScore {
  /** Banned constructions cleared (planted minus those still present, never below zero). */
  correct: number;
  /** Banned constructions planted in the original paragraph. */
  total: number;
  /** Banned constructions still in the rewrite (a clean pass is zero). */
  remaining: number;
  /** The rewrite is shorter than the floor — they cut the content instead of recasting it. */
  tooShort: boolean;
  percent: number;
}

/**
 * Scores a rewrite against the paragraph it recasts. Every banned construction
 * cleared is a point; introducing new ones lowers the count; a rewrite under
 * the length floor scores nothing (the content was cut, not rewritten).
 */
export function scoreRewrite(original: string, rewrite: string): RewriteScore {
  const total = bannedConstructions(original).length;
  const words = wordCount(rewrite);
  const tooShort = words < REWRITE_MIN_WORDS || words < Math.round(wordCount(original) * REWRITE_MIN_WORD_RATIO);
  const remaining = bannedConstructions(rewrite).length;
  const correct = tooShort ? 0 : Math.max(0, total - remaining);
  const percent = total > 0 ? Math.round((correct / total) * 100) : remaining === 0 && !tooShort ? 100 : 0;
  return { correct, total, remaining, tooShort, percent };
}

/**
 * Checks a rewrite bank item the founder is saving: the AI-sounding paragraph,
 * and an optional private note. The paragraph must actually read like AI — it
 * has to carry at least `REWRITE_MIN_PLANTED` banned constructions, or there is
 * nothing for the candidate to fix.
 */
export function validateRewriteItem(
  payload: { text?: unknown; note?: unknown },
  _answerKey: unknown
): { payload: { text: string; note: string | null }; answerKey: Record<string, never> } {
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (text.length < 60) throw new ScreeningRuleError("The paragraph is too short");
  if (text.length > 4000) throw new ScreeningRuleError("The paragraph is too long");
  const planted = bannedConstructions(text).length;
  if (planted < REWRITE_MIN_PLANTED) {
    throw new ScreeningRuleError(
      `This paragraph does not read enough like AI to score fairly — it needs at least ${REWRITE_MIN_PLANTED} tell-tale phrases (a stock opener, hype, a filler transition, meta-commentary or first person)`
    );
  }
  const note = typeof payload.note === "string" && payload.note.trim() ? payload.note.trim() : null;
  return { payload: { text, note }, answerKey: {} };
}
