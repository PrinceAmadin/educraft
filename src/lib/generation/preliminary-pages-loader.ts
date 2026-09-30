/**
 * Phase D10: reads the founder's preliminary-pages prompt (a Markdown file
 * at prompts/preliminary-pages/preliminary_pages_prompt.md) once per process
 * and substitutes {TOKEN} values from the project data. Assembles two prompt
 * blocks (the Acknowledgement + Abstract rules for Call A, the Abbreviations
 * rules for Call B) so each of the two Claude calls sees only what it needs.
 *
 * Pattern mirrors src/lib/generation/prompt-loader.ts: cached once, throws
 * on any unresolved {TOKEN}, and every sentence the loader itself writes
 * (as opposed to the founder's own prose) sits in LOADER_TEXT below.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const PROMPT_REL = "prompts/preliminary-pages/preliminary_pages_prompt.md";
const TOKEN_RE = /\{([A-Z0-9_]+)\}/g;

export class PreliminaryPagesPromptError extends Error {}

let cache: string | null = null;

async function loadRaw(): Promise<string> {
  if (cache) return cache;
  const filePath = path.join(process.cwd(), PROMPT_REL);
  const raw = await readFile(filePath, "utf8");
  cache = raw.replace(/\r\n/g, "\n");
  return cache;
}

/** For tests: forget the cached copy so a hot-reload picks up an edit. */
export function _resetPreliminaryPagesCache(): void {
  cache = null;
}

/**
 * A page header in the prompt file: "### PAGE 6 — ACKNOWLEDGEMENT".
 * The em dash is what separates the number from the label; we accept
 * en dash and hyphen too, in case the file is edited.
 */
const PAGE_HEADER = /^###\s+PAGE\s+(\d+)\s*[—–-]\s*(.+?)\s*$/;

