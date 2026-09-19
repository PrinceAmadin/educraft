/**
 * Thin wrapper over the Anthropic Messages API for EduCraft's own backend
 * calls (research paper discovery, Tier 2 relevance verification) — separate
 * from any Claude Code session. Raw fetch, no SDK, same style as the other
 * external clients in this codebase.
 *
 * Structured output is forced via tool-use rather than asking for JSON in
 * prose and parsing it — the model can't "almost" return valid JSON when the
 * schema is enforced as a tool call.
 */

import { logAiUsage, type AiUsageContext } from "@/lib/ai-usage-log";

const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";

function apiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  return key;
}

export class AnthropicError extends Error {}

export interface ClaudeToolCallInput<T> {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  maxTokens?: number;
  /** Where this call belongs, so its tokens and cost land in the AI usage log. */
  usage?: AiUsageContext;
}

export async function callClaudeForJson<T>({
  system,
  user,
  toolName,
  toolDescription,
  inputSchema,
  maxTokens = 4096,
  usage,
}: ClaudeToolCallInput<T>): Promise<T> {
  const startedAt = Date.now();
  const res = await fetch(ANTHROPIC_BASE_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey(),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
      tools: [{ name: toolName, description: toolDescription, input_schema: inputSchema }],
      tool_choice: { type: "tool", name: toolName },
    }),
  });

  const json = await res.json().catch(() => null);
  if (usage) {
    await logAiUsage({
      ...usage,
      model: json?.model ?? MODEL,
      inputTokens: json?.usage?.input_tokens ?? 0,
      outputTokens: json?.usage?.output_tokens ?? 0,
      durationMs: Date.now() - startedAt,
      status: res.ok ? "success" : "error",
    });
  }
  if (!res.ok) {
    throw new AnthropicError(json?.error?.message || `Claude API error (${res.status})`);
  }

  const block = (json?.content ?? []).find((c: any) => c.type === "tool_use" && c.name === toolName);
  if (!block) throw new AnthropicError("Claude did not return the expected structured response");

  return block.input as T;
}
