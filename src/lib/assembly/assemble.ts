/**
 * Phase D7: document assembly. A report project's finished chapters, its
 * preliminary pages (from the intake, plus the acknowledgement, abstract and
 * list of abbreviations the D10 agent writes, placeholders until it has) and
 * the works it cites, as one Word file that follows the 71 rules in
 * prompts/shared/formatting_rules.md. Built on demand; the quality gate stores
 * the copy it sends to QA.
 *
 * Layout (PN1-PN4): three sections.
 *   1. Cover: no page number shown.
 *   2. Preliminary pages: lower-case Roman from i; the title page counts as i
 *      but shows nothing (titlePage), the declaration shows ii.
 *   3. Chapters and References: Arabic from 1, starting at Chapter One.
 * Each section has its own footer (never linked to the one before), the page
 * number centred. The Table of Contents and the Lists of Tables and Figures
 * are Word fields that Word fills when it updates fields on opening.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  ImportedXmlComponent,
  NumberFormat,
  Packer,
  PageNumber,
  Paragraph,
  SectionType,
  StyleLevel,
  Table,
  TableBorders,
  TableCell,
  TableLayoutType,
  TableOfContents,
  TableRow,
  Tab,
  TabStopType,
  TextRun,
  VerticalAlignTable,
  WidthType,
  type ISectionOptions,
  type ParagraphChild,
} from "docx";
import { db } from "@/lib/db";
import { downloadName } from "@/lib/files/policy";
import { readSubmittedContact } from "@/lib/submitted-contact";
import { expectedChapters, orderedChapters } from "@/lib/deliverables";
import { isReportTemplate } from "@/lib/generation/generation-state";
import { chapterTitle } from "@/lib/generation/progress-events";
import { CERTIFICATE_AWARDS, degreeName, getDegreeFromDepartment, lookupDepartment, resolveSection, type SectionKey } from "@/lib/generation/department-map";
import { STYLE_LABEL } from "@/lib/generation/referencing";
import { getApprovedModeSettings } from "@/lib/services/research-mode";
import { formattedReferences, type DocReference, type ReferencingStyle as ListStyle } from "@/lib/research-references-doc";
import { loadChapterTexts, type ChapterTextSource } from "@/lib/services/chapter-texts";
import { parseChapter, type Block } from "./parse-chapter";
import { analyseChapterNotes, collectEndnotes, resolveNotes, type CollectedEndnotes } from "./endnotes";
import { CHAPTER_STAMP, type ImageType } from "./read-chapter-docx";
import { AssemblyError } from "./errors";
import { finalizeDocx } from "./finalize-docx";
import { parseEquation, type MathNode } from "./equation-omml";
import {
  chapterWord,
  citedReferences,
  findPlaceholders,
  fixSentenceDashes,
  inlineSegments,
  italiciseEtAl,
  properNounsFrom,
  renumberEquationRefs,
  sentenceCase,
  titleCase,
  upperH1,
  type Seg,
} from "./text-rules";
import { BLACK, FONT, PAGE, SINGLE, SIZE, STYLE, TEXT_WIDTH, reportStyles } from "./styles";

// ─── Input and report ────────────────────────────────────────────────────────

export type AssemblyProfile = "FYP_STANDARD" | "ENGINEERING";

export interface AssemblyInput {
  projectCode: string;
  title: string;
  student: { name: string; matric: string | null };
  university: string;
  faculty: string;
  department: string;
  supervisor: string | null;
  hod: string | null;
  /** The month and year printed on the cover and title page. */
  submission: Date;
  dedication: { type: string | null; details: string | null };
  acknowledgementNote: string | null;
  mode: number | null;
  section: SectionKey | null;
  /** The approved style key (ReferencingStyleKey), e.g. "APA_7TH", "NALT". */
  referencingStyle: string;
  citationPlacement: string | null;
  thematicTitles: { chapter3: string | null; chapter4: string | null };
  /** Finished chapters, in order: the COO-approved uploads read back, or (a working copy) the AI text. */
  chapters: { number: number; text: string }[];
  /** Pictures the approved chapters use, by the key in their [IMAGE: key | WxH] lines. */
  media?: Map<string, { data: Uint8Array; type: ImageType }>;
  /**
   * Chapter review: the approved version each chapter was built from, when every chapter is
   * approved (a complete document records it, so a newer approval makes it stale). Null for a
   * working copy that still uses AI text, or a report written by hand.
   */
  builtFrom?: Record<string, string> | null;
  /** Where the chapter text came from: every chapter approved, or a working copy. */
  source?: "approved" | "working-copy" | "ai";
  references: DocReference[];
  /** Full reports get the preliminary pages; a chapter-based order is just its chapters. */
  includePrelims: boolean;
  /**
   * D10: the Claude-written preliminary sections, written before the quality
   * gate scores the report (D7b) and editable by hand. When present, the placeholders for Ack, Abstract and the
   * List of Abbreviations are replaced with the stored content. When null or
   * omitted the assembler keeps the founder's placeholder strings, as before
   * D10 (the fixture inputs in scripts/check-* do not carry it).
   */
  preliminary?: {
    acknowledgement: string;
    abstract: string;
    abbreviations: { token: string; expansion: string }[];
    needsReview: boolean;
  } | null;
}

export interface ChapterReport {
  number: number;
  title: string;
  equations: number;
  tables: number;
  figures: number;
  placeholders: string[];
  warnings: string[];
}

export interface AssemblyReport {
  profile: AssemblyProfile;
  chapters: ChapterReport[];
  prelimPlaceholders: string[];
  etAl: number;
  dashesFixed: number;
  headingsRecased: number;
  equationsAsText: number;
  references: { style: string; listedAs: string; listed: number; leftOut: number; unmatchedCitations: string[] };
  notes: string[];
}

export { AssemblyError } from "./errors";

// ─── Wording (for the founder's review) ──────────────────────────────────────

/**
 * "the degree of Bachelor of Science (B.Sc)", or "the Registered Nurse (RN) certificate"
 * for a school of nursing. `upper` capitalises everything but the abbreviation.
 */
function awardPhrase(degree: string, upper = false): string {
  const name = upper ? degreeName(degree).toUpperCase() : degreeName(degree);
  if (CERTIFICATE_AWARDS.has(degree)) return upper ? `THE ${name} (${degree}) CERTIFICATE` : `the ${name} (${degree}) certificate`;
  return upper ? `THE DEGREE OF ${name} (${degree})` : `the degree of ${name} (${degree})`;
}

/**
 * Every sentence the assembly writes itself, laid out as the founder's template
 * (prompts/preliminary-pages/PRELIMINARY PAGE TEMPLATE.docx). Placeholders are in
 * [SQUARE BRACKETS] for the specialist.
 */
