/**
 * Phase D8 Layer 2b: reference verification. Every author-date citation in the
 * chapters is matched to the verified (KEPT) references with D7's own rule
 * (first author's surname + year); a citation matching none fails, except the
 * standard sources on the known list (a WARN). Relevance is the research
 * step's stored classification. The AI batch (in the gate) then checks, per
 * chapter, that each cited paper's abstract supports the sentence citing it
 * (the Reference Verification System's Tier 3 prompt). Pure.
 */

import { parseChapter } from "@/lib/assembly/parse-chapter";
import { analyseChapterNotes, entryFor, resolveNotes, type NoteEntry } from "@/lib/assembly/endnotes";
import { citationsIn, nameKey, referencesForCitation, type CitableReference } from "@/lib/assembly/text-rules";
import { plainText, splitSentences } from "./prose";
import { result, shortQuote, type CheckResult, type QualityIssue } from "./types";

export interface GateReference extends CitableReference {
  id: string;
  title: string | null;
  proposedTitle: string;
  journal: string | null;
  abstract: string | null;
  classification: string | null;
}

export interface CitationUse {
  chapter: number;
  /** ¶ number for prose, null for a table cell, list item or caption. */
  paragraph: number | null;
  sentence: string;
  author: string;
  year: string;
  raw: string;
}

/** Approved Law/History sources: cited by name or holder, not author-date. */
export interface PrimarySourceRef {
  title: string | null;
  holder?: string | null;
  citation?: string | null;
  reference?: string | null;
}

/** Mode 5's data sources, named under tables: "not reference-list works" (D5 loader text). */
const DATA_SOURCE = /^(?:world bank|cbn|central bank(?: of nigeria)?|nbs|national bureau of statistics|imf|international monetary fund|nnpc|opec|fao|faostat|unctad|wdi)$/i;

/** Every author-date citation in the chapters, with the sentence it sits in. */
export function citationUses(chapters: { number: number; text: string }[]): CitationUse[] {
  const out: CitationUse[] = [];
  for (const ch of chapters) {
    let index = 0;
    const add = (text: string, paragraph: number | null) => {
      for (const sentence of splitSentences(plainText(text))) {
        for (const c of citationsIn(sentence)) out.push({ chapter: ch.number, paragraph, sentence, author: c.author, year: c.year, raw: c.raw });
      }
    };
    for (const b of parseChapter(ch.text, ch.number).blocks) {
      if (b.kind === "paragraph") {
        if (plainText(b.text)) add(b.text, ++index);
      } else if (b.kind === "list") b.items.forEach((i) => add(i.text, null));
      else if (b.kind === "table") {
        if (b.caption) add(b.caption, null);
        for (const row of b.rows) for (const cell of row) add(cell, null);
      } else if (b.kind === "figure" && b.caption) add(b.caption, null);
    }
  }
  return out;
}

export interface CitationMatch {
  uses: CitationUse[];
  matched: { use: CitationUse; refs: GateReference[] }[];
  /** Cited but on no list: each is a failure. */
  unmatched: CitationUse[];
  /** Cited, not verified, but a standard source (Davis 1989, Yamane 1967): a WARN. */
  knownCommon: { use: CitationUse; work: string }[];
  /** Verified references no chapter cites (left out of the References by D7). */
  uncited: GateReference[];
  /** Distinct verified references cited. */
  cited: GateReference[];
  /**
   * The citation placement the chapters use. A note-style placement (MODE_A, MODE_B, MODE_C) writes
   * the reference marker in the body ("^3") and lists the notes at the chapter end; there is no
   * (Author, Year) to match, so the Davis/Yamane warning does not apply and ST13's Ch1/Ch2 rule uses
   * the endnote list instead of the matched-citation count.
   */
  noteStyle: boolean;
  /** The approved placement. MODE_A and MODE_B cite through [ENDNOTES] notes, which are matched too. */
  placement: string | null;
}

