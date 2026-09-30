/**
 * Phase D7: a generated chapter's text (D2's output format) as blocks for the
 * Word document. Pure.
 *
 * The markup it reads (chapter-plan.ts GENERATION_TEXT.outputFormat and the
 * Chapter 3 prompt's AI AGENT OUTPUT FORMAT):
 *   [H1] CHAPTER TWO / [H1] LITERATURE REVIEW   chapter lines (first part only)
 *   [H2] 2.1 Introduction / [H3] 2.1.1 ...        sections; also unmarked "2.1 Title" or "**2.1 Title**"
 *   paragraphs separated by a blank line; lists as "i." / "1." / bullet lines
 *   Table 4.1: caption, pipe rows (| a | b |, |---|), Source: line; or [TABLE] caption | rows [/TABLE]
 *   [FIGURE PLACEHOLDER: ...] + Figure 3.1: caption; or [FIG] ... | caption [/FIG]
 *   [EQ] equation | 3.1 [/EQ], [Equation 3.1: ...], or an equation alone on its line
 *   [ENDNOTES] numbered notes (citation Modes A and B; one block per part, each ending at its first non-entry line)
 *   [AGENT REPORT] (split off at generation; dropped here if it ever arrives)
 */

import { splitEquationNumber, superscriptNumber } from "./text-rules";

export type Block =
  | { kind: "heading"; level: 2 | 3; text: string; tooDeep?: boolean }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: { marker: string; text: string }[] }
  | { kind: "equation"; text: string; modelNumber: string | null }
  | { kind: "table"; caption: string | null; header: string[]; rows: string[][]; source: string | null }
  /** A figure: a [FIGURE PLACEHOLDER] still to be drawn, or (chapter review) a picture from an approved upload. */
  | { kind: "figure"; placeholder: string; caption: string | null; source: string | null; image?: { key: string; width: number; height: number } }
  | { kind: "endnotes"; lines: string[] };

export interface ParsedChapter {
  /** The model's chapter title line ("LITERATURE REVIEW"), when it wrote one. */
  title: string | null;
  blocks: Block[];
  /** Things the specialist or QA should look at, in plain words. */
  warnings: string[];
}

const HEADING_MARKER = /^\s*\[(H[123])\]\s*(.*)$/;
const CHAPTER_LINE = /^CHAPTER\s+(?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|\d+)\b/i;
const TABLE_CAPTION = /^\**\s*Table\s+(\d+(?:\.\d+)?)\s*[:.\-–—]?\s*(.*?)\s*\**$/i;
const FIGURE_CAPTION = /^\**\s*Fig(?:ure|\.)?\s+(\d+(?:\.\d+)?)\s*[:.\-–—]?\s*(.*?)\s*\**$/i;
const SOURCE_LINE = /^\(?\**\s*Sources?\s*:\s*(.+?)\**\)?\s*$/i;
const FIGURE_PLACEHOLDER = /\[FIGURE PLACEHOLDER:[^\]]*\]/i;
/** Chapter review: a picture from the approved upload, "[IMAGE: word/media/image1.png | 480x320]" (read-chapter-docx.ts). */
export const IMAGE_LINE = /^\[IMAGE:\s*([^|\]]+?)\s*\|\s*(\d{1,5})x(\d{1,5})\s*\]$/;
const FIGURE_START = (line: string) => FIGURE_PLACEHOLDER.test(line) || IMAGE_LINE.test(line.trim());
const LIST_LINE = /^\s*(?:((?:[ivxlc]{1,6}|\d{1,2}|[a-z])[.)])|([•▪◦\-–*]))\s+(.+)$/i;
const NUMBERED_HEADING = /^\**\s*(\d+(?:\.\d+){1,4})\.?\s+(\S.*?)\s*\**:?$/;