export const PRELIM_TEXT = {
  /** Title page, in bold capitals under the student's name; `degree` is getDegreeFromDepartment's abbreviation (its case is kept). */
  submission: (dept: string, faculty: string, university: string, degree: string) =>
    `${`A project submitted to the Department of ${dept}, Faculty of ${faculty}, ${university}, in partial fulfilment of the requirements for the award of`.toUpperCase()} ${awardPhrase(degree, true)}`,
  by: "BY",
  supervisedBy: (name: string) => `SUPERVISED BY: ${name.toUpperCase()}`,
  declaration: (title: string, dept: string, faculty: string, university: string, supervisor: string) =>
    `I hereby declare that this project titled, "${title}", submitted to the Department of ${dept}, Faculty of ${faculty}, ${university}, is an original work carried out by me under the supervision of ${supervisor}. The work has not been submitted wholly or in part for the award of any degree in this or any other institution.`,
  certification: (title: string, student: string, matric: string, dept: string, faculty: string, university: string, degree: string) =>
    `This is to certify that this project titled, "${title}", was carried out by ${student} (${matric}), of the Department of ${dept}, Faculty of ${faculty}, ${university}, under my supervision, and has been found suitable for the award of ${awardPhrase(degree)}.`,
  dedication: {
    God: "This project is dedicated to the Almighty God, the source of my wisdom, strength and understanding.",
    Family: "This project is dedicated to my family, whose unwavering support, encouragement and sacrifices made this achievement possible.",
    Both: "This project is dedicated to the Almighty God, for His grace and mercy, and to my family, whose unwavering support and sacrifices made this achievement possible.",
  } as Record<string, string>,
  dedicationPlaceholder: "[DEDICATION TO BE SUPPLIED]",
  acknowledgementPlaceholder: "[ACKNOWLEDGEMENT TO BE SUPPLIED]",
  acknowledgementFromOrder: (note: string) => `[FROM THE ORDER: ${note}]`,
  abstractPlaceholder: "[ABSTRACT TO BE SUPPLIED]",
  abbreviationsPlaceholder: "[LIST OF ABBREVIATIONS TO BE SUPPLIED]",
  /** D10: shown when the scanner found no candidate initialisms. */
  noAbbreviations: "This report contains no abbreviations that require expansion.",
  supervisorPlaceholder: "[SUPERVISOR TO BE SUPPLIED]",
  hodPlaceholder: "[HEAD OF DEPARTMENT TO BE SUPPLIED]",
  matricPlaceholder: "[MATRIC NUMBER TO BE SUPPLIED]",
  /** A signature line and, beside it, a date line (the template's layout). */
  signatureLine: "____________________________",
  date: "Date",
  projectSupervisor: "Project Supervisor",
  headOfDepartment: "Head of Department",
  externalExaminer: "External Examiner",
} as const;

const PAGE_TITLES = {
  declaration: "DECLARATION",
  certification: "CERTIFICATION",
  dedication: "DEDICATION",
  acknowledgement: "ACKNOWLEDGEMENT",
  abstract: "ABSTRACT",
  contents: "TABLE OF CONTENTS",
  tables: "LIST OF TABLES",
  figures: "LIST OF FIGURES",
  abbreviations: "LIST OF ABBREVIATIONS",
  references: "REFERENCES",
  endnotes: "Endnotes",
  /** MODE_B: the one list of notes for the whole report, just before the References. */
  documentEndnotes: "ENDNOTES",
} as const;

// ─── Loading ─────────────────────────────────────────────────────────────────

/** A chapter-based order (the chapters picked, or FYP-CH4): just its chapters, no preliminary pages. */
export function isChapterBasedOrder(serviceCode: string, additionalData: unknown): boolean {
  return (serviceCode === "FYP-CHAPTERS" && orderedChapters(additionalData).length > 0) || serviceCode === "FYP-CH4";
}

/**
 * Everything a report needs, read once. 404 for a project that is not a written report; 409 while
 * a chapter is unfinished, or (source "approved") not yet approved by the COO.
 *
 *   approved   every chapter must be a COO-approved upload: the complete report, what QA and the
 *              specialist receive
 *   canonical  the approved upload where there is one, the AI text where not: the founder's and
 *              the COO's working copy, and what the quality gate scores
 *   ai         the AI text only (reports written before chapter review, and the check scripts)
 */
export async function loadAssemblyInput(
  projectDbId: string,
  opts: {
    source?: ChapterTextSource;
    only?: number[];
    /** The chapter gate: this one chapter's text (and pictures) instead of any stored text. */
    chapterText?: { number: number; text: string; media?: AssemblyInput["media"] };
  } = {},
): Promise<AssemblyInput> {
  const project = await db.project.findUnique({
    where: { id: projectDbId },
    select: {
      id: true,
      projectId: true,
      projectTitle: true,
      matricNumber: true,
      supervisorName: true,
      hodName: true,
      dedicationType: true,
      dedicationDetails: true,
      acknowledgmentDetails: true,
      additionalData: true,
      chapterCount: true,
      expectedDeliveryAt: true,
      clientDeadline: true,
      service: { select: { serviceCode: true, intakeFormTemplate: true } },
      client: { select: { fullName: true, faculty: true, department: true, university: { select: { name: true } } } },
    },
  });
  if (!project || !isReportTemplate(project.service.intakeFormTemplate)) {
    throw new AssemblyError("This project is not a written report.", 404, "NOT_A_REPORT");
  }

  const chapterBased = isChapterBasedOrder(project.service.serviceCode, project.additionalData);
  const all = expectedChapters({ serviceCode: project.service.serviceCode, additionalData: project.additionalData, chapterCount: project.chapterCount });
  // `only`: one chapter on its own (the AI draft the specialist reviews).
  const expected = opts.only ? all.filter((n) => opts.only!.includes(n)) : all;

  const given = opts.chapterText;
  const [texts, references, settings, preliminaryRow] = await Promise.all([
    given
      ? Promise.resolve({ chapters: [{ number: given.number, text: given.text }], media: given.media ?? new Map(), builtFrom: null, source: "working-copy" as const })
      : loadChapterTexts(project.id, expected, opts.source ?? "canonical"),
    db.reference.findMany({
      where: { projectId: project.id, status: "KEPT" },
      select: { title: true, proposedTitle: true, authors: true, year: true, journal: true, doi: true },
    }),
    getApprovedModeSettings(project.id).catch(() => null),
    // D10: the Claude-written prelim sections (fills the three placeholders when present).
    db.preliminaryPages.findUnique({
      where: { projectId: project.id },
      select: { acknowledgement: true, abstract: true, abbreviations: true, needsReview: true },
    }),
  ]);
  const contact = readSubmittedContact(project.additionalData);
  const university =
    contact?.universityId && contact.universityId.length > 0
      ? ((await db.university.findUnique({ where: { id: contact.universityId }, select: { name: true } }))?.name ?? project.client.university?.name ?? "")
      : (project.client.university?.name ?? "");

  let section: SectionKey | null = null;
  if (settings) {
    const entry = lookupDepartment(settings.department);
    try {
      section = entry ? resolveSection(entry, settings.mode, settings.sectionOverride) : settings.sectionOverride;
    } catch {
      section = settings.sectionOverride;
    }
  }

  const dedication = (project.dedicationDetails ?? null) as { type?: string | null; details?: string | null } | null;
  const acknowledgement = (project.acknowledgmentDetails ?? null) as { details?: string | null } | null;
  return {
    projectCode: project.projectId,
    title: project.projectTitle?.trim() || project.projectId,
    student: { name: contact?.fullName || project.client.fullName, matric: project.matricNumber },
    university,
    faculty: contact?.faculty || project.client.faculty || "",
    department: settings?.department || contact?.department || project.client.department || "",
    supervisor: project.supervisorName,
    hod: project.hodName,
    submission: project.expectedDeliveryAt ?? project.clientDeadline ?? new Date(),
    dedication: { type: project.dedicationType ?? dedication?.type ?? null, details: dedication?.details ?? null },
    acknowledgementNote: acknowledgement?.details ?? null,
    mode: settings?.mode ?? null,
    section,
    referencingStyle: settings?.referencingStyle ?? "APA_7TH",
    citationPlacement: settings?.citationPlacement ?? null,
    thematicTitles: settings?.thematicTitles ?? { chapter3: null, chapter4: null },
    chapters: texts.chapters.map((c) => ({ number: c.number, text: c.text })),
    media: texts.media,
    builtFrom: texts.builtFrom,
    source: texts.source,
    references,
    includePrelims: !chapterBased,
    preliminary: preliminaryRow
      ? {
          acknowledgement: preliminaryRow.acknowledgement,
          abstract: preliminaryRow.abstract,
          abbreviations: Array.isArray(preliminaryRow.abbreviations)
            ? (preliminaryRow.abbreviations as unknown as { token: string; expansion: string }[])
            : [],
          needsReview: preliminaryRow.needsReview,
        }
      : null,
  };
}

