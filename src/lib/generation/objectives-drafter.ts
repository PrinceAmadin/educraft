/**
 * Drafts a report's 3–5 objectives (D3b) for every report project. The COO
 * reviews and edits them on the mode card; once approved, Chapter 1 states
 * them word for word and every later chapter follows them (generate-chapter.ts
 * refuses any others).
 *
 * One Claude call (tool `record_objectives`). Inputs: the topic, the
 * department, the recommended or approved mode, the client's own instructions
 * and department outline, and the titles of the strongest references research
 * kept (titles only, to keep the call cheap). Every sentence sent is in
 * OBJECTIVES_TEXT for the founder to review.
 */

import { callClaudeForJson } from "@/lib/anthropic";
import { listFrom } from "@/lib/research/source-policy";
import type { AiUsageContext } from "@/lib/ai-usage-log";
import { MAX_OBJECTIVE_CHARS, MAX_OBJECTIVES, MIN_OBJECTIVES, validateObjectives } from "@/lib/generation/objectives-rules";

export { MAX_OBJECTIVE_CHARS, MAX_OBJECTIVES, MIN_OBJECTIVES, validateObjectives };
export type { ObjectivesCheck } from "@/lib/generation/objectives-rules";

export interface ObjectivesContext {
  topic: string;
  department: string;
  /** e.g. "Mode 2 (survey)"; null when no mode has been chosen yet. */
  modeLabel: string | null;
  /** What each mode's objectives must be answerable by. */
  modeHint: string | null;
  specialInstructions: string | null;
  departmentOutline: string | null;
  referenceTitles: string[];
}

export const OBJECTIVES_TEXT = {
  system:
    "You draft the objectives of a Nigerian university student's final year project. " +
    `Write ${MIN_OBJECTIVES} to ${MAX_OBJECTIVES} specific objectives for the project described. ` +
    "Rules: each objective is one sentence that begins with \"To \" followed by a verb (for example \"To examine\", \"To determine\", \"To assess\", \"To compare\"), states one aim only, and names what is studied and, where it applies, where and among whom. " +
    `Each is at most ${MAX_OBJECTIVE_CHARS} characters, with no numbering and no full stop at the end. ` +
    "Together they cover the topic as stated, in the order the study would address them, without going beyond it. " +
    "Each objective must be achievable with the project's research method, as described below. " +
    "If the client's instructions or the department outline already state the project's objectives, use those word for word (at most five, in their order) and set fromClient to true; otherwise set fromClient to false.",
  tool: "Record the project's objectives.",
  modeHints: {
    1: "Mode 1 (thematic): library-based analysis of documents, cases, texts or records; objectives examine, analyse or evaluate, and are answered by argument, not by fieldwork.",
    2: "Mode 2 (survey): a questionnaire or interviews with respondents; each objective must be answerable from their responses.",
    3: "Mode 3 (build): designing and implementing a system, device or model; objectives design, develop, implement and evaluate it.",
    4: "Mode 4 (lab): laboratory or field experiments; each objective must be answerable from measurements.",
    5: "Mode 5 (secondary data): published statistics or financial data analysed with statistical or econometric methods; each objective must be answerable from that data.",
  } as Record<number, string>,
} as const;

function clip(s: string | null | undefined, max: number): string | null {
  const t = s?.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

export function objectivesUserPrompt(ctx: ObjectivesContext): string {
  const lines = [`Project topic: ${ctx.topic}`, `Department: ${ctx.department}`];
  lines.push(`Research method: ${ctx.modeHint ?? "not chosen yet; write objectives that suit the topic as stated."}`);
  const instructions = clip(ctx.specialInstructions, 2000);
  if (instructions) lines.push(`Client's instructions: ${instructions}`);
  const outline = clip(ctx.departmentOutline, 3000);
  if (outline) lines.push(`Department outline: ${outline}`);
  if (ctx.referenceTitles.length) {
    lines.push("Titles of the most relevant published works found for this topic (for context only):");
    ctx.referenceTitles.slice(0, 10).forEach((t) => lines.push(`- ${clip(t, 250)}`));
  }
  return lines.join("\n");
}

const SCHEMA = {
  type: "object",
  properties: {
    objectives: {
      type: "array",
      minItems: MIN_OBJECTIVES,
      maxItems: MAX_OBJECTIVES,
      items: { type: "string", description: "One objective beginning with \"To \"." },
    },
    fromClient: { type: "boolean", description: "True when the objectives were taken word for word from the client's instructions or outline." },
  },
  required: ["objectives", "fromClient"],
} as const;

export class ObjectivesDraftError extends Error {}

/** Drafts the objectives; one retry when the reply breaks the rules. */
export async function draftObjectives(ctx: ObjectivesContext, usage: AiUsageContext): Promise<{ objectives: string[]; fromClient: boolean }> {
  let user = objectivesUserPrompt(ctx);
  let last: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const reply = await callClaudeForJson<{ objectives?: unknown; fromClient?: unknown }>({
      system: OBJECTIVES_TEXT.system,
      user,
      toolName: "record_objectives",
      toolDescription: OBJECTIVES_TEXT.tool,
      inputSchema: SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 1500,
      usage: { ...usage, step: attempt === 1 ? usage.step : `${usage.step}_retry` },
    });
    const check = validateObjectives(listFrom(reply.objectives, "objectives"));
    if (check.ok) return { objectives: check.objectives, fromClient: reply.fromClient === true };
    last = check.problems;
    user = `${objectivesUserPrompt(ctx)}\n\nYour previous list broke these rules: ${check.problems.join(" ")} Write the list again.`;
  }
  throw new ObjectivesDraftError(`The drafted objectives broke the rules twice: ${last.join(" ")}`);
}