/** An [ENDNOTES] block's opening line; anything after the tag on the same line is its first entry. */
export const ENDNOTES_START = /^\s*\[ENDNOTES\]\s*(.*)$/i;
/** One endnote entry: "3. Full note" or "3) Full note". */
export const ENDNOTE_ENTRY = /^\s*\**\s*(\d{1,3})[.)]\s+(\S.*)$/;
/** One endnote entry written with a superscript number, "³ Full note" (the prompt files' own example). */
export const ENDNOTE_ENTRY_SUPERSCRIPT = /^\s*([⁰¹²³⁴⁵⁶⁷⁸⁹]{1,3})\s+(\S.*)$/;
/** The entry's number and text, or null when the line is not an endnote entry. */
export function endnoteEntry(line: string): { number: number; text: string } | null {
  const m = ENDNOTE_ENTRY.exec(line);
  if (m) return { number: Number(m[1]), text: m[2].trim() };
  const s = ENDNOTE_ENTRY_SUPERSCRIPT.exec(line);
  return s ? { number: superscriptNumber(s[1]), text: s[2].trim() } : null;
}

function stripEmphasis(s: string): string {
  return s.replace(/^\s*[#*\s]+/, "").replace(/[*\s]+$/, "").trim();
}

/** Heading level from the section number: 2.1 -> 2, 2.1.1 -> 3, deeper is not allowed (H4) and becomes 3. */
function levelFromNumber(text: string): { level: 2 | 3; tooDeep: boolean } | null {
  const m = /^(\d+(?:\.\d+)+)\.?\s/.exec(text);
  if (!m) return null;
  const dots = m[1].split(".").length - 1;
  if (dots <= 1) return { level: 2, tooDeep: false };
  return { level: 3, tooDeep: dots >= 3 };
}

function isPipeRow(line: string): boolean {
  const t = line.trim();
  if (!t.includes("|")) return false;
  if (/^\[(?:EQ|TABLE|FIG)\]/i.test(t) || IMAGE_LINE.test(t)) return false;
  return t.split("|").filter((c) => c.trim() !== "").length >= 2 || /^\|?\s*:?-{3,}/.test(t);
}

const isAlignmentRow = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);

export function parsePipeTable(lines: string[]): { header: string[]; rows: string[][] } {
  const cells = (l: string) => {
    let t = l.trim();
    if (t.startsWith("|")) t = t.slice(1);
    if (t.endsWith("|")) t = t.slice(0, -1);
    return t.split("|").map((c) => c.trim());
  };
  const rows = lines.filter((l) => !isAlignmentRow(l)).map(cells);
  const width = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => [...r, ...Array(Math.max(0, width - r.length)).fill("")]);
  return { header: padded[0] ?? [], rows: padded.slice(1) };
}

/**
 * An equation standing alone on its line: it has a relation sign, no more than
 * a couple of ordinary lower-case words (a sentence has many), and does not
 * start like a definition ("where ...").
 */
export function detectEquationLine(line: string): { text: string; number: string | null } | null {
  const t = line.trim().replace(/^\$+|\$+$/g, "").trim();
  const bracketed = /^\[\s*Equation\s+(\d+\.\d+)\s*:\s*(.+?)\s*\]$/i.exec(t);
  if (bracketed) return { text: bracketed[2], number: bracketed[1] };
  if (t.length > 220 || !/[=≈≤≥]/.test(t)) return null;
  if (/^(where|in which|here|thus|therefore|hence|such that|and|with)\b/i.test(t)) return null;
  if (/[.!?]\s+[A-Z]/.test(t)) return null;
  const { text, number } = splitEquationNumber(t);
  const proseWords = (text.match(/\b[a-z]{4,}\b/g) ?? []).filter((w) => !["log", "exp", "sin", "cos", "tan", "lim", "max", "min"].includes(w));
  if (proseWords.length > 2) return null;
  // "n = sample size", "N = population of the study (4,200)": a symbol defined in words, not an equation.
  const rhs = text.slice(text.search(/[=≈≤≥]/) + 1);
  if (!/[+−\-×·*/^²³√∑Σ=]/.test(rhs.replace(/\(\s*[\d.,]+\s*\)/g, "")) && /\b[a-z]{3,}\b/.test(rhs)) return null;
  if (/[:;]\s*$/.test(text)) return null;
  return { text: text.replace(/[.,]\s*$/, ""), number };
}