// ─── Small builders ──────────────────────────────────────────────────────────

interface Ctx {
  profile: AssemblyProfile;
  report: AssemblyReport;
  properNouns: Set<string>;
  mode: number | null;
  thematic: AssemblyInput["thematicTitles"];
  /** The approved citation placement (MODE_A gathers a chapter's note blocks into one list at its end). */
  placement: string | null;
  /** Pictures from approved chapters. */
  media: AssemblyInput["media"];
}

function textRun(seg: Seg, extra: { bold?: boolean } = {}): TextRun {
  return new TextRun({
    text: seg.text,
    ...(seg.italics ? { italics: true } : {}),
    ...(seg.sub ? { subScript: true } : {}),
    ...(seg.sup ? { superScript: true } : {}),
    ...extra,
  });
}

/** Runs for a piece of generated text: *italics*, et al. italic, P2 dashes (prose only). */
function runsFor(text: string, ctx: Ctx, opts: { inTable?: boolean; prose?: boolean; bold?: boolean } = {}): TextRun[] {
  let t = text;
  if (opts.prose) {
    const fixed = fixSentenceDashes(t);
    ctx.report.dashesFixed += fixed.fixed;
    t = fixed.text;
  }
  const segs = inlineSegments(t, { inTable: opts.inTable });
  ctx.report.etAl += segs.filter((s) => s.italics && s.text === "et al.").length;
  return segs.map((s) => textRun(s, opts.bold ? { bold: true } : {}));
}

function plain(text: string, extra: { bold?: boolean; italics?: boolean; allCaps?: boolean } = {}): TextRun {
  return new TextRun({ text, ...extra });
}

function centred(children: ParagraphChild[], extra: { pageBreakBefore?: boolean } = {}): Paragraph {
  return new Paragraph({ style: STYLE.prelimText.id, alignment: AlignmentType.CENTER, children, ...extra });
}

const blank = () => new Paragraph({ children: [] });

function pageNumberFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        style: STYLE.pageNumber.id,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SIZE, color: BLACK })],
      }),
    ],
  });
}

const emptyFooter = () => new Footer({ children: [new Paragraph({ style: STYLE.pageNumber.id, children: [] })] });

const NONE_BORDER = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;
const RULE = { style: BorderStyle.SINGLE, size: 4, color: BLACK } as const; // 0.5pt
const NO_CELL_BORDERS = { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER };

/** H1 page title in the preliminary pages (each on a new page, except where noted). */
function pageTitle(text: string, pageBreakBefore = true): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore, children: [plain(text, { bold: true })] });
}

// ─── Equations (EQ1-EQ5) ─────────────────────────────────────────────────────

const EQ_LEFT = Math.round(TEXT_WIDTH * 0.85);
const EQ_RIGHT = TEXT_WIDTH - EQ_LEFT;

/** One OMML element; `attrs` become its XML attributes. */
function el(name: string, children: (ImportedXmlComponent | string)[] = [], attrs?: Record<string, string>): ImportedXmlComponent {
  const c = new ImportedXmlComponent(name, attrs);
  for (const ch of children) c.push(ch);
  return c;
}

/** A math run as normal text in Times New Roman 12pt (founder's call), letters italic. */
function mathRun(text: string, italic: boolean): ImportedXmlComponent {
  const rPr = el("w:rPr", [
    el("w:rFonts", [], { "w:ascii": "Times New Roman", "w:hAnsi": "Times New Roman", "w:cs": "Times New Roman", "w:eastAsia": "Times New Roman" }),
    ...(italic ? [el("w:i"), el("w:iCs")] : []),
    el("w:color", [], { "w:val": BLACK }),
    el("w:sz", [], { "w:val": String(SIZE) }),
    el("w:szCs", [], { "w:val": String(SIZE) }),
  ]);
  return el("m:r", [el("m:rPr", [el("m:nor")]), rPr, el("m:t", [text], { "xml:space": "preserve" })]);
}

function mathNodes(nodes: MathNode[]): ImportedXmlComponent[] {
  return nodes.map((n): ImportedXmlComponent => {
    switch (n.t) {
      case "run":
        return mathRun(n.text, n.italic);
      case "frac":
        return el("m:f", [el("m:num", mathNodes(n.num)), el("m:den", mathNodes(n.den))]);
      case "sub":
        return el("m:sSub", [el("m:e", mathNodes(n.base)), el("m:sub", mathNodes(n.sub))]);
      case "sup":
        return el("m:sSup", [el("m:e", mathNodes(n.base)), el("m:sup", mathNodes(n.sup))]);
      case "subsup":
        return el("m:sSubSup", [el("m:e", mathNodes(n.base)), el("m:sub", mathNodes(n.sub)), el("m:sup", mathNodes(n.sup))]);
      case "rad":
        return el("m:rad", [el("m:radPr", [el("m:degHide", [], { "m:val": "1" })]), el("m:deg"), el("m:e", mathNodes(n.body))]);
    }
  });
}

/**
 * EQ2: a borderless two-column table, each equation (native OMML) left and its
 * number (3.1, never (3.1)) right. Equations that follow one another share one
 * table, a row each: Word joins tables that touch, so this is what it would show anyway.
 */
function equationTable(equations: { text: string; number: string }[], ctx: Ctx): Table {
  const row = ({ text, number }: { text: string; number: string }) => {
    const { nodes, structured } = parseEquation(text);
    if (!structured) ctx.report.equationsAsText++;
    const math = el("m:oMath", mathNodes(nodes));
    return new TableRow({
      cantSplit: true,
      children: [
        new TableCell({
          width: { size: EQ_LEFT, type: WidthType.DXA },
          borders: NO_CELL_BORDERS,
          verticalAlign: VerticalAlignTable.CENTER,
          children: [new Paragraph({ style: STYLE.equation.id, alignment: AlignmentType.CENTER, children: [math as unknown as ParagraphChild] })],
        }),
        new TableCell({
          width: { size: EQ_RIGHT, type: WidthType.DXA },
          borders: NO_CELL_BORDERS,
          verticalAlign: VerticalAlignTable.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [plain(number)] })],
        }),
      ],
    });
  };
  return new Table({
    width: { size: TEXT_WIDTH, type: WidthType.DXA },
    columnWidths: [EQ_LEFT, EQ_RIGHT],
    layout: TableLayoutType.FIXED,
    borders: TableBorders.NONE,
    rows: equations.map(row),
  });
}

