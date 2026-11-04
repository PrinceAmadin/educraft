/**
 * The Stage-1 formatting practical: a candidate is given a chapter that is
 * correct in substance but wrong in formatting, fixes it in Word, and uploads
 * it; we grade which planted faults they cleared against the chapter gate's own
 * formatting rules.
 *
 * Each fault is planted as a DIRECT property on ONE named body paragraph (found
 * by a snippet of its text), and graded by reading that same paragraph back —
 * not by running the report gate's full Layer 1. That matters: a word processor
 * rewrites a saved .docx its own way (it renames styles to numbers and drops the
 * document defaults), and the report gate reads some rules (12pt, 2.0 spacing,
 * justification) from those document defaults, so it would mark a correctly
 * fixed file as wrong. Reading the specific paragraph the fault was planted in
 * tolerates whatever the word processor did elsewhere and matches the candidate's
 * natural fix ("select this text, set it right"). Verified through a real Word
 * round-trip. MG reads the section margins, which Word's Layout tab does change.
 *
 * Not pure (JSZip + the assembly builder); the fold-into-the-overall numbers
 * live in `rules.ts`. The injector menu is fixed in code — there is no FORMAT
 * question bank.
 */

import JSZip from "jszip";
import { packChapter, type AssemblyInput } from "@/lib/assembly/assemble";

// ── The fixture chapter (one correct chapter, no preliminary pages) ──────────
// Six body paragraphs, each with a distinctive opening so a fault can be planted
// in one and found again after the candidate saves.

const FIXTURE_CHAPTER = [
  "[H1] CHAPTER THREE",
  "[H1] RESEARCH METHODOLOGY",
  "[H2] 3.1 Research Design",
  "This study adopts a descriptive survey design. The design suits a study that measures opinion across a defined population at one point in time, and it keeps the cost of fieldwork within the limits a student researcher can meet.",
  "A pilot was run with twenty respondents before the main survey to check that the questions were understood as intended. The wording of two items was changed after the pilot so that the meaning was clear to every trader.",
  "[H2] 3.2 Population and Sample",
  "The population was the registered traders of three markets in the local government area. A sample of two hundred and forty traders was drawn by simple random sampling from the union register.",
  "[H3] 3.2.1 Sampling procedure",
  "The register was numbered and a random number table was used to pick the traders for the sample. Where a selected trader could not be reached after two visits, the next number on the list was taken in their place.",
  "[H2] 3.3 Method of Data Collection",
  "Data were collected with a structured questionnaire administered by hand. The questionnaire had three parts: the trader's background, their use of mobile money, and their view of its cost.",
  "Responses were recorded on a five-point scale so that they could be summarised and compared across the three markets. The scale ran from strong disagreement to strong agreement, with a neutral middle point.",
].join("\n");

export const FORMAT_FIXTURE_INPUT: AssemblyInput = {
  projectCode: "EC-SCREEN",
  title: "A Study of Mobile Money Use Among Market Traders",
  student: { name: "", matric: "" },
  university: "",
  faculty: "Management Sciences",
  department: "Business Administration",
  supervisor: "",
  hod: null,
  submission: new Date("2026-01-01T00:00:00Z"),
  dedication: { type: "none", details: null },
  acknowledgementNote: null,
  mode: 2,
  section: "BUSINESS",
  referencingStyle: "APA_7TH",
  citationPlacement: "NOT_APPLICABLE",
  thematicTitles: { chapter3: null, chapter4: null },
  chapters: [{ number: 3, text: FIXTURE_CHAPTER }],
  references: [],
  includePrelims: false,
};

// ── XML helpers ──────────────────────────────────────────────────────────────

const PARA_RE = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
const textOfPara = (p: string) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("");

/** The first paragraph whose text contains `snippet`. */
function findParagraph(documentXml: string, snippet: string): string | null {
  for (const p of documentXml.match(PARA_RE) ?? []) if (textOfPara(p).includes(snippet)) return p;
  return null;
}