/** Tagged blocks that can span lines, lifted out before the line-by-line pass. */
function liftTaggedBlocks(text: string, blocks: Block[], warnings: string[]): string {
  return text.replace(/\[(EQ|TABLE|FIG)\]([\s\S]*?)\[\/\1\]/gi, (_m, tag: string, bodyRaw: string) => {
    const body = bodyRaw.trim();
    let block: Block | null = null;
    if (tag.toUpperCase() === "EQ") {
      const cut = body.lastIndexOf("|");
      const eq = cut === -1 ? body : body.slice(0, cut).trim();
      const num = cut === -1 ? null : body.slice(cut + 1).trim().replace(/^\(|\)$/g, "");
      const split = splitEquationNumber(eq);
      block = { kind: "equation", text: split.text, modelNumber: /^\d+\.\d+$/.test(num ?? "") ? num : split.number };
    } else if (tag.toUpperCase() === "TABLE") {
      const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
      let caption: string | null = null;
      let rowLines = lines;
      if (lines.length > 1 && !lines[0].startsWith("|")) {
        caption = lines[0].replace(/\|\s*$/, "").trim();
        rowLines = lines.slice(1);
      } else if (lines.length === 1) {
        const [cap, ...rest] = lines[0].split(/\s\|\s/);
        caption = cap.trim();
        rowLines = rest.length ? [rest.join(" | ")] : [];
      }
      const source = rowLines.length && SOURCE_LINE.test(rowLines[rowLines.length - 1]) ? SOURCE_LINE.exec(rowLines.pop()!)![1] : null;
      const parsed = parsePipeTable(rowLines.filter(isPipeRow));
      if (!parsed.header.length) warnings.push(`A [TABLE] block had no readable rows: "${(caption ?? body).slice(0, 60)}"`);
      block = { kind: "table", caption, ...parsed, source };
    } else {
      const cut = body.lastIndexOf("|");
      const placeholder = (cut === -1 ? body : body.slice(0, cut)).trim();
      const caption = cut === -1 ? null : body.slice(cut + 1).trim();
      block = { kind: "figure", placeholder: FIGURE_PLACEHOLDER.test(placeholder) ? placeholder : `[FIGURE PLACEHOLDER: ${placeholder.replace(/^\[|\]$/g, "")}]`, caption: caption || null, source: null };
    }
    blocks.push(block);
    return `\n\u0000${blocks.length - 1}\u0000\n`;
  });
}