// ─── Tables (T1-T8) ──────────────────────────────────────────────────────────

/** "Table 4.1: Title" with a colon, whatever separator the model used; numbered here when it had none. */
function tableCaptionText(caption: string | null, chapter: number, index: number, kind: "Table" | "Figure"): { text: string; generated: boolean } {
  const re = new RegExp(`^\\**\\s*${kind === "Table" ? "Table" : "Fig(?:ure|\\.)?"}\\s+(\\d+(?:\\.\\d+)?)\\s*[:.\\-–—]?\\s*(.*?)\\s*\\**$`, "i");
  const m = caption ? re.exec(caption.trim()) : null;
  if (m) return { text: `${kind} ${m[1]}: ${m[2]}`.trim().replace(/:\s*$/, ""), generated: false };
  const title = (caption ?? "").replace(/^\**|\**$/g, "").trim();
  return { text: `${kind} ${chapter}.${index}${title ? `: ${title}` : ""}`, generated: true };
}

const isNumeric = (s: string) => /^[\s(]*[-−+]?[\d.,]+%?\**[)\s]*$/.test(s) || /^[\d.,]+\s*\([\d.,]+%?\)$/.test(s);

/**
 * Column widths that follow the content: a short "S/N" or "Mean" column stays
 * narrow and a long "Specification" column gets the room (each between 1 and
 * 4.5 times its share of the longest words).
 */
function columnWidths(rows: string[][], columns: number): number[] {
  const weight = Array.from({ length: columns }, (_, c) => {
    const cells = rows.map((r) => (r[c] ?? "").trim());
    const longest = Math.max(4, ...cells.map((t) => t.length));
    const longestWord = Math.max(3, ...cells.flatMap((t) => t.split(/\s+/).map((w) => w.length)));
    return Math.min(Math.max(longest, longestWord * 1.5), 45);
  });
  const total = weight.reduce((a, w) => a + w, 0);
  const widths = weight.map((w) => Math.max(700, Math.floor((w / total) * TEXT_WIDTH)));
  const over = widths.reduce((a, w) => a + w, 0) - TEXT_WIDTH;
  if (over > 0) {
    const widest = widths.indexOf(Math.max(...widths));
    widths[widest] -= over;
  }
  return widths;
}

function dataTable(block: Extract<Block, { kind: "table" }>, chapter: number, index: number, ctx: Ctx, chapterReport: ChapterReport): (Paragraph | Table)[] {
  const caption = tableCaptionText(block.caption, chapter, index, "Table");
  if (caption.generated) chapterReport.warnings.push(`Table ${chapter}.${index} had no caption; one was added.`);
  const threeLine = ctx.profile === "ENGINEERING";
  const width = Math.max(1, block.header.length, ...block.rows.map((r) => r.length));
  const colWidths = columnWidths([block.header, ...block.rows], width);
  const keepTogether = block.rows.length <= 40;

  const cell = (text: string, col: number, header: boolean, lastRow: boolean) =>
    new TableCell({
      width: { size: colWidths[col], type: WidthType.DXA },
      margins: { left: 80, right: 80, top: 0, bottom: 0 },
      ...(threeLine
        ? { borders: header ? { top: RULE, bottom: RULE, left: NONE_BORDER, right: NONE_BORDER } : { left: NONE_BORDER, right: NONE_BORDER } }
        : {}),
      verticalAlign: VerticalAlignTable.CENTER,
      children: [
        new Paragraph({
          style: STYLE.tableText.id,
          alignment: col > 0 && (header || isNumeric(text)) ? AlignmentType.CENTER : AlignmentType.LEFT,
          keepNext: keepTogether && !lastRow,
          keepLines: true,
          children: runsFor(text, ctx, { inTable: true, bold: header }),
        }),
      ],
    });

  const pad = (r: string[]) => [...r, ...Array(Math.max(0, width - r.length)).fill("")];
  const rows = [
    new TableRow({ tableHeader: true, cantSplit: true, children: pad(block.header).map((t, c) => cell(t, c, true, block.rows.length === 0)) }),
    ...block.rows.map((r, i) => new TableRow({ cantSplit: true, children: pad(r).map((t, c) => cell(t, c, false, i === block.rows.length - 1)) })),
  ];

  const table = new Table({
    width: { size: colWidths.reduce((a, w) => a + w, 0), type: WidthType.DXA },
    columnWidths: colWidths,
    alignment: AlignmentType.CENTER,
    borders: threeLine
      ? { top: RULE, bottom: RULE, left: NONE_BORDER, right: NONE_BORDER, insideHorizontal: NONE_BORDER, insideVertical: NONE_BORDER }
      : { top: RULE, bottom: RULE, left: RULE, right: RULE, insideHorizontal: RULE, insideVertical: RULE },
    rows,
  });

  const out: (Paragraph | Table)[] = [
    new Paragraph({ style: STYLE.tableCaption.id, keepNext: true, children: runsFor(caption.text, ctx, { bold: true }) }),
    table,
  ];
  if (block.source) out.push(new Paragraph({ alignment: AlignmentType.LEFT, children: runsFor(`Source: ${block.source}`, ctx) }));
  return out;
}

// ─── Figures (FG1-FG6) ───────────────────────────────────────────────────────

function figureBlock(block: Extract<Block, { kind: "figure" }>, chapter: number, index: number, ctx: Ctx, chapterReport: ChapterReport): Paragraph[] {
  const description = /\[FIGURE PLACEHOLDER:\s*([^\]]*)\]/i.exec(block.placeholder)?.[1]?.trim() ?? "";
  const caption = tableCaptionText(block.caption ?? (description ? `Figure ${chapter}.${index}: ${description}` : null), chapter, index, "Figure");
  if (!block.caption) chapterReport.warnings.push(`Figure ${chapter}.${index} had no caption; ${block.image ? "a number was given to it" : "one was made from the placeholder"}.`);
  // Chapter review: a picture from the approved upload, at the size the specialist gave it (capped to the page).
  const picture = block.image ? ctx.media?.get(block.image.key) : undefined;
  if (block.image && !picture) chapterReport.warnings.push(`Figure ${chapter}.${index}: the picture could not be loaded, so a placeholder stands in its place.`);
  const figure = picture
    ? new Paragraph({
        alignment: AlignmentType.CENTER,
        keepNext: true,
        children: [new ImageRun({ type: picture.type, data: picture.data, transformation: { width: block.image!.width, height: block.image!.height } })],
      })
    : new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, children: [plain(block.image ? "[FIGURE PLACEHOLDER: picture missing]" : block.placeholder)] });
  const out = [figure, new Paragraph({ style: STYLE.figureCaption.id, children: runsFor(caption.text, ctx, { bold: true }) })];
  if (block.source) out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: runsFor(`Source: ${block.source}`, ctx) }));
  return out;
}

// ─── Chapters ────────────────────────────────────────────────────────────────

