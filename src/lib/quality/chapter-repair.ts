/**
 * Surgical chapter repair (3 Nov 2026): the mechanics of fixing a failed
 * chapter check IN PLACE instead of regenerating the chapter. The measured
 * reason this exists: on the two real client reports (EC-00002, EC-00010)
 * whole-chapter rewrites were ~60% of all AI spend — ₦450–2,200 a rewrite to
 * fix what are three-paragraph edits. A repair is one short call (~₦30–60)
 * returning exact find→replace pairs, applied only where the `find` occurs in
 * the chapter text verbatim and exactly once — the same discipline the gate
 * already applies to AI voice findings ("kept only if its quote is in the
 * paragraph word for word").
 *
 * Pure and browser-safe. Which failures ARE repairable is gate policy and
 * lives in chapter-gate.ts (repairableItem / allRepairable); this module only
 * knows how to ask for and apply the patches. The service
 * (src/lib/services/chapter-repair.ts) makes the one Claude call.
 *
 * Every sentence sent to Claude is in REPAIR_TEXT, for the founder's review.
 */

/** The AI usage log step for the repair call (subsystem quality_gate). */
export const REPAIR_STEP = "chapter_repair";
/** At most this many patches are applied from one repair call. */
export const MAX_REPAIRS_PER_CALL = 40;
/** A `find` shorter than this is too ambiguous to anchor a safe replacement. */
export const MIN_FIND_CHARS = 8;
/**
 * A replacement may grow its anchor, but a repair is an edit, not a rewrite:
 * anything past this is refused so the model cannot smuggle in a new chapter.
 */
export const MAX_REPLACE_GROWTH = (findLength: number) => findLength * 6 + 400;

export interface RepairPatch {
  find: string;
  replace: string;
}

export interface RefusedPatch extends RepairPatch {
  reason: string;
}

export interface AppliedRepairs {
  text: string;
  applied: RepairPatch[];
  refused: RefusedPatch[];
}

export const REPAIR_TEXT = {
  system: [
    "You repair one chapter of a Nigerian university report that failed EduCraft's quality check.",
    "You are given the chapter exactly as it is stored (with its [H1]/[H2]/[H3] heading markers, tables and citations) and the list of failures.",
    "Fix ONLY what the failures name, with the smallest possible edits. Do not rewrite sections, do not reorder anything, do not touch text no failure points at.",
    "Return your fixes with the record_repairs tool as find/replace pairs. Each `find` must be copied CHARACTER FOR CHARACTER from the chapter — same spelling, same punctuation, same markers — and must be long enough to appear only once. Each `replace` is the corrected text that takes its place.",
    "Keep the chapter's plain academic voice. Never introduce promotional words, section cross-references ('as discussed above'), first-person constructions, or any phrase the failures flag.",
    "A citation may only name a work from the VERIFIED REFERENCES list when one is given. If no listed work fits, remove the citation and soften the sentence to an uncontroversial statement instead of inventing a source.",
    "If a failure cannot be fixed with a small in-place edit, leave it out rather than guessing.",
  ].join("\n"),
  user: (a: { chapter: number; title: string; lines: string[]; references: string[] | null; text: string }) =>
    [
      `CHAPTER ${a.chapter} OF "${a.title}" — THE STORED TEXT:`,
      a.text,
      "",
      "THE FAILURES TO FIX:",
      ...a.lines.map((l) => `- ${l}`),
      ...(a.references?.length ? ["", "VERIFIED REFERENCES (the only works a citation may name):", ...a.references.map((r) => `- ${r}`)] : []),
      "",
      `Record up to ${MAX_REPAIRS_PER_CALL} find/replace pairs that fix the failures above, and nothing else.`,
    ].join("\n"),
  toolName: "record_repairs",
  toolDescription: "The exact in-place edits that fix the listed failures: each `find` copied verbatim from the chapter, each `replace` the corrected text.",
} as const;

/** The record_repairs tool schema (strict-mode friendly: every object closed by toStrictSchema). */
export const REPAIRS_SCHEMA = {
  type: "object",
  properties: {
    repairs: {
      type: "array",
      description: "The edits, in the order they appear in the chapter.",
      items: {
        type: "object",
        properties: {
          find: { type: "string", description: "Text copied character for character from the chapter, long enough to occur exactly once." },
          replace: { type: "string", description: "The corrected text that replaces it." },
        },
        required: ["find", "replace"],
      },
    },
  },
  required: ["repairs"],
} as const;

/**
 * The model sometimes answers with the list as a JSON string wrapping the
 * object (seen live on other tools — every reader goes through a tolerant
 * parse like this one).
 */
export function parseRepairs(raw: unknown): RepairPatch[] {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  const list = Array.isArray(value) ? value : value && typeof value === "object" ? (value as { repairs?: unknown }).repairs : null;
  if (!Array.isArray(list)) return [];
  const out: RepairPatch[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const find = (item as { find?: unknown }).find;
    const replace = (item as { replace?: unknown }).replace;
    if (typeof find === "string" && typeof replace === "string") out.push({ find, replace });
  }
  return out.slice(0, MAX_REPAIRS_PER_CALL);
}

const occurrences = (text: string, find: string): number => {
  if (!find) return 0;
  let n = 0;
  let i = text.indexOf(find);
  while (i !== -1) {
    n += 1;
    i = text.indexOf(find, i + find.length);
  }
  return n;
};

/**
 * Applies the patches one after another, refusing any that is not safe:
 * a `find` that is too short, not present character for character, present
 * more than once (ambiguous), identical to its replacement, or a replacement
 * so much larger that it is a rewrite in disguise. Later patches are checked
 * against the already-patched text, so two patches can never fight.
 */
export function applyRepairs(text: string, patches: RepairPatch[]): AppliedRepairs {
  let current = text;
  const applied: RepairPatch[] = [];
  const refused: RefusedPatch[] = [];
  for (const p of patches.slice(0, MAX_REPAIRS_PER_CALL)) {
    const find = p.find;
    if (find.trim().length < MIN_FIND_CHARS) {
      refused.push({ ...p, reason: `the anchor is shorter than ${MIN_FIND_CHARS} characters` });
      continue;
    }
    if (p.replace === find) {
      refused.push({ ...p, reason: "the replacement is identical to the anchor" });
      continue;
    }
    if (p.replace.length > MAX_REPLACE_GROWTH(find.length)) {
      refused.push({ ...p, reason: "the replacement is far larger than the anchor — a repair is an edit, not a rewrite" });
      continue;
    }
    const n = occurrences(current, find);
    if (n === 0) {
      refused.push({ ...p, reason: "the anchor is not in the chapter character for character" });
      continue;
    }
    if (n > 1) {
      refused.push({ ...p, reason: `the anchor appears ${n} times — ambiguous` });
      continue;
    }
    current = current.replace(find, p.replace);
    applied.push(p);
  }
  return { text: current, applied, refused };
}
