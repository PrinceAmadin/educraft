/**
 * Thin wrapper over the Anthropic Messages API for EduCraft's own backend
 * calls (research paper discovery, Tier 2 relevance verification) — separate
 * from any Claude Code session. Raw fetch, no SDK, same style as the other
 * external clients in this codebase.
 *
 * Structured output is forced via tool-use rather than asking for JSON in
 * prose and parsing it — the model can't "almost" return valid JSON when the
 * schema is enforced as a tool call.
 *
 * Long writing (report chapters) uses streamClaude: a streamed call with
 * prompt caching, retries before any text arrives, and a deadline so it never
 * outlives the function running it. Both calls log every attempt to the AI
 * usage log.
 */

import { logAiUsage, type AiUsageContext } from "@/lib/ai-usage-log";
import {
  AnthropicStreamAccumulator,
  StreamErrorEvent,
  ZERO_USAGE,
  addUsage,
  isRetryableErrorType,
  isRetryableStatus,
  retryDelayMs,
  type ClaudeUsage,
  type StreamedToolCall,
} from "@/lib/anthropic-stream";

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
      cacheWriteTokens: json?.usage?.cache_creation_input_tokens ?? 0,
      cacheReadTokens: json?.usage?.cache_read_input_tokens ?? 0,
      webSearchRequests: json?.usage?.server_tool_use?.web_search_requests ?? 0,
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

// ─── Streamed calls ──────────────────────────────────────────────────────────

/** A prompt-cache breakpoint: everything up to and including the marked block is cached for 5 minutes. */
export type CacheControl = { type: "ephemeral" };
export interface ClaudeTextBlock {
  type: "text";
  text: string;
  cache_control?: CacheControl;
}
export interface ClaudeToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ClaudeStreamInput {
  /** Stable instructions first: this is the cached prefix. */
  system: ClaudeTextBlock[];
  /** The one user turn, as blocks so breakpoints can sit on them. */
  user: ClaudeTextBlock[];
  /** Keep the same tools on every call that shares a cached prefix: tools render before the system prompt. */
  tools?: ClaudeToolDefinition[];
  /** Changing tool_choice keeps the tools and system cache (the messages cache is rebuilt). */
  toolChoice?: { type: "auto" } | { type: "none" };
  maxTokens: number;
  /** Omitted = the API default (high). Thinking is left at Sonnet 5's default, adaptive. */
  effort?: ClaudeEffort;
  /** Every text delta, as it arrives. Keep it quick; do slow work (DB writes) outside it. */
  onText?: (delta: string) => void;
  /** Epoch ms. The call, retries included, is abandoned after this (the function running it has a hard limit). */
  deadline?: number;
  /** Tries in all, counted only while no text has arrived (default 4). A failure after text is thrown to the caller. */
  attempts?: number;
  /** Abandon an attempt when no bytes arrive for this long (default 120 s; the API sends pings while it thinks). */
  idleTimeoutMs?: number;
  usage?: AiUsageContext;
}

export interface ClaudeStreamResult {
  text: string;
  toolCalls: StreamedToolCall[];
  /** end_turn, max_tokens (cut off), tool_use, refusal… */
  stopReason: string | null;
  model: string;
  /** Summed over every attempt, failed ones included. */
  usage: ClaudeUsage;
  attempts: number;
}

export interface ClaudeStreamErrorInfo {
  retryable: boolean;
  status?: number;
  /** API error type, e.g. overloaded_error. */
  type?: string;
  /** Text that had streamed before the failure (never retried inside streamClaude). */
  partialText: string;
  /** Summed over every attempt so far. */
  usage: ClaudeUsage;
  /** The deadline passed: not the model's fault, the run just needs a fresh invocation. */
  deadline?: boolean;
  retryAfter?: string | null;
}

