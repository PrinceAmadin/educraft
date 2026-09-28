/**
 * Note-style citations (MODE_A chapter endnotes, MODE_B document endnotes).
 *
 * A chapter is written in parts, and each part ends with an [ENDNOTES] block
 * listing the notes its markers use ("3. Full note"). A marker in the body is
 * resolved against the FIRST block after it, so a part that restarts its
 * numbering at 1 still resolves correctly.
 *
 * For MODE_B, collectEndnotes joins every chapter's notes into one list:
 * exact duplicate entries become one note (Chicago short-form repeats stay
 * separate), notes are numbered 1..N in order of first appearance across the
 * report, each marker is rewritten to its new number, and the blocks are taken
 * out of the chapters. Pure: no database, no docx.
 */

import { detectEquationLine, ENDNOTES_START, endnoteEntry } from "./parse-chapter";
import { IBID, noteCitesAWork, referencesForNote, superscriptNumber, type CitableReference } from "./text-rules";

/**
 * A note marker: ^3, ^{12}, ^[3], a trailing [3], or superscript digits (³). It
 * counts only straight after punctuation or a word of three or more letters,
 * so R^2, e^2, m² and cm² stay what they are.
 */
const MARKER = /(?<=[.,;:!?)"'’”]|\p{L}{3})(?:\^\{(\d{1,3})\}|\^\[(\d{1,3})\]|\^(\d{1,3})(?!\d)|\[(\d{1,3})\](?![\p{L}\d])|([⁰¹²³⁴⁵⁶⁷⁸⁹]{1,3})(?![\p{L}\d]))/gu;
const HEADING_LINE = /^\s*\[H[123]\]/;
const AGENT_REPORT = /^\s*\[AGENT REPORT\]/i;

export interface NoteMarker {
  line: number;
  start: number;
  end: number;
  /** The number as the chapter wrote it. */
  local: number;
  /** Which [ENDNOTES] block (0-based) resolves it; -1 when no block follows it. */
  block: number;
  /** The sentence the marker sits in, markers removed. */
  sentence: string;
}

export interface NoteEntry {
  block: number;
  local: number;
  text: string;
  line: number;
}

export interface ChapterNotes {
  markers: NoteMarker[];
  entries: NoteEntry[];
  /** Lines that belong to [ENDNOTES] blocks (the tag line, entries and blank lines inside). */
  blockLines: Set<number>;
}

/** The entry a marker points to, or undefined (a marker with no note). */
export function entryFor(notes: ChapterNotes, m: NoteMarker): NoteEntry | undefined {
  return m.block < 0 ? undefined : notes.entries.find((e) => e.block === m.block && e.local === m.local);
}

function sentenceAround(line: string, index: number): string {
  const before = line.slice(0, index);
  const start = Math.max(before.lastIndexOf(". "), before.lastIndexOf("? "), before.lastIndexOf("! "));
  const after = line.slice(index).search(/[.?!](?:\s|$)/);
  const end = after < 0 ? line.length : index + after + 1;
  return line
    .slice(start < 0 ? 0 : start + 2, end)
    .replace(MARKER, "")
    .replace(/\[H[123]\]\s*/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every note marker and every [ENDNOTES] entry in one chapter, each marker tied to the block after it. */
export function analyseChapterNotes(text: string): ChapterNotes {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const markers: NoteMarker[] = [];
  const entries: NoteEntry[] = [];
  const blockLines = new Set<number>();
  let blocks = 0;
  let inBlock = false;
  let inEquation = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (AGENT_REPORT.test(line)) break; // the end-of-chapter report is never part of the chapter
    if (inBlock) {
      if (!line.trim()) {
        blockLines.add(i);
        continue;
      }
      const entry = endnoteEntry(line);
      if (entry) {
        entries.push({ block: blocks - 1, local: entry.number, text: entry.text, line: i });
        blockLines.add(i);
        continue;
      }
      inBlock = false;
    }
    const start = ENDNOTES_START.exec(line);
    if (start) {
      for (const m of markers) if (m.block === -1) m.block = blocks;
      blocks++;
      inBlock = true;
      blockLines.add(i);
      const first = start[1] ? endnoteEntry(start[1]) : null;
      if (first) entries.push({ block: blocks - 1, local: first.number, text: first.text, line: i });
      continue;
    }
    if (HEADING_LINE.test(line)) continue;
    if (inEquation || /\[EQ\]/i.test(line)) {
      inEquation = !/\[\/EQ\]/i.test(line);
      continue;
    }
    if (detectEquationLine(line.trim())) continue;
    for (const m of line.matchAll(MARKER)) {
      const digits = m[1] ?? m[2] ?? m[3] ?? m[4];
      const local = digits ? Number(digits) : superscriptNumber(m[5]);
      const at = m.index ?? 0;
      markers.push({ line: i, start: at, end: at + m[0].length, local, block: -1, sentence: sentenceAround(line, at) });
    }
  }
  return { markers, entries, blockLines };
}

/** Two entries are the same note when their words match (case, spacing, emphasis and the closing full stop aside). */
export function noteKey(text: string): string {
  return text.replace(/\*/g, "").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "").toLowerCase();
}

export interface CollectedEndnotes {
  /** The chapters with their [ENDNOTES] blocks taken out and every marker rewritten to ^N. */
  chapters: { number: number; text: string }[];
  /** The one list, numbered 1..N in order of first appearance. */
  notes: { number: number; text: string }[];
  /** "Chapter 2, note 7": a marker with no entry after it (its marker is removed). */
  dangling: string[];
  /** "Chapter 3, note 4": an entry no marker uses (left out of the list). */
  unused: string[];
  /** Entries folded into an earlier identical note. */
  merged: number;
  markers: number;
}

/** MODE_B: one numbered list for the whole report. */
export function collectEndnotes(chapters: { number: number; text: string }[]): CollectedEndnotes {
  const byKey = new Map<string, number>();
  const notes: CollectedEndnotes["notes"] = [];
  const out: CollectedEndnotes = { chapters: [], notes, dangling: [], unused: [], merged: 0, markers: 0 };
  /** The entry that created each note, and the entries folded into one. */
  const owner = new Map<number, NoteEntry>();
  const mergedEntries = new Set<NoteEntry>();
  const ibidNumber = new Map<NoteEntry, number>();
  for (const ch of [...chapters].sort((a, b) => a.number - b.number)) {
    const text = ch.text.replace(/\r\n?/g, "\n");
    const found = analyseChapterNotes(text);
    const lines = text.split("\n");
    const edits = new Map<number, { start: number; end: number; with: string }[]>();
    const used = new Set<NoteEntry>();
    /** The joined number the chapter's previous marker got: what an "Ibid." note refers to. */
    let previous: number | null = null;
    for (const m of found.markers) {
      out.markers++;
      const entry = entryFor(found, m);
      let replacement = "";
      if (!entry) out.dangling.push(`Chapter ${ch.number}, note ${m.local}`);
      else if (IBID.test(entry.text) && previous !== null) {
        // "Ibid." is never joined with another "Ibid." (they name different works). It stays a note of its own
        // only when its work is the note just before it in the joined list; otherwise it reuses that work's number.
        used.add(entry);
        let number = ibidNumber.get(entry);
        if (number === undefined) {
          number = previous === notes.length ? notes.length + 1 : previous;
          if (number === notes.length + 1) notes.push({ number, text: entry.text });
          ibidNumber.set(entry, number);
        }
        replacement = `^${number}`;
        previous = number;
      } else {
        used.add(entry);
        // An "Ibid." with nothing before it in the chapter is kept as its own note, never joined with another.
        const key = IBID.test(entry.text) ? `ibid:${ch.number}:${entry.block}:${entry.local}` : noteKey(entry.text);
        let number = byKey.get(key);
        if (number === undefined) {
          number = notes.length + 1;
          byKey.set(key, number);
          owner.set(number, entry);
          notes.push({ number, text: entry.text });
        } else if (owner.get(number) !== entry && !mergedEntries.has(entry)) {
          // A different entry (another chapter's, or another part's) with the same words: one note.
          mergedEntries.add(entry);
          out.merged++;
        }
        replacement = `^${number}`;
        previous = number;
      }
      const list = edits.get(m.line) ?? [];
      list.push({ start: m.start, end: m.end, with: replacement });
      edits.set(m.line, list);
    }
    for (const [lineNo, list] of edits) {
      let s = lines[lineNo];
      for (const e of [...list].sort((a, b) => b.start - a.start)) s = s.slice(0, e.start) + e.with + s.slice(e.end);
      lines[lineNo] = s;
    }
    for (const e of found.entries) if (!used.has(e)) out.unused.push(`Chapter ${ch.number}, note ${e.local}`);
    const kept = lines.filter((_, i) => !found.blockLines.has(i));
    out.chapters.push({ number: ch.number, text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() });
  }
  return out;
}

/**
 * What each entry of a chapter cites: the verified references it names ("Ibid." takes the note before
 * it in the same block), or "comment" for a note that names no work (no year, DOI or link).
 */
export function resolveNotes<T extends CitableReference & { title?: string | null }>(notes: ChapterNotes, refs: T[]): Map<NoteEntry, T[] | "comment"> {
  const out = new Map<NoteEntry, T[] | "comment">();
  const ordered = [...notes.entries].sort((a, b) => a.block - b.block || a.local - b.local);
  let previous: { block: number; refs: T[] | "comment" } | null = null;
  for (const e of ordered) {
    let found: T[] | "comment";
    if (IBID.test(e.text) && previous && previous.block === e.block) found = previous.refs;
    else if (!noteCitesAWork(e.text)) {
      const named = referencesForNote(refs, e.text); // a Chicago short form has no year but still names a work
      found = named.length ? named : "comment";
    } else found = referencesForNote(refs, e.text);
    out.set(e, found);
    previous = { block: e.block, refs: found };
  }
  return out;
}

/** How many distinct notes the chapters carry (MODE_A counts each chapter's own; MODE_B the joined list). */
export function distinctNoteCount(chapters: { number: number; text: string }[], placement: "MODE_A" | "MODE_B"): number {
  if (placement === "MODE_B") return collectEndnotes(chapters).notes.length;
  return chapters.reduce((n, ch) => n + new Set(analyseChapterNotes(ch.text).entries.map((e) => noteKey(e.text))).size, 0);
}
