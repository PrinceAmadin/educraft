/**
 * Drafts a report's aim and its 4–5 objectives (D3b) for every report project
 * (the aim since 30 Sept 2026: every report states one aim before its
 * objectives, whatever its department's Chapter One list says). The COO
 * reviews and edits them on the mode card; once approved, Chapter 1 states
 * them word for word and every later chapter follows them (generate-chapter.ts
 * refuses any others).
 *
 * The prompt is a three-step examiner: understand the title's core goal, apply
 * the mode's methodology, draft the one-sentence aim and 4–5 objectives that
 * are specific to THIS title and end with the promised output. One Claude call
 * (tool `record_objectives`). Inputs: TITLE, RESEARCH MODE, DEPARTMENT, DEGREE.
 *
 * When the client's own brief or the supervisor's outline already lists
 * objectives (a run of 4–5 "To …" lines), extractClientStatedObjectives
 * returns those and stepDraft uses them verbatim (fromClient=true); the aim is
 * then the client's own "Aim: …" line (extractClientStatedAim) or one short
 * draftAim call. Every sentence sent to Claude is in OBJECTIVES_TEXT for the
 * founder to review.
 *
 * Written by Claude Opus 5.5 (SUPERVISOR_FACING_MODEL, founder, 30 Sept 2026:
 * the aim and objectives are what a supervisor reads first; Sonnet 5's drafts
 * scored mostly Weak or Fair on "Strong" in the independent check).
 */

import { SUPERVISOR_FACING_MODEL, callClaudeForJson } from "@/lib/anthropic";
import { listFrom } from "@/lib/research/source-policy";
import type { AiUsageContext } from "@/lib/ai-usage-log";
import { MAX_AIM_CHARS, MAX_OBJECTIVE_CHARS, MAX_OBJECTIVES, MIN_OBJECTIVES, validateAim, validateObjectives } from "@/lib/generation/objectives-rules";
import type { ResearchModeNumber } from "@/lib/generation/department-map";

export { MAX_OBJECTIVE_CHARS, MAX_OBJECTIVES, MIN_OBJECTIVES, validateAim, validateObjectives };
export type { ObjectivesCheck } from "@/lib/generation/objectives-rules";

export interface ObjectivesContext {
  title: string;
  department: string;
  degree: string;
  modeNumber: ResearchModeNumber;
}

