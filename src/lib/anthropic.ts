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

// ─── Web search ──────────────────────────────────────────────────────────────

/**
 * Anthropic's web search, run on Anthropic's servers. The basic version: each
 * search is made by Claude directly and its results come back as they are
 * (the newer versions search from inside a code sandbox, which complicates
 * pairing them with our own record tool). $10 per 1,000 searches plus the
 * tokens of the results.
 */
export const WEB_SEARCH_TOOL = "web_search_20250305";

export interface WebSearchOptions {
  /** The most searches Claude may make in this call. */
  maxUses: number;
  /** Never search these domains (subdomains included). Mutually exclusive with allowedDomains. */
  blockedDomains?: string[];
  allowedDomains?: string[];
  /** Two-letter country code to localise results, e.g. "NG". */
  country?: string;
}

export interface ClaudeWebSearchInput extends ClaudeToolCallInput<unknown> {
  webSearch: WebSearchOptions;
  /** Stop waiting after this long, all continuations together. Default 100 s. */
  timeoutMs?: number;
}

export interface WebSearchResultRef {
  url: string;
  title: string;
  pageAge: string | null;
}

export interface ClaudeWebSearchResult<T> {
  /** What Claude put in the record tool, or null when it finished without calling it. */
  record: T | null;
  /** Searches billed, from the API's own count. */
  searchesUsed: number;
  /** True when the call was cut off, so searchesUsed may be short of what was billed. */
  incomplete: boolean;
  queries: string[];
  /** Every result page the searches returned (a recorded source must be one of these). */
  results: WebSearchResultRef[];
  searchErrors: string[];
  stopReason: string | null;
  calls: number;
}

const MAX_WEB_SEARCH_CALLS = 4; // the first call + up to 3 continuations

/**
 * A web-search turn that failed. `searchesUsed` is what the API reported as
 * billed before the failure; `uncertain` means the call was cut off (timeout,
 * dropped connection), so more searches may have run and been billed.
 */
export class WebSearchCallError extends AnthropicError {
  constructor(
    message: string,
    readonly searchesUsed: number,
    readonly uncertain: boolean,
  ) {
    super(message);
  }
}

/**
 * One turn in which Claude may search the web, then must record what it found
 * with our tool. Handles `pause_turn` (the server-side loop paused: send the
 * turn back unchanged) and a record made before a search had finished (tell
 * Claude to wait and record again). Every call is logged with its search count.
 */
