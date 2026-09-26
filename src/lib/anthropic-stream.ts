/**
 * Reads the Messages API's streamed response (server-sent events) into a
 * result. Pure: no network, no database, so `npm run check:generation` can feed
 * it recorded streams. The fetch, retries and logging live in anthropic.ts.
 *
 * The stream is: message_start (model, input and cache usage), then per
 * content block a content_block_start / content_block_delta… / content_block_stop,
 * then message_delta (stop_reason, final usage) and message_stop. `ping`
 * events keep the connection alive; an `error` event (e.g. overloaded_error)
 * can arrive at any point, even after text has streamed.
 */

export interface ClaudeUsage {
  /** Uncached input tokens. */
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  webSearchRequests: number;
}

export const ZERO_USAGE: ClaudeUsage = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, webSearchRequests: 0 };

export function addUsage(a: ClaudeUsage, b: ClaudeUsage): ClaudeUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    webSearchRequests: a.webSearchRequests + b.webSearchRequests,
  };
}

export interface StreamedToolCall {
  name: string;
  /** Parsed input; null when the streamed JSON could not be parsed (treat as an error). */
  input: unknown;
}

/** An `error` event inside a 200 stream: `type` is the API error type, e.g. "overloaded_error". */
export class StreamErrorEvent extends Error {
  constructor(
    readonly type: string,
    message: string,
  ) {
    super(message);
  }
}

type Block = { type: string; name?: string; json: string };

/**
 * Feed it decoded text chunks as they arrive (`push`), in any split; it calls
 * `onText` for every text delta and keeps the model, stop reason, usage, the
 * text and any tool calls. Throws StreamErrorEvent on an `error` event.
 */
export class AnthropicStreamAccumulator {
  model: string | null = null;
  stopReason: string | null = null;
  text = "";
  toolCalls: StreamedToolCall[] = [];
  usage: ClaudeUsage = { ...ZERO_USAGE };
  /** True once message_stop has arrived. */
  finished = false;
  /** True once message_delta has carried the final output count. */
  sawFinalUsage = false;

  private buffer = "";
  private blocks = new Map<number, Block>();

  constructor(private readonly onText?: (delta: string) => void) {}

  push(chunk: string): void {
    this.buffer += chunk.replace(/\r\n/g, "\n");
    let end: number;
    while ((end = this.buffer.indexOf("\n\n")) !== -1) {
      const raw = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      this.handleEvent(raw);
    }
  }

  /** Whatever is left once the body ends (a final event without its blank line). */
  flush(): void {
    if (this.buffer.trim()) this.handleEvent(this.buffer);
    this.buffer = "";
  }

  private handleEvent(raw: string): void {
    const data = raw
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) return; // a comment line or a bare "event:" line
    let evt: any;
    try {
      evt = JSON.parse(data);
    } catch {
      return; // not JSON: ignore rather than fail a long generation on one odd line
    }
    switch (evt?.type) {
      case "message_start": {
        const m = evt.message ?? {};
        this.model = typeof m.model === "string" ? m.model : this.model;
        this.readUsage(m.usage);
        break;
      }
      case "content_block_start": {
        const cb = evt.content_block ?? {};
        this.blocks.set(evt.index, { type: cb.type, name: cb.name, json: "" });
        if (cb.type === "text" && typeof cb.text === "string" && cb.text) this.appendText(cb.text);
        break;
      }
      case "content_block_delta": {
        const d = evt.delta ?? {};
        if (d.type === "text_delta" && typeof d.text === "string") this.appendText(d.text);
        else if (d.type === "input_json_delta" && typeof d.partial_json === "string") {
          const block = this.blocks.get(evt.index);
          if (block) block.json += d.partial_json;
        }
        // thinking_delta / signature_delta: the reasoning is not used (and is empty by default on Sonnet 5)
        break;
      }
      case "content_block_stop": {
        const block = this.blocks.get(evt.index);
        if (block?.type === "tool_use" && block.name) {
          let input: unknown = null;
          try {
            input = block.json ? JSON.parse(block.json) : {};
          } catch {
            input = null;
          }
          this.toolCalls.push({ name: block.name, input });
        }
        break;
      }
      case "message_delta": {
        if (evt.delta?.stop_reason) this.stopReason = evt.delta.stop_reason;
        if (evt.usage && typeof evt.usage.output_tokens === "number") this.sawFinalUsage = true;
        this.readUsage(evt.usage);
        break;
      }
      case "message_stop":
        this.finished = true;
        break;
      case "error": {
        const e = evt.error ?? {};
        throw new StreamErrorEvent(String(e.type ?? "api_error"), String(e.message ?? "Claude stream error"));
      }
      default:
        break; // ping and anything new
    }
  }

  /**
   * A stream cut off before message_delta only reports the output count from
   * message_start (a handful). The text that did stream was still generated
   * and billed, so estimate it rather than log about 0; thinking tokens before
   * the cut cannot be known. Returns true when it estimated.
   */
  estimateUnfinishedUsage(): boolean {
    if (this.sawFinalUsage) return false;
    this.usage.outputTokens = Math.max(this.usage.outputTokens, estimateOutputTokens(this.text));
    return true;
  }

  private appendText(delta: string) {
    this.text += delta;
    this.onText?.(delta);
  }

  /** message_start carries the input side; message_delta carries cumulative output (and may repeat the input side). */
  private readUsage(u: any) {
    if (!u || typeof u !== "object") return;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const input = num(u.input_tokens);
    const output = num(u.output_tokens);
    const write = num(u.cache_creation_input_tokens);
    const read = num(u.cache_read_input_tokens);
    const searches = num(u.server_tool_use?.web_search_requests);
    if (input !== null) this.usage.inputTokens = input;
    if (output !== null) this.usage.outputTokens = Math.max(this.usage.outputTokens, output);
    if (write !== null) this.usage.cacheWriteTokens = write;
    if (read !== null) this.usage.cacheReadTokens = read;
    if (searches !== null) this.usage.webSearchRequests = searches;
  }
}

/** Rough output tokens for streamed text (Sonnet 5 averages about 3 characters of English prose per token). */
export function estimateOutputTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/** Statuses worth another try: rate limit, overload and server-side errors. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status === 529 || status >= 500;
}

/** Stream `error` event types worth another try. */
export function isRetryableErrorType(type: string): boolean {
  return type === "overloaded_error" || type === "rate_limit_error" || type === "api_error" || type === "timeout_error";
}

/**
 * How long to wait before attempt `attempt` (1 = the first retry): the
 * server's retry-after when it gave one (seconds), else 2, 4, 8… seconds,
 * capped, with a little jitter so parallel jobs don't retry in step.
 */
export function retryDelayMs(attempt: number, retryAfterHeader: string | null, capMs = 30_000, jitter = Math.random()): number {
  const fromHeader = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(fromHeader) && fromHeader >= 0) return Math.min(capMs, Math.ceil(fromHeader * 1000));
  const base = Math.min(capMs, 2000 * 2 ** (attempt - 1));
  return Math.round(base * (0.85 + 0.3 * jitter));
}