/** Returns the block of text under one page's heading, up to (but not including) the next page or a top-level "## " section. */
function extractPage(raw: string, pageNumber: number): string | null {
  const lines = raw.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = PAGE_HEADER.exec(lines[i]);
    if (m && Number(m[1]) === pageNumber) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (PAGE_HEADER.test(lines[i]) || /^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

export const LOADER_TEXT = {
  /** The acknowledgement's call (Sonnet 5). */
  ackIntro:
    "You are EduCraft's Preliminary Pages Agent. Read the project context and the rules below carefully, then write only the ACKNOWLEDGEMENT page for this specific project and return it through the record_acknowledgement tool. Do not add any other text. Do not include page numbers, headings or the section label: the tool captures the page as plain paragraphs of body text.",
  /** The abstract's call: Claude Opus 5.5 (SUPERVISOR_FACING_MODEL; founder, 30 Sept 2026: supervisors read the abstract first). */
  abstractIntro:
    "You are EduCraft's Preliminary Pages Agent. Read the project context and the rules below carefully, then write only the ABSTRACT page for this specific project and return it through the record_abstract tool. Do not add any other text. Do not include page numbers, headings or the section label: the tool captures the page as plain paragraphs of body text.",
  abstractRetryIntro:
    "The previous abstract was returned outside the 250–300 word range. Rewrite it to fall inside 260–290 words (aim for 275). Keep every rule in the ABSTRACT section below. Return the corrected Abstract through the tool.",
  callBIntro:
    "You are EduCraft's Preliminary Pages Agent. The token list below was scanned from the project's completed chapters. For each token, return its expansion through the expand_abbreviations tool. If you are not confident of an expansion, return null for that entry: an omitted entry is preferable to a guessed one. Do not add any other text.",
  contextHeading: "PROJECT CONTEXT",
  ackHeading: "ACKNOWLEDGEMENT — the rules for this section (from PAGE 6 of the founder's prompt)",
  abstractHeading: "ABSTRACT — the rules for this section (from PAGE 7 of the founder's prompt)",
  abbreviationsHeading: "ABBREVIATIONS — the tokens the scanner found in the completed chapters",
  abstractBand:
    "Aim for 275 words. Anything under 250 or over 300 is rejected and the run is asked again. Do not include citations, abbreviations without a first expansion, bullet points, or the phrases 'In conclusion' or 'To summarise'. Third person, past tense throughout.",
  ackBand:
    "Aim for 200 words. 150–250 is acceptable. Third person only ('The researcher wishes to express …'), never 'I' or 'we'. Do not name anyone the context does not already give.",
} as const;

/** All tokens the founder's prompt template understands. Any {TOKEN} outside this set throws. */
export const KNOWN_TOKENS = [
  "project_id",
  "student_full_name",
  "matric_number",
  "department",
  "faculty",
  "university",
  "project_title",
  "supervisor_name",
  "supervisor_title",
  "hod_name",
  "hod_title",
  "parent_reference",
  "degree_programme",
  "submission_year",
  "submission_month",
  "research_mode",
  "dedication_note",
  "acknowledgment_note",
  "extracted_aim",
  "extracted_objectives",
  "extracted_findings",
  "extracted_method",
  "extracted_conclusion",
] as const;
export type PromptToken = (typeof KNOWN_TOKENS)[number];
export type PromptValues = Record<PromptToken, string>;

function fill(text: string, values: PromptValues): string {
  return text.replace(TOKEN_RE, (_m, name: string) => {
    if (!(KNOWN_TOKENS as readonly string[]).includes(name)) {
      throw new PreliminaryPagesPromptError(`Unknown token {${name}} in preliminary_pages_prompt.md`);
    }
    return values[name as PromptToken] ?? "";
  });
}

export interface PreliminaryPromptBlocks {
  /** The acknowledgement's call (Sonnet 5): system and user prompts. */
  ackSystem: string;
  ackUser: string;
  /** The abstract's call (Opus 5.5): system and user prompts. */
  abstractSystem: string;
  abstractUser: string;
  /** The abstract's retry when the first came back outside the word band (the abstract only). */
  abstractRetryUser: string;
  /** System prompt for Call B (abbreviations expansion). */
  callBSystem: string;
  /** Builds Call B's user prompt for a specific list of tokens. */
  callBUser: (tokens: string[]) => string;
}

/**
 * Assembles both call prompts from the founder's file. Throws on any missing
 * page or unresolved token, so a broken prompt file never reaches the model.
 */
export async function loadPreliminaryPagesPrompts(values: PromptValues): Promise<PreliminaryPromptBlocks> {
  const raw = await loadRaw();
  const ackRules = extractPage(raw, 6);
  const abstractRules = extractPage(raw, 7);
  const abbreviationsRules = extractPage(raw, 8);
  if (!ackRules) throw new PreliminaryPagesPromptError("PAGE 6 (ACKNOWLEDGEMENT) not found in preliminary_pages_prompt.md");
  if (!abstractRules) throw new PreliminaryPagesPromptError("PAGE 7 (ABSTRACT) not found in preliminary_pages_prompt.md");
  if (!abbreviationsRules)
    throw new PreliminaryPagesPromptError("PAGE 8 (LIST OF ABBREVIATIONS) not found in preliminary_pages_prompt.md");

  const context = [
    `${LOADER_TEXT.contextHeading}`,
    `Project code: ${values.project_id}`,
    `Student: ${values.student_full_name} (matric ${values.matric_number})`,
    `University: ${values.university}`,
    `Faculty: ${values.faculty}`,
    `Department: ${values.department}`,
    `Degree: ${values.degree_programme}`,
    `Project title: ${values.project_title}`,
    `Supervisor: ${values.supervisor_title} ${values.supervisor_name}`.trim(),
    `HOD: ${values.hod_title} ${values.hod_name}`.trim(),
    `Parent reference: ${values.parent_reference}`,
    `Submission: ${values.submission_month} ${values.submission_year}`,
    `Research Mode: ${values.research_mode}`,
    values.dedication_note ? `DEDICATION_NOTE from the client: ${values.dedication_note}` : "",
    values.acknowledgment_note ? `ACKNOWLEDGMENT_NOTE from the client: ${values.acknowledgment_note}` : "",
    "",
    `Chapter 1 aim: ${values.extracted_aim}`,
    `Chapter 1 objectives:\n${values.extracted_objectives}`,
    `Chapter 3 methodology: ${values.extracted_method}`,
    `Chapter 4 findings: ${values.extracted_findings}`,
    `Chapter 5 conclusion: ${values.extracted_conclusion}`,
  ]
    .filter((s) => s !== "")
    .join("\n");

  const ackUser = [fill(context, values), "", LOADER_TEXT.ackHeading, fill(ackRules, values), "", LOADER_TEXT.ackBand].join("\n");

  const abstractUser = [fill(context, values), "", LOADER_TEXT.abstractHeading, fill(abstractRules, values), "", LOADER_TEXT.abstractBand].join("\n");

  const abstractRetryUser = [
    LOADER_TEXT.abstractRetryIntro,
    "",
    fill(context, values),
    "",
    LOADER_TEXT.abstractHeading,
    fill(abstractRules, values),
    "",
    LOADER_TEXT.abstractBand,
  ].join("\n");

  const callBUser = (tokens: string[]) =>
    [
      fill(context, values),
      "",
      LOADER_TEXT.abbreviationsHeading,
      tokens.map((t, i) => `${i + 1}. ${t}`).join("\n"),
      "",
      fill(abbreviationsRules, values),
    ].join("\n");

  return {
    ackSystem: LOADER_TEXT.ackIntro,
    ackUser,
    abstractSystem: LOADER_TEXT.abstractIntro,
    abstractUser,
    abstractRetryUser,
    callBSystem: LOADER_TEXT.callBIntro,
    callBUser,
  };
}
