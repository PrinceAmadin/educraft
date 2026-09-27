/**
 * Phase D7: every style the assembled report uses, from
 * prompts/shared/formatting_rules.md (FYP_STANDARD). Times New Roman 12pt
 * black for body AND headings (F1-F5: nothing is 14pt, not even the unused
 * built-in Title / Heading 4-6 / footnote styles), line spacing exactly 2.0
 * (Word's "Double": 480, auto) with 0pt before and after everywhere (S1-S5),
 * no first-line indent (P1), justified body (AL1).
 */

import { AlignmentType, LineRuleType, type IStylesOptions } from "docx";

export const FONT_NAME = "Times New Roman";
export const FONT = { ascii: FONT_NAME, hAnsi: FONT_NAME, cs: FONT_NAME, eastAsia: FONT_NAME };
/** 12pt, in half-points. */
export const SIZE = 24;
export const BLACK = "000000";

/** S1-S5: exactly 2.0, nothing before or after. */
export const DOUBLE = { line: 480, lineRule: LineRuleType.AUTO, before: 0, after: 0 } as const;
/** Table cells may use single spacing so a table fits on one page (the S exception). */
export const SINGLE = { line: 240, lineRule: LineRuleType.AUTO, before: 0, after: 0 } as const;

/** A4 with 1.0 inch margins (MG1-MG4). */
export const PAGE = {
  size: { width: 11906, height: 16838 },
  margin: { top: 1440, bottom: 1440, left: 1440, right: 1440, header: 720, footer: 720, gutter: 0 },
} as const;
/** The text width between the margins, in twips: where right-aligned tab stops go. */
export const TEXT_WIDTH = PAGE.size.width - PAGE.margin.left - PAGE.margin.right;

/** Style ids used in the document. The Lists of Tables and Figures are TOC fields over the caption style NAMES. */
export const STYLE = {
  tableCaption: { id: "TableCaption", name: "Table Caption" },
  figureCaption: { id: "FigureCaption", name: "Figure Caption" },
  tableText: { id: "TableText", name: "Table Text" },
  reference: { id: "Reference", name: "Reference" },
  pageNumber: { id: "PageNumber", name: "Page Number Footer" },
  equation: { id: "EquationLine", name: "Equation" },
  prelimText: { id: "PrelimCentred", name: "Preliminary Centred" },
} as const;

const run = { font: FONT, size: SIZE, sizeComplexScript: SIZE, color: BLACK } as const;

function heading(level: 1 | 2 | 3) {
  return {
    run: { ...run, bold: true, italics: false },
    paragraph: {
      alignment: level === 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: DOUBLE,
      indent: { left: 0, firstLine: 0 },
      keepNext: true,
      keepLines: true,
      outlineLevel: level - 1,
    },
  };
}

/** The same 12pt, 2.0 look for a built-in style the report never uses, so none is left at another size. */
const plainBuiltIn = { run: { ...run }, paragraph: { spacing: DOUBLE } };

export function reportStyles(): IStylesOptions {
  return {
    default: {
      document: {
        run: { ...run },
        paragraph: { spacing: DOUBLE, alignment: AlignmentType.JUSTIFIED, indent: { left: 0, firstLine: 0 } },
      },
      heading1: heading(1),
      heading2: heading(2),
      heading3: heading(3),
      heading4: { ...plainBuiltIn, run: { ...run, bold: true } },
      heading5: { ...plainBuiltIn, run: { ...run, bold: true } },
      heading6: { ...plainBuiltIn, run: { ...run, bold: true } },
      title: { run: { ...run, bold: true }, paragraph: { spacing: DOUBLE, alignment: AlignmentType.CENTER } },
      listParagraph: plainBuiltIn,
      footnoteText: plainBuiltIn,
      endnoteText: plainBuiltIn,
      footnoteTextChar: { run: { ...run } },
      endnoteTextChar: { run: { ...run } },
      hyperlink: { run: { color: BLACK, underline: {} } },
    },
    paragraphStyles: [
      // TOC entries: Word writes them from these styles when it updates the field. A right tab at the
      // margin with NO leader (TOC5: no dotted lines); level 2 and 3 indented.
      ...[1, 2, 3].map((level) => ({
        id: `TOC${level}`,
        name: `toc ${level}`,
        basedOn: "Normal",
        next: "Normal",
        uiPriority: 39,
        run: { ...run, bold: false },
        paragraph: {
          alignment: AlignmentType.LEFT,
          spacing: DOUBLE,
          indent: { left: (level - 1) * 360, right: 720, hanging: 0 },
          rightTabStop: TEXT_WIDTH,
        },
      })),
      {
        id: "TableofFigures",
        name: "table of figures",
        basedOn: "Normal",
        next: "Normal",
        run: { ...run },
        paragraph: { alignment: AlignmentType.LEFT, spacing: DOUBLE, indent: { left: 0, right: 720 }, rightTabStop: TEXT_WIDTH },
      },
      // T6/T7: caption ABOVE the table, centred, kept with the table.
      {
        id: STYLE.tableCaption.id,
        name: STYLE.tableCaption.name,
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { ...run, bold: true },
        paragraph: { alignment: AlignmentType.CENTER, spacing: DOUBLE, keepNext: true, keepLines: true },
      },
      // FG2/FG3: caption BELOW the figure, centred.
      {
        id: STYLE.figureCaption.id,
        name: STYLE.figureCaption.name,
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { ...run, bold: true },
        paragraph: { alignment: AlignmentType.CENTER, spacing: DOUBLE, keepLines: true },
      },
      {
        id: STYLE.tableText.id,
        name: STYLE.tableText.name,
        basedOn: "Normal",
        next: STYLE.tableText.id,
        run: { ...run },
        paragraph: { alignment: AlignmentType.LEFT, spacing: SINGLE, indent: { left: 0, firstLine: 0 } },
      },
      // R3: hanging indent, 0.5 inch.
      {
        id: STYLE.reference.id,
        name: STYLE.reference.name,
        basedOn: "Normal",
        next: STYLE.reference.id,
        run: { ...run },
        paragraph: { alignment: AlignmentType.JUSTIFIED, spacing: DOUBLE, indent: { left: 720, hanging: 720 } },
      },
      // PN4: page numbers centred in the footer.
      {
        id: STYLE.pageNumber.id,
        name: STYLE.pageNumber.name,
        basedOn: "Normal",
        run: { ...run },
        paragraph: { alignment: AlignmentType.CENTER, spacing: SINGLE, indent: { left: 0, firstLine: 0 } },
      },
      {
        id: STYLE.equation.id,
        name: STYLE.equation.name,
        basedOn: "Normal",
        run: { ...run },
        paragraph: { alignment: AlignmentType.CENTER, spacing: DOUBLE, keepLines: true },
      },
      {
        id: STYLE.prelimText.id,
        name: STYLE.prelimText.name,
        basedOn: "Normal",
        run: { ...run },
        paragraph: { alignment: AlignmentType.CENTER, spacing: DOUBLE },
      },
    ],
  };
}