export class ClaudeStreamError extends AnthropicError {
  constructor(
    message: string,
    readonly info: ClaudeStreamErrorInfo,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One streamed Messages API call, retried with backoff (honouring
 * retry-after) on rate limits, overload, server errors and dropped
 * connections, as long as no text has arrived. Returns the text, any tool
 * calls, the stop reason and the usage; the caller decides what a
 * `max_tokens` or `refusal` stop means for it.
 */
export async function streamClaude(input: ClaudeStreamInput): Promise<ClaudeStreamResult> {
  const maxAttempts = Math.max(1, input.attempts ?? 4);
  let total: ClaudeUsage = { ...ZERO_USAGE };
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await streamOnce(input);
      total = addUsage(total, result.usage);
      return { ...result, usage: total, attempts: attempt };
    } catch (error) {
      const failure =
        error instanceof ClaudeStreamError
          ? error
          : new ClaudeStreamError(error instanceof Error ? error.message : String(error), { retryable: false, partialText: "", usage: { ...ZERO_USAGE } });
      total = addUsage(total, failure.info.usage);
      failure.info.usage = total;
      const again = failure.info.retryable && !failure.info.deadline && !failure.info.partialText && attempt < maxAttempts;
      if (!again) throw failure;
      const wait = retryDelayMs(attempt, failure.info.retryAfter ?? null);
      // Not enough time left for the wait plus a useful attempt: let the caller reschedule instead.
      if (input.deadline && Date.now() + wait + 30_000 > input.deadline) throw failure;
      console.warn(`[claude stream] attempt ${attempt} failed (${failure.message}); retrying in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    }
  }
}

async function streamOnce(input: ClaudeStreamInput): Promise<Omit<ClaudeStreamResult, "attempts">> {
  const startedAt = Date.now();
  const controller = new AbortController();
  let abortedFor: "deadline" | "idle" | null = null;
  const idleMs = input.idleTimeoutMs ?? 120_000;
  const deadlineTimer = input.deadline
    ? setTimeout(() => {
        abortedFor = "deadline";
        controller.abort();
      }, Math.max(0, input.deadline - Date.now()))
    : null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const touch = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      abortedFor = "idle";
      controller.abort();
    }, idleMs);
  };

  const acc = new AnthropicStreamAccumulator(input.onText);
  let ok = false;
  try {
    touch();
    const res = await fetch(ANTHROPIC_BASE_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey(),
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: input.maxTokens,
        stream: true,
        system: input.system,
        messages: [{ role: "user", content: input.user }],
        ...(input.tools?.length ? { tools: input.tools, tool_choice: input.toolChoice ?? { type: "auto" } } : {}),
        ...(input.effort ? { output_config: { effort: input.effort } } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new ClaudeStreamError(json?.error?.message || `Claude API error (${res.status})`, {
        retryable: isRetryableStatus(res.status),
        status: res.status,
        type: json?.error?.type,
        retryAfter: res.headers.get("retry-after"),
        partialText: "",
        usage: { ...ZERO_USAGE },
      });
    }
    if (!res.body) throw new ClaudeStreamError("Claude returned no stream", { retryable: true, partialText: "", usage: { ...ZERO_USAGE } });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      touch();
      acc.push(decoder.decode(value, { stream: true }));
    }
    acc.push(decoder.decode());
    acc.flush();
    if (!acc.finished) {
      throw new ClaudeStreamError("The Claude stream ended before the message was complete", { retryable: true, partialText: acc.text, usage: acc.usage });
    }
    ok = true;
    return { text: acc.text, toolCalls: acc.toolCalls, stopReason: acc.stopReason, model: acc.model ?? MODEL, usage: acc.usage };
  } catch (error) {
    // Cut off before the final usage arrived: log an estimate for the text that did stream, not about 0.
    if (acc.estimateUnfinishedUsage() && acc.text) {
      console.warn(`[claude stream] usage estimated for an unfinished stream: ~${acc.usage.outputTokens} output tokens (${acc.text.length} characters)`);
    }
    if (error instanceof ClaudeStreamError) {
      error.info.usage = acc.usage;
      throw error;
    }
    if (error instanceof StreamErrorEvent) {
      throw new ClaudeStreamError(`Claude stream error: ${error.message}`, {
        retryable: isRetryableErrorType(error.type),
        type: error.type,
        partialText: acc.text,
        usage: acc.usage,
      });
    }
    if (abortedFor === "deadline") {
      throw new ClaudeStreamError("Out of time in this run; the step will continue in a fresh one", {
        retryable: true,
        deadline: true,
        partialText: acc.text,
        usage: acc.usage,
      });
    }
    if (abortedFor === "idle") {
      throw new ClaudeStreamError(`No data from Claude for ${Math.round(idleMs / 1000)}s`, { retryable: true, partialText: acc.text, usage: acc.usage });
    }
    // fetch or the body reader failed: a dropped connection.
    throw new ClaudeStreamError(`Connection to Claude failed: ${error instanceof Error ? error.message : String(error)}`, {
      retryable: true,
      partialText: acc.text,
      usage: acc.usage,
    });
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (idleTimer) clearTimeout(idleTimer);
    if (input.usage) {
      await logAiUsage({
        ...input.usage,
        model: acc.model ?? MODEL,
        inputTokens: acc.usage.inputTokens,
        outputTokens: acc.usage.outputTokens,
        cacheWriteTokens: acc.usage.cacheWriteTokens,
        cacheReadTokens: acc.usage.cacheReadTokens,
        webSearchRequests: acc.usage.webSearchRequests,
        durationMs: Date.now() - startedAt,
        status: ok ? "success" : "error",
      });
    }
  }
}
