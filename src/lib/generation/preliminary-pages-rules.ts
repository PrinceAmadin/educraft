/**
 * The abstract's length band for the Claude-written preliminary pages (D10), in
 * a module with no database or file access, so the quality gate's pure checks
 * and the Report tab read the same figures as the page writer.
 */
export const ABSTRACT_MIN_WORDS = 240;
export const ABSTRACT_MAX_WORDS = 320;
export const ABSTRACT_TARGET_LO = 260;
export const ABSTRACT_TARGET_HI = 290;
