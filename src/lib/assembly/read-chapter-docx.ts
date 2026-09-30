/**
 * Chapter review: a chapter the specialist corrected in Word, read back into
 * the chapter text the report builder writes from (the D2 markup parse-chapter.ts
 * reads). The COO approves that upload, and the complete report is rebuilt from
 * this text, so one format, one table of contents and one set of numbers run
 * through the whole report and the 89 checks still apply.
 *
 * What is read, from the file's own XML:
 *   headings by their style's name ("heading 1".."heading 3", Title, or an outline
 *     level), never by the style id Word translates ("berschrift2"); Word's list
 *     and heading numbering rebuilt from numbering.xml
 *   text with italics, note numbers (^3) and sub- and superscripts (R², CO₂, f_{m});
 *     runs Word split are joined, fields keep what they show, tracked insertions
 *     are kept and deletions dropped, comments are ignored
 *   tables (the first row is the header), with their captions and Source lines;
 *     the builder's equation tables and any Word equation as [EQ] text
 *   pictures (PNG, JPG, GIF, BMP) as [IMAGE: key | WxH], the image kept in the file
 *   notes: the chapter's notes list and Word's own footnotes and endnotes, as ^N and [ENDNOTES]
 *   everything after a REFERENCES heading is left out (the list is rebuilt from the verified references)
 *
 * What stops approval (`blocking`): content that would be lost (an EMF/WMF or
 * linked picture, a live chart, SmartArt, an embedded object, a drawing group),
 * a file stamped for another project or chapter. What is only reported (`flags`):
 * everything else that changes on the way (text boxes, inline maths, bold in the
 * body, merged table cells, Word caption numbers, tracked changes, comments).
 *
 * Pure apart from reading the zip: no database, no network.
 */

import crypto from "node:crypto";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { ommlToLinear, M_NS } from "./omml-to-linear";
import { endnoteEntry, parseChapter } from "./parse-chapter";
import { chapterWord, citedReferences, findPlaceholders, splitEquationNumber, type CitableReference } from "./text-rules";
import { knownCommonCitation } from "@/lib/quality/known-citations";

/** Bump when the reader's output changes, so stored read-backs are read again. */
export const READER_VERSION = 1;

/** Custom document properties the builder stamps on a chapter file (assemble.ts buildChapterDocument). */
export const CHAPTER_STAMP = { project: "EduCraftProject", chapter: "EduCraftChapter", source: "EduCraftSource" } as const;

/** The widest picture the page takes, in pixels at 96 dpi (6.27 inch text width). */
export const MAX_IMAGE_WIDTH_PX = 600;

export type ImageType = "png" | "jpg" | "gif" | "bmp";

export interface ReadAsset {
  /** The picture's path inside the .docx ("word/media/image1.png"): the [IMAGE: key] in the text. */
  key: string;
  type: ImageType;
  width: number;
  height: number;
  /** sha256 of the picture's bytes (a replaced picture changes the read-back's hash). */
  sha: string;
}

export interface ReadSummary {
  words: number;
  headings: number;
  tables: number;
  equations: number;
  figures: number;
  images: number;
  notes: number;
  wordNotes: number;
  trackedInsertions: number;
  trackedDeletions: number;
  comments: number;
  /** "CHAPTER THREE", as the file has it. */
  chapterLine: string | null;
  referencesSection: boolean;
  stamp: { project: string | null; chapter: number | null; source: string | null } | null;
  placeholders: string[];
  /** Author-date citations that match no verified reference (when the references were given). */
  unmatchedCitations: string[];
}

export interface ReadChapterResult {
  /** The chapter as builder markup. */
  markup: string;
  assets: ReadAsset[];
  summary: ReadSummary;
  blocking: string[];
  flags: string[];
  /** sha256 of the markup and the pictures: changes whenever what would be built changes. */
  hash: string;
  readerVersion: number;
}

export interface ReadChapterOptions {
  chapter: number;
  /** The project code the file should be stamped with (a file stamped for another project is refused). */
  projectCode?: string;
  /** The verified references: citations that match none are reported. */
  references?: readonly CitableReference[];
}

// ─── Namespaces and small DOM helpers ────────────────────────────────────────

const W = new Set(["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"]);
const M = new Set([M_NS, "http://purl.oclc.org/ooxml/officeDocument/math"]);
const R_NS = ["http://schemas.openxmlformats.org/officeDocument/2006/relationships", "http://purl.oclc.org/ooxml/officeDocument/relationships"];
const MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";

const ELEMENT = 1;

function kids(node: Node | null): Element[] {
  const out: Element[] = [];
  if (!node) return out;
  for (let i = 0; i < node.childNodes.length; i++) {
    const c = node.childNodes.item(i);
    if (c && c.nodeType === ELEMENT) out.push(c as Element);
  }
  return out;
}

const isW = (el: Element, local?: string) => W.has(el.namespaceURI ?? "") && (!local || el.localName === local);
const isM = (el: Element, local?: string) => M.has(el.namespaceURI ?? "") && (!local || el.localName === local);
const wKid = (el: Element | null, local: string) => (el ? (kids(el).find((c) => isW(c, local)) ?? null) : null);

/** Every descendant with this local name (any namespace). */
function descendants(el: Element, local: string): Element[] {
  const out: Element[] = [];
  const walk = (n: Element) => {
    for (const c of kids(n)) {
      if (c.localName === local) out.push(c);
      walk(c);
    }
  };
  walk(el);
  return out;
}

/** An attribute by local name ("w:val", "r:embed"), whatever its prefix. */
function attr(el: Element | null, local: string): string | null {
  if (!el) return null;
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes.item(i);
    if (a && (a.localName === local || a.name === local)) return a.value;
  }
  return null;
}

function relAttr(el: Element, local: string): string | null {
  for (const ns of R_NS) {
    const v = el.getAttributeNS(ns, local);
    if (v) return v;
  }
  return null;
}

/** A w:b / w:i style toggle: present = on unless its val says off. */
function toggle(el: Element | null): boolean | null {
  if (!el) return null;
  const v = attr(el, "val");
  return v === null || !["0", "false", "off", "none"].includes(v.toLowerCase());
}

