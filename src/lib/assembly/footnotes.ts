/**
 * MODE_C: real Word footnotes at the foot of each page (NALT and doctrinal Law).
 *
 * A chapter is written in parts, and each part ends with a [FOOTNOTES] block
 * listing the notes its markers use ("3. Full note"). collectFootnotes walks the
 * chapters in order, gives every marker its own footnote numbered 1..N across
 * the whole report, rewrites each marker to ^N and takes the blocks out of the
 * chapter text. The assembly then turns each ^N into a Word footnote reference.
 *
 * Unlike MODE_B document endnotes, nothing is merged: Word gives every reference
 * its own footnote, and NALT repeats a source with "ibid" or "(n X)" rather than
 * sharing one number between two places in the text. Pure: no database, no docx.
 */

import { analyseChapterNotes, entryFor, noteKey } from "./endnotes";

export interface CollectedFootnotes {
  /** The chapters with their note blocks taken out and every marker rewritten to ^N. */
  chapters: { number: number; text: string }[];
  /** Every footnote, numbered 1..N in the order its marker appears in the report. */
  notes: { number: number; text: string }[];
  /** "Chapter 2, note 7": a marker whose note was not written (its marker is removed). */
  dangling: string[];
  /** "Chapter 3, note 4": a note no marker uses (left out). */
  unused: string[];
  /** Markers that reused a note another marker had already used: each still gets its own footnote. */
  repeated: number;
  markers: number;
}

/** One numbered sequence of footnotes for the whole report. */
export function collectFootnotes(chapters: { number: number; text: string }[]): CollectedFootnotes {
  const notes: CollectedFootnotes["notes"] = [];
  const out: CollectedFootnotes = { chapters: [], notes, dangling: [], unused: [], repeated: 0, markers: 0 };
  for (const ch of [...chapters].sort((a, b) => a.number - b.number)) {
    const text = ch.text.replace(/\r\n?/g, "\n");
    const found = analyseChapterNotes(text);
    const lines = text.split("\n");
    const edits = new Map<number, { start: number; end: number; with: string }[]>();
    const used = new Set<(typeof found.entries)[number]>();
    for (const m of found.markers) {
      out.markers++;
      const entry = entryFor(found, m);
      let replacement = "";
      if (!entry) {
        out.dangling.push(`Chapter ${String(ch.number)}, note ${String(m.local)}`);
      } else {
        if (used.has(entry)) out.repeated++;
        used.add(entry);
        const number = notes.length + 1;
        notes.push({ number, text: entry.text });
        replacement = `^${String(number)}`;
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
    for (const e of found.entries) if (!used.has(e)) out.unused.push(`Chapter ${String(ch.number)}, note ${String(e.local)}`);
    const kept = lines.filter((_, i) => !found.blockLines.has(i));
    out.chapters.push({ number: ch.number, text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() });
  }
  return out;
}

/**
 * How many distinct works the footnotes cite: the same note written twice counts
 * once, so ST12's reference count is honest even where a source is repeated in
 * full rather than cross-referenced.
 */
export function distinctFootnoteCount(chapters: { number: number; text: string }[]): number {
  const keys = new Set<string>();
  for (const ch of chapters) for (const e of analyseChapterNotes(ch.text).entries) keys.add(noteKey(e.text));
  return keys.size;
}

/** The footnotes a single chapter carries, numbered from 1, for a chapter-only document. */
export function chapterFootnotes(chapter: { number: number; text: string }): CollectedFootnotes {
  return collectFootnotes([chapter]);
}