export const OBJECTIVES_TEXT = {
  system:
    "You are a Nigerian university FYP examiner and academic writing expert. Your job is to draft the aim and the research objectives for a final year project.\n\n" +
    "You will be given:\n" +
    "- PROJECT TITLE: The exact title of the student's project\n" +
    "- RESEARCH MODE: The methodology the project will use (explained below)\n" +
    "- DEPARTMENT: The student's department\n" +
    "- DEGREE: The student's degree programme\n\n" +
    "---\n\n" +
    "RESEARCH MODES (what each one means for how the research is conducted):\n" +
    "- Mode 1 (Thematic): Pure desk research. Analyse existing theories, literature, and arguments. No data collection. All five chapters are written from published sources.\n" +
    "- Mode 2 (Survey): The student collects primary data by distributing questionnaires to human respondents. Chapter 4 analyses the responses (frequencies, correlations, hypothesis testing using SPSS or similar).\n" +
    "- Mode 3 (Implementation/Build): The student designs and builds a working system, prototype, or application. Chapter 3 covers the design/specification. Chapter 4 covers the implementation and testing results.\n" +
    "- Mode 4 (Laboratory): The student conducts physical lab experiments or tests. Chapter 3 covers the experimental setup. Chapter 4 analyses the lab results.\n" +
    "- Mode 5 (Secondary Data): The student uses existing published datasets, institutional records, or statistical databases — no primary data collection. Chapter 4 models or analyses this external data quantitatively.\n\n" +
    "---\n\n" +
    "STEP 1 — UNDERSTAND THE TITLE:\n" +
    "Read the project title carefully. Ask yourself:\n" +
    "- What is the student ultimately trying to produce, prove, or achieve?\n" +
    "- What is the core output or contribution this project promises?\n" +
    "- What problem is being solved or question being answered?\n" +
    "- What key concepts or subject matter does the title contain?\n\n" +
    "Write your understanding of the title's core goal in one sentence before drafting the aim and objectives. This is your anchor.\n\n" +
    "STEP 2 — APPLY THE MODE:\n" +
    "Now consider the research mode. Ask yourself:\n" +
    "- How does this mode shape the WAY the student will achieve the title's core goal?\n" +
    "- What does the student DO in this mode (survey people / build something / analyse existing data)?\n" +
    "- The mode is the methodology — it constrains HOW, not WHAT.\n\n" +
    "STEP 3 — DRAFT THE AIM:\n" +
    "Write ONE aim: a single sentence that states the title's core goal from Step 1, what the whole study will achieve.\n" +
    "- Begin it \"The aim of this study is to\" followed by a strong verb. For a design, build or engineering project you may write \"The aim of this project is to [verb] a [system/device] that [outcome] for [application].\"\n" +
    `- One sentence only, ending with a full stop, at most ${MAX_AIM_CHARS} characters.\n` +
    "- The aim is the destination; the objectives are the steps that reach it. Do not list the steps inside the aim.\n\n" +
    "STEP 4 — DRAFT THE OBJECTIVES:\n" +
    "Write 4–5 research objectives that:\n" +
    "1. Serve the core goal identified in Step 1 — objectives must feel specific to THIS title, not generic to the mode\n" +
    "2. Are shaped by the methodology of the mode from Step 2\n" +
    "3. Follow a logical progression (e.g. examine → analyse → develop → evaluate, or survey → analyse → propose)\n" +
    "4. Each begins with \"To\" followed by a strong action verb (examine, analyse, assess, develop, propose, evaluate, determine, compare)\n" +
    "5. Are measurable and defensible to a Nigerian university examiner\n" +
    "6. Together, they cover the full scope of the title — nothing promised in the title is left unaddressed by any objective\n" +
    "7. The final objective should deliver the project's core output (the thing the title promises — a framework, a system, a model, a recommendation, etc.), which is the aim\n" +
    "8. Together, the objectives achieve the aim: none of them goes beyond it, and nothing in the aim is left without an objective\n\n" +
    "CRITICAL RULES:\n" +
    "- Never write objectives that could belong to any project in this mode — they must be specific to this title\n" +
    "- If the title says \"develop\", \"design\", \"propose\", or \"build\" something, the final objective MUST deliver that thing\n" +
    "- If the title mentions both prevention AND mitigation, both must appear explicitly in the objectives\n" +
    "- Do not write more than one purely descriptive/trend objective — description serves the literature review, not the objectives\n" +
    "- Avoid overlap: each objective must add something the others do not\n" +
    `- Each objective is one sentence, at most ${MAX_OBJECTIVE_CHARS} characters, with no full stop at the end\n\n` +
    "OUTPUT FORMAT:\n" +
    `Call the record_objectives tool. Put the aim sentence in aim. Put each objective as one element in the objectives array (${MIN_OBJECTIVES}–${MAX_OBJECTIVES} elements). Each element is one sentence starting with \"To\". Do not include a numbering prefix in the strings — the tool numbers them. No preamble, no explanation.`,
  tool: `Record the one-sentence aim and the ${MIN_OBJECTIVES}–${MAX_OBJECTIVES} numbered objectives you drafted for this project.`,
  /** The aim-only call: objectives already fixed (the client's own, or approved before the aim was asked for). */
  aimSystem:
    "You are a Nigerian university FYP examiner and academic writing expert. A final year project's research objectives are already fixed. Your job is to write the ONE aim that these objectives serve.\n\n" +
    "Rules:\n" +
    "- One sentence stating what the whole study will achieve, drawn from the project title and consistent with every objective. The final objective usually delivers it.\n" +
    "- Begin it \"The aim of this study is to\" followed by a strong verb. For a design, build or engineering project you may write \"The aim of this project is to [verb] a [system/device] that [outcome] for [application].\"\n" +
    `- One sentence only, ending with a full stop, at most ${MAX_AIM_CHARS} characters. Do not list the objectives inside it.\n` +
    "- Do not change, add to or comment on the objectives.\n\n" +
    "Call the record_aim tool with the sentence. No preamble, no explanation.",
  aimTool: "Record the one-sentence aim these objectives serve.",
} as const;