/** An unmarked "2.1 Title" line is a heading only when it carries this chapter's number and reads like a title. */
function isUnmarkedHeading(trimmed: string, chapter: number | null): boolean {
  const m = NUMBERED_HEADING.exec(trimmed);
  if (!m || trimmed.length > 160) return false;
  if (chapter !== null && Number(m[1].split(".")[0]) !== chapter) return false;
  if (/[.!?,;]\s*\**$/.test(trimmed)) return false;
  return /^[A-Z("'‘“]/.test(m[2]);
}

/** The next non-empty line after `i`, or null. */
function nextLine(lines: string[], i: number): string | null {
  for (let k = i + 1; k < lines.length; k++) if (lines[k].trim()) return lines[k].trim();
  return null;
}

export function parseChapter(raw: string, chapter: number | null = null): ParsedChapter {
  const warnings: string[] = [];
  const lifted: Block[] = [];
  let text = raw.replace(/\r\n?/g, "\n");
  const report = text.search(/^\s*\[AGENT REPORT\]/m);
  if (report !== -1) text = text.slice(0, report);
  text = liftTaggedBlocks(text, lifted, warnings);

  const lines = text.split("\n");
  const blocks: Block[] = [];
  let title: string | null = null;
  let para: string[] = [];
  let list: { marker: string; text: string }[] = [];
  let pendingTableCaption: string | null = null;
  let pendingFigureCaption: string | null = null;
  let endnotes: string[] | null = null;
  let seenBody = false;

  const flushList = () => {
    if (list.length) blocks.push({ kind: "list", items: list });
    list = [];
  };
  // Claude writes each paragraph on one line, so a line inside a block is a line of its own
  // ("where:" then "n = sample size", a signature, an equation between two sentences).
  const flushPara = () => {
    for (const line of para) {
      const eq = detectEquationLine(line);
      if (eq) blocks.push({ kind: "equation", text: eq.text, modelNumber: eq.number });
      else blocks.push({ kind: "paragraph", text: line.replace(/\s+/g, " ").trim() });
    }
    para = [];
  };
  const flushCaptions = () => {
    if (pendingTableCaption) {
      warnings.push(`A table caption had no table under it: "${pendingTableCaption.slice(0, 60)}"`);
      blocks.push({ kind: "paragraph", text: pendingTableCaption });
      pendingTableCaption = null;
    }
  };
  const flush = () => {
    flushPara();
    flushList();
  };
  const lastBlock = () => blocks[blocks.length - 1];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flush();
      continue;
    }

    // A lifted [EQ]/[TABLE]/[FIG] block.
    const sentinel = /^\u0000(\d+)\u0000$/.exec(trimmed);
    if (sentinel) {
      flush();
      const block = lifted[Number(sentinel[1])];
      if (block.kind === "table" && !block.caption && pendingTableCaption) {
        block.caption = pendingTableCaption;
        pendingTableCaption = null;
      }
      if (block.kind === "figure" && !block.caption && pendingFigureCaption) {
        block.caption = pendingFigureCaption;
        pendingFigureCaption = null;
      }
      flushCaptions();
      blocks.push(block);
      seenBody = true;
      continue;
    }

    const notesStart = ENDNOTES_START.exec(trimmed);
    if (notesStart) {
      flush();
      flushCaptions();
      endnotes = [];
      blocks.push({ kind: "endnotes", lines: endnotes });
      if (notesStart[1]) endnotes.push(notesStart[1].trim());
      continue;
    }
    // A block of notes ends at its first line that is not a numbered entry: a chapter written in
    // parts carries one block per part, and the next part's text must not be read as notes.
    if (endnotes && !endnoteEntry(trimmed)) endnotes = null;

    const marker = HEADING_MARKER.exec(trimmed);
    const unmarked = !marker && para.length === 0 && isUnmarkedHeading(trimmed, chapter);
    const isChapterLine = !marker && !seenBody && (CHAPTER_LINE.test(stripEmphasis(trimmed)) || (blocks.length === 0 && para.length === 0 && title === null && /^[A-Z][A-Z ,&'’\-()]{3,}$/.test(stripEmphasis(trimmed)) && lastWasChapterLine(lines, i)));
    if (marker || isChapterLine || unmarked) {
      const level = marker ? marker[1] : isChapterLine ? "H1" : "H2";
      const headingText = stripEmphasis(marker ? marker[2] : trimmed);
      if (level === "H1" || (isChapterLine && !marker)) {
        if (!CHAPTER_LINE.test(headingText) && headingText) {
          if (seenBody) {
            // An [H1] in the middle of a chapter is really a section.
            flush();
            flushCaptions();
            const byNumber = levelFromNumber(headingText);
            blocks.push({ kind: "heading", level: byNumber?.level ?? 2, text: headingText });
            warnings.push(`An [H1] line inside the chapter was set as a section heading: "${headingText.slice(0, 60)}"`);
          } else if (title === null) title = headingText;
        }
        continue;
      }
      if (!headingText) continue;
      flush();
      flushCaptions();
      endnotes = null;
      const byNumber = levelFromNumber(headingText);
      const markerLevel: 2 | 3 = level === "H3" ? 3 : 2;
      const finalLevel = byNumber?.level ?? markerLevel;
      if (byNumber?.tooDeep) warnings.push(`A fourth heading level is not allowed (rule H4); set as a sub-section: "${headingText.slice(0, 60)}"`);
      blocks.push({ kind: "heading", level: finalLevel, text: headingText, ...(byNumber?.tooDeep ? { tooDeep: true } : {}) });
      seenBody = true;
      continue;
    }

    seenBody = true;

    if (endnotes) {
      endnotes.push(trimmed);
      continue;
    }

    if (isPipeRow(trimmed)) {
      flush();
      const rows: string[] = [trimmed];
      while (i + 1 < lines.length && isPipeRow(lines[i + 1].trim())) rows.push(lines[++i].trim());
      if (rows.length < 2 && !pendingTableCaption) {
        para.push(trimmed);
        continue;
      }
      const table = parsePipeTable(rows);
      let source: string | null = null;
      // The source line may follow directly, or after one blank line.
      for (let k = i + 1; k < Math.min(lines.length, i + 3); k++) {
        const next = lines[k].trim();
        if (!next) continue;
        const sm = SOURCE_LINE.exec(next);
        if (sm) {
          source = sm[1];
          i = k;
        }
        break;
      }
      blocks.push({ kind: "table", caption: pendingTableCaption, header: table.header, rows: table.rows, source });
      pendingTableCaption = null;
      continue;
    }

    const tableCaption = TABLE_CAPTION.exec(trimmed);
    const tableFollows = (() => {
      const next = nextLine(lines, i);
      return next !== null && (isPipeRow(next) || /^\u0000\d+\u0000$/.test(next));
    })();
    if (tableCaption && tableCaption[2] && trimmed.length <= 220 && tableFollows) {
      flush();
      flushCaptions();
      pendingTableCaption = stripEmphasis(trimmed);
      continue;
    }

    const image = IMAGE_LINE.exec(trimmed);
    if (image) {
      flush();
      blocks.push({ kind: "figure", placeholder: "", caption: pendingFigureCaption, source: null, image: { key: image[1], width: Number(image[2]), height: Number(image[3]) } });
      pendingFigureCaption = null;
      continue;
    }

    if (FIGURE_PLACEHOLDER.test(trimmed)) {
      flush();
      const placeholder = FIGURE_PLACEHOLDER.exec(trimmed)![0];
      const rest = trimmed.replace(FIGURE_PLACEHOLDER, "").trim();
      const inlineCaption = FIGURE_CAPTION.exec(rest) ? stripEmphasis(rest) : null;
      blocks.push({ kind: "figure", placeholder, caption: inlineCaption ?? pendingFigureCaption, source: null });
      pendingFigureCaption = null;
      continue;
    }

    const figureCaption = FIGURE_CAPTION.exec(trimmed);
    if (figureCaption && figureCaption[2] && trimmed.length <= 260) {
      flush();
      const last = lastBlock();
      if (last?.kind === "figure" && !last.caption) last.caption = stripEmphasis(trimmed);
      else if (FIGURE_START(lines[i + 1] ?? "") || FIGURE_START(lines[i + 2] ?? "")) pendingFigureCaption = stripEmphasis(trimmed);
      else blocks.push({ kind: "paragraph", text: trimmed });
      continue;
    }

    const source = SOURCE_LINE.exec(trimmed);
    if (source) {
      const last = lastBlock();
      if (!para.length && !list.length && (last?.kind === "table" || last?.kind === "figure") && !last.source) {
        last.source = source[1];
        continue;
      }
    }

    const li = LIST_LINE.exec(line);
    if (li && !(li[2] && li[2] === "*" && /\*$/.test(li[3]))) {
      // A roman "i." list must not swallow a sentence that starts "I." ... it only counts inside a list or after a colon.
      const startsList = list.length > 0 || para.length === 0 || /:\s*$/.test(para[para.length - 1] ?? "");
      if (startsList) {
        flushPara();
        list.push({ marker: li[1] ?? "•", text: li[3].trim() });
        continue;
      }
    }

    if (list.length) flushList();
    para.push(trimmed);
  }
  flush();
  flushCaptions();
  if (pendingFigureCaption) blocks.push({ kind: "paragraph", text: pendingFigureCaption });

  return { title, blocks: blocks.filter((b) => !(b.kind === "endnotes" && b.lines.length === 0)), warnings };
}

/** An ALL-CAPS line counts as the chapter title only straight after a "CHAPTER N" line. */
function lastWasChapterLine(lines: string[], i: number): boolean {
  for (let k = i - 1; k >= 0; k--) {
    const t = lines[k].trim();
    if (!t) continue;
    return CHAPTER_LINE.test(stripEmphasis(t.replace(HEADING_MARKER, "$2")));
  }
  return false;
}