function chapterContent(chapter: { number: number; text: string }, first: boolean, ctx: Ctx): (Paragraph | Table)[] {
  const parsed = parseChapter(chapter.text, chapter.number);
  const title = upperH1(parsed.title ?? chapterTitle(ctx.mode, chapter.number, ctx.thematic));
  const chapterReport: ChapterReport = {
    number: chapter.number,
    title,
    equations: 0,
    tables: 0,
    figures: 0,
    placeholders: findPlaceholders(chapter.text),
    warnings: [...parsed.warnings],
  };
  ctx.report.chapters.push(chapterReport);

  // EQ4: the assembly numbers equations chapter.n in order; the model's numbers map onto them for in-text references.
  const numberMap = new Map<string, string>();
  let eq = 0;
  for (const b of parsed.blocks) {
    if (b.kind !== "equation") continue;
    eq++;
    if (b.modelNumber && !numberMap.has(b.modelNumber)) numberMap.set(b.modelNumber, `${chapter.number}.${eq}`);
  }

  const out: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: !first,
      children: [plain(`CHAPTER ${chapterWord(chapter.number)}`, { bold: true }), new TextRun({ text: title, bold: true, break: 1 })],
    }),
  ];

  let equationNo = 0;
  let tableNo = 0;
  let figureNo = 0;
  // MODE_A: a chapter written in parts carries one [ENDNOTES] block per part; they are shown as one list at its end.
  const chapterNotes: string[] = [];
  // Word joins two tables that touch into one: keep a paragraph between any two (a blank line, 2.0 like the rest).
  const push = (...items: (Paragraph | Table)[]) => {
    for (const item of items) {
      if (item instanceof Table && out[out.length - 1] instanceof Table) out.push(new Paragraph({ children: [] }));
      out.push(item);
    }
  };
  for (let i = 0; i < parsed.blocks.length; i++) {
    const block = parsed.blocks[i];
    switch (block.kind) {
      case "heading": {
        const cased = block.level === 2 ? titleCase(block.text) : sentenceCase(block.text, ctx.properNouns);
        if (cased !== block.text) ctx.report.headingsRecased++;
        push(new Paragraph({ heading: block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, children: runsFor(cased, ctx, { bold: true }) }));
        break;
      }
      case "paragraph":
        push(new Paragraph({ children: runsFor(renumberEquationRefs(block.text, numberMap), ctx, { prose: true }) }));
        break;
      case "list":
        for (const item of block.items) {
          push(
            new Paragraph({
              indent: { left: 360, hanging: 360 },
              children: [plain(`${item.marker} `), ...runsFor(renumberEquationRefs(item.text, numberMap), ctx, { prose: true })],
            }),
          );
        }
        break;
      case "equation": {
        const run: { text: string; number: string }[] = [];
        for (let k = i; k < parsed.blocks.length; k++) {
          const b = parsed.blocks[k];
          if (b.kind !== "equation") break;
          equationNo++;
          chapterReport.equations++;
          run.push({ text: b.text, number: `${chapter.number}.${equationNo}` });
          i = k;
        }
        push(equationTable(run, ctx));
        break;
      }
      case "table":
        tableNo++;
        chapterReport.tables++;
        push(...dataTable(block, chapter.number, tableNo, ctx, chapterReport));
        break;
      case "figure":
        figureNo++;
        chapterReport.figures++;
        push(...figureBlock(block, chapter.number, figureNo, ctx, chapterReport));
        break;
      case "endnotes":
        if (ctx.placement === "MODE_A") {
          chapterNotes.push(...block.lines);
          break;
        }
        push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [plain(PAGE_TITLES.endnotes, { bold: true })] }));
        for (const line of block.lines) push(new Paragraph({ children: runsFor(line, ctx) }));
        break;
    }
  }
  if (chapterNotes.length) {
    push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [plain(PAGE_TITLES.endnotes, { bold: true })] }));
    for (const line of chapterNotes) push(new Paragraph({ indent: { left: 360, hanging: 360 }, children: runsFor(line, ctx) }));
  }
  return out;
}

/** MODE_B: the report's one numbered list of notes, on its own page before the References. */
function endnotesPages(notes: CollectedEndnotes["notes"], ctx: Ctx): Paragraph[] {
  return [
    new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [plain(PAGE_TITLES.documentEndnotes, { bold: true })] }),
    ...notes.map((n) => new Paragraph({ indent: { left: 360, hanging: 360 }, children: [plain(`${n.number}. `), ...runsFor(n.text, ctx)] })),
  ];
}

// ─── References (R1-R6) ──────────────────────────────────────────────────────

/** The approved style as one the list formatter knows; anything it cannot set is noted for the specialist. */
function listStyleFor(key: string): { style: ListStyle; note: string | null } {
  switch (key) {
    case "APA_7TH":
    case "APA_6TH":
    case "HARVARD":
    case "IEEE":
    case "MLA":
    case "CHICAGO":
      return { style: key, note: null };
    case "CHICAGO_AUTHOR_DATE":
    case "CHICAGO_NOTES_BIBLIOGRAPHY":
      return { style: "CHICAGO", note: null };
    case "NMCN":
      return { style: "APA_7TH", note: null }; // the NMCN profile references in APA 7th
    default: {
      const label = (STYLE_LABEL as Record<string, string>)[key] ?? key;
      return { style: "APA_7TH", note: `The approved referencing style (${label}) has no list layout yet, so the References are set in APA 7th for the specialist to adjust.` };
    }
  }
}

function referencesPages(
  input: AssemblyInput,
  ctx: Ctx,
  citedInNotes: ReadonlySet<DocReference> = new Set(),
  opts: { omitWhenEmpty?: boolean } = {},
): Paragraph[] {
  const { style, note } = listStyleFor(input.referencingStyle);
  if (note) ctx.report.notes.push(note);
  const numbered = style === "IEEE";
  // Founder's call (D7): only works cited in the chapters. A numbered style (IEEE) cites by number, so its list is kept whole.
  // Note-style chapters (MODE_A/B) cite in their notes rather than as (Author, Year): those works count as cited too.
  const inText = numbered
    ? { cited: input.references, uncited: [] as DocReference[], unmatched: [] as string[] }
    : citedReferences(input.references, input.chapters.map((c) => c.text));
  const cited = citedInNotes.size ? input.references.filter((r) => inText.cited.includes(r) || citedInNotes.has(r)) : inText.cited;
  const uncited = input.references.filter((r) => !cited.includes(r));
  const unmatched = inText.unmatched;
  if (numbered) ctx.report.notes.push("IEEE numbers references in the order they are first cited; this list holds every verified reference alphabetically, so renumber it to match the chapters.");
  const entries = formattedReferences(cited, style);
  ctx.report.references = {
    style: input.referencingStyle,
    listedAs: style,
    listed: entries.length,
    leftOut: uncited.length,
    unmatchedCitations: unmatched,
  };
  // A single chapter that cites nothing gets no empty References page (R1 would fail it for having no entries).
  if (opts.omitWhenEmpty && entries.length === 0) return [];
  return [
    new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [plain(PAGE_TITLES.references, { bold: true })] }),
    ...entries.map(({ segs }) => {
      const italic = italiciseEtAl(segs.map((s) => ({ text: s.text, ...(s.italics ? { italics: true } : {}) })));
      ctx.report.etAl += italic.filter((s) => s.italics && s.text === "et al.").length;
      return new Paragraph({ style: STYLE.reference.id, children: italic.map((s) => textRun(s)) });
    }),
  ];
}

