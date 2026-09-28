/**
 * Phase D8 Layer 1: the 71 formatting rules (prompts/shared/formatting_rules.md),
 * read back from the assembled Word file's XML. No AI tokens.
 *
 * D7 builds most of these by construction, so this layer is the proof and it
 * catches what comes from the chapter text itself (a fourth heading level, a
 * table with no caption, a figure with no source, an equation left in a
 * sentence, a references list out of order). Page numbers inside the Table of
 * Contents and the lists exist only once Word updates the fields: TOC2, LF2 and
 * LT2 prove the fields are built from exactly the headings and captions.
 */

import JSZip from "jszip";
import type { AssemblyInput, AssemblyProfile, AssemblyReport } from "@/lib/assembly/assemble";
import { parseChapter } from "@/lib/assembly/parse-chapter";
import { citationsIn, citedReferences, nameKey, properNounsFrom, referencesForCitation, sentenceCase, titleCase } from "@/lib/assembly/text-rules";
import { result, shortQuote, type CheckResult, type QualityIssue, type Severity } from "./types";

// ─── Reading the file ────────────────────────────────────────────────────────

export interface DocxParts {
  document: string;
  styles: string;
  settings: string;
  rels: string;
  /** "footer1.xml" → its XML. */
  footers: Record<string, string>;
}

export async function readDocxParts(buffer: Uint8Array): Promise<DocxParts> {
  const zip = await JSZip.loadAsync(buffer);
  const read = async (name: string) => (await zip.file(name)?.async("string")) ?? "";
  const footerNames = Object.keys(zip.files).filter((f) => /^word\/footer\d+\.xml$/.test(f));
  const footers: Record<string, string> = {};
  for (const f of footerNames) footers[f.slice("word/".length)] = await read(f);
  return {
    document: await read("word/document.xml"),
    styles: await read("word/styles.xml"),
    settings: await read("word/settings.xml"),
    rels: await read("word/_rels/document.xml.rels"),
    footers,
  };
}

// ─── XML helpers ─────────────────────────────────────────────────────────────

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
/** A paragraph's text; a line break (the chapter heading's) reads as a space. */
const textOf = (xml: string) => decode([...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:br\/>/g)].map((m) => m[1] ?? " ").join(""));
const PARA = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
const TABLE = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
const paragraphs = (xml: string) => xml.match(PARA) ?? [];
const tables = (xml: string) => xml.match(TABLE) ?? [];
const pPrOf = (p: string) => /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(p)?.[1] ?? "";
const styleOf = (p: string) => /<w:pStyle w:val="([^"]+)"/.exec(pPrOf(p))?.[1] ?? null;
/** The paragraph's own alignment (its pPr, never the section properties inside it). */
const jcOf = (p: string) => /<w:jc w:val="([^"]+)"/.exec(pPrOf(p).replace(/<w:sectPr[\s\S]*?<\/w:sectPr>/, ""))?.[1] ?? null;
const styleBlock = (styles: string, id: string) => new RegExp(`<w:style [^>]*w:styleId="${id}"[^>]*>[\\s\\S]*?</w:style>`).exec(styles)?.[0] ?? "";
const attrs = (xml: string, tag: string, name: string) => [...xml.matchAll(new RegExp(`<${tag}\\s[^>]*?${name}="([^"]*)"`, "g"))].map((m) => m[1]);
const isOn = (xml: string, tag: string) => new RegExp(`<${tag}/>|<${tag} w:val="(?:true|1|on)"/>`).test(xml);

interface Run {
  text: string;
  italic: boolean;
}
function runsOf(p: string): Run[] {
  return [...p.matchAll(/<w:r>([\s\S]*?)<\/w:r>|<w:r [^>]*>([\s\S]*?)<\/w:r>/g)].map((m) => {
    const body = m[1] ?? m[2] ?? "";
    const rPr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(body)?.[1] ?? "";
    return { text: textOf(body), italic: isOn(rPr, "w:i") };
  });
}

const HEADING_STYLES = ["Heading1", "Heading2", "Heading3"];
const CHAPTER_WORDS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN"];

/** One paragraph outside the tables, in order, with the chapter it sits in. */
export interface Para {
  xml: string;
  text: string;
  style: string | null;
  chapter: number | null;
  /** In the body section (Chapter One onward). */
  body: boolean;
}

export interface Doc {
  parts: DocxParts;
  sectPrs: string[];
  outside: Para[];
  /** Every table, in order, with the chapter it sits in and the paragraph just above it. */
  tables: { xml: string; chapter: number | null; before: Para | null; after: Para | null }[];
  heading1: string[];
}

export function readDoc(parts: DocxParts): Doc {
  const doc = parts.document;
  const sectPrs = doc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g) ?? [];
  // The body section starts after the last section break inside a paragraph.
  const lastBreak = doc.lastIndexOf("</w:sectPr></w:pPr>");
  const bodyStart = lastBreak === -1 ? 0 : lastBreak;
  const outside: Para[] = [];
  const tbls: Doc["tables"] = [];
  let chapter: number | null = null;
  // Walk the document in order: a table or a paragraph at a time.
  const token = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
  let pendingTable: Doc["tables"][number] | null = null;
  for (const m of doc.matchAll(token)) {
    const xml = m[0];
    const at = m.index ?? 0;
    if (xml.startsWith("<w:tbl>")) {
      const entry = { xml, chapter, before: outside[outside.length - 1] ?? null, after: null };
      tbls.push(entry);
      pendingTable = entry;
      continue;
    }
    const text = textOf(xml);
    const style = styleOf(xml);
    if (style === "Heading1") {
      const word = /^CHAPTER\s+(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)\b/.exec(text)?.[1];
      const n = word ? CHAPTER_WORDS.indexOf(word) + 1 : 0;
      if (n > 0) chapter = n;
      else if (at > bodyStart) chapter = null; // REFERENCES
    }
    const para = { xml, text, style, chapter: at > bodyStart ? chapter : null, body: at > bodyStart };
    if (pendingTable) {
      pendingTable.after = para;
      pendingTable = null;
    }
    outside.push(para);
  }
  return {
    parts,
    sectPrs,
    outside,
    tables: tbls,
    heading1: outside.filter((p) => p.style === "Heading1").map((p) => p.text),
  };
}

// ─── The rules ───────────────────────────────────────────────────────────────

export interface FormattingContext {
  input: AssemblyInput;
  report: AssemblyReport;
  profile: AssemblyProfile;
  /** A standard source cited by habit (Davis 1989, Yamane 1967): a WARN when missing from the list, never a failure. */
  knownCommon?: (author: string, year: string) => { work: string } | null;
}

type RuleDef = { id: string; title: string; severity: Severity };