/** Add a run-property fragment to every run in a paragraph — extending an existing <w:rPr>, or inserting one (rPr is the run's first child). */
function addRunProp(paragraph: string, fragment: string): string {
  return paragraph.replace(/(<w:r(?:\s[^>]*)?>)([\s\S]*?)(<\/w:r>)/g, (_m, open: string, inner: string, close: string) => {
    const next = /<w:rPr>/.test(inner)
      ? inner.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/, (_x, rp: string) => `<w:rPr>${rp}${fragment}</w:rPr>`)
      : `<w:rPr>${fragment}</w:rPr>${inner}`;
    return `${open}${next}${close}`;
  });
}

/** Set a paragraph-property fragment inside <w:pPr> (removing any existing one of that tag), creating pPr if needed. */
function setParaProp(paragraph: string, tagName: string, fragment: string): string {
  const pPr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(paragraph);
  if (pPr) {
    const inner = pPr[1].replace(new RegExp(`<${tagName}[^>]*/>`, "g"), "");
    return paragraph.replace(pPr[0], `<w:pPr>${fragment}${inner}</w:pPr>`);
  }
  return paragraph.replace(/(<w:p(?:\s[^>]*)?>)/, `$1<w:pPr>${fragment}</w:pPr>`);
}

const runFonts = (p: string) => [...p.matchAll(/<w:rFonts\s[^>]*?w:(?:ascii|hAnsi|cs)="([^"]*)"/g)].map((m) => m[1]);
// Only the display size (w:sz), as the gate's F2 reads it — never the complex-script size (w:szCs),
// which a word processor may leave behind on a Latin-script run and which does not affect the body.
const runSizes = (p: string) => [...p.matchAll(/<w:sz\s[^>]*?w:val="([^"]*)"/g)].map((m) => m[1]);
const runColours = (p: string) => [...p.matchAll(/<w:color\s[^>]*?w:val="([^"]*)"/g)].map((m) => m[1]);
const paraSpacingLine = (p: string) => /<w:pPr>[\s\S]*?<w:spacing\s[^>]*?w:line="(-?\d+)"/.exec(p)?.[1] ?? null;
const paraJc = (p: string) => {
  const pPr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(p)?.[1] ?? "";
  return /<w:jc\s[^>]*?w:val="([^"]*)"/.exec(pPr)?.[1] ?? null;
};

// ── The injector menu ────────────────────────────────────────────────────────

export interface FormatInjector {
  id: string;
  /** The chapter-gate formatting rule this fault is graded against. */
  ruleId: string;
  /** What the candidate sees is wrong. */
  label: string;
  /** What they do in Word to fix it. */
  fix: string;
  /** A snippet of the body paragraph the fault lives in (null = the whole document, e.g. margins). */
  snippet: string | null;
  /** Plant the fault in the located paragraph (or the whole document.xml when snippet is null). */
  inject: (target: string) => string;
  /** Read the located paragraph (or document.xml) back: is the fault gone? */
  isFixed: (target: string) => boolean;
}

export const FORMAT_INJECTORS: readonly FormatInjector[] = [
  {
    id: "font",
    ruleId: "F1",
    label: "Some of the text is in the wrong font (not Times New Roman).",
    fix: "Select the text and set the font to Times New Roman.",
    snippet: "This study adopts a descriptive survey design",
    inject: (p) => addRunProp(p, '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>'),
    isFixed: (p) => runFonts(p).every((f) => f === "Times New Roman"),
  },
  {
    id: "size",
    ruleId: "F2",
    label: "Some body text is not 12 point.",
    fix: "Select the text and set the size to 12 point.",
    snippet: "A pilot was run with twenty respondents",
    inject: (p) => addRunProp(p, '<w:sz w:val="28"/>'),
    isFixed: (p) => runSizes(p).every((s) => s === "24"),
  },
  {
    id: "colour",
    ruleId: "F5",
    label: "Some text is coloured instead of black.",
    fix: "Select the text and set the font colour to Automatic (black).",
    snippet: "The population was the registered traders",
    inject: (p) => addRunProp(p, '<w:color w:val="1F4E79"/>'),
    isFixed: (p) => runColours(p).every((c) => /^(?:000000|auto)$/i.test(c)),
  },
  {
    id: "spacing",
    ruleId: "S1",
    label: "A paragraph is not double (2.0) line spaced.",
    fix: "Select the paragraph and set line spacing to Double (2.0).",
    snippet: "The register was numbered and a random number table",
    inject: (p) => setParaProp(p, "w:spacing", '<w:spacing w:line="240" w:lineRule="auto"/>'),
    isFixed: (p) => {
      const line = paraSpacingLine(p);
      return line === null || line === "480";
    },
  },
  {
    id: "align",
    ruleId: "AL1",
    label: "A paragraph is left-aligned instead of justified.",
    fix: "Select the paragraph and justify it.",
    snippet: "Data were collected with a structured questionnaire",
    inject: (p) => setParaProp(p, "w:jc", '<w:jc w:val="left"/>'),
    isFixed: (p) => {
      const jc = paraJc(p);
      return jc === null || jc === "both" || jc === "center";
    },
  },
  {
    id: "margin",
    ruleId: "MG1",
    label: "The top margin is not 1 inch.",
    fix: "On the Layout tab, set all margins to 1 inch.",
    snippet: null,
    inject: (doc) => doc.replace(/(<w:pgMar[^>]*?)w:top="\d+"/, '$1w:top="720"'),
    // 1 inch = 1440 twips, ±72 (0.05in) tolerance, like the gate's MG check.
    isFixed: (doc) => {
      const top = Number(/<w:pgMar[^>]*?w:top="(-?\d+)"/.exec(doc)?.[1] ?? NaN);
      return Number.isFinite(top) && Math.abs(top - 1440) <= 72;
    },
  },
] as const;