// ─── Preliminary pages (the founder's template) ──────────────────────────────

/** "OCTOBER, 2026". */
const submissionDate = (d: Date) => {
  const [month, year] = d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Africa/Lagos" }).split(" ");
  return `${month.toUpperCase()}, ${year}`;
};
/**
 * D7b: the details on the preliminary pages the order did not supply, in the
 * words the Report tab shows (the same rules preliminaryChildren uses to put a
 * placeholder in their place). They are edited on the project's Edit intake page.
 */
export function prelimIntakeGaps(input: Pick<AssemblyInput, "student" | "supervisor" | "hod" | "dedication">): string[] {
  const gaps: string[] = [];
  if (!input.student.matric?.trim()) gaps.push("Matric number");
  if (!input.supervisor?.trim()) gaps.push("Supervisor's name");
  if (!input.hod?.trim()) gaps.push("Head of Department's name");
  const custom = input.dedication.type === "Custom" || (!input.dedication.type && input.dedication.details);
  const dedicated = custom ? Boolean(input.dedication.details?.trim()) : Boolean(PRELIM_TEXT.dedication[input.dedication.type ?? ""]);
  if (!dedicated) gaps.push("Dedication");
  return gaps;
}

const orPlaceholder = (value: string | null | undefined, placeholder: string, ctx: Ctx) => {
  const v = value?.trim();
  if (v) return v;
  ctx.report.prelimPlaceholders.push(placeholder);
  return placeholder;
};

/**
 * Word fits about 25 double-spaced 12pt lines on an A4 page with 1 inch margins.
 * The cover and title page are laid out with blank lines, as in the template, and
 * kept to 24 so a long title never pushes them onto a second page.
 */
const PAGE_LINES = 24;
/** Lines a centred bold capital line takes: about 58 characters fit across the page. */
const linesFor = (text: string) => Math.max(1, Math.ceil(text.length / 58));
const blanks = (n: number) => Array.from({ length: Math.max(0, n) }, blank);
const boldCentred = (text: string) => centred([plain(text, { bold: true })]);

/** Cover (template): the topic at the top, the name and matric number in the middle, the date at the foot. No number is shown. */
function coverPage(input: AssemblyInput, matric: string): Paragraph[] {
  const title = input.title.toUpperCase();
  const free = PAGE_LINES - linesFor(title) - 3;
  const top = Math.min(10, Math.ceil(free / 2));
  return [
    boldCentred(title),
    ...blanks(top),
    boldCentred(input.student.name.toUpperCase()),
    boldCentred(matric),
    ...blanks(Math.min(10, free - top)),
    boldCentred(submissionDate(input.submission)),
  ];
}

/** Title page (template): topic, BY, name and matric number, the submission statement, the supervisor, the date. It shows page ii. */
function titlePage(input: AssemblyInput, degree: string, matric: string, supervisor: string): Paragraph[] {
  const title = input.title.toUpperCase();
  const statement = PRELIM_TEXT.submission(
    input.department.replace(/^department of\s+/i, "") || "[DEPARTMENT]",
    input.faculty.replace(/^faculty of\s+/i, "") || "[FACULTY]",
    input.university || "[UNIVERSITY]",
    degree,
  );
  // The template's gaps: 6 blank lines after the topic, 3 after the matric number, 3 after the statement, 3 after the supervisor.
  const gaps = [6, 3, 3, 3];
  let over = linesFor(title) + 3 + linesFor(statement) + 2 + gaps.reduce((a, g) => a + g, 0) - PAGE_LINES;
  for (let i = 0; over > 0 && i < 20; i++) {
    const k = gaps[0] > 2 ? 0 : gaps.findIndex((g) => g > 1);
    if (k === -1) break;
    gaps[k]--;
    over--;
  }
  return [
    boldCentred(title),
    ...blanks(gaps[0]),
    boldCentred(PRELIM_TEXT.by),
    boldCentred(input.student.name.toUpperCase()),
    boldCentred(matric),
    ...blanks(gaps[1]),
    boldCentred(statement),
    ...blanks(gaps[2]),
    boldCentred(PRELIM_TEXT.supervisedBy(supervisor)),
    ...blanks(gaps[3]),
    boldCentred(submissionDate(input.submission)),
  ];
}

/** The right-hand line (the date line): 28 underscores ending at the right margin. */
const DATE_LINE_WIDTH = 3360;
const SIGNATURE_TAB = TEXT_WIDTH - DATE_LINE_WIDTH;
/** "Date" sits centred under the date line (founder, 27 Sept). */
const DATE_CENTRE_TAB = TEXT_WIDTH - DATE_LINE_WIDTH / 2;

/** One row of a signature block: the left text, and the right text on the date line (starting there, or centred under it). */
function signatureRow(left: string, right: string, opts: { leftBold?: boolean; centreRight?: boolean } = {}): Paragraph {
  return new Paragraph({
    tabStops: [opts.centreRight ? { type: TabStopType.CENTER, position: DATE_CENTRE_TAB } : { type: TabStopType.LEFT, position: SIGNATURE_TAB }],
    keepNext: true,
    keepLines: true,
    children: [plain(left, opts.leftBold ? { bold: true } : {}), new TextRun({ children: [new Tab(), right] })],
  });
}

/** A signature line with a date line beside it, the name (bold) with "Date" centred under the date line, then the role. */
function signatureBlock(name: string, role: string | null): Paragraph[] {
  return [
    signatureRow(PRELIM_TEXT.signatureLine, PRELIM_TEXT.signatureLine),
    signatureRow(name, PRELIM_TEXT.date, { leftBold: true, centreRight: true }),
    ...(role ? [new Paragraph({ children: [plain(role)] })] : []),
  ];
}

