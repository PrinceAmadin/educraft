/**
 * The independent judge of a report's aim and objectives (founder, 30 Sept
 * 2026). Deliberately apart from the drafter (objectives-drafter.ts):
 *  - a different model: Claude Opus 5.5 judges, Sonnet 5 drafts;
 *  - a fresh call with its own examiner prompt (OBJECTIVES_CHECK_TEXT in
 *    objectives-check-rules.ts): it never sees the drafter's instructions,
 *    steps or reasoning, and is not told the objectives were drafted by AI;
 *  - only the title, department, degree, research method, aim and objectives.
 * One call (tool record_objectives_check), one retry when the reply breaks the
 * rules. About ₦50–100 a check.
 */

import { callClaudeForJson } from "@/lib/anthropic";
import type { AiUsageContext } from "@/lib/ai-usage-log";
import { OBJECTIVES_CHECK_TEXT, checkUserPrompt, validateCheckReply, type CheckRow, type CheckScores, type ObjectivesCheckInput } from "@/lib/generation/objectives-check-rules";

export const JUDGE_MODEL = "claude-opus-5-5";
export const JUDGE_STEP = "check_objectives";

const SCORE = { type: "integer", description: "0 to 100, using the bands in the instructions." } as const;
const ROW_PROPERTIES = {
  related: SCORE,
  strong: SCORE,
  achievable: SCORE,
  reason: { type: "string", description: "One sentence naming the specific strength or problem." },
  suggestion: { type: "string", description: "A rewritten version or a precise change when any score is below 75; otherwise an empty string." },
} as const;

/** Strict tool schema: every property required, nothing extra (strict: true needs both). */
const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["aim", "objectives", "overall"],
  properties: {
    aim: { type: "object", additionalProperties: false, required: ["related", "strong", "achievable", "reason", "suggestion"], properties: ROW_PROPERTIES },
    objectives: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["number", "related", "strong", "achievable", "reason", "suggestion"],
        properties: { number: { type: "integer", description: "The objective's number as given (1, 2, …)." }, ...ROW_PROPERTIES },
      },
    },
    overall: {
      type: "object",
      additionalProperties: false,
      required: ["related", "strong", "achievable", "summary"],
      properties: {
        related: SCORE,
        strong: SCORE,
        achievable: SCORE,
        summary: { type: "string", description: "One or two sentences for the supervisor." },
      },
    },
  },
} as const;

export class ObjectivesJudgeError extends Error {}

export interface JudgedObjectives {
  overall: CheckScores & { summary: string };
  rows: CheckRow[];
}

/** Scores the aim and objectives; one retry when the reply breaks the rules. Throws when both attempts do. */
export async function judgeObjectives(input: ObjectivesCheckInput, usage: AiUsageContext): Promise<JudgedObjectives> {
  let user = checkUserPrompt(input);
  let last: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const reply = await callClaudeForJson<unknown>({
      model: JUDGE_MODEL,
      effort: "medium",
      system: OBJECTIVES_CHECK_TEXT.system,
      user,
      toolName: "record_objectives_check",
      toolDescription: OBJECTIVES_CHECK_TEXT.tool,
      inputSchema: CHECK_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 16_000,
      timeoutMs: 100_000,
      usage: { ...usage, step: attempt === 1 ? usage.step : `${usage.step}_retry` },
    });
    const check = validateCheckReply(reply, input.objectives.length);
    if (check.ok) return { overall: check.overall, rows: check.rows };
    last = check.problems;
    user = `${checkUserPrompt(input)}\n\nYour previous reply broke these rules: ${check.problems.join(" ")} Score them again and call the tool once.`;
  }
  throw new ObjectivesJudgeError(`The check's reply broke the rules twice: ${last.join(" ")}`);
}
