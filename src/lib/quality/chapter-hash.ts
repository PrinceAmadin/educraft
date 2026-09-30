/**
 * The chapter gate's key for a chapter's text: the gate's rules version and the
 * exact text. Written on GenerationCheckpoint.outputHash whenever fullOutput is
 * written, and on every ChapterCheck, so a check belongs to one text.
 */

import crypto from "node:crypto";
import { CHAPTER_GATE_VERSION } from "./chapter-gate";

export function chapterTextHash(text: string): string {
  return crypto.createHash("sha256").update(`${CHAPTER_GATE_VERSION}|${text}`).digest("hex").slice(0, 32);
}

/**
 * The AI draft's identity (DeliverableVersion.sourceHash and the stamp in the file): the draft's build
 * and the text. Bumped when the draft's Word file changes, so every draft is made again once
 * (30 Sept 2026: a real Normal style, and the chapter's quality check in its note).
 */
export const DRAFT_BUILD_VERSION = "draft-2";

export function draftSourceHash(text: string): string {
  return crypto.createHash("sha256").update(`${DRAFT_BUILD_VERSION}|${text}`).digest("hex").slice(0, 32);
}