const MODE_NAME: Record<ResearchModeNumber, string> = {
  1: "Mode 1 (Thematic)",
  2: "Mode 2 (Survey)",
  3: "Mode 3 (Implementation/Build)",
  4: "Mode 4 (Laboratory)",
  5: "Mode 5 (Secondary Data)",
};

export function objectivesUserPrompt(ctx: ObjectivesContext): string {
  return [
    `PROJECT TITLE: ${ctx.title.replace(/\s+/g, " ").trim()}`,
    `RESEARCH MODE: ${MODE_NAME[ctx.modeNumber]}`,
    `DEPARTMENT: ${ctx.department}`,
    `DEGREE: ${ctx.degree}`,
  ].join("\n");
}

/** The aim-only call's user message: the project and its fixed objectives, numbered. */
export function aimUserPrompt(ctx: ObjectivesContext, objectives: string[]): string {
  return [objectivesUserPrompt(ctx), "", "OBJECTIVES:", ...objectives.map((o, i) => `${i + 1}. ${o}`)].join("\n");
}

const SCHEMA = {
  type: "object",
  properties: {
    aim: { type: "string", description: "One sentence beginning \"The aim of this study is to\" (or \"project\")." },
    objectives: {
      type: "array",
      minItems: MIN_OBJECTIVES,
      maxItems: MAX_OBJECTIVES,
      items: { type: "string", description: "One objective beginning with \"To \"." },
    },
  },
  required: ["aim", "objectives"],
} as const;

const AIM_SCHEMA = {
  type: "object",
  properties: { aim: { type: "string", description: "One sentence beginning \"The aim of this study is to\" (or \"project\")." } },
  required: ["aim"],
} as const;

export class ObjectivesDraftError extends Error {}

/** Opus 5.5 at medium effort: room for its thinking before the tool call, and a cap inside the 300 s a function may run. */
const OPUS_CALL = { model: SUPERVISOR_FACING_MODEL, effort: "medium", maxTokens: 16_000, timeoutMs: 140_000 } as const;

/**
 * Drafts the aim and the objectives; one retry when the reply breaks the
 * rules. The fromClient path is handled by extractClientStatedObjectives in
 * the caller, so this always returns fromClient=false.
 */
export async function draftObjectives(ctx: ObjectivesContext, usage: AiUsageContext): Promise<{ aim: string; objectives: string[]; fromClient: boolean }> {
  let user = objectivesUserPrompt(ctx);
  let last: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const reply = await callClaudeForJson<{ aim?: unknown; objectives?: unknown }>({
      system: OBJECTIVES_TEXT.system,
      user,
      toolName: "record_objectives",
      toolDescription: OBJECTIVES_TEXT.tool,
      inputSchema: SCHEMA as unknown as Record<string, unknown>,
      ...OPUS_CALL,
      usage: { ...usage, step: attempt === 1 ? usage.step : `${usage.step}_retry` },
    });
    const check = validateObjectives(listFrom(reply.objectives, "objectives"));
    const aim = validateAim(reply.aim);
    if (check.ok && aim.ok) return { aim: aim.aim, objectives: check.objectives, fromClient: false };
    last = [...(check.ok ? [] : check.problems), ...(aim.ok ? [] : aim.problems)];
    user = `${objectivesUserPrompt(ctx)}\n\nYour previous reply broke these rules: ${last.join(" ")} Write the aim and the list again.`;
  }
  throw new ObjectivesDraftError(`The drafted aim and objectives broke the rules twice: ${last.join(" ")}`);
}

/**
 * Writes the one aim a fixed list of objectives serves (the client's own
 * objectives, a brief drafted before aims were asked for, or a report approved
 * without one). One short call; one retry when the reply breaks the rules.
 */