function preliminaryChildren(input: AssemblyInput, ctx: Ctx, counts: { tables: number; figures: number }): (Paragraph | Table | TableOfContents)[] {
  const degree = getDegreeFromDepartment(input.department, { faculty: input.faculty, institution: input.university });
  const matric = orPlaceholder(input.student.matric, PRELIM_TEXT.matricPlaceholder, ctx);
  const supervisor = orPlaceholder(input.supervisor, PRELIM_TEXT.supervisorPlaceholder, ctx);
  const hod = orPlaceholder(input.hod, PRELIM_TEXT.hodPlaceholder, ctx);
  const dept = input.department.replace(/^department of\s+/i, "");
  const faculty = input.faculty.replace(/^faculty of\s+/i, "");

  const dedicationText =
    input.dedication.type === "Custom" || (!input.dedication.type && input.dedication.details)
      ? orPlaceholder(input.dedication.details, PRELIM_TEXT.dedicationPlaceholder, ctx)
      : (PRELIM_TEXT.dedication[input.dedication.type ?? ""] ?? orPlaceholder(null, PRELIM_TEXT.dedicationPlaceholder, ctx));

  // D10: the acknowledgement, abstract and list of abbreviations use the stored
  // agent output when the PreliminaryPages row exists; otherwise the founder's
  // placeholders remain in the document, exactly as before D10, and are recorded
  // in report.prelimPlaceholders. A stored section that came back empty keeps its placeholder too.
  const stored = input.preliminary ?? null;
  const ackText = stored?.acknowledgement.trim() ?? "";
  const abstractText = stored?.abstract.trim() ?? "";
  if (!ackText) ctx.report.prelimPlaceholders.push(PRELIM_TEXT.acknowledgementPlaceholder);
  if (!abstractText) ctx.report.prelimPlaceholders.push(PRELIM_TEXT.abstractPlaceholder);
  if (!stored) ctx.report.prelimPlaceholders.push(PRELIM_TEXT.abbreviationsPlaceholder);

  const ackParagraphs = ackText
    ? paragraphsFrom(ackText, ctx)
    : [new Paragraph({ children: [plain(PRELIM_TEXT.acknowledgementPlaceholder)] })];
  const abstractParagraphs = abstractText
    ? paragraphsFrom(abstractText, ctx)
    : [new Paragraph({ children: [plain(PRELIM_TEXT.abstractPlaceholder)] })];

  const out: (Paragraph | Table | TableOfContents)[] = [
    ...titlePage(input, degree, matric, supervisor),

    pageTitle(PAGE_TITLES.declaration),
    new Paragraph({ children: runsFor(PRELIM_TEXT.declaration(input.title, dept, faculty, input.university, supervisor), ctx) }),
    ...blanks(2),
    ...signatureBlock(input.student.name, null),
    new Paragraph({ children: [plain(matric)] }),

    pageTitle(PAGE_TITLES.certification),
    new Paragraph({ children: runsFor(PRELIM_TEXT.certification(input.title, input.student.name, matric, dept, faculty, input.university, degree), ctx) }),
    ...blanks(3),
    ...signatureBlock(supervisor, PRELIM_TEXT.projectSupervisor),
    ...blanks(2),
    ...signatureBlock(hod, PRELIM_TEXT.headOfDepartment),
    ...blanks(2),
    ...signatureBlock(PRELIM_TEXT.externalExaminer, null),

    // Justified, not centred (founder's template).
    pageTitle(PAGE_TITLES.dedication),
    new Paragraph({ children: runsFor(dedicationText, ctx) }),

    pageTitle(PAGE_TITLES.acknowledgement),
    ...ackParagraphs,
    ...(input.acknowledgementNote?.trim() && !ackText
      ? [new Paragraph({ children: [plain(PRELIM_TEXT.acknowledgementFromOrder(input.acknowledgementNote.trim()))] })]
      : []),

    pageTitle(PAGE_TITLES.abstract),
    ...abstractParagraphs,
  ];
  // LT1/LF1: a list exists when the report has any table or figure.
  if (counts.tables > 0) {
    out.push(pageTitle(PAGE_TITLES.tables), new TableOfContents(PAGE_TITLES.tables, { hyperlink: true, hideTabAndPageNumbersInWebView: true, stylesWithLevels: [new StyleLevel(STYLE.tableCaption.name, 1)] }));
  }
  if (counts.figures > 0) {
    out.push(pageTitle(PAGE_TITLES.figures), new TableOfContents(PAGE_TITLES.figures, { hyperlink: true, hideTabAndPageNumbersInWebView: true, stylesWithLevels: [new StyleLevel(STYLE.figureCaption.name, 1)] }));
  }
  out.push(pageTitle(PAGE_TITLES.abbreviations));
  if (stored && stored.abbreviations.length > 0) {
    out.push(abbreviationsTable(stored.abbreviations));
  } else if (stored && stored.abbreviations.length === 0) {
    // D10: the scanner found nothing worth listing (or Claude expanded none confidently).
    out.push(new Paragraph({ children: [plain(PRELIM_TEXT.noAbbreviations)] }));
  } else {
    out.push(new Paragraph({ children: [plain(PRELIM_TEXT.abbreviationsPlaceholder)] }));
  }
  out.push(
    // The template puts the Table of Contents last. TOC1-TOC5: a real field over Heading 1-3, no dotted leaders.
    pageTitle(PAGE_TITLES.contents),
    new TableOfContents(PAGE_TITLES.contents, { headingStyleRange: "1-3", hyperlink: true, hideTabAndPageNumbersInWebView: true, useAppliedParagraphOutlineLevel: true }),
  );
  return out;
}

/** D10: prose paragraphs from a Claude-written body. Preserves blank-line breaks. */
function paragraphsFrom(body: string, ctx: Ctx): Paragraph[] {
  const parts = body.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return [new Paragraph({ children: [plain("")] })];
  return parts.map((p) => new Paragraph({ children: runsFor(p, ctx, { prose: true }) }));
}

/** D10: two-column list of abbreviations, alphabetical, no header row (matches the founder's template). */
function abbreviationsTable(rows: { token: string; expansion: string }[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: rows.map(
      (r) =>
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({ width: { size: 25, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [plain(r.token, { bold: true })] })] }),
            new TableCell({ width: { size: 75, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [plain(r.expansion)] })] }),
          ],
        }),
    ),
  });
}

// ─── The document ────────────────────────────────────────────────────────────

export function profileFor(input: Pick<AssemblyInput, "section">): AssemblyProfile {
  return input.section === "ENGINEERING" ? "ENGINEERING" : "FYP_STANDARD";
}