export const FORMAT_INJECTOR_IDS = FORMAT_INJECTORS.map((i) => i.id);

// ── Build the broken chapter ─────────────────────────────────────────────────

/** Builds the fixture chapter and plants the named faults; returns the .docx bytes. */
export async function buildFormatTest(injectIds: readonly string[]): Promise<Buffer> {
  const { buffer } = await packChapter(FORMAT_FIXTURE_INPUT, 3, { sourceHash: "screening-format" });
  const zip = await JSZip.loadAsync(buffer);
  let documentXml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  for (const id of injectIds) {
    const injector = FORMAT_INJECTORS.find((i) => i.id === id);
    if (!injector) continue;
    if (injector.snippet === null) {
      documentXml = injector.inject(documentXml);
    } else {
      const para = findParagraph(documentXml, injector.snippet);
      if (para) documentXml = documentXml.replace(para, injector.inject(para));
    }
  }
  zip.file("word/document.xml", documentXml);
  return zip.generateAsync({ type: "nodebuffer" });
}

// ── Grade the candidate's upload ─────────────────────────────────────────────

export interface FormatGrade {
  cleared: string[];
  /** Faults still present (or whose paragraph could not be found), with what to do. */
  remaining: { id: string; ruleId: string; label: string; fix: string }[];
  correct: number;
  total: number;
  /** The uploaded file does not look like the chapter we handed out. */
  notOurChapter: boolean;
}

/**
 * Reads the candidate's uploaded .docx and, for each planted fault, finds the
 * paragraph it was planted in and checks whether the fault is gone. If the file
 * does not contain the chapter's paragraphs at all, it is flagged (and scores 0).
 */
export async function gradeFormatTest(buffer: Uint8Array, injectedIds: readonly string[]): Promise<FormatGrade> {
  let documentXml = "";
  try {
    const zip = await JSZip.loadAsync(buffer);
    documentXml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  } catch {
    documentXml = "";
  }
  // A quick sanity anchor: a snippet that is never a fault target.
  const anchor = "The questionnaire had three parts";
  const notOurChapter = !documentXml || !documentXml.includes("Research") || findParagraph(documentXml, anchor) === null;

  const cleared: string[] = [];
  const remaining: FormatGrade["remaining"] = [];
  for (const id of injectedIds) {
    const injector = FORMAT_INJECTORS.find((i) => i.id === id);
    if (!injector) continue;
    let fixed = false;
    if (!notOurChapter) {
      if (injector.snippet === null) {
        fixed = injector.isFixed(documentXml);
      } else {
        const para = findParagraph(documentXml, injector.snippet);
        fixed = para ? injector.isFixed(para) : false;
      }
    }
    if (fixed) cleared.push(id);
    else remaining.push({ id: injector.id, ruleId: injector.ruleId, label: injector.label, fix: injector.fix });
  }
  return { cleared, remaining, correct: cleared.length, total: injectedIds.length, notOurChapter };
}