export async function draftAim(ctx: ObjectivesContext, objectives: string[], usage: AiUsageContext): Promise<string> {
  let user = aimUserPrompt(ctx, objectives);
  let last: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const reply = await callClaudeForJson<{ aim?: unknown }>({
      system: OBJECTIVES_TEXT.aimSystem,
      user,
      toolName: "record_aim",
      toolDescription: OBJECTIVES_TEXT.aimTool,
      inputSchema: AIM_SCHEMA as unknown as Record<string, unknown>,
      ...OPUS_CALL,
      usage: { ...usage, step: attempt === 1 ? usage.step : `${usage.step}_retry` },
    });
    const aim = validateAim(reply.aim);
    if (aim.ok) return aim.aim;
    last = aim.problems;
    user = `${aimUserPrompt(ctx, objectives)}\n\nYour previous aim broke these rules: ${aim.problems.join(" ")} Write it again.`;
  }
  throw new ObjectivesDraftError(`The drafted aim broke the rules twice: ${last.join(" ")}`);
}

// ─── Client-stated objectives fallback ─────────────────────────────────────
//
// If the client's own brief or the supervisor's outline already lists
// objectives (a run of MIN..MAX "To …" lines, plain or bulleted), use those
// word for word instead of asking Claude. Pure so check:sources can cover it.

const OBJECTIVE_LINE = /^\s*(?:\(?\d{1,2}[.)]|[-*•●]|[ivx]{1,4}[.)]|\([ivx]{1,4}\))\s*(?:To\s+.+)$|^\s*(?:To\s+.+)$/i;

/** Extracts an ordered run of "To …" objective lines from a free-text field. */
function findObjectiveRun(text: string | null | undefined): string[] {
  if (!text) return [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const runs: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (OBJECTIVE_LINE.test(line)) {
      current.push(line);
    } else if (current.length) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length) runs.push(current);
  // Pick the longest run that also fits the size window; ties → the first.
  let best: string[] = [];
  for (const run of runs) {
    if (run.length >= MIN_OBJECTIVES && run.length <= MAX_OBJECTIVES && run.length > best.length) best = run;
  }
  return best;
}

/**
 * When the client's own brief or the supervisor's outline already states the
 * objectives, use those word for word. Returns the list if it passes
 * validateObjectives, else null.
 */
export function extractClientStatedObjectives(inputs: {
  specialInstructions: string | null | undefined;
  departmentOutline: string | null | undefined;
}): string[] | null {
  for (const source of [inputs.specialInstructions, inputs.departmentOutline]) {
    const run = findObjectiveRun(source);
    if (!run.length) continue;
    const check = validateObjectives(run);
    if (check.ok) return check.objectives;
  }
  return null;
}

/** An "Aim: …" / "Aim of the study: …" line, or a sentence already opening "The aim of this study is to". */
const AIM_LINE = /^\s*(?:(?:\d{1,2}[.)]\s*)?(?:aim|aim of the (?:study|project|research))\s*[:\-–]\s*(.+)|(The aim of this (?:study|project|research) is to .+))$/i;

/**
 * When the client's brief or the supervisor's outline states the aim ("Aim: to
 * develop …" or a full "The aim of this study is to …" sentence), use it word
 * for word once it passes validateAim; a bare "Aim: to develop …" becomes
 * "The aim of this study is to develop …". Null otherwise.
 */
export function extractClientStatedAim(inputs: {
  specialInstructions: string | null | undefined;
  departmentOutline: string | null | undefined;
}): string | null {
  for (const source of [inputs.specialInstructions, inputs.departmentOutline]) {
    for (const line of (source ?? "").split(/\r?\n/)) {
      const m = AIM_LINE.exec(line.trim());
      if (!m) continue;
      let text = (m[2] ?? m[1] ?? "").trim();
      if (!/^The aim of this/i.test(text)) {
        const rest = text.replace(/^to\s+/i, "");
        text = `The aim of this study is to ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
      }
      const check = validateAim(text);
      if (check.ok) return check.aim;
    }
  }
  return null;
}