/** The whole report from loaded input; no database. */
export function buildReportDocument(input: AssemblyInput): { doc: Document; report: AssemblyReport } {
  const report: AssemblyReport = {
    profile: profileFor(input),
    chapters: [],
    prelimPlaceholders: [],
    etAl: 0,
    dashesFixed: 0,
    headingsRecased: 0,
    equationsAsText: 0,
    references: { style: input.referencingStyle, listedAs: input.referencingStyle, listed: 0, leftOut: 0, unmatchedCitations: [] },
    notes: [],
  };
  const ctx: Ctx = {
    profile: report.profile,
    report,
    properNouns: properNounsFrom(input.chapters.map((c) => c.text)),
    mode: input.mode,
    thematic: input.thematicTitles,
    placement: input.citationPlacement,
    media: input.media,
  };
  if (input.citationPlacement === "MODE_C") {
    report.notes.push("This referencing style cites in footnotes. The chapters carry the note numbers, but the footnote text is not produced yet, so the specialist adds the notes.");
  }

  // MODE_B: every chapter's note blocks become one numbered list at the end of the document (endnotes.ts).
  const endnotes = input.citationPlacement === "MODE_B" ? collectEndnotes(input.chapters) : null;
  if (endnotes) {
    if (endnotes.dangling.length) report.notes.push(`${endnotes.dangling.length} note marker(s) had no note and were taken out: ${endnotes.dangling.slice(0, 8).join("; ")}.`);
    if (endnotes.unused.length) report.notes.push(`${endnotes.unused.length} note(s) had no marker in the text and were left out: ${endnotes.unused.slice(0, 8).join("; ")}.`);
    if (endnotes.merged) report.notes.push(`${endnotes.merged} note(s) repeated word for word in another chapter or part were joined into one.`);
  }
  const citedInNotes = new Set<DocReference>();
  if (input.citationPlacement === "MODE_A" || input.citationPlacement === "MODE_B") {
    let naming = 0;
    for (const ch of input.chapters) {
      for (const [, refs] of resolveNotes(analyseChapterNotes(ch.text), input.references)) {
        if (refs === "comment") continue;
        if (refs.length === 0) naming++;
        refs.forEach((r) => citedInNotes.add(r));
      }
    }
    if (naming) report.notes.push(`${naming} note(s) name a work that is not on the verified reference list.`);
  }
  const bodyChapters = endnotes ? endnotes.chapters : input.chapters;
  const body = [
    ...bodyChapters.flatMap((c, i) => chapterContent(c, i === 0, ctx)),
    ...(endnotes?.notes.length ? endnotesPages(endnotes.notes, ctx) : []),
    ...referencesPages(input, ctx, citedInNotes),
  ];
  const counts = { tables: report.chapters.reduce((n, c) => n + c.tables, 0), figures: report.chapters.reduce((n, c) => n + c.figures, 0) };

  const page = (format: (typeof NumberFormat)[keyof typeof NumberFormat], start?: number) => ({
    size: PAGE.size,
    margin: PAGE.margin,
    pageNumbers: { ...(start ? { start } : {}), formatType: format },
  });

  const sections: ISectionOptions[] = [];
  if (input.includePrelims) {
    // The template's numbering: the cover counts as i but shows nothing; the title page shows ii, the declaration iii.
    const matric = input.student.matric?.trim() || PRELIM_TEXT.matricPlaceholder;
    sections.push({
      properties: { page: page(NumberFormat.LOWER_ROMAN, 1) },
      footers: { default: emptyFooter() },
      children: coverPage(input, matric),
    });
    sections.push({
      properties: { type: SectionType.NEXT_PAGE, page: page(NumberFormat.LOWER_ROMAN, 2) },
      footers: { default: pageNumberFooter() },
      children: preliminaryChildren(input, ctx, counts),
    });
  }
  sections.push({
    properties: { type: SectionType.NEXT_PAGE, page: page(NumberFormat.DECIMAL, 1), titlePage: false },
    footers: { default: pageNumberFooter() },
    children: body,
  });

  const doc = new Document({
    creator: "EduCraft",
    title: input.title,
    description: `${input.projectCode} report`,
    features: { updateFields: true },
    styles: reportStyles(),
    sections,
  });
  // The cover repeats wording the title page also counted; keep each placeholder once.
  report.prelimPlaceholders = [...new Set(report.prelimPlaceholders)];
  return { doc, report };
}

/**
 * Chapter review: one chapter as its own Word file, the AI draft the specialist
 * corrects. The chapter is laid out exactly as in the report (the same styles and
 * rules), its notes gathered into one list at its end and numbered 1..N (so any
 * placement reads back the same), followed by the works it cites. The file is
 * stamped with the project, the chapter and the text it was built from, so an
 * upload of the wrong file is caught when it is read back.
 */
export function buildChapterDocument(input: AssemblyInput, chapterNumber: number, stamp: { sourceHash: string }): { doc: Document; report: AssemblyReport } {
  const chapter = input.chapters.find((c) => c.number === chapterNumber);
  if (!chapter) throw new AssemblyError(`Chapter ${chapterNumber} is not written yet.`, 409, "CHAPTERS_NOT_READY", { missing: [chapterNumber] });
  const report: AssemblyReport = {
    profile: profileFor(input),
    chapters: [],
    prelimPlaceholders: [],
    etAl: 0,
    dashesFixed: 0,
    headingsRecased: 0,
    equationsAsText: 0,
    references: { style: input.referencingStyle, listedAs: input.referencingStyle, listed: 0, leftOut: 0, unmatchedCitations: [] },
    notes: [],
  };
  const notePlacement = input.citationPlacement === "MODE_A" || input.citationPlacement === "MODE_B";
  let text = chapter.text;
  if (notePlacement) {
    const joined = collectEndnotes([chapter]);
    text = joined.chapters[0]?.text ?? chapter.text;
    if (joined.notes.length) text += `\n\n[ENDNOTES]\n${joined.notes.map((n) => `${n.number}. ${n.text}`).join("\n")}`;
  }
  const ctx: Ctx = {
    profile: report.profile,
    report,
    properNouns: properNounsFrom(input.chapters.map((c) => c.text)),
    mode: input.mode,
    thematic: input.thematicTitles,
    placement: notePlacement ? "MODE_A" : input.citationPlacement,
    media: input.media,
  };
  const citedInNotes = new Set<DocReference>();
  if (notePlacement) {
    for (const [, refs] of resolveNotes(analyseChapterNotes(text), input.references)) if (refs !== "comment") refs.forEach((r) => citedInNotes.add(r));
  }
  const body = [...chapterContent({ number: chapterNumber, text }, true, ctx), ...referencesPages({ ...input, chapters: [{ number: chapterNumber, text }] }, ctx, citedInNotes, { omitWhenEmpty: true })];
  const doc = new Document({
    creator: "EduCraft",
    title: `${input.title}: Chapter ${chapterNumber}`,
    description: `${input.projectCode} Chapter ${chapterNumber}`,
    customProperties: [
      { name: CHAPTER_STAMP.project, value: input.projectCode },
      { name: CHAPTER_STAMP.chapter, value: String(chapterNumber) },
      { name: CHAPTER_STAMP.source, value: stamp.sourceHash },
    ],
    styles: reportStyles(),
    sections: [
      {
        properties: { page: { size: PAGE.size, margin: PAGE.margin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } },
        footers: { default: pageNumberFooter() },
        children: body,
      },
    ],
  });
  return { doc, report };
}

export async function packChapter(input: AssemblyInput, chapterNumber: number, stamp: { sourceHash: string }): Promise<{ buffer: Buffer; report: AssemblyReport }> {
  const { doc, report } = buildChapterDocument(input, chapterNumber, stamp);
  return { buffer: await finalizeDocx(await Packer.toBuffer(doc)), report };
}

/** "<project title> Chapter 2.docx". */
export function chapterFileName(title: string | null | undefined, code: string, chapter: number): string {
  return downloadName([title?.trim() || code, `Chapter ${chapter}`], "docx");
}

/** "<project title>.docx", safe for a download header (falls back to the project code). */
export function reportFileName(title: string | null | undefined, code: string): string {
  return downloadName([title?.trim() || code], "docx");
}

/** Load, build and pack. Throws AssemblyError (404 / 409). */
export async function assembleReport(
  projectDbId: string,
  opts: { source?: ChapterTextSource } = {},
): Promise<{ buffer: Buffer; fileName: string; report: AssemblyReport; source: AssemblyInput["source"] }> {
  const input = await loadAssemblyInput(projectDbId, opts);
  const { doc, report } = buildReportDocument(input);
  const buffer = await finalizeDocx(await Packer.toBuffer(doc));
  const workingCopy = input.source === "working-copy";
  return { buffer, fileName: workingCopy ? downloadName([input.title?.trim() || input.projectCode, "(working copy)"], "docx") : reportFileName(input.title, input.projectCode), report, source: input.source };
}

/** For the check script: the same document as a buffer, from fixture input. */
export async function packReport(input: AssemblyInput): Promise<{ buffer: Buffer; report: AssemblyReport }> {
  const { doc, report } = buildReportDocument(input);
  return { buffer: await finalizeDocx(await Packer.toBuffer(doc)), report };
}
