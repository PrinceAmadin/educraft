/**
 * The abstract's length band for the Claude-written preliminary pages (D10), in
 * a module with no database or file access, so the quality gate's pure checks
 * and the Report tab read the same figures as the page writer.
 */

import { followsNalt } from "@/lib/law/nalt";
import type { SectionKey } from "./department-map";
export const ABSTRACT_MIN_WORDS = 240;
export const ABSTRACT_MAX_WORDS = 320;
export const ABSTRACT_TARGET_LO = 260;
export const ABSTRACT_TARGET_HI = 290;

/**
 * A law report's abstract (the founder's call, 26 Nov 2026). NALT contradicts
 * itself — its long-essay guidelines say "not more than 200-350", its abstract
 * guidelines "not more 300-400 words for undergraduate" — and the benchmark long
 * essay is 283 words, so the band holds the benchmark and stays inside the
 * long-essay figure.
 */
export const NALT_ABSTRACT_MIN_WORDS = 250;
export const NALT_ABSTRACT_MAX_WORDS = 350;

export interface AbstractBand {
  min: number;
  max: number;
  targetLo: number;
  targetHi: number;
}

/** The band this report's abstract is written and judged against. */
export function abstractBand(input: { section?: SectionKey | null; referencingStyle?: string | null }): AbstractBand {
  if (followsNalt(input)) return { min: NALT_ABSTRACT_MIN_WORDS, max: NALT_ABSTRACT_MAX_WORDS, targetLo: 270, targetHi: 320 };
  return { min: ABSTRACT_MIN_WORDS, max: ABSTRACT_MAX_WORDS, targetLo: ABSTRACT_TARGET_LO, targetHi: ABSTRACT_TARGET_HI };
}