export async function callClaudeWithWebSearch<T>({
  system,
  user,
  toolName,
  toolDescription,
  inputSchema,
  maxTokens = 6000,
  usage,
  webSearch,
  timeoutMs = 100_000,
}: ClaudeWebSearchInput): Promise<ClaudeWebSearchResult<T>> {
  const deadline = Date.now() + timeoutMs;
  const searchTool: Record<string, unknown> = { type: WEB_SEARCH_TOOL, name: "web_search", max_uses: webSearch.maxUses };
  if (webSearch.allowedDomains?.length) searchTool.allowed_domains = webSearch.allowedDomains;
  else if (webSearch.blockedDomains?.length) searchTool.blocked_domains = webSearch.blockedDomains;
  if (webSearch.country) searchTool.user_location = { type: "approximate", country: webSearch.country };
  const tools = [searchTool, { name: toolName, description: toolDescription, input_schema: inputSchema }];

  const messages: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: user }];
  const out: ClaudeWebSearchResult<T> = { record: null, searchesUsed: 0, incomplete: false, queries: [], results: [], searchErrors: [], stopReason: null, calls: 0 };
  const seen = new Set<string>();

  while (out.calls < MAX_WEB_SEARCH_CALLS) {
    const left = deadline - Date.now();
    if (left <= 1_000) {
      out.incomplete = true;
      break;
    }
    out.calls++;
    const startedAt = Date.now();
    let res: Response;
    try {
      res = await fetch(ANTHROPIC_BASE_URL, {
        method: "POST",
        headers: { "x-api-key": apiKey(), "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages, tools, tool_choice: { type: "auto" } }),
        signal: AbortSignal.timeout(left),
      });
    } catch (error) {
      // Timed out or the connection dropped: searches may have run and been billed.
      out.incomplete = true;
      if (usage) {
        await logAiUsage({ ...usage, model: MODEL, inputTokens: 0, outputTokens: 0, durationMs: Date.now() - startedAt, status: "error" });
      }
      throw new WebSearchCallError(`The web search call did not finish: ${error instanceof Error ? error.message : String(error)}`, out.searchesUsed, true);
    }

    const json = await res.json().catch(() => null);
    const searches = json?.usage?.server_tool_use?.web_search_requests ?? 0;
    out.searchesUsed += searches;
    if (usage) {
      await logAiUsage({
        ...usage,
        model: json?.model ?? MODEL,
        inputTokens: json?.usage?.input_tokens ?? 0,
        outputTokens: json?.usage?.output_tokens ?? 0,
        cacheWriteTokens: json?.usage?.cache_creation_input_tokens ?? 0,
        cacheReadTokens: json?.usage?.cache_read_input_tokens ?? 0,
        webSearchRequests: searches,
        durationMs: Date.now() - startedAt,
        status: res.ok ? "success" : "error",
      });
    }
    if (!res.ok) throw new WebSearchCallError(json?.error?.message || `Claude API error (${res.status})`, out.searchesUsed, false);

    const content: any[] = Array.isArray(json?.content) ? json.content : [];
    const answered = new Set<string>();
    const asked: string[] = [];
    let recordBlock: any = null;
    for (const block of content) {
      if (block?.type === "server_tool_use" && block.name === "web_search") {
        asked.push(block.id);
        if (typeof block.input?.query === "string") out.queries.push(block.input.query);
      } else if (block?.type === "web_search_tool_result") {
        answered.add(block.tool_use_id);
        if (Array.isArray(block.content)) {
          for (const r of block.content) {
            if (r?.type !== "web_search_result" || typeof r.url !== "string" || seen.has(r.url)) continue;
            seen.add(r.url);
            out.results.push({ url: r.url, title: String(r.title ?? ""), pageAge: r.page_age ?? null });
          }
        } else if (block.content?.error_code) {
          out.searchErrors.push(String(block.content.error_code));
        }
      } else if (block?.type === "tool_use" && block.name === toolName) {
        recordBlock = block;
      }
    }
    out.stopReason = json?.stop_reason ?? null;
    const pendingSearch = asked.some((id) => !answered.has(id));

    if (out.stopReason === "pause_turn") {
      messages.push({ role: "assistant", content });
      continue;
    }
    if (out.stopReason === "tool_use" && recordBlock && pendingSearch) {
      // Recorded before its own search ran: the search runs when we answer the record call.
      messages.push({ role: "assistant", content });
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: recordBlock.id,
            is_error: true,
            content: `Not recorded: your search has not returned yet. Read its results, then call ${toolName} again with only what those results show.`,
          },
        ],
      });
      continue;
    }
    if (recordBlock) out.record = recordBlock.input as T;
    break;
  }
  if (out.calls >= MAX_WEB_SEARCH_CALLS && out.record === null && out.stopReason === "pause_turn") out.incomplete = true;
  return out;
}

// ─── Streamed calls ──────────────────────────────────────────────────────────

/** A prompt-cache breakpoint: everything up to and including the marked block is cached for 5 minutes. */
export type CacheControl = { type: "ephemeral" };
/** A PDF or an image sent as it is (Claude reads its tables and charts). */
export type ClaudeAttachmentBlock =
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string }; title?: string; cache_control?: CacheControl }
  | { type: "image"; source: { type: "base64"; media_type: "image/png" | "image/jpeg"; data: string }; cache_control?: CacheControl };

export type ClaudeContentBlock = ClaudeTextBlock | ClaudeAttachmentBlock;

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
  /** Text, plus D3c's data files (a PDF document or an image) where a chapter carries them. */
  user: ClaudeContentBlock[];
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