function parseXml(xml: string): Document {
  const errors: string[] = [];
  const doc = new DOMParser({
    errorHandler: { warning: () => undefined, error: (m: string) => errors.push(m), fatalError: (m: string) => errors.push(m) },
  }).parseFromString(xml, "text/xml");
  if (errors.length && !doc.documentElement) throw new Error(`the XML could not be read (${errors[0]})`);
  return doc as unknown as Document;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

interface StyleInfo {
  id: string;
  name: string;
  type: string;
  basedOn: string | null;
  outlineLevel: number | null;
  italic: boolean | null;
  bold: boolean | null;
  vertAlign: string | null;
  numId: string | null;
  ilvl: number | null;
}

type Styles = Map<string, StyleInfo>;

function readStyles(xml: string | null): Styles {
  const styles: Styles = new Map();
  if (!xml) return styles;
  const doc = parseXml(xml);
  for (const s of descendants(doc.documentElement, "style")) {
    if (!isW(s)) continue;
    const id = attr(s, "styleId") ?? "";
    const pPr = wKid(s, "pPr");
    const rPr = wKid(s, "rPr");
    const numPr = wKid(pPr, "numPr");
    const info: StyleInfo = {
      id,
      name: (attr(wKid(s, "name"), "val") ?? id).trim(),
      type: attr(s, "type") ?? "paragraph",
      basedOn: attr(wKid(s, "basedOn"), "val"),
      outlineLevel: attr(wKid(pPr, "outlineLvl"), "val") !== null ? Number(attr(wKid(pPr, "outlineLvl"), "val")) : null,
      italic: toggle(wKid(rPr, "i")),
      bold: toggle(wKid(rPr, "b")),
      vertAlign: attr(wKid(rPr, "vertAlign"), "val"),
      numId: attr(wKid(numPr, "numId"), "val"),
      ilvl: attr(wKid(numPr, "ilvl"), "val") !== null ? Number(attr(wKid(numPr, "ilvl"), "val")) : null,
    };
    styles.set(id, info);
  }
  return styles;
}

/** A style and the ones it is based on, nearest first (a loop is cut). */
function styleChain(styles: Styles, id: string | null): StyleInfo[] {
  const out: StyleInfo[] = [];
  const seen = new Set<string>();
  let cur = id;
  while (cur && !seen.has(cur) && out.length < 12) {
    seen.add(cur);
    const s = styles.get(cur);
    if (!s) break;
    out.push(s);
    cur = s.basedOn;
  }
  return out;
}

type ParaRole =
  | { kind: "heading"; level: number }
  | { kind: "caption"; of: "table" | "figure" | "any" }
  | { kind: "toc" }
  | { kind: "body" };

/** What a paragraph is, from its style's NAME (Word keeps built-in names in English whatever the language). */
function roleFor(styles: Styles, styleId: string | null, ownOutline: number | null): ParaRole {
  const chain = styleChain(styles, styleId);
  for (const s of chain) {
    const name = s.name.toLowerCase();
    const h = /^heading\s*([1-9])$/.exec(name);
    if (h) return { kind: "heading", level: Number(h[1]) };
    if (name === "title") return { kind: "heading", level: 1 };
    if (/^toc\s*\d$|^toc heading$|^table of figures$|^table of authorities$|^index \d$/.test(name)) return { kind: "toc" };
    if (name === "table caption") return { kind: "caption", of: "table" };
    if (name === "figure caption") return { kind: "caption", of: "figure" };
    if (name === "caption") return { kind: "caption", of: "any" };
  }
  const outline = ownOutline ?? chain.find((s) => s.outlineLevel !== null)?.outlineLevel ?? null;
  if (outline !== null && outline >= 0 && outline <= 8) return { kind: "heading", level: outline + 1 };
  return { kind: "body" };
}

// ─── Numbering ───────────────────────────────────────────────────────────────

interface Level {
  fmt: string;
  text: string;
  start: number;
}

interface Numbering {
  levels(numId: string): Level[] | null;
  counters: Map<string, number[]>;
  starts: Map<string, Map<number, number>>;
}

function readNumbering(xml: string | null): Numbering {
  const abstracts = new Map<string, Level[]>();
  const nums = new Map<string, string>();
  const starts = new Map<string, Map<number, number>>();
  if (xml) {
    const doc = parseXml(xml);
    for (const a of descendants(doc.documentElement, "abstractNum")) {
      if (!isW(a)) continue;
      const levels: Level[] = [];
      for (const l of kids(a).filter((k) => isW(k, "lvl"))) {
        const i = Number(attr(l, "ilvl") ?? levels.length);
        levels[i] = {
          fmt: attr(wKid(l, "numFmt"), "val") ?? "decimal",
          text: attr(wKid(l, "lvlText"), "val") ?? `%${i + 1}.`,
          start: Number(attr(wKid(l, "start"), "val") ?? 1),
        };
      }
      abstracts.set(attr(a, "abstractNumId") ?? "", levels);
    }
    for (const n of descendants(doc.documentElement, "num")) {
      if (!isW(n)) continue;
      const id = attr(n, "numId") ?? "";
      nums.set(id, attr(wKid(n, "abstractNumId"), "val") ?? "");
      for (const o of kids(n).filter((k) => isW(k, "lvlOverride"))) {
        const so = attr(wKid(o, "startOverride"), "val");
        if (so !== null) {
          const m = starts.get(id) ?? new Map<number, number>();
          m.set(Number(attr(o, "ilvl") ?? 0), Number(so));
          starts.set(id, m);
        }
      }
    }
  }
  return {
    levels: (numId) => abstracts.get(nums.get(numId) ?? "") ?? null,
    counters: new Map(),
    starts,
  };
}

function roman(n: number): string {
  const table: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let out = "";
  for (const [v, s] of table) while (n >= v) {
    out += s;
    n -= v;
  }
  return out;
}

function letters(n: number): string {
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(97 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function formatNumber(n: number, fmt: string): string {
  switch (fmt) {
    case "lowerRoman":
      return roman(n);
    case "upperRoman":
      return roman(n).toUpperCase();
    case "lowerLetter":
      return letters(n);
    case "upperLetter":
      return letters(n).toUpperCase();
    case "decimalZero":
      return String(n).padStart(2, "0");
    case "cardinalText":
    case "ordinalText":
      return chapterWord(n);
    case "none":
      return "";
    default:
      return String(n);
  }
}

/** The marker Word shows for a numbered paragraph ("1.", "ii.", "2.1", "•"), counting as Word does. */
function numberMarker(numbering: Numbering, numId: string, ilvl: number): string | null {
  if (numId === "0") return null;
  const levels = numbering.levels(numId);
  if (!levels) return null;
  const level = levels[ilvl] ?? levels[0];
  if (!level) return null;
  if (level.fmt === "bullet") return "•";
  const counters = numbering.counters.get(numId) ?? [];
  const startOf = (i: number) => numbering.starts.get(numId)?.get(i) ?? levels[i]?.start ?? 1;
  counters[ilvl] = counters[ilvl] === undefined ? startOf(ilvl) : counters[ilvl] + 1;
  for (let i = ilvl + 1; i < counters.length; i++) counters[i] = undefined as unknown as number;
  numbering.counters.set(numId, counters);
  return level.text.replace(/%([1-9])/g, (_m, d: string) => {
    const i = Number(d) - 1;
    const value = counters[i] ?? startOf(i);
    return formatNumber(value, levels[i]?.fmt ?? "decimal");
  });
}

// ─── Relationships and pictures ──────────────────────────────────────────────

type Rels = Map<string, { target: string; external: boolean; type: string }>;

function readRels(xml: string | null): Rels {
  const rels: Rels = new Map();
  if (!xml) return rels;
  const doc = parseXml(xml);
  for (const r of descendants(doc.documentElement, "Relationship")) {
    rels.set(attr(r, "Id") ?? "", { target: attr(r, "Target") ?? "", external: (attr(r, "TargetMode") ?? "") === "External", type: attr(r, "Type") ?? "" });
  }
  return rels;
}

function zipPath(target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = ["word", ...target.split("/")];
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
}

const IMAGE_TYPES: Record<string, ImageType> = { png: "png", jpg: "jpg", jpeg: "jpg", gif: "gif", bmp: "bmp" };

// ─── Reading context ─────────────────────────────────────────────────────────

type Seg =
  | { t: "text"; text: string; italic: boolean; bold: boolean; va: "sup" | "sub" | null }
  | { t: "note"; kind: "footnote" | "endnote"; id: string }
  | { t: "math"; linear: string }
  | { t: "break" };

interface Field {
  instr: string;
  phase: "code" | "result";
}

interface Ctx {
  chapter: number;
  styles: Styles;
  numbering: Numbering;
  rels: Rels;
  zip: JSZip;
  blocking: Set<string>;
  flags: Set<string>;
  assets: Map<string, ReadAsset>;
  counts: { insertions: number; deletions: number; comments: number; textBoxes: number; inlineMath: number; seq: number; toc: number; bold: number; merged: number; pipes: number; lossyMath: Set<string> };
  fields: Field[];
  /** Word notes in the order the text refers to them. */
  noteRefs: { kind: "footnote" | "endnote"; id: string }[];
}

/** A paragraph's pieces, before they become markup. */
interface ReadPara {
  role: ParaRole;
  segs: Seg[];
  marker: string | null;
  images: ReadAsset[];
  /** The paragraph mark was deleted with tracked changes: it joins the next paragraph. */
  joinsNext: boolean;
  /** Paragraphs that sat in text boxes in this paragraph. */
  boxed: Element[];
}

const EMU_PER_PX = 9525;

function imageFromBlip(blip: Element, cxEmu: number, cyEmu: number, ctx: Ctx, rels: Rels): ReadAsset | null {
  return imageFromRel(relAttr(blip, "embed"), relAttr(blip, "link"), cxEmu, cyEmu, ctx, rels);
}

function imageFromRel(embed: string | null, link: string | null, cxEmu: number, cyEmu: number, ctx: Ctx, rels: Rels): ReadAsset | null {
  if (!embed) {
    if (link) ctx.blocking.add("A picture is linked to a file on the specialist's computer instead of being saved in the document. Insert it again as a picture (Insert > Pictures > This Device).");
    return null;
  }
  const rel = rels.get(embed);
  if (!rel || rel.external) {
    ctx.blocking.add("A picture is linked rather than saved in the document. Insert it again as a picture.");
    return null;
  }
  const key = zipPath(rel.target);
  const ext = (/\.([a-z0-9]+)$/i.exec(key)?.[1] ?? "").toLowerCase();
  const type = IMAGE_TYPES[ext];
  if (!type) {
    const name = key.split("/").pop() ?? key;
    ctx.blocking.add(`The picture "${name}" is in a format the report cannot carry (${ext.toUpperCase() || "unknown"}). Save it as PNG or JPG and insert it again.`);
    return null;
  }
  let width = Math.max(1, Math.round(cxEmu / EMU_PER_PX));
  let height = Math.max(1, Math.round(cyEmu / EMU_PER_PX));
  if (width > MAX_IMAGE_WIDTH_PX) {
    height = Math.max(1, Math.round((height * MAX_IMAGE_WIDTH_PX) / width));
    width = MAX_IMAGE_WIDTH_PX;
  }
  const asset: ReadAsset = { key, type, width, height, sha: "" };
  if (!ctx.assets.has(key)) ctx.assets.set(key, asset);
  return ctx.assets.get(key) ?? asset;
}

/** A DrawingML picture, chart, SmartArt, shape or text box inside a run. */
function readDrawing(drawing: Element, ctx: Ctx, out: ReadPara, rels: Rels) {
  for (const holder of kids(drawing)) {
    const extent = kids(holder).find((k) => k.localName === "extent");
    const cx = Number(attr(extent ?? null, "cx") ?? 0);
    const cy = Number(attr(extent ?? null, "cy") ?? 0);
    for (const gd of descendants(holder, "graphicData")) {
      const uri = attr(gd, "uri") ?? "";
      if (/\/chart$/.test(uri)) {
        ctx.blocking.add("The chapter has a live chart. Copy the chart and paste it as a picture (Paste Special > Picture), then upload again.");
      } else if (/\/diagram$/.test(uri)) {
        ctx.blocking.add("The chapter has a SmartArt diagram. Copy it and paste it as a picture (Paste Special > Picture), then upload again.");
      } else if (/\/picture$/.test(uri)) {
        const blip = descendants(gd, "blip")[0];
        if (blip) {
          const asset = imageFromBlip(blip, cx, cy, ctx, rels);
          if (asset) out.images.push(asset);
        }
      } else if (/wordprocessingShape$/.test(uri)) {
        const boxes = descendants(gd, "txbxContent");
        if (boxes.length) {
          ctx.counts.textBoxes++;
          for (const b of boxes) out.boxed.push(...kids(b).filter((k) => isW(k, "p") || isW(k, "tbl")));
        } else ctx.flags.add("A drawn shape (a line, arrow or box with no text) was left out.");
      } else if (/wordprocessingGroup$|wordprocessingCanvas$/.test(uri)) {
        ctx.blocking.add("The chapter has a group of drawing shapes. Save the drawing as one picture (right-click > Save as Picture) and insert that picture instead.");
      } else if (/\/ink$|ink/.test(uri)) {
        ctx.blocking.add("The chapter has ink (a hand-drawn stroke). Replace it with a picture.");
      } else {
        ctx.blocking.add("The chapter has an object the report cannot carry. Replace it with a picture or plain text.");
      }
    }
  }
}

/** An old-style (VML) picture or text box. */
function readVml(pict: Element, ctx: Ctx, out: ReadPara, rels: Rels) {
  for (const img of descendants(pict, "imagedata")) {
    const id = relAttr(img, "id");
    const shape = img.parentNode as Element | null;
    const style = attr(shape, "style") ?? "";
    const pt = (name: string) => Number(new RegExp(`${name}:\\s*([\\d.]+)pt`).exec(style)?.[1] ?? 0);
    if (!id) continue;
    // VML sizes are in points; 12,700 EMU to the point.
    const asset = imageFromRel(id, null, pt("width") * 12700, pt("height") * 12700, ctx, rels);
    if (asset) out.images.push(asset);
  }
  for (const tb of descendants(pict, "txbxContent")) {
    ctx.counts.textBoxes++;
    out.boxed.push(...kids(tb).filter((k) => isW(k, "p") || isW(k, "tbl")));
  }
  if (descendants(pict, "control").length || descendants(pict, "OLEObject").length) {
    ctx.blocking.add("The chapter has an embedded object (an Excel sheet or an old-style equation, for example). Paste it as a table, a Word equation or a picture instead.");
  }
}

const SYMBOL_FONT: Record<string, string> = {
  a: "α", b: "β", c: "χ", d: "δ", e: "ε", f: "φ", g: "γ", h: "η", i: "ι", j: "ϕ", k: "κ", l: "λ", m: "μ", n: "ν", o: "ο", p: "π", q: "θ", r: "ρ", s: "σ", t: "τ", u: "υ", w: "ω", x: "ξ", y: "ψ", z: "ζ",
  A: "Α", B: "Β", C: "Χ", D: "Δ", E: "Ε", F: "Φ", G: "Γ", H: "Η", I: "Ι", K: "Κ", L: "Λ", M: "Μ", N: "Ν", O: "Ο", P: "Π", Q: "Θ", R: "Ρ", S: "Σ", T: "Τ", U: "Υ", W: "Ω", X: "Ξ", Y: "Ψ", Z: "Ζ",
  "±": "±", "³": "≥", "£": "≤", "´": "×", "¸": "÷", "¹": "≠", "»": "≈", "å": "∑", "Ö": "√", "¥": "∞", "¶": "∂", "®": "→",
};

function symbolChar(sym: Element, ctx: Ctx): string {
  const font = (attr(sym, "font") ?? "").toLowerCase();
  const code = parseInt(attr(sym, "char") ?? "", 16);
  if (!Number.isFinite(code)) return "";
  // Symbol-font characters live at F0xx; the low byte is the character in the old Symbol encoding.
  const low = code >= 0xf000 ? code - 0xf000 : code;
  if (font === "symbol") {
    const ch = String.fromCharCode(low);
    const mapped = SYMBOL_FONT[ch];
    if (mapped) return mapped;
  }
  if (code < 0xf000) return String.fromCharCode(code);
  ctx.flags.add("A symbol from a decorative font (Wingdings or similar) was left out.");
  return "";
}

// ─── Runs ────────────────────────────────────────────────────────────────────

interface RunFormat {
  italic: boolean;
  bold: boolean;
  va: "sup" | "sub" | null;
}

/** A run's own formatting, else its character style's, else (italic only) its paragraph style's. */
function runFormat(r: Element, styles: Styles, paraStyle: StyleInfo[]): RunFormat {
  const rPr = wKid(r, "rPr");
  const charStyle = styleChain(styles, attr(wKid(rPr, "rStyle"), "val"));
  const italic = toggle(wKid(rPr, "i")) ?? charStyle.find((s) => s.italic !== null)?.italic ?? paraStyle.find((s) => s.italic !== null)?.italic ?? false;
  const bold = toggle(wKid(rPr, "b")) ?? charStyle.find((s) => s.bold !== null)?.bold ?? false;
  const vaRaw = attr(wKid(rPr, "vertAlign"), "val") ?? charStyle.find((s) => s.vertAlign)?.vertAlign ?? null;
  const va = vaRaw === "superscript" ? "sup" : vaRaw === "subscript" ? "sub" : null;
  return { italic: Boolean(italic), bold: Boolean(bold), va };
}

function inFieldCode(ctx: Ctx): boolean {
  return ctx.fields.some((f) => f.phase === "code");
}

/** The SEQ caption field showing now (Word's own "Table 1"), if any. */
function seqField(ctx: Ctx): Field | null {
  for (let i = ctx.fields.length - 1; i >= 0; i--) if (/^\s*SEQ\s+(Table|Figure)\b/i.test(ctx.fields[i].instr)) return ctx.fields[i];
  return null;
}

function pushText(out: ReadPara, text: string, fmt: RunFormat, ctx: Ctx) {
  if (!text || inFieldCode(ctx)) return;
  const seq = seqField(ctx);
  if (seq && /^\d+$/.test(text.trim())) {
    // Word's caption numbering counts 1, 2, 3 in a chapter: the report numbers them chapter.n.
    ctx.counts.seq++;
    text = `${ctx.chapter}.${text.trim()}`;
  }
  out.segs.push({ t: "text", text, italic: fmt.italic, bold: fmt.bold, va: fmt.va });
}

function readRun(r: Element, ctx: Ctx, out: ReadPara, paraStyle: StyleInfo[], rels: Rels, notesContext: boolean) {
  const fmt = runFormat(r, ctx.styles, paraStyle);
  for (const c of kids(r)) {
    if (c.namespaceURI === MC && c.localName === "AlternateContent") {
      const choice = kids(c).find((k) => k.localName === "Choice") ?? kids(c).find((k) => k.localName === "Fallback");
      if (choice) for (const inner of kids(choice)) readRunChild(inner, fmt, ctx, out, rels, notesContext);
      continue;
    }
    readRunChild(c, fmt, ctx, out, rels, notesContext);
  }
}

function readRunChild(c: Element, fmt: RunFormat, ctx: Ctx, out: ReadPara, rels: Rels, notesContext: boolean) {
  if (isM(c)) {
    readMath(c, ctx, out);
    return;
  }
  if (!isW(c)) {
    if (c.localName === "drawing") readDrawing(c, ctx, out, rels);
    return;
  }
  switch (c.localName) {
    case "t":
      pushText(out, c.textContent ?? "", fmt, ctx);
      break;
    case "delText":
      break;
    case "instrText":
      if (ctx.fields.length) ctx.fields[ctx.fields.length - 1].instr += c.textContent ?? "";
      break;
    case "fldChar": {
      const type = attr(c, "fldCharType");
      if (type === "begin") ctx.fields.push({ instr: "", phase: "code" });
      else if (type === "separate" && ctx.fields.length) ctx.fields[ctx.fields.length - 1].phase = "result";
      else if (type === "end") ctx.fields.pop();
      break;
    }
    case "tab":
    case "ptab":
      pushText(out, " ", fmt, ctx);
      break;
    case "br":
    case "cr": {
      const type = attr(c, "type");
      if (type === "page" || type === "column") break;
      if (!inFieldCode(ctx)) out.segs.push({ t: "break" });
      break;
    }
    case "noBreakHyphen":
      pushText(out, "-", fmt, ctx);
      break;
    case "softHyphen":
      break;
    case "sym":
      pushText(out, symbolChar(c, ctx), fmt, ctx);
      break;
    case "footnoteReference":
    case "endnoteReference": {
      if (notesContext) break;
      const kind = c.localName === "footnoteReference" ? "footnote" : "endnote";
      const id = attr(c, "id") ?? "";
      out.segs.push({ t: "note", kind, id });
      ctx.noteRefs.push({ kind, id });
      break;
    }
    case "drawing":
      readDrawing(c, ctx, out, rels);
      break;
    case "pict":
      readVml(c, ctx, out, rels);
      break;
    case "object":
      ctx.blocking.add("The chapter has an embedded object (an Excel sheet or an old-style equation, for example). Paste it as a table, a Word equation or a picture instead.");
      break;
    case "commentReference":
      ctx.counts.comments++;
      break;
    default:
      break;
  }
}

function readMath(el: Element, ctx: Ctx, out: ReadPara) {
  if (!isM(el, "oMath") && !isM(el, "oMathPara")) {
    // Loose math pieces outside an m:oMath (rare): read what they say.
    const text = el.textContent ?? "";
    if (text.trim()) out.segs.push({ t: "math", linear: text.trim() });
    return;
  }
  const lin = ommlToLinear(el);
  lin.lossy.forEach((l) => ctx.counts.lossyMath.add(l));
  out.segs.push({ t: "math", linear: lin.text });
}

/** Walks a paragraph's content (runs, hyperlinks, tracked changes, fields, content controls, maths). */
function readInline(node: Element, ctx: Ctx, out: ReadPara, paraStyle: StyleInfo[], rels: Rels, notesContext: boolean) {
  for (const c of kids(node)) {
    if (isM(c)) {
      readMath(c, ctx, out);
      continue;
    }
    if (c.namespaceURI === MC && c.localName === "AlternateContent") {
      const choice = kids(c).find((k) => k.localName === "Choice") ?? kids(c).find((k) => k.localName === "Fallback");
      if (choice) readInline(choice, ctx, out, paraStyle, rels, notesContext);
      continue;
    }
    if (!isW(c)) continue;
    switch (c.localName) {
      case "r":
        readRun(c, ctx, out, paraStyle, rels, notesContext);
        break;
      case "ins":
      case "moveTo":
        ctx.counts.insertions++;
        readInline(c, ctx, out, paraStyle, rels, notesContext);
        break;
      case "del":
      case "moveFrom":
        ctx.counts.deletions++;
        break;
      case "hyperlink":
      case "smartTag":
      case "customXml":
      case "bdo":
      case "dir":
        readInline(c, ctx, out, paraStyle, rels, notesContext);
        break;
      case "sdt":
        readInline(wKid(c, "sdtContent") ?? c, ctx, out, paraStyle, rels, notesContext);
        break;
      case "fldSimple": {
        const instr = attr(c, "instr") ?? "";
        ctx.fields.push({ instr, phase: "result" });
        readInline(c, ctx, out, paraStyle, rels, notesContext);
        ctx.fields.pop();
        break;
      }
      default:
        break;
    }
  }
}

function readParagraph(p: Element, ctx: Ctx, rels: Rels, notesContext = false): ReadPara {
  const pPr = wKid(p, "pPr");
  const styleId = attr(wKid(pPr, "pStyle"), "val");
  const ownOutline = attr(wKid(pPr, "outlineLvl"), "val");
  const chain = styleChain(ctx.styles, styleId);
  const role = roleFor(ctx.styles, styleId, ownOutline !== null ? Number(ownOutline) : null);
  const out: ReadPara = { role, segs: [], marker: null, images: [], joinsNext: false, boxed: [] };
  const numPr = wKid(pPr, "numPr");
  const numId = attr(wKid(numPr, "numId"), "val") ?? chain.find((s) => s.numId)?.numId ?? null;
  const ilvl = Number(attr(wKid(numPr, "ilvl"), "val") ?? chain.find((s) => s.ilvl !== null)?.ilvl ?? 0);
  if (numId) out.marker = numberMarker(ctx.numbering, numId, ilvl);
  const markRPr = wKid(pPr, "rPr");
  if (wKid(markRPr, "del")) out.joinsNext = true;
  // A field's code never runs past its paragraph (only a result, like a table of contents, can):
  // a field left open by a damaged file must not hide the rest of the chapter.
  ctx.fields = ctx.fields.filter((f) => f.phase === "result");
  // A style's italics count only in body text (a block quote); a heading's or a caption's look is the
  // report's own (Word's built-in Caption style is italic, and the report's captions are not).
  readInline(p, ctx, out, role.kind === "body" ? chain : [], rels, notesContext);
  return out;
}

// ─── Segments to markup ──────────────────────────────────────────────────────

const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ" };
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎" };
const mapAll = (s: string, table: Record<string, string>) => ([...s].every((ch) => table[ch]) ? [...s].map((ch) => table[ch]).join("") : null);

/** Markup tags the builder reads, broken with a zero-width space when they turn up in the text itself. */
const TAG = /\[(?=(?:\/?(?:H[123]|EQ|TABLE|FIG)|ENDNOTES|AGENT REPORT|IMAGE:)(?:\]|\s|:|$))/gi;
export const escapeTags = (s: string) => s.replace(TAG, "[​");

interface MarkupOptions {
  inTable?: boolean;
  /** Headings and captions: bold is their own style, never reported. */
  boldIsStyle?: boolean;
  /** Called for each Word note reference, returning its marker text. */
  noteToken: (kind: "footnote" | "endnote", id: string) => string;
  /** Superscript numbers are note markers (the chapter has notes). */
  notesInUse: boolean;
}

function markupOf(segs: Seg[], ctx: Ctx, o: MarkupOptions): string {
  // Join neighbouring text pieces with the same look (Word splits runs for spelling marks and edits).
  const merged: Seg[] = [];
  for (const s of segs) {
    const prev = merged[merged.length - 1];
    if (s.t === "text" && prev?.t === "text" && prev.italic === s.italic && prev.va === s.va && prev.bold === s.bold) prev.text += s.text;
    else merged.push(s.t === "text" ? { ...s } : s);
  }
  let out = "";
  for (const s of merged) {
    if (s.t === "break") {
      out += "\n";
      continue;
    }
    if (s.t === "note") {
      out += o.noteToken(s.kind, s.id);
      continue;
    }
    if (s.t === "math") {
      ctx.counts.inlineMath++;
      out += s.linear;
      continue;
    }
    let text = s.text.replace(/ /g, " ");
    if (s.bold && !o.boldIsStyle && !o.inTable && text.trim()) ctx.counts.bold++;
    if (s.va === "sup") {
      const digits = text.trim();
      if (/^\d{1,3}$/.test(digits) && o.notesInUse && /(?:[.,;:!?)"'’”]|\p{L}{3})$/u.test(out)) {
        out += `^${digits}`;
        continue;
      }
      const mapped = mapAll(digits, SUP);
      out += mapped ?? text;
      continue;
    }
    if (s.va === "sub") {
      const t = text.trim();
      if (/(?:^|[^\p{L}\d_])[A-Za-zΑ-Ωα-ω]$/u.test(out) && /^[A-Za-z0-9]{1,10}$/.test(t)) {
        out += `_${t}`;
        continue;
      }
      if (/(?:^|[^\p{L}\d_])[A-Za-zΑ-Ωα-ω]$/u.test(out) && /^[^\s{}]{1,12}$/.test(t)) {
        out += `_{${t}}`;
        continue;
      }
      out += mapAll(t, SUB) ?? text;
      continue;
    }
    if (s.italic && text.trim() && !text.includes("*")) {
      const lead = /^\s*/.exec(text)?.[0] ?? "";
      const trail = /\s*$/.exec(text)?.[0] ?? "";
      out += `${lead}*${text.trim()}*${trail}`;
      continue;
    }
    out += text;
  }
  return out;
}

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ").replace(/[ \t]+/g, " ").trim();

// ─── Tables ──────────────────────────────────────────────────────────────────

const EQ_NUMBER = /^\(?\s*(\d+(?:\.\d+)+|\d+)\s*\)?$/;

/**
 * An equation's text and number. The number may be typed beside the equation (a table cell, or after it in
 * the paragraph) or inside it, after a tab ("y = a + bx<tab>3.1", as Word keeps it): a trailing number is
 * split off only when what is left is still an equation (splitEquationNumber's rule), so "x = 3.1" stays a value.
 */
function equationNumber(linear: string, typed: string, ctx: Ctx): { linear: string; number: string } {
  let text = linear.trim();
  let raw = typed.trim();
  if (!raw) {
    const split = splitEquationNumber(text);
    if (split.number) {
      raw = /\(\s*[\d.]+\s*\)\s*$/.test(text) ? `(${split.number})` : split.number;
      text = split.text;
    }
  }
  if (/^\(/.test(raw)) ctx.flags.add("Equation numbers written in brackets, (3.1), are written without them, 3.1.");
  return { linear: text, number: EQ_NUMBER.exec(raw)?.[1] ?? "" };
}

interface ReadTable {
  kind: "equations" | "data";
  equations: { linear: string; number: string }[];
  rows: string[][];
}

function cellParagraphs(tc: Element): Element[] {
  const out: Element[] = [];
  for (const k of kids(tc)) {
    if (isW(k, "p")) out.push(k);
    else if (isW(k, "sdt")) out.push(...cellParagraphs(wKid(k, "sdtContent") ?? k));
    else if (isW(k, "tbl")) out.push(k);
  }
  return out;
}

function tableRows(tbl: Element): Element[] {
  const rows: Element[] = [];
  for (const k of kids(tbl)) {
    if (isW(k, "tr")) rows.push(k);
    else if (isW(k, "sdt") || isW(k, "customXml")) rows.push(...tableRows(wKid(k, "sdtContent") ?? k));
  }
  return rows;
}

function rowCells(tr: Element): Element[] {
  const cells: Element[] = [];
  for (const k of kids(tr)) {
    if (isW(k, "tc")) cells.push(k);
    else if (isW(k, "sdt") || isW(k, "customXml")) cells.push(...rowCells(wKid(k, "sdtContent") ?? k));
  }
  return cells;
}

function readTable(tbl: Element, ctx: Ctx, rels: Rels, noteToken: MarkupOptions["noteToken"], notesInUse: boolean): ReadTable {
  const rows = tableRows(tbl);
  // The builder's equation table: every row an equation (left) and its number (right).
  const isEquationRow = (tr: Element) => {
    const cells = rowCells(tr);
    if (cells.length < 1 || cells.length > 2) return false;
    const hasMath = descendants(cells[0], "oMath").some((m) => isM(m)) || descendants(cells[0], "oMathPara").some((m) => isM(m));
    const numberText = cells[1] ? oneLine(cells[1].textContent ?? "") : "";
    return hasMath && (numberText === "" || EQ_NUMBER.test(numberText));
  };
  if (rows.length && rows.every(isEquationRow)) {
    return {
      kind: "equations",
      rows: [],
      equations: rows.map((tr) => {
        const cells = rowCells(tr);
        const math = [...descendants(cells[0], "oMathPara").filter((m) => isM(m)), ...descendants(cells[0], "oMath").filter((m) => isM(m) && !(m.parentNode && isM(m.parentNode as Element, "oMathPara")))];
        const lins = math.map((m) => ommlToLinear(m));
        lins.forEach((l) => l.lossy.forEach((x) => ctx.counts.lossyMath.add(x)));
        const numberText = cells[1] ? oneLine(cells[1].textContent ?? "") : "";
        return equationNumber(lins.map((l) => l.text).join("; "), numberText, ctx);
      }),
    };
  }
  const out: string[][] = [];
  for (const tr of rows) {
    const row: string[] = [];
    for (const tc of rowCells(tr)) {
      const tcPr = wKid(tc, "tcPr");
      const span = Number(attr(wKid(tcPr, "gridSpan"), "val") ?? 1);
      const vMerge = wKid(tcPr, "vMerge");
      const continued = vMerge !== null && (attr(vMerge, "val") ?? "continue") === "continue";
      let text = "";
      if (!continued) {
        text = cellParagraphs(tc)
          .map((el) => {
            if (isW(el, "tbl")) {
              ctx.flags.add("A table inside a table cell was written as text in that cell.");
              return oneLine(el.textContent ?? "");
            }
            const para = readParagraph(el, ctx, rels);
            if (para.images.length) ctx.flags.add("A picture inside a table cell was left out (put pictures outside tables).");
            const t = markupOf(para.segs, ctx, { inTable: true, noteToken, notesInUse });
            return oneLine(`${para.marker ? `${para.marker} ` : ""}${t}`);
          })
          .filter(Boolean)
          .join(" ");
      } else ctx.counts.merged++;
      if (span > 1) ctx.counts.merged++;
      if (text.includes("|")) {
        ctx.counts.pipes++;
        text = text.replace(/\|/g, "/");
      }
      row.push(escapeTags(text));
      for (let s = 1; s < span; s++) row.push("");
    }
    if (row.some((c) => c.trim())) out.push(row);
  }
  return { kind: "data", equations: [], rows: out };
}

// ─── Notes ───────────────────────────────────────────────────────────────────

/** Word's footnotes or endnotes: id -> the note's text as markup. */
function readWordNotes(xml: string | null, kind: "footnote" | "endnote", ctx: Ctx, rels: Rels): Map<string, string> {
  const notes = new Map<string, string>();
  if (!xml) return notes;
  const doc = parseXml(xml);
  for (const n of descendants(doc.documentElement, kind)) {
    if (!isW(n)) continue;
    const type = attr(n, "type");
    if (type && type !== "normal") continue; // separators
    const id = attr(n, "id") ?? "";
    const text = kids(n)
      .filter((k) => isW(k, "p"))
      .map((p) => {
        const para = readParagraph(p, ctx, rels, true);
        if (para.images.length) ctx.flags.add("A picture inside a footnote was left out.");
        return oneLine(markupOf(para.segs, ctx, { noteToken: () => "", notesInUse: false }));
      })
      .filter(Boolean)
      .join(" ");
    notes.set(id, text);
  }
  return notes;
}

// ─── The reader ──────────────────────────────────────────────────────────────

const REFERENCES_HEADING = /^(references|bibliography|reference list|list of references|works cited|sources)$/i;
const NOTES_HEADING = /^(end\s?notes|notes|footnotes)$/i;
const CHAPTER_LINE = /^CHAPTER\s+(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|\d+)\b/i;
const TABLE_CAPTION_TEXT = /^\**\s*Table\s+\d+(?:\.\d+)?\s*[:.\-–—]/i;
const FIGURE_CAPTION_TEXT = /^\**\s*Fig(?:ure|\.)?\s+\d+(?:\.\d+)?\s*[:.\-–—]/i;
const WORDS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10 };

type Item =
  | { k: "heading"; level: number; lines: string[] }
  | { k: "para"; text: string; caption: "table" | "figure" | null }
  | { k: "equation"; linear: string; number: string }
  | { k: "table"; rows: string[][] }
  | { k: "image"; asset: ReadAsset }
  | { k: "notes-start" }
  | { k: "note"; text: string };

async function textOf(zip: JSZip, path: string): Promise<string | null> {
  const f = zip.file(path);
  return f ? f.async("string") : null;
}

function readStamp(xml: string | null): ReadSummary["stamp"] {
  if (!xml) return null;
  const value = (name: string) => {
    const m = new RegExp(`<property[^>]*name="${name}"[^>]*>\\s*<vt:[a-z0-9]+>([^<]*)</vt:[a-z0-9]+>`, "i").exec(xml);
    return m ? m[1].trim() : null;
  };
  const project = value(CHAPTER_STAMP.project);
  const chapter = value(CHAPTER_STAMP.chapter);
  const source = value(CHAPTER_STAMP.source);
  if (!project && !chapter && !source) return null;
  return { project, chapter: chapter && /^\d+$/.test(chapter) ? Number(chapter) : null, source };
}

/** Reads a chapter .docx. Throws only when the file is not a Word document at all. */
export async function readChapterDocx(bytes: Uint8Array, options: ReadChapterOptions): Promise<ReadChapterResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error("The file is not a Word document (.docx).");
  }
  const documentXml = await textOf(zip, "word/document.xml");
  if (!documentXml) throw new Error("The file is not a Word document (.docx): it has no document body.");

  const [stylesXml, numberingXml, relsXml, footnotesXml, endnotesXml, footRelsXml, endRelsXml, customXml, commentsXml] = await Promise.all([
    textOf(zip, "word/styles.xml"),
    textOf(zip, "word/numbering.xml"),
    textOf(zip, "word/_rels/document.xml.rels"),
    textOf(zip, "word/footnotes.xml"),
    textOf(zip, "word/endnotes.xml"),
    textOf(zip, "word/_rels/footnotes.xml.rels"),
    textOf(zip, "word/_rels/endnotes.xml.rels"),
    textOf(zip, "docProps/custom.xml"),
    textOf(zip, "word/comments.xml"),
  ]);

  const styles = readStyles(stylesXml);
  const ctx: Ctx = {
    chapter: options.chapter,
    styles,
    numbering: readNumbering(numberingXml),
    rels: readRels(relsXml),
    zip,
    blocking: new Set(),
    flags: new Set(),
    assets: new Map(),
    counts: { insertions: 0, deletions: 0, comments: 0, textBoxes: 0, inlineMath: 0, seq: 0, toc: 0, bold: 0, merged: 0, pipes: 0, lossyMath: new Set() },
    fields: [],
    noteRefs: [],
  };

  const doc = parseXml(documentXml);
  const body = descendants(doc.documentElement, "body").find((b) => isW(b));
  if (!body) throw new Error("The file is not a Word document (.docx): it has no document body.");

  // Notes are in use when the chapter carries a notes list or Word notes: then superscript numbers are markers.
  const notesInUse = Boolean(footnotesXml && /<w:footnote\b(?![^>]*w:type=)/.test(footnotesXml)) || Boolean(endnotesXml && /<w:endnote\b(?![^>]*w:type=)/.test(endnotesXml)) || /<w:t[^>]*>\s*(?:End\s?notes|Notes)\s*<\/w:t>/i.test(documentXml);
  const noteTokens = new Map<string, string>();
  const noteToken = (kind: "footnote" | "endnote", id: string) => {
    const key = `${kind}:${id}`;
    if (!noteTokens.has(key)) noteTokens.set(key, `\u0001${noteTokens.size}\u0001`);
    return noteTokens.get(key) as string;
  };

  // ── Pass 1: the body as items ──
  const items: Item[] = [];
  let stopped = false;
  let referencesSection = false;
  let inNotes = false;
  const referenceLines: string[] = [];

  const handleParagraph = (p: Element) => {
    const para = readParagraph(p, ctx, ctx.rels);
    // A paragraph holding only an equation (and perhaps its number) is a display equation, like the builder's,
    // whatever its style (an equation typed into a heading-styled line is still an equation).
    const visible = para.segs.filter((s) => s.t !== "break" && !(s.t === "text" && !s.text.trim()));
    const displayMath =
      !stopped &&
      (para.role.kind === "body" || para.role.kind === "heading") &&
      !inNotes &&
      !para.images.length &&
      visible.some((s) => s.t === "math") &&
      visible.every((s) => s.t === "math" || (s.t === "text" && EQ_NUMBER.test(s.text.trim())));
    if (displayMath) {
      const linear = visible.filter((s): s is Extract<Seg, { t: "math" }> => s.t === "math").map((s) => s.linear).join("; ");
      const typed = visible.find((s): s is Extract<Seg, { t: "text" }> => s.t === "text")?.text.trim() ?? "";
      items.push({ k: "equation", ...equationNumber(linear, typed, ctx) });
      return para;
    }
    const markup = markupOf(para.segs, ctx, { noteToken, notesInUse, boldIsStyle: para.role.kind === "heading" || para.role.kind === "caption" });
    const lineText = oneLine(markup);
    if (stopped) {
      if (lineText) referenceLines.push(lineText.replace(/\*/g, ""));
      return para;
    }
    if (para.role.kind === "toc") {
      if (lineText) ctx.counts.toc++;
      return para;
    }
    if (para.role.kind === "heading" && lineText) {
      const level = para.role.level;
      const numbered = para.marker && para.marker !== "•" ? `${para.marker.replace(/\.$/, "")} ` : "";
      if (level === 1 && REFERENCES_HEADING.test(lineText)) {
        stopped = true;
        referencesSection = true;
        inNotes = false;
        return para;
      }
      if (level <= 2 && NOTES_HEADING.test(lineText)) {
        inNotes = true;
        items.push({ k: "notes-start" });
        return para;
      }
      inNotes = false;
      if (level === 1) {
        const lines = markup.split("\n").map(oneLine).filter(Boolean);
        // Word's own chapter numbering on Heading 1 ("CHAPTER %1") shows before the text.
        if (para.marker && para.marker !== "•") lines.unshift(para.marker.replace(/\.$/, ""));
        items.push({ k: "heading", level: 1, lines });
      } else {
        if (level > 3) ctx.flags.add("A fourth heading level (Heading 4 or lower) was set as a sub-section (Heading 3); the report allows three levels.");
        items.push({ k: "heading", level: Math.min(level, 3), lines: [`${numbered}${lineText}`] });
      }
    } else if (lineText || para.images.length) {
      const text = `${para.marker ? `${para.marker} ` : ""}${lineText}`;
      if (inNotes && lineText) items.push({ k: "note", text: escapeTags(text) });
      else {
        if (lineText) {
          const caption = para.role.kind === "caption" ? (para.role.of === "any" ? (TABLE_CAPTION_TEXT.test(lineText) ? "table" : FIGURE_CAPTION_TEXT.test(lineText) ? "figure" : null) : para.role.of) : TABLE_CAPTION_TEXT.test(lineText) ? "table" : FIGURE_CAPTION_TEXT.test(lineText) ? "figure" : null;
          items.push({ k: "para", text: escapeTags(text), caption });
        }
        for (const asset of para.images) items.push({ k: "image", asset });
      }
    }
    for (const boxed of para.boxed) {
      if (isW(boxed, "p")) handleParagraph(boxed);
      else handleTable(boxed);
    }
    return para;
  };

  const handleTable = (tbl: Element) => {
    if (stopped) return;
    const t = readTable(tbl, ctx, ctx.rels, noteToken, notesInUse);
    if (t.kind === "equations") for (const e of t.equations) items.push({ k: "equation", linear: e.linear, number: e.number });
    else if (t.rows.length) items.push({ k: "table", rows: t.rows });
  };

  const walkBlock = (el: Element) => {
    for (const c of kids(el)) {
      if (!isW(c)) {
        if (c.namespaceURI === MC && c.localName === "AlternateContent") {
          const choice = kids(c).find((k) => k.localName === "Choice") ?? kids(c).find((k) => k.localName === "Fallback");
          if (choice) walkBlock(choice);
        }
        continue;
      }
      if (c.localName === "p") handleParagraph(c);
      else if (c.localName === "tbl") handleTable(c);
      else if (c.localName === "sdt") walkBlock(wKid(c, "sdtContent") ?? c);
      else if (c.localName === "customXml") walkBlock(c);
      else if (c.localName === "altChunk") ctx.blocking.add("The chapter has an imported document part (altChunk). Copy its text into the chapter itself.");
    }
  };

  // A paragraph whose mark was deleted with tracked changes runs on into the next one.
  const bodyKids = kids(body);
  const merged: Element[] = [];
  for (let i = 0; i < bodyKids.length; i++) {
    const el = bodyKids[i];
    if (isW(el, "p") && wKid(wKid(wKid(el, "pPr"), "rPr"), "del") && isW(bodyKids[i + 1] ?? el, "p")) {
      const next = bodyKids[i + 1];
      const joined = el.cloneNode(true) as Element;
      for (const k of kids(next)) if (!isW(k, "pPr")) joined.appendChild(k.cloneNode(true));
      bodyKids[i + 1] = joined;
      continue;
    }
    merged.push(el);
  }
  const holder = body.cloneNode(false) as Element;
  for (const el of merged) holder.appendChild(el);
  walkBlock(holder);

  // ── Word's own footnotes and endnotes: numbered after the chapter's notes list ──
  const footnotes = readWordNotes(footnotesXml, "footnote", ctx, readRels(footRelsXml));
  const endnotes = readWordNotes(endnotesXml, "endnote", ctx, readRels(endRelsXml));

  // ── Pass 2: items as markup ──
  const listEntries: { number: number; text: string }[] = [];
  const noteItems = items.filter((i): i is Extract<Item, { k: "note" }> => i.k === "note");
  let lastNumber = 0;
  for (const n of noteItems) {
    const entry = endnoteEntry(n.text);
    if (entry) {
      listEntries.push(entry);
      lastNumber = entry.number;
    } else if (listEntries.length) listEntries[listEntries.length - 1].text += ` ${n.text}`;
    else listEntries.push({ number: ++lastNumber, text: n.text });
  }
  const numbers = listEntries.map((e) => e.number);
  if (new Set(numbers).size !== numbers.length) ctx.flags.add("The chapter's notes list repeats a note number. Check that each note number in the text points to the right note.");
  let nextNumber = Math.max(0, ...numbers);
  const wordEntries: { number: number; text: string }[] = [];
  const tokenNumber = new Map<string, number>();
  for (const [key, token] of noteTokens) {
    const [kind, id] = key.split(":") as ["footnote" | "endnote", string];
    const text = (kind === "footnote" ? footnotes : endnotes).get(id);
    if (text === undefined) continue;
    const number = ++nextNumber;
    tokenNumber.set(token, number);
    wordEntries.push({ number, text: text || "[NOTE TEXT MISSING]" });
  }
  if (wordEntries.length) {
    ctx.flags.add(
      `${wordEntries.length} Word ${wordEntries.length === 1 ? "footnote was" : "footnotes were"} turned into the chapter's notes (numbered ${wordEntries[0].number}${wordEntries.length > 1 ? `–${wordEntries[wordEntries.length - 1].number}` : ""}).`,
    );
  }

  const lines: string[] = [];
  const push = (block: string) => lines.push(block);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    switch (it.k) {
      case "heading":
        push(it.lines.map((l) => `[H${it.level}] ${escapeTags(l)}`).join("\n"));
        break;
      case "para": {
        // A table caption written under its table moves above it (T6).
        push(it.text);
        break;
      }
      case "equation":
        push(`[EQ] ${it.linear} | ${it.number} [/EQ]`);
        break;
      case "table": {
        // A caption written under the table goes above it.
        const next = items[i + 1];
        const prev = items[i - 1];
        if (!(prev?.k === "para" && prev.caption === "table") && next?.k === "para" && next.caption === "table") {
          lines.push(next.text);
          items.splice(i + 1, 1);
          ctx.flags.add("A table caption written under its table was moved above it.");
        }
        const width = Math.max(...it.rows.map((r) => r.length));
        const row = (r: string[]) => `| ${[...r, ...Array(width - r.length).fill("")].map((c) => c || " ").join(" | ")} |`;
        push([row(it.rows[0]), `|${Array(width).fill("---").join("|")}|`, ...it.rows.slice(1).map(row)].join("\n"));
        break;
      }
      case "image":
        push(`[IMAGE: ${it.asset.key} | ${it.asset.width}x${it.asset.height}]`);
        break;
      case "notes-start":
      case "note":
        break;
    }
  }
  const allEntries = [...listEntries, ...wordEntries];
  if (allEntries.length) push(`[ENDNOTES]\n${allEntries.map((e) => `${e.number}. ${oneLine(e.text)}`).join("\n")}`);

  let markup = lines.join("\n\n");
  markup = markup.replace(/\u0001(\d+)\u0001/g, (m) => {
    const n = tokenNumber.get(m);
    return n === undefined ? "" : `^${n}`;
  });

  // ── Findings ──
  const c = ctx.counts;
  if (c.insertions || c.deletions) ctx.flags.add(`Tracked changes were accepted as they stand (${c.insertions} insertion${c.insertions === 1 ? "" : "s"} kept, ${c.deletions} deletion${c.deletions === 1 ? "" : "s"} left out).`);
  const commentCount = c.comments || (commentsXml ? (commentsXml.match(/<w:comment\b/g) ?? []).length : 0);
  if (commentCount) ctx.flags.add(`${commentCount} Word comment${commentCount === 1 ? " was" : "s were"} left out (comments are never part of the report).`);
  if (c.textBoxes) ctx.flags.add(`Text in ${c.textBoxes} text box${c.textBoxes === 1 ? "" : "es"} was moved into the body. Check where it now sits.`);
  if (c.inlineMath) ctx.flags.add("An equation written inside a sentence was turned into plain text in that sentence. Put display equations on a line of their own.");
  if (c.seq) ctx.flags.add(`Word's own caption numbers (Table 1, Figure 1) were written as chapter numbers (Table ${options.chapter}.1).`);
  if (c.toc) ctx.flags.add("A table of contents inside the chapter was left out (the report has its own).");
  if (c.bold) ctx.flags.add("Bold text in the body was set as normal text (the report's body has no bold).");
  if (c.merged) ctx.flags.add("Merged table cells were split back into single cells. Check the tables.");
  if (c.pipes) ctx.flags.add("A table cell's vertical bar (|) was written as a slash (/).");
  for (const l of c.lossyMath) ctx.flags.add(`In an equation, ${l}.`);

  const stamp = readStamp(customXml);
  if (stamp?.project && options.projectCode && stamp.project !== options.projectCode) {
    ctx.blocking.add(`This file is from project ${stamp.project}${stamp.chapter ? `, Chapter ${stamp.chapter}` : ""}, not ${options.projectCode}. Upload the right file.`);
  } else if (stamp?.chapter && stamp.chapter !== options.chapter) {
    ctx.blocking.add(`This file is Chapter ${stamp.chapter}, not Chapter ${options.chapter}. Upload it to Chapter ${stamp.chapter}, or upload the right file here.`);
  }

  const firstH1 = items.find((i): i is Extract<Item, { k: "heading" }> => i.k === "heading" && i.level === 1);
  const chapterLine = firstH1?.lines.find((l) => CHAPTER_LINE.test(l)) ?? null;
  if (chapterLine) {
    const word = CHAPTER_LINE.exec(chapterLine)?.[1]?.toUpperCase() ?? "";
    const n = WORDS[word] ?? Number(word);
    if (n && n !== options.chapter) ctx.flags.add(`The file's heading says ${chapterLine}, but it was uploaded as Chapter ${options.chapter} (${chapterWord(options.chapter)}).`);
  } else ctx.flags.add(`No "CHAPTER ${chapterWord(options.chapter)}" heading (Heading 1) was found; the report uses its own chapter heading.`);

  // ── Pictures: their bytes (for the hash) ──
  const assets = [...ctx.assets.values()];
  for (const a of assets) {
    const f = zip.file(a.key);
    if (!f) {
      ctx.blocking.add(`A picture (${a.key.split("/").pop()}) is missing from the file. Insert it again and save.`);
      continue;
    }
    a.sha = crypto.createHash("sha256").update(await f.async("uint8array")).digest("hex").slice(0, 32);
  }

  // ── Self-check: the builder must read what the reader wrote ──
  const parsed = parseChapter(markup, options.chapter);
  const kinds = (k: string) => parsed.blocks.filter((b) => b.kind === k).length;
  const expected = { tables: items.filter((i) => i.k === "table").length, equations: items.filter((i) => i.k === "equation").length, images: assets.length };
  const parsedImages = parsed.blocks.filter((b) => b.kind === "figure" && b.image).length;
  if (kinds("table") < expected.tables) ctx.flags.add(`Only ${kinds("table")} of the ${expected.tables} tables could be read as tables. Check the tables in the summary.`);
  if (kinds("equation") < expected.equations) ctx.flags.add(`Only ${kinds("equation")} of the ${expected.equations} equations could be read as equations.`);
  if (parsedImages < expected.images) ctx.flags.add(`Only ${parsedImages} of the ${expected.images} pictures could be placed as figures.`);

  const prose = parsed.blocks.flatMap((b) => (b.kind === "paragraph" ? [b.text] : b.kind === "list" ? b.items.map((x) => x.text) : b.kind === "heading" ? [b.text] : []));
  const words = prose.join(" ").replace(/[*^_{}]/g, " ").split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
  const placeholders = [...new Set(findPlaceholders(markup))];
  // Davis (1989) and Yamane (1967) are cited by habit: the gate only warns about them, and so does this.
  const unmatchedCitations = options.references
    ? citedReferences([...options.references], [markup]).unmatched.filter((c) => {
        const cut = c.lastIndexOf(", ");
        return cut === -1 || !knownCommonCitation(c.slice(0, cut), c.slice(cut + 2));
      })
    : [];
  if (unmatchedCitations.length) {
    ctx.flags.add(
      `${unmatchedCitations.length === 1 ? "A citation matches" : `${unmatchedCitations.length} citations match`} no verified reference: ${unmatchedCitations.slice(0, 6).join("; ")}${unmatchedCitations.length > 6 ? "; …" : ""}. The quality check fails a work that is not on the list.`,
    );
  }

  const hash = crypto
    .createHash("sha256")
    .update(`${READER_VERSION}\n${markup}\n${assets.map((a) => `${a.key}:${a.sha}:${a.width}x${a.height}`).join(",")}`)
    .digest("hex")
    .slice(0, 32);

  return {
    markup,
    assets,
    summary: {
      words,
      headings: parsed.blocks.filter((b) => b.kind === "heading").length,
      tables: kinds("table"),
      equations: kinds("equation"),
      figures: kinds("figure"),
      images: parsedImages,
      notes: allEntries.length,
      wordNotes: wordEntries.length,
      trackedInsertions: c.insertions,
      trackedDeletions: c.deletions,
      comments: commentCount,
      chapterLine,
      referencesSection,
      stamp,
      placeholders,
      unmatchedCitations,
    },
    blocking: [...ctx.blocking],
    flags: [...ctx.flags],
    hash,
    readerVersion: READER_VERSION,
  };
}

/** The pictures a read-back uses, from the .docx they came from (by their key). */
export async function extractMedia(bytes: Uint8Array, keys: readonly string[]): Promise<Map<string, Uint8Array>> {
  const zip = await JSZip.loadAsync(bytes);
  const out = new Map<string, Uint8Array>();
  for (const key of keys) {
    const f = zip.file(key);
    if (f) out.set(key, await f.async("uint8array"));
  }
  return out;
}