/** The 71 rules in the order of formatting_rules.md, with the severity a failure carries. */
export const FORMATTING_RULES: readonly RuleDef[] = [
  { id: "F1", title: "Times New Roman throughout", severity: "CRITICAL" },
  { id: "F2", title: "Body text 12pt", severity: "MAJOR" },
  { id: "F3", title: "Headings 12pt, no other size anywhere", severity: "MAJOR" },
  { id: "F4", title: "Headings bold", severity: "MAJOR" },
  { id: "F5", title: "Black text only", severity: "MAJOR" },
  { id: "F6", title: "No underlined headings", severity: "MINOR" },
  { id: "S1", title: "Line spacing 2.0", severity: "CRITICAL" },
  { id: "S2", title: "No space before headings", severity: "MAJOR" },
  { id: "S3", title: "No space after headings", severity: "MAJOR" },
  { id: "S4", title: "Headings at 2.0", severity: "MAJOR" },
  { id: "S5", title: "No extra paragraph spacing", severity: "MAJOR" },
  { id: "MG1", title: "Top margin 1.0 inch", severity: "CRITICAL" },
  { id: "MG2", title: "Bottom margin 1.0 inch", severity: "CRITICAL" },
  { id: "MG3", title: "Left margin 1.0 inch", severity: "CRITICAL" },
  { id: "MG4", title: "Right margin 1.0 inch", severity: "CRITICAL" },
  { id: "AL1", title: "Body text justified", severity: "MAJOR" },
  { id: "AL2", title: "Heading 1 centred, upper case", severity: "MAJOR" },
  { id: "AL3", title: "Heading 2 left, Title Case", severity: "MINOR" },
  { id: "AL4", title: "Heading 3 left, sentence case", severity: "MINOR" },
  { id: "H1", title: "Chapter headings: 12pt bold, centred, capitals", severity: "MAJOR" },
  { id: "H2", title: "Section headings: 12pt bold, left, Title Case", severity: "MAJOR" },
  { id: "H3", title: "Sub-section headings: 12pt bold, left, sentence case", severity: "MAJOR" },
  { id: "H4", title: "No heading level below H3", severity: "MAJOR" },
  { id: "P1", title: "No first-line indent", severity: "MAJOR" },
  { id: "P2", title: "No dashes as sentence separators", severity: "MAJOR" },
  { id: "P3", title: "Hyphens only inside words", severity: "MINOR" },
  { id: "P4", title: "Every et al. italic", severity: "MINOR" },
  { id: "P5", title: "No highlight or shading", severity: "MAJOR" },
  { id: "PN1", title: "Preliminary pages in Roman numerals", severity: "CRITICAL" },
  { id: "PN2", title: "Main body in Arabic numerals", severity: "CRITICAL" },
  { id: "PN3", title: "Numbering restarts at 1 at Chapter One", severity: "CRITICAL" },
  { id: "PN4", title: "Page numbers centred in the footer", severity: "MAJOR" },
  { id: "T1", title: "Tables kept on one page", severity: "MINOR" },
  { id: "T2", title: "Engineering: three-line tables", severity: "MAJOR" },
  { id: "T3", title: "Engineering: no vertical borders", severity: "MAJOR" },
  { id: "T4", title: "No cell shading", severity: "MINOR" },
  { id: "T5", title: "Every table has a caption", severity: "MAJOR" },
  { id: "T6", title: "Table captions above, centred", severity: "MINOR" },
  { id: "T7", title: "Table captions in the Table Caption style", severity: "MINOR" },
  { id: "T8", title: "Every table in the List of Tables", severity: "MINOR" },
  { id: "FG1", title: "Every figure has a caption", severity: "MAJOR" },
  { id: "FG2", title: "Figure captions below, centred", severity: "MINOR" },
  { id: "FG3", title: "Figure captions in the Figure Caption style", severity: "MINOR" },
  { id: "FG4", title: "External figures cite their source", severity: "MAJOR" },
  { id: "FG5", title: "Own figures marked (Author, Year)", severity: "MAJOR" },
  { id: "FG6", title: "Every figure in the List of Figures", severity: "MINOR" },
  { id: "EQ1", title: "Equations on their own line", severity: "MAJOR" },
  { id: "EQ2", title: "Equations in borderless two-column tables", severity: "MAJOR" },
  { id: "EQ3", title: "Equation numbers 3.1, no parentheses", severity: "MAJOR" },
  { id: "EQ4", title: "Equation numbers restart each chapter", severity: "MINOR" },
  { id: "EQ5", title: "Native Word equations", severity: "MAJOR" },
  { id: "TOC1", title: "Table of Contents present", severity: "MAJOR" },
  { id: "TOC2", title: "Contents built from the headings", severity: "MINOR" },
  { id: "TOC3", title: "Contents page numbers are a field", severity: "MAJOR" },
  { id: "TOC4", title: "Contents include H1 to H3", severity: "MAJOR" },
  { id: "TOC5", title: "No dotted leaders in the Contents", severity: "MAJOR" },
  { id: "LF1", title: "List of Figures present", severity: "MAJOR" },
  { id: "LF2", title: "List of Figures built from the captions", severity: "MINOR" },
  { id: "LF3", title: "No dotted leaders in the List of Figures", severity: "MINOR" },
  { id: "LT1", title: "List of Tables present", severity: "MAJOR" },
  { id: "LT2", title: "List of Tables built from the captions", severity: "MINOR" },
  { id: "LT3", title: "No dotted leaders in the List of Tables", severity: "MINOR" },
  { id: "LA1", title: "List of Appendices present", severity: "MAJOR" },
  { id: "LA2", title: "List of Appendices built from the titles", severity: "MINOR" },
  { id: "LA3", title: "No dotted leaders in the List of Appendices", severity: "MINOR" },
  { id: "R1", title: "References section present", severity: "MAJOR" },
  { id: "R2", title: "References in alphabetical order", severity: "MAJOR" },
  { id: "R3", title: "Hanging indent on references", severity: "MINOR" },
  { id: "R4", title: "Journal names italic", severity: "MINOR" },
  { id: "R5", title: "et al. italic in references", severity: "MINOR" },
  { id: "R6", title: "No duplicate references", severity: "MAJOR" },
];

/** What the specialist does in Word when a rule fails (shown with the failure). */
export const FORMATTING_FIX: Record<string, string> = {
  F1: "Set the font to Times New Roman.",
  F2: "Set the body text to 12pt.",
  F3: "Set every heading to 12pt and remove other sizes.",
  F4: "Make the heading bold.",
  F5: "Set the text colour to black (Automatic).",
  F6: "Remove the underline; headings are bold only.",
  S1: "Set line spacing to Double (2.0).",
  S2: "Set Spacing Before to 0 pt on the heading.",
  S3: "Set Spacing After to 0 pt on the heading.",
  S4: "Set the heading's line spacing to Double.",
  S5: "Set Spacing Before and After to 0 pt.",
  MG: "Set the margin to 1.0 inch (Layout, Margins).",
  AL1: "Justify the paragraph.",
  AL2: "Centre the chapter heading and write it in capitals.",
  AL3: "Left-align the heading and write it in Title Case.",
  AL4: "Left-align the heading and write it in sentence case.",
  H4: "Merge the fourth-level heading into its sub-section; only three heading levels are allowed.",
  P1: "Remove the first-line indent.",
  P2: "Replace the dash with a comma.",
  P3: "Replace the spaced hyphen with a comma.",
  P4: "Italicise et al.",
  P5: "Remove the highlight or shading.",
  PN: "Insert a section break (next page) before Chapter One and restart numbering at 1 in Arabic numerals, with Roman numerals before it.",
  PN4: "Centre the page number in the footer.",
  T1: "In Table Properties, untick 'Allow row to break across pages' and keep the table on one page.",
  T2: "Use the three-line format: top line, a line under the header row, bottom line.",
  T3: "Remove the vertical borders.",
  T4: "Remove the cell shading.",
  T5: "Add a caption above the table (Table N.M: Title).",
  T6: "Put the caption directly above the table, centred.",
  T7: "Apply the Table Caption style to the caption.",
  T8: "Apply the Table Caption style so the List of Tables collects it, then update the list.",
  FG1: "Add a caption below the figure (Figure N.M: Title).",
  FG2: "Put the caption directly below the figure, centred.",
  FG3: "Apply the Figure Caption style to the caption.",
  FG4: "Cite the figure's source in the caption and add it to the References.",
  FG5: "Mark an original figure (Author, Year) in its caption.",
  FG6: "Apply the Figure Caption style so the List of Figures collects it, then update the list.",
  EQ1: "Move the equation onto its own line in the two-column equation table.",
  EQ2: "Put the equation in a borderless two-column table: equation left, number right.",
  EQ3: "Number the equation 3.1, without parentheses.",
  EQ4: "Number equations in order within each chapter (3.1, 3.2 …).",
  EQ5: "Insert the equation as a Word equation (Insert, Equation).",
  TOC: "Insert the Table of Contents from Heading 1 to Heading 3 (References, Table of Contents) with no tab leader, then update it.",
  LF: "Insert the List of Figures from the Figure Caption style with no tab leader, then update it.",
  LT: "Insert the List of Tables from the Table Caption style with no tab leader, then update it.",
  R1: "Add the References section.",
  R2: "Sort the references alphabetically by first author's surname.",
  R3: "Give the references a hanging indent.",
  R4: "Italicise the journal name.",
  R5: "Italicise et al.",
  R6: "Remove the duplicate reference.",
};