/** MODE_A / MODE_B: the chapters' notes are read as citations (endnotes.ts). */
export function citesInEndnotes(placement: string | null | undefined): placement is "MODE_A" | "MODE_B" {
  return placement === "MODE_A" || placement === "MODE_B";
}

export function matchCitations(input: {
  chapters: { number: number; text: string }[];
  references: GateReference[];
  mode: number | null;
  knownCommon: (author: string, year: string) => { work: string } | null;
  primarySources?: PrimarySourceRef[];
  /** Set for a note-style placement (MODE_A, MODE_B, MODE_C). Davis/Yamane WARN is then skipped. */
  noteStyle?: boolean;
  placement?: string | null;
}): CitationMatch {
  const uses = citationUses(input.chapters);
  const matched: CitationMatch["matched"] = [];
  const unmatched: CitationUse[] = [];
  const knownCommon: CitationMatch["knownCommon"] = [];
  const citedIds = new Set<string>();
  const sourceText = (input.primarySources ?? []).map((s) => nameKey([s.title, s.holder, s.citation, s.reference].filter(Boolean).join(" ")));
  for (const use of uses) {
    const refs = referencesForCitation(input.references, use);
    if (refs.length) {
      refs.forEach((r) => citedIds.add(r.id));
      matched.push({ use, refs });
      continue;
    }
    if (input.mode === 5 && DATA_SOURCE.test(use.author.trim())) continue;
    const key = nameKey(use.author);
    if (key.length >= 3 && sourceText.some((t) => t.includes(key))) continue;
    const known = input.knownCommon(use.author, use.year);
    // Note-style citations do not carry author-date markers, so a stray (Author, Year) in a note-style
    // report is treated the same as any other unmatched citation: fail. The Davis/Yamane WARN, which
    // only ever applies to author-date reports, is skipped.
    if (known && !input.noteStyle) knownCommon.push({ use, work: known.work });
    else unmatched.push(use);
  }
  // Endnote styles: each marker is a citation of the note it points to. The sentence around the marker is
  // what the note's work must support; a note naming a work that is on no list fails like any citation.
  if (citesInEndnotes(input.placement)) {
    for (const ch of input.chapters) {
      const notes = analyseChapterNotes(ch.text);
      const resolved = resolveNotes(notes, input.references);
      const failed = new Set<NoteEntry>();
      for (const m of notes.markers) {
        const entry = entryFor(notes, m);
        const refs = entry ? resolved.get(entry) : undefined;
        if (!entry || !refs || refs === "comment") continue; // no note (ST13's concern) or a note of comment
        const use: CitationUse = { chapter: ch.number, paragraph: null, sentence: m.sentence, author: `note ${m.local}`, year: "", raw: `(note ${m.local}: ${shortQuote(entry.text, 90)})` };
        uses.push(use);
        if (refs.length) {
          refs.forEach((r) => citedIds.add(r.id));
          matched.push({ use, refs });
          continue;
        }
        const key = nameKey(entry.text);
        if (sourceText.some((t) => t.length >= 12 && key.includes(t.slice(0, 40)))) continue; // an approved case or archive
        if (!failed.has(entry)) {
          failed.add(entry);
          unmatched.push(use);
        }
      }
    }
  }
  return {
    uses,
    matched,
    unmatched,
    knownCommon,
    uncited: input.references.filter((r) => !citedIds.has(r.id)),
    cited: input.references.filter((r) => citedIds.has(r.id)),
    noteStyle: Boolean(input.noteStyle),
    placement: input.placement ?? null,
  };
}

// ─── The AI batch: does the cited paper support the sentence? ────────────────

export type SupportVerdict = "SUPPORTS" | "PARTIALLY_SUPPORTS" | "DOES_NOT_SUPPORT" | "CANNOT_DETERMINE";

export interface SupportPair {
  index: number;
  chapter: number;
  paragraph: number | null;
  sentence: string;
  ref: GateReference;
}