const fixFor = (id: string) => FORMATTING_FIX[id] ?? FORMATTING_FIX[id.replace(/\d+$/, "")] ?? null;

export function runFormattingChecks(parts: DocxParts, ctx: FormattingContext): CheckResult[] {
  const doc = readDoc(parts);
  const { styles, document: xml } = parts;
  const withPrelims = ctx.input.includePrelims;
  const engineering = ctx.profile === "ENGINEERING";
  const rule = (id: string) => {
    const def = FORMATTING_RULES.find((r) => r.id === id);
    if (!def) throw new Error(`Unknown formatting rule ${id}`);
    return { id, layer: "formatting" as const, title: def.title, severity: def.severity };
  };
  const fail = (id: string, message: string, where: { chapter?: number | null; quote?: string | null } = {}): QualityIssue => ({
    level: "FAIL",
    message,
    chapter: where.chapter ?? null,
    quote: where.quote ? shortQuote(where.quote, 120) : null,
    fix: fixFor(id),
  });
  const warn = (id: string, message: string, where: { chapter?: number | null; quote?: string | null } = {}): QualityIssue => ({
    ...fail(id, message, where),
    level: "WARN",
  });
  const out: CheckResult[] = [];
  const push = (id: string, issues: QualityIssue[], summary: { pass: string; fail?: string; na?: string } | string, opts: { na?: boolean } = {}) =>
    out.push(result(rule(id), opts.na ? [] : issues, summary, opts));

  const footerXml = Object.values(parts.footers);
  const all = [xml, styles, ...footerXml].join("\n");
  const docDefaults = /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/.exec(styles)?.[0] ?? "";
  const headingParas = doc.outside.filter((p) => p.style && HEADING_STYLES.includes(p.style));
  const bodyProse = doc.outside.filter((p) => p.body && !p.style && p.text.trim() && !p.text.includes("[FIGURE PLACEHOLDER") && !/^Source\s*:/i.test(p.text.trim()));
  const usedStyles = [...new Set(doc.outside.map((p) => p.style).filter((s): s is string => !!s))];
  const dataTables = doc.tables.filter((t) => t.xml.includes("<w:tblHeader") && !t.xml.includes("<m:oMath"));
  const eqTables = doc.tables.filter((t) => t.xml.includes("<m:oMath"));
  const figures = doc.outside.filter((p) => p.text.includes("[FIGURE PLACEHOLDER"));
  const refParas = doc.outside.filter((p) => p.style === "Reference");
  const tocInstr = [...xml.matchAll(/<w:instrText[^>]*>([^<]*)<\/w:instrText>/g)].map((m) => decode(m[1]).trim()).filter((t) => /^TOC\b/.test(t));
  const mainToc = tocInstr.find((t) => /\\o\s+"1-3"/.test(t)) ?? tocInstr.find((t) => !/\\t\s+"/.test(t)) ?? null;
  const listField = (styleName: string) => tocInstr.find((t) => t.includes(`\\t "${styleName},1"`)) ?? null;
  const spacingOf = (block: string) => /<w:spacing [^>]*\/>/.exec(block)?.[0] ?? "";
  const num = (s: string, a: string) => Number(new RegExp(`w:${a}="(-?\\d+)"`).exec(s)?.[1] ?? NaN);
  const locate = (p: Para) => ({ chapter: p.chapter, quote: p.text });

  // ── F1–F6 fonts ──────────────────────────────────────────────────────────
  {
    const fonts = [...attrs(all, "w:rFonts", "w:ascii"), ...attrs(all, "w:rFonts", "w:hAnsi"), ...attrs(all, "w:rFonts", "w:cs")];
    const bad = [...new Set(fonts.filter((f) => f !== "Times New Roman"))];
    const themed = /<w:rFonts [^>]*w:(?:ascii|hAnsi)Theme=/.test(all);
    push(
      "F1",
      [
        ...bad.map((f) => fail("F1", `Text is set in ${f}.`)),
        ...(themed ? [fail("F1", "A style takes its font from the document theme instead of Times New Roman.")] : []),
        ...(fonts.length === 0 ? [fail("F1", "No font is set anywhere, so Word's default applies.")] : []),
      ],
      { pass: "Every run, style, footer and equation is Times New Roman.", fail: "Text in another font." },
    );
  }
  const sizes = [...attrs(all, "w:sz", "w:val"), ...attrs(all, "w:szCs", "w:val")];
  {
    const bodySize = attrs(docDefaults, "w:sz", "w:val")[0];
    const normal = styleBlock(styles, "Normal");
    const normalSize = attrs(normal, "w:sz", "w:val")[0];
    const proseSizes = bodyProse.flatMap((p) => attrs(p.xml, "w:sz", "w:val")).filter((s) => s !== "24");
    push(
      "F2",
      [
        ...(bodySize !== "24" ? [fail("F2", `The document's default size is ${bodySize ? Number(bodySize) / 2 : "unset"}pt.`)] : []),
        ...(normalSize && normalSize !== "24" ? [fail("F2", `The Normal style is ${Number(normalSize) / 2}pt.`)] : []),
        ...[...new Set(proseSizes)].map((s) => fail("F2", `Body text at ${Number(s) / 2}pt.`)),
      ],
      "Body text is 12pt.",
    );
    const headingSizes = HEADING_STYLES.map((id) => attrs(styleBlock(styles, id), "w:sz", "w:val")[0]);
    const other = [...new Set(sizes.filter((s) => s !== "24"))];
    push(
      "F3",
      [
        ...HEADING_STYLES.filter((_, i) => headingSizes[i] !== "24").map((id, i) => fail("F3", `${id.replace("Heading", "Heading ")} is ${headingSizes[i] ? Number(headingSizes[i]) / 2 : "not set to 12"}pt.`)),
        ...other.map((s) => fail("F3", `Text at ${Number(s) / 2}pt appears in the document.`)),
      ],
      "Headings are 12pt and nothing in the document is any other size.",
    );
  }
  push(
    "F4",
    [
      ...HEADING_STYLES.filter((id) => !isOn(styleBlock(styles, id), "w:b")).map((id) => fail("F4", `The ${id.replace("Heading", "Heading ")} style is not bold.`)),
      ...headingParas.filter((p) => /<w:b w:val="(?:false|0|off)"\/>/.test(p.xml)).map((p) => fail("F4", "A heading has its bold turned off.", locate(p))),
    ],
    "Heading 1–3 are bold.",
  );
  {
    const colours = [...new Set(attrs(all, "w:color", "w:val").filter((c) => !/^(?:000000|auto)$/i.test(c)))];
    push("F5", colours.map((c) => fail("F5", `Text is coloured #${c}.`)), "All text is black.");
  }
  push(
    "F6",
    [
      ...HEADING_STYLES.filter((id) => /<w:u w:val="(?!none)/.test(styleBlock(styles, id))).map((id) => fail("F6", `The ${id.replace("Heading", "Heading ")} style is underlined.`)),
      ...headingParas.filter((p) => /<w:u w:val="(?!none)/.test(p.xml)).map((p) => fail("F6", "A heading is underlined.", locate(p))),
    ],
    "No heading is underlined.",
  );

  // ── S1–S5 spacing ────────────────────────────────────────────────────────
  {
    const dd = spacingOf(docDefaults);
    const issues: QualityIssue[] = [];
    if (num(dd, "line") !== 480 || !/w:lineRule="auto"/.test(dd)) issues.push(fail("S1", "The document's default line spacing is not Double (2.0)."));
    for (const id of usedStyles) {
      const s = spacingOf(styleBlock(styles, id));
      if (s && /w:line=/.test(s) && num(s, "line") !== 480) issues.push(fail("S1", `The ${id} style is not double spaced.`));
    }
    for (const p of doc.outside) {
      const s = spacingOf(pPrOf(p.xml));
      if (s && /w:line=/.test(s) && num(s, "line") !== 480) issues.push(fail("S1", "A paragraph is not double spaced.", locate(p)));
    }
    push("S1", issues, "Double (2.0) spacing throughout; only table cells are tighter, which the rules allow.");
  }
  const headingSpacing = (attr: "before" | "after" | "line", id: string): QualityIssue[] => {
    const issues: QualityIssue[] = [];
    for (const style of HEADING_STYLES) {
      const s = spacingOf(styleBlock(styles, style));
      const v = num(s, attr);
      const bad = attr === "line" ? !(v === 480 || (Number.isNaN(v) && num(spacingOf(docDefaults), "line") === 480)) : v > 0;
      if (bad) issues.push(fail(id, `The ${style.replace("Heading", "Heading ")} style has ${attr === "line" ? "line spacing other than Double" : `space ${attr} it`}.`));
    }
    for (const p of headingParas) {
      const s = spacingOf(pPrOf(p.xml));
      const v = num(s, attr);
      if (attr === "line" ? s && /w:line=/.test(s) && v !== 480 : v > 0) issues.push(fail(id, `A heading has ${attr === "line" ? "its own line spacing" : `space ${attr} it`}.`, locate(p)));
    }
    return issues;
  };
  push("S2", headingSpacing("before", "S2"), "No space before any heading.");
  push("S3", headingSpacing("after", "S3"), "No space after any heading.");
  push("S4", headingSpacing("line", "S4"), "Headings are double spaced like the body.");
  {
    const issues: QualityIssue[] = [];
    const dd = spacingOf(docDefaults);
    if (num(dd, "before") > 0 || num(dd, "after") > 0) issues.push(fail("S5", "The document's default paragraph has space before or after it."));
    for (const id of usedStyles) {
      const s = spacingOf(styleBlock(styles, id));
      if (num(s, "before") > 0 || num(s, "after") > 0) issues.push(fail("S5", `The ${id} style adds space before or after paragraphs.`));
    }
    for (const p of doc.outside) {
      const s = spacingOf(pPrOf(p.xml));
      if (num(s, "before") > 0 || num(s, "after") > 0) issues.push(fail("S5", "A paragraph has space before or after it.", locate(p)));
    }
    push("S5", issues, "No extra space before or after any paragraph.");
  }

  // ── MG1–MG4 margins ──────────────────────────────────────────────────────
  for (const [id, side] of [["MG1", "top"], ["MG2", "bottom"], ["MG3", "left"], ["MG4", "right"]] as const) {
    const values = attrs(xml, "w:pgMar", `w:${side}`).map(Number);
    const bad = values.filter((v) => Math.abs(v - 1440) > 72);
    push(
      id,
      [...(values.length === 0 ? [fail(id, `No ${side} margin is set.`)] : []), ...[...new Set(bad)].map((v) => fail(id, `The ${side} margin is ${(v / 1440).toFixed(2)} inch.`))],
      `The ${side} margin is 1.0 inch in every section.`,
    );
  }

  // ── AL1–AL4 alignment, H1–H4 headings ────────────────────────────────────
  {
    const issues: QualityIssue[] = [];
    if (!/<w:jc w:val="both"\/>/.test(docDefaults)) issues.push(fail("AL1", "Body text is not justified by default."));
    for (const p of bodyProse) {
      const jc = jcOf(p.xml);
      if (jc && jc !== "both") issues.push(fail("AL1", `A paragraph is aligned ${jc === "center" ? "centre" : jc}.`, locate(p)));
    }
    push("AL1", issues, "Body text is justified.");
  }
  const h1Paras = doc.outside.filter((p) => p.style === "Heading1");
  const h2Paras = doc.outside.filter((p) => p.style === "Heading2");
  const h3Paras = doc.outside.filter((p) => p.style === "Heading3");
  const styleJc = (id: string) => /<w:jc w:val="([^"]+)"/.exec(styleBlock(styles, id))?.[1] ?? null;
  const leftish = (jc: string | null) => jc === null || jc === "left" || jc === "start";
  push(
    "AL2",
    [
      ...(styleJc("Heading1") !== "center" ? [fail("AL2", "The Heading 1 style is not centred.")] : []),
      ...h1Paras.filter((p) => jcOf(p.xml) && jcOf(p.xml) !== "center").map((p) => fail("AL2", "A chapter heading is not centred.", locate(p))),
      ...h1Paras.filter((p) => p.text !== p.text.toUpperCase()).map((p) => fail("AL2", "A Heading 1 is not in capitals.", locate(p))),
    ],
    "Heading 1 is centred and in capitals.",
  );
  const properNouns = properNounsFrom(ctx.input.chapters.map((c) => c.text));
  push(
    "AL3",
    [
      ...(!leftish(styleJc("Heading2")) ? [fail("AL3", "The Heading 2 style is not left-aligned.")] : []),
      ...h2Paras.filter((p) => !leftish(jcOf(p.xml))).map((p) => fail("AL3", "A section heading is not left-aligned.", locate(p))),
      ...h2Paras.filter((p) => p.body && titleCase(p.text) !== p.text).map((p) => fail("AL3", `A section heading is not in Title Case (should read "${titleCase(p.text)}").`, locate(p))),
    ],
    "Heading 2 is left-aligned, in Title Case.",
  );
  push(
    "AL4",
    [
      ...(!leftish(styleJc("Heading3")) ? [fail("AL4", "The Heading 3 style is not left-aligned.")] : []),
      ...h3Paras.filter((p) => !leftish(jcOf(p.xml))).map((p) => fail("AL4", "A sub-section heading is not left-aligned.", locate(p))),
      ...h3Paras.filter((p) => sentenceCase(p.text, properNouns) !== p.text).map((p) => fail("AL4", `A sub-section heading is not in sentence case (should read "${sentenceCase(p.text, properNouns)}").`, locate(p))),
    ],
    "Heading 3 is left-aligned, in sentence case.",
  );
  const headingStyleIssues = (id: "H1" | "H2" | "H3", style: string, align: "center" | "left"): QualityIssue[] => {
    const block = styleBlock(styles, style);
    const issues: QualityIssue[] = [];
    if (!block) return [fail(id, `The ${style} style is missing.`)];
    if (attrs(block, "w:sz", "w:val")[0] !== "24") issues.push(fail(id, `${style} is not 12pt.`));
    if (!isOn(block, "w:b")) issues.push(fail(id, `${style} is not bold.`));
    if (attrs(block, "w:rFonts", "w:ascii")[0] !== "Times New Roman") issues.push(fail(id, `${style} is not Times New Roman.`));
    const jc = styleJc(style);
    if (align === "center" ? jc !== "center" : !leftish(jc)) issues.push(fail(id, `${style} is not ${align === "center" ? "centred" : "left-aligned"}.`));
    return issues;
  };
  push("H1", [...headingStyleIssues("H1", "Heading1", "center"), ...h1Paras.filter((p) => p.text !== p.text.toUpperCase()).map((p) => fail("H1", "A chapter heading is not in capitals.", locate(p)))], "Chapter headings: 12pt, bold, Times New Roman, centred, capitals.");
  push("H2", [...headingStyleIssues("H2", "Heading2", "left"), ...h2Paras.filter((p) => p.body && titleCase(p.text) !== p.text).map((p) => fail("H2", "A section heading is not in Title Case.", locate(p)))], "Section headings: 12pt, bold, Times New Roman, left, Title Case.");
  push("H3", [...headingStyleIssues("H3", "Heading3", "left"), ...h3Paras.filter((p) => sentenceCase(p.text, properNouns) !== p.text).map((p) => fail("H3", "A sub-section heading is not in sentence case.", locate(p)))], "Sub-section headings: 12pt, bold, Times New Roman, left, sentence case.");
  {
    const issues: QualityIssue[] = [];
    if (/<w:pStyle w:val="Heading[4-9]"\/>/.test(xml)) issues.push(fail("H4", "A Heading 4 (or lower) style is used."));
    for (const ch of ctx.input.chapters) {
      for (const b of parseChapter(ch.text, ch.number).blocks) {
        if (b.kind === "heading" && b.tooDeep) issues.push(fail("H4", "A fourth heading level (1.1.1.1) is used.", { chapter: ch.number, quote: b.text }));
      }
    }
    push("H4", issues, "Headings go no deeper than H3.");
  }

  // ── P1–P5 paragraphs ─────────────────────────────────────────────────────
  {
    const issues: QualityIssue[] = [];
    if (/w:firstLine="[1-9]/.test(styles)) issues.push(fail("P1", "A style indents the first line."));
    for (const p of doc.outside) if (/w:firstLine="[1-9]/.test(pPrOf(p.xml))) issues.push(fail("P1", "A paragraph has a first-line indent.", locate(p)));
    push("P1", issues, "No first-line indents.");
  }
  {
    const dash = /\p{L}[\s ]*[—–][\s ]*\p{L}/u;
    const issues = bodyProse.filter((p) => dash.test(p.text.replace(/\[[^\]]*\]/g, ""))).map((p) => fail("P2", "A dash is used as a sentence separator.", locate(p)));
    const note = ctx.report.dashesFixed ? ` The assembly changed ${ctx.report.dashesFixed} to commas.` : "";
    push("P2", issues, { pass: `No dash is used as a sentence separator.${note}`, fail: "Dashes used as sentence separators." });
  }
  push(
    "P3",
    bodyProse.filter((p) => /\p{L}\s+-\s+\p{L}/u.test(p.text.replace(/\[[^\]]*\]/g, ""))).map((p) => fail("P3", "A spaced hyphen is used as a separator.", locate(p))),
    "Hyphens appear only inside words.",
  );
  {
    const issues: QualityIssue[] = [];
    const scan = (p: string, where: { chapter: number | null; quote: string }) => {
      const total = (textOf(p).match(/\bet\.?\s+al\b/g) ?? []).length;
      const italic = runsOf(p).filter((r) => r.italic).reduce((n, r) => n + (r.text.match(/\bet\.?\s+al\b/g) ?? []).length, 0);
      if (total > italic) issues.push(fail("P4", `"et al." is not italic (${total - italic}).`, where));
    };
    for (const p of doc.outside) scan(p.xml, locate(p));
    for (const t of doc.tables) for (const p of paragraphs(t.xml)) scan(p, { chapter: t.chapter, quote: textOf(p) });
    push("P4", issues, { pass: `Every et al. is italic (${ctx.report.etAl} in the report).`, fail: "Some et al. are not italic." });
  }
  {
    const outsideTables = xml.replace(TABLE, "");
    const shaded = [...outsideTables.matchAll(/<w:shd [^>]*w:fill="([^"]+)"/g)].map((m) => m[1]).filter((f) => !/^(?:auto|FFFFFF)$/i.test(f));
    push(
      "P5",
      [...(/<w:highlight /.test(xml) ? [fail("P5", "Text is highlighted.")] : []), ...(shaded.length ? [fail("P5", "Text or a paragraph is shaded.")] : [])],
      "No highlight or shading.",
    );
  }

  // ── PN1–PN4 page numbers ─────────────────────────────────────────────────
  const fmtOf = (s: string) => /<w:pgNumType[^>]*w:fmt="([^"]+)"/.exec(s)?.[1] ?? null;
  const startOf = (s: string) => /<w:pgNumType[^>]*w:start="(\d+)"/.exec(s)?.[1] ?? null;
  const bodySect = doc.sectPrs[doc.sectPrs.length - 1] ?? "";
  const prelimSects = doc.sectPrs.slice(0, -1);
  push(
    "PN1",
    withPrelims
      ? [
          ...(prelimSects.length === 0 ? [fail("PN1", "There is no section break between the preliminary pages and Chapter One.")] : []),
          ...prelimSects.filter((s) => fmtOf(s) !== "lowerRoman").map(() => fail("PN1", "A preliminary section is not numbered in Roman numerals.")),
        ]
      : [],
    { pass: "Preliminary pages are numbered i, ii, iii.", na: "A chapter-based order has no preliminary pages." },
    { na: !withPrelims },
  );
  push("PN2", fmtOf(bodySect) === "decimal" ? [] : [fail("PN2", "The main body is not numbered in Arabic numerals.")], "The body is numbered 1, 2, 3.");
  {
    const issues: QualityIssue[] = [];
    if (startOf(bodySect) !== "1") issues.push(fail("PN3", "The body's numbering does not restart at 1."));
    if (withPrelims) {
      if (prelimSects.length === 0) issues.push(fail("PN3", "There is no section break before Chapter One."));
      if (!/<w:footerReference [^>]*w:type="default"/.test(bodySect)) issues.push(fail("PN3", "The body has no footer of its own (it is linked to the previous section)."));
      const firstBody = doc.outside.find((p) => p.body && p.text.trim());
      if (firstBody && !/^CHAPTER ONE/.test(firstBody.text)) issues.push(fail("PN3", "The body section does not begin at Chapter One.", locate(firstBody)));
    }
    push("PN3", issues, "Numbering restarts at 1 at Chapter One, after a section break, with its own footer.");
  }
  {
    const issues: QualityIssue[] = [];
    const footerFor = (sect: string) => {
      const rid = /<w:footerReference [^>]*w:type="default"[^>]*r:id="([^"]+)"|<w:footerReference [^>]*r:id="([^"]+)"[^>]*w:type="default"/.exec(sect);
      const id = rid?.[1] ?? rid?.[2];
      if (!id) return "";
      const target = new RegExp(`Id="${id}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${id}"`).exec(parts.rels);
      return parts.footers[target?.[1] ?? target?.[2] ?? ""] ?? "";
    };
    const shown = [bodySect, ...(withPrelims ? prelimSects.slice(1) : [])];
    for (const s of shown) {
      const f = footerFor(s);
      if (!/PAGE/.test(f)) issues.push(fail("PN4", "A section's footer has no page number."));
    }
    for (const f of footerXml.filter((f) => /PAGE/.test(f))) {
      for (const p of paragraphs(f)) if (/PAGE/.test(p) && jcOf(p) !== "center") issues.push(fail("PN4", "A page number is not centred."));
    }
    push("PN4", issues, "Page numbers sit centred in the footer.");
  }

  // ── T1–T8 tables ─────────────────────────────────────────────────────────
  const noTables = dataTables.length === 0;
  const tableNa = { pass: "", na: "The report has no tables." };
  {
    const issues: QualityIssue[] = [];
    for (const t of dataTables) {
      const rows = t.xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g) ?? [];
      const where = { chapter: t.chapter, quote: t.before?.text ?? "" };
      if (rows.some((r) => !/<w:cantSplit/.test(r))) issues.push(fail("T1", "A table row can break across pages.", where));
      if (!/<w:tblHeader/.test(rows[0] ?? "")) issues.push(fail("T1", "The table's header row does not repeat.", where));
      if (rows.length - 1 <= 40 && rows.slice(0, -1).some((r) => paragraphs(r).some((p) => !/<w:keepNext/.test(p)))) issues.push(fail("T1", "A table of 40 rows or fewer is not kept on one page.", where));
    }
    push("T1", issues, { ...tableNa, pass: "Tables cannot break across pages; header rows repeat." }, { na: noTables });
  }
  {
    const issues: QualityIssue[] = [];
    for (const t of dataTables) {
      const b = /<w:tblBorders>[\s\S]*?<\/w:tblBorders>/.exec(t.xml)?.[0] ?? "";
      const where = { chapter: t.chapter, quote: t.before?.text ?? "" };
      const line = (side: string) => {
        const m = new RegExp(`<w:${side} [^>]*/>`).exec(b)?.[0] ?? "";
        return { single: /w:val="single"/.test(m), sz: Number(/w:sz="(\d+)"/.exec(m)?.[1] ?? 0), none: /w:val="(?:none|nil)"/.test(m) || m === "" };
      };
      if (!line("top").single || line("top").sz > 4 || !line("bottom").single || line("bottom").sz > 4) issues.push(fail("T2", "The top or bottom rule is missing or thicker than 0.5pt.", where));
      if (!["left", "right", "insideH", "insideV"].every((s) => line(s).none)) issues.push(fail("T2", "The table has lines beyond the three rules.", where));
      const headerRow = (t.xml.match(/<w:tr>[\s\S]*?<\/w:tr>/) ?? [""])[0];
      if (!/<w:tcBorders>[\s\S]*?<w:bottom w:val="single"/.test(headerRow)) issues.push(fail("T2", "There is no rule under the header row.", where));
    }
    push("T2", issues, { pass: "Three-line tables: top rule, a rule under the header row, bottom rule (0.5pt).", na: engineering ? "The report has no tables." : "Three-line tables apply to Engineering only." }, { na: !engineering || noTables });
  }
  {
    const issues: QualityIssue[] = [];
    for (const t of dataTables) {
      const b = /<w:tblBorders>[\s\S]*?<\/w:tblBorders>/.exec(t.xml)?.[0] ?? "";
      const vertical = ["left", "right", "insideV"].some((s) => /w:val="single"|w:val="double"|w:val="thick"/.test(new RegExp(`<w:${s} [^>]*/>`).exec(b)?.[0] ?? ""));
      const cellVertical = /<w:tcBorders>[\s\S]*?<w:(?:left|right) w:val="(?!none|nil)/.test(t.xml);
      if (vertical || cellVertical) issues.push(fail("T3", "The table has vertical borders.", { chapter: t.chapter, quote: t.before?.text ?? "" }));
    }
    push("T3", issues, { pass: "No vertical borders.", na: engineering ? "The report has no tables." : "The no-vertical-borders rule is the Engineering standard." }, { na: !engineering || noTables });
  }
  push(
    "T4",
    dataTables.filter((t) => [...t.xml.matchAll(/<w:shd [^>]*w:fill="([^"]+)"/g)].some((m) => !/^(?:auto|FFFFFF)$/i.test(m[1]))).map((t) => fail("T4", "A table cell is shaded.", { chapter: t.chapter, quote: t.before?.text ?? "" })),
    { ...tableNa, pass: "No cell shading." },
    { na: noTables },
  );
  const invented = new Set(
    ctx.report.chapters.flatMap((c) => c.warnings.filter((w) => /^Table \d+\.\d+ had no caption/.test(w)).map((w) => /^Table (\d+\.\d+)/.exec(w)?.[1] ?? "")),
  );
  const captionAbove = (t: Doc["tables"][number]) => (t.before && /^Table\s+\d+(?:\.\d+)?/i.test(t.before.text.trim()) ? t.before : null);
  push(
    "T5",
    dataTables.flatMap((t) => {
      const cap = captionAbove(t);
      if (!cap) return [fail("T5", "A table has no caption.", { chapter: t.chapter, quote: t.before?.text ?? "" })];
      const n = /^Table\s+(\d+\.\d+)/.exec(cap.text)?.[1];
      return n && invented.has(n) ? [warn("T5", `Table ${n} had no caption in the chapter text; the assembly numbered it. Give it a real title.`, locate(cap))] : [];
    }),
    { ...tableNa, pass: "Every table has a caption." },
    { na: noTables },
  );
  push(
    "T6",
    dataTables.flatMap((t) => {
      const cap = captionAbove(t);
      if (!cap) return [fail("T6", "No caption directly above a table.", { chapter: t.chapter })];
      const centred = (jcOf(cap.xml) ?? styleJc(cap.style ?? "")) === "center";
      return centred ? [] : [fail("T6", "A table caption is not centred.", locate(cap))];
    }),
    { ...tableNa, pass: "Table captions sit directly above their tables, centred." },
    { na: noTables },
  );
  push(
    "T7",
    dataTables.flatMap((t) => {
      const cap = captionAbove(t);
      return cap && cap.style !== "TableCaption" ? [fail("T7", "A table caption does not use the Table Caption style.", locate(cap))] : [];
    }),
    { ...tableNa, pass: "Table captions use the Table Caption style." },
    { na: noTables },
  );
  push(
    "T8",
    [
      ...(withPrelims && !listField("Table Caption") ? [fail("T8", "There is no List of Tables field collecting the Table Caption style.")] : []),
      ...dataTables.flatMap((t) => {
        const cap = captionAbove(t);
        return cap && cap.style !== "TableCaption" ? [fail("T8", "A table caption will be missing from the List of Tables.", locate(cap))] : [];
      }),
    ],
    { pass: "Every table caption is collected by the List of Tables.", na: noTables ? "The report has no tables." : "A chapter-based order has no List of Tables." },
    { na: noTables || !withPrelims },
  );

  // ── FG1–FG6 figures ──────────────────────────────────────────────────────
  const noFigures = figures.length === 0;
  const figNa = { pass: "", na: "The report has no figures." };
  const captionBelow = (f: Para) => {
    const i = doc.outside.indexOf(f);
    const next = doc.outside[i + 1];
    return next && /^Fig(?:ure|\.)?\s+\d/i.test(next.text.trim()) ? next : null;
  };
  const madeUpFigure = new Set(ctx.report.chapters.flatMap((c) => c.warnings.filter((w) => /^Figure \d+\.\d+ had no caption/.test(w)).map((w) => /^Figure (\d+\.\d+)/.exec(w)?.[1] ?? "")));
  push(
    "FG1",
    figures.flatMap((f) => {
      const cap = captionBelow(f);
      if (!cap) return [fail("FG1", "A figure has no caption.", locate(f))];
      const n = /^Fig(?:ure|\.)?\s+(\d+\.\d+)/i.exec(cap.text)?.[1];
      return n && madeUpFigure.has(n) ? [warn("FG1", `Figure ${n} had no caption in the chapter text; one was made from the placeholder. Give it a proper caption.`, locate(cap))] : [];
    }),
    { ...figNa, pass: "Every figure has a caption." },
    { na: noFigures },
  );
  push(
    "FG2",
    figures.flatMap((f) => {
      const cap = captionBelow(f);
      if (!cap) return [fail("FG2", "No caption directly below a figure.", locate(f))];
      return (jcOf(cap.xml) ?? styleJc(cap.style ?? "")) === "center" ? [] : [fail("FG2", "A figure caption is not centred.", locate(cap))];
    }),
    { ...figNa, pass: "Figure captions sit directly below their figures, centred." },
    { na: noFigures },
  );
  push(
    "FG3",
    figures.flatMap((f) => {
      const cap = captionBelow(f);
      return cap && cap.style !== "FigureCaption" ? [fail("FG3", "A figure caption does not use the Figure Caption style.", locate(cap))] : [];
    }),
    { ...figNa, pass: "Figure captions use the Figure Caption style." },
    { na: noFigures },
  );
  {
    const cited = citedReferences(ctx.input.references, ctx.input.chapters.map((c) => c.text)).cited;
    const fg4: QualityIssue[] = [];
    const fg5: QualityIssue[] = [];
    for (const f of figures) {
      const cap = captionBelow(f);
      if (!cap) continue;
      const i = doc.outside.indexOf(cap);
      const sourceLine = doc.outside[i + 1] && /^Source\s*:/i.test(doc.outside[i + 1].text.trim()) ? doc.outside[i + 1].text : "";
      const marks = `${cap.text} ${sourceLine}`;
      const citations = citationsIn(marks);
      const own = /\((?:the\s+)?(?:author|researcher)(?:['’]s)?(?:\s+\w+)?,\s*(?:19|20)\d{2}\)|\b(?:field survey|researcher|author)\b/i.test(marks);
      for (const c of citations) {
        if (referencesForCitation(cited, c).length) continue;
        const known = ctx.knownCommon?.(c.author, c.year);
        if (known) fg4.push(warn("FG4", `The figure's source ${c.author} (${c.year}) is ${known.work}; it is not among the verified references, so add it to the References by hand.`, locate(cap)));
        else fg4.push(fail("FG4", `The figure's source (${c.author}, ${c.year}) is not in the References.`, locate(cap)));
      }
      if (!citations.length && !own && !/adapted from/i.test(marks)) fg5.push(fail("FG5", "A figure caption marks no source: cite it, or mark it (Author, Year) if it is original.", locate(cap)));
    }
    push("FG4", fg4, { ...figNa, pass: "Every figure that names a source cites one on the References list." }, { na: noFigures });
    push("FG5", fg5, { ...figNa, pass: "Every figure is marked with its source or (Author, Year)." }, { na: noFigures });
  }
  push(
    "FG6",
    [
      ...(withPrelims && !listField("Figure Caption") ? [fail("FG6", "There is no List of Figures field collecting the Figure Caption style.")] : []),
      ...figures.flatMap((f) => {
        const cap = captionBelow(f);
        return cap && cap.style !== "FigureCaption" ? [fail("FG6", "A figure caption will be missing from the List of Figures.", locate(cap))] : [];
      }),
    ],
    { pass: "Every figure caption is collected by the List of Figures.", na: noFigures ? "The report has no figures." : "A chapter-based order has no List of Figures." },
    { na: noFigures || !withPrelims },
  );

  // ── EQ1–EQ5 equations ────────────────────────────────────────────────────
  const eqRows = eqTables.flatMap((t) => (t.xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g) ?? []).map((r) => ({ r, chapter: t.chapter })));
  const noEquations = eqRows.length === 0 && !/<m:oMath/.test(xml);
  {
    // An equation written inside a sentence: "y = a + bx" with an operator and a variable on the right, not a "where x = …" definition.
    const inline = /(?:^|[\s(])[\p{L}][\p{L}\d_]{0,12}\s*=\s*[^.;,=]{0,50}?[\p{L}\d)][\s]*[+×*/^][\s]*[^.;,]{1,50}/u;
    const issues = bodyProse
      .filter((p) => !/^\s*(?:where|in which|here)\b/i.test(p.text))
      .filter((p) => p.text.split(/(?<=[.;])\s+/).some((s) => !/^\s*(?:where|in which)\b/i.test(s) && inline.test(s) && /[\p{L}]/u.test(s.split("=")[1] ?? "") && s.split(/\s+/).length > 6))
      .map((p) => fail("EQ1", "An equation is written inside a sentence.", locate(p)));
    push("EQ1", issues, "Every equation is on its own line.");
  }
  {
    const issues: QualityIssue[] = [];
    const inTables = eqTables.reduce((n, t) => n + (t.xml.match(/<m:oMath>/g) ?? []).length, 0);
    const total = (xml.match(/<m:oMath>/g) ?? []).length;
    if (total > inTables) issues.push(fail("EQ2", `${total - inTables} equation(s) are not in an equation table.`));
    for (const t of eqTables) {
      const b = /<w:tblBorders>[\s\S]*?<\/w:tblBorders>/.exec(t.xml)?.[0] ?? "";
      if (/w:val="(?:single|double|thick)"/.test(b) || /<w:tcBorders>[\s\S]*?w:val="(?:single|double|thick)"/.test(t.xml)) issues.push(fail("EQ2", "An equation table has borders.", { chapter: t.chapter }));
      if ((t.xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g) ?? []).some((r) => (r.match(/<w:tc>/g) ?? []).length !== 2)) issues.push(fail("EQ2", "An equation table does not have two columns.", { chapter: t.chapter }));
    }
    push("EQ2", issues, { pass: "Every equation sits in a borderless two-column table.", na: "The report has no equations." }, { na: noEquations });
  }
  {
    const issues: QualityIssue[] = [];
    for (const { r, chapter } of eqRows) {
      const n = textOf(r.split("</w:tc>")[1] ?? "").trim();
      if (!/^\d+\.\d+$/.test(n)) issues.push(fail("EQ3", `An equation is numbered "${n || "(none)"}".`, { chapter }));
    }
    for (const p of bodyProse) if (/\b(?:Equation|Eq\.?|equation)\s*\(\d+\.\d+\)/.test(p.text)) issues.push(fail("EQ3", "An equation is referred to with parentheses, e.g. Equation (3.1).", locate(p)));
    push("EQ3", issues, { pass: "Equations are numbered 3.1, 3.2 without parentheses.", na: "The report has no equations." }, { na: noEquations });
  }
  {
    const issues: QualityIssue[] = [];
    const byChapter = new Map<number, string[]>();
    for (const { r, chapter } of eqRows) byChapter.set(chapter ?? 0, [...(byChapter.get(chapter ?? 0) ?? []), textOf(r.split("</w:tc>")[1] ?? "").trim()]);
    for (const [chapter, numbers] of byChapter) {
      const want = numbers.map((_, i) => `${chapter}.${i + 1}`);
      if (numbers.join() !== want.join()) issues.push(fail("EQ4", `Chapter ${chapter}'s equations are numbered ${numbers.join(", ")}.`, { chapter }));
    }
    push("EQ4", issues, { pass: "Equation numbers run 1, 2, 3 in each chapter and restart per chapter.", na: "The report has no equations." }, { na: noEquations });
  }
  {
    const issues: QualityIssue[] = [];
    if (eqTables.some((t) => /<w:drawing|<w:pict|<v:imagedata/.test(t.xml))) issues.push(fail("EQ5", "An equation is an image, not a Word equation."));
    if (ctx.report.equationsAsText) issues.push(warn("EQ5", `${ctx.report.equationsAsText} equation(s) could not be read as structured maths and are set as plain text inside the Word equation. Check and retype them in Word's equation editor.`));
    push("EQ5", issues, { pass: "Every equation is a native Word (OMML) equation.", na: "The report has no equations." }, { na: noEquations });
  }

  // ── TOC1–TOC5 ────────────────────────────────────────────────────────────
  const tocNa = { na: !withPrelims };
  const tocNaText = "A chapter-based order has no Table of Contents.";
  const leaders = (id: string) => /w:leader="(?!none)[^"]+"/.test(styleBlock(styles, id));
  push("TOC1", mainToc && headingParas.length ? [] : [fail("TOC1", mainToc ? "There are no headings for the Table of Contents to collect." : "There is no Table of Contents.")], { pass: "The Table of Contents is present; Word fills it when the fields update.", na: tocNaText }, tocNa);
  {
    // Every chapter heading the chapters contain must be a Heading 1–3 paragraph, so the field lists exactly the headings.
    // Note blocks: MODE_B's become the one ENDNOTES section (a Heading 1), MODE_A's one "Endnotes" heading per chapter.
    const placement = ctx.input.citationPlacement;
    const expected = ctx.input.chapters.reduce((n, ch) => {
      const blocks = parseChapter(ch.text, ch.number).blocks;
      const noteBlocks = blocks.filter((b) => b.kind === "endnotes").length;
      return n + blocks.filter((b) => b.kind === "heading").length + (placement === "MODE_B" ? 0 : placement === "MODE_A" ? Math.min(1, noteBlocks) : noteBlocks);
    }, 0);
    const found = doc.outside.filter((p) => p.body && (p.style === "Heading2" || p.style === "Heading3")).length;
    push("TOC2", found >= expected ? [] : [fail("TOC2", `${expected - found} section heading(s) are not heading-styled and will be missing from the Contents.`)], { pass: "Every chapter, section and sub-section heading is heading-styled, so the Contents lists exactly them.", na: tocNaText }, tocNa);
  }
  push(
    "TOC3",
    mainToc && /<w:fldChar w:fldCharType="begin"/.test(xml) ? [] : [fail("TOC3", "The Table of Contents is typed text, not a field.")],
    { pass: "The Table of Contents is a field, so its page numbers update.", na: tocNaText },
    tocNa,
  );
  push("TOC4", mainToc && /\\o\s+"1-3"/.test(mainToc) ? [] : [fail("TOC4", `The Table of Contents does not collect Heading 1 to Heading 3${mainToc ? ` (${mainToc})` : ""}.`)], { pass: "The Contents collect Heading 1 to Heading 3.", na: tocNaText }, tocNa);
  push(
    "TOC5",
    [...["TOC1", "TOC2", "TOC3"].filter(leaders).map((id) => fail("TOC5", `The ${id} style draws a tab leader.`)), ...(/\\p\s+"\."/.test(mainToc ?? "") ? [fail("TOC5", "The Contents field asks for dotted leaders.")] : [])],
    { pass: "No dotted leaders in the Contents.", na: tocNaText },
    tocNa,
  );

  // ── LF, LT, LA lists ─────────────────────────────────────────────────────
  const listRules = (prefix: "LF" | "LT", styleName: string, count: number, word: "figures" | "tables") => {
    const na = !withPrelims || count === 0;
    const naText = count === 0 ? `The report has no ${word}.` : `A chapter-based order has no List of ${word === "figures" ? "Figures" : "Tables"}.`;
    const field = listField(styleName);
    push(`${prefix}1`, field ? [] : [fail(`${prefix}1`, `There is no List of ${word === "figures" ? "Figures" : "Tables"}.`)], { pass: `The List of ${word === "figures" ? "Figures" : "Tables"} is present.`, na: naText }, { na });
    push(
      `${prefix}2`,
      field && /\\h/.test(field) ? [] : [fail(`${prefix}2`, `The List of ${word === "figures" ? "Figures" : "Tables"} is not built from the ${styleName} style.`)],
      { pass: `The list is built from every ${styleName}, so its entries match the captions.`, na: naText },
      { na },
    );
    push(`${prefix}3`, leaders("TOC1") ? [fail(`${prefix}3`, "The list's entry style draws a tab leader.")] : [], { pass: "No dotted leaders in the list.", na: naText }, { na });
  };
  listRules("LF", "Figure Caption", figures.length, "figures");
  listRules("LT", "Table Caption", dataTables.length, "tables");
  for (const id of ["LA1", "LA2", "LA3"]) push(id, [], { pass: "", na: "The assembled report has no appendices." }, { na: true });

  // ── R1–R6 references ─────────────────────────────────────────────────────
  const refHeading = doc.outside.find((p) => p.style === "Heading1" && /^(?:REFERENCES|BIBLIOGRAPHY|WORKS CITED)$/.test(p.text.trim()));
  push("R1", refHeading && refParas.length ? [] : [fail("R1", refHeading ? "The References section has no entries." : "There is no References section.")], `References section with ${refParas.length} entr${refParas.length === 1 ? "y" : "ies"}.`);
  {
    const ieee = ctx.report.references.listedAs === "IEEE";
    const keys = refParas.map((p) => nameKey(p.text.split(/[,.]/)[0] ?? ""));
    const outOfOrder = keys.findIndex((k, i) => i > 0 && k.localeCompare(keys[i - 1]) < 0);
    push(
      "R2",
      ieee
        ? [warn("R2", "IEEE numbers references in the order they are first cited: renumber the list to match the chapters.")]
        : outOfOrder === -1
          ? []
          : [fail("R2", "The references are not in alphabetical order.", { quote: refParas[outOfOrder].text })],
      "References are in alphabetical order by first author.",
    );
  }
  {
    const ref = styleBlock(styles, "Reference");
    const hanging = num(ref, "hanging") > 0 && num(ref, "left") > 0;
    push(
      "R3",
      [...(hanging ? [] : [fail("R3", "The Reference style has no hanging indent.")]), ...refParas.filter((p) => /w:firstLine="[1-9]/.test(pPrOf(p.xml))).map((p) => fail("R3", "A reference has a first-line indent instead of a hanging indent.", { quote: p.text }))],
      { pass: "Every reference has a hanging indent.", na: "There are no references." },
      { na: refParas.length === 0 },
    );
  }
  {
    const journals = [...new Set(ctx.input.references.map((r) => r.journal?.trim()).filter((j): j is string => !!j && j.length > 3))];
    const issues: QualityIssue[] = [];
    for (const p of refParas) {
      const j = journals.find((name) => p.text.includes(name));
      if (!j) continue;
      const italic = runsOf(p.xml).filter((r) => r.italic).map((r) => r.text).join("");
      if (!italic.includes(j.slice(0, Math.min(j.length, 20)))) issues.push(fail("R4", `The journal name "${j}" is not italic.`, { quote: p.text }));
    }
    push("R4", issues, { pass: "Journal names are italic.", na: "There are no references." }, { na: refParas.length === 0 });
  }
  {
    const issues: QualityIssue[] = [];
    for (const p of refParas) {
      const total = (p.text.match(/\bet\.?\s+al\b/g) ?? []).length;
      const italic = runsOf(p.xml).filter((r) => r.italic).reduce((n, r) => n + (r.text.match(/\bet\.?\s+al\b/g) ?? []).length, 0);
      if (total > italic) issues.push(fail("R5", '"et al." is not italic in a reference.', { quote: p.text }));
    }
    push("R5", issues, { pass: "et al. is italic in the references.", na: "There are no references." }, { na: refParas.length === 0 });
  }
  {
    const seen = new Map<string, string>();
    const issues: QualityIssue[] = [];
    for (const p of refParas) {
      const doi = /10\.\d{4,9}\/[^\s]+/i.exec(p.text)?.[0]?.replace(/[.,]$/, "").toLowerCase();
      const key = doi ?? nameKey(p.text).slice(0, 80);
      if (seen.has(key)) issues.push(fail("R6", "A reference appears twice.", { quote: p.text }));
      else seen.set(key, p.text);
    }
    push("R6", issues, { pass: "No reference appears twice.", na: "There are no references." }, { na: refParas.length === 0 });
  }

  // Every rule returned once, in the rules' order.
  const ids = out.map((r) => r.id);
  const missing = FORMATTING_RULES.filter((r) => !ids.includes(r.id)).map((r) => r.id);
  if (missing.length || out.length !== FORMATTING_RULES.length) throw new Error(`Formatting layer incomplete: missing ${missing.join(", ")}`);
  return FORMATTING_RULES.map((r) => out.find((o) => o.id === r.id)!);
}