export interface SupportResult extends SupportPair {
  verdict: SupportVerdict;
  reason: string;
}

export const MAX_SUPPORT_PAIRS_PER_CHAPTER = 40;
export const ABSTRACT_CHARS = 700;

/**
 * One chapter's distinct (sentence, reference) pairs, at most 40 spread evenly
 * through the chapter. Returns the pairs to check and how many there were.
 */
export function supportPairs(match: CitationMatch, chapter: number): { pairs: SupportPair[]; total: number } {
  const seen = new Set<string>();
  const all: Omit<SupportPair, "index">[] = [];
  for (const m of match.matched.filter((x) => x.use.chapter === chapter)) {
    for (const ref of m.refs) {
      const key = `${ref.id}\u0000${m.use.sentence}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push({ chapter, paragraph: m.use.paragraph, sentence: m.use.sentence, ref });
    }
  }
  const step = all.length > MAX_SUPPORT_PAIRS_PER_CHAPTER ? all.length / MAX_SUPPORT_PAIRS_PER_CHAPTER : 1;
  const picked = step === 1 ? all : Array.from({ length: MAX_SUPPORT_PAIRS_PER_CHAPTER }, (_, i) => all[Math.floor(i * step)]);
  return { pairs: picked.map((p, i) => ({ ...p, index: i + 1 })), total: all.length };
}

export const SUPPORT_TOOL_NAME = "record_citation_support";

export const SUPPORT_TOOL = {
  name: SUPPORT_TOOL_NAME,
  description: "Record, for every numbered citation, whether the cited source supports the claim in its sentence.",
  input_schema: {
    type: "object",
    properties: {
      verdicts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            verdict: { type: "string", enum: ["SUPPORTS", "PARTIALLY_SUPPORTS", "DOES_NOT_SUPPORT", "CANNOT_DETERMINE"] },
            reason: { type: "string", description: "One sentence, at most 25 words." },
          },
          required: ["index", "verdict", "reason"],
        },
      },
    },
    required: ["verdicts"],
  },
} as const;

/** The verdicts, one per pair; a pair the model skipped is CANNOT_DETERMINE. */
export function readSupportVerdicts(raw: unknown, pairs: SupportPair[]): SupportResult[] {
  let list: unknown = (raw as { verdicts?: unknown } | null)?.verdicts;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = [];
    }
  }
  const byIndex = new Map<number, { verdict: SupportVerdict; reason: string }>();
  const allowed = new Set(["SUPPORTS", "PARTIALLY_SUPPORTS", "DOES_NOT_SUPPORT", "CANNOT_DETERMINE"]);
  for (const v of (Array.isArray(list) ? list : []) as Record<string, unknown>[]) {
    const i = Number(v?.index);
    if (!Number.isInteger(i) || !allowed.has(String(v?.verdict))) continue;
    byIndex.set(i, { verdict: v.verdict as SupportVerdict, reason: typeof v.reason === "string" ? v.reason.trim() : "" });
  }
  return pairs.map((p) => ({ ...p, ...(byIndex.get(p.index) ?? { verdict: "CANNOT_DETERMINE" as const, reason: "No verdict returned." }) }));
}

/** A pair whose reference has no abstract is decided without a call. */
export const noAbstract = (p: SupportPair) => !(p.ref.abstract && p.ref.abstract.trim().length >= 40);

export const DOES_NOT_SUPPORT_LIMIT = 0.15;
export const CANNOT_DETERMINE_LIMIT = 0.15;

const cite = (u: CitationUse) => u.raw.startsWith("(") ? u.raw : `${u.author} (${u.year})`;
const refLabel = (r: GateReference) => `${(r.authors ?? "").split(";")[0]?.split(",")[0] ?? "?"} (${r.year ?? "n.d."})`;

/** The one reference check. */
export function referenceCheck(match: CitationMatch, support: { results: SupportResult[]; checked: number; total: number }): CheckResult {
  const issues: QualityIssue[] = [];
  for (const u of match.unmatched) {
    issues.push({
      level: "FAIL",
      message: `${cite(u)} is cited but is not among the verified references.`,
      chapter: u.chapter,
      paragraph: u.paragraph,
      quote: shortQuote(u.sentence, 200),
      fix: "Cite only works on the verified reference list, or replace it with one that is.",
    });
  }
  for (const k of match.knownCommon) {
    issues.push({
      level: "WARN",
      message: `${k.use.author} (${k.use.year}) is cited but is not among the verified references. It is ${k.work}; add it to the reference list by hand.`,
      chapter: k.use.chapter,
      paragraph: k.use.paragraph,
      quote: shortQuote(k.use.sentence, 200),
      fix: `Add the full ${k.use.author} (${k.use.year}) entry to the References.`,
    });
  }
  // Relevance: the research step classified every kept reference; a cited one must be CORE or CLOSELY_RELATED.
  for (const r of match.cited.filter((c) => c.classification && !["CORE", "CLOSELY_RELATED"].includes(c.classification))) {
    issues.push({ level: "FAIL", message: `${refLabel(r)} is cited but the research step rated it ${r.classification}.`, quote: r.title ?? r.proposedTitle, fix: "Replace it with a CORE or closely related reference." });
  }
  const judged = support.results.filter((r) => r.verdict !== "CANNOT_DETERMINE");
  const against = support.results.filter((r) => r.verdict === "DOES_NOT_SUPPORT");
  const unsure = support.results.filter((r) => r.verdict === "CANNOT_DETERMINE");
  const tooMany = support.checked > 0 && against.length / support.checked > DOES_NOT_SUPPORT_LIMIT;
  for (const r of against) {
    issues.push({
      level: tooMany ? "FAIL" : "WARN",
      message: `${refLabel(r.ref)} does not support the sentence citing it${r.reason ? `: ${r.reason}` : "."}`,
      chapter: r.chapter,
      paragraph: r.paragraph,
      quote: shortQuote(r.sentence, 200),
      fix: "Cite a source that supports this claim, or change the claim to what the source says.",
    });
  }
  for (const r of support.results.filter((x) => x.verdict === "PARTIALLY_SUPPORTS").slice(0, 10)) {
    issues.push({ level: "WARN", message: `${refLabel(r.ref)} only partly supports its sentence${r.reason ? `: ${r.reason}` : "."}`, chapter: r.chapter, paragraph: r.paragraph, quote: shortQuote(r.sentence, 200), fix: "Check the claim against the paper." });
  }
  if (support.checked > 0 && unsure.length / support.checked > CANNOT_DETERMINE_LIMIT) {
    issues.push({ level: "WARN", message: `${unsure.length} of ${support.checked} citations could not be judged (no abstract, or too little in it).`, fix: "Check those citations against the papers." });
  }
  const core = match.cited.filter((c) => c.classification === "CORE").length;
  const close = match.cited.filter((c) => c.classification === "CLOSELY_RELATED").length;
  const pct = (n: number) => (match.cited.length ? Math.round((n / match.cited.length) * 100) : 0);
  const supported = judged.filter((r) => r.verdict === "SUPPORTS").length;
  const summary = [
    `${match.cited.length} verified references cited (${pct(core)}% CORE, ${pct(close)}% CLOSELY_RELATED)`,
    `${match.unmatched.length} unmatched citation${match.unmatched.length === 1 ? "" : "s"}`,
    support.checked ? `support checked on ${support.checked} of ${support.total} citations: ${supported} support, ${against.length} do not` : "no citation support check",
    `${match.uncited.length} verified reference${match.uncited.length === 1 ? "" : "s"} not cited`,
  ].join("; ");
  return result({ id: "REF", layer: "reference", title: "Reference verification (Tier 2)", severity: "MAJOR" }, issues, { pass: `${summary}.`, fail: `${summary}.` });
}
