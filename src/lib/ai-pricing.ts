/** Claude prices and the naira rate. Pure (no database), so the check scripts can test the maths. */

/**
 * One model's USD prices per million tokens.
 *
 * `cacheRead` is the multiple of the base input price a cache hit costs. It is
 * per model, not one shared constant: it is 0.1x on most models but 0.05x on
 * Opus 5.5 and Sonnet 5.5 (checked against Anthropic's pricing page, 3 Nov
 * 2026). Getting this wrong is invisible — the call succeeds and only the
 * logged cost is wrong — which is why Sonnet 5.5 was mispriced before.
 *
 * Haiku 5.5 is priced by PROMPT LENGTH: a request whose whole prompt (uncached
 * input + cache writes + cache reads) is over `longPromptFrom` tokens pays the
 * `long` rates, five times the short ones. Each request is priced on its own,
 * so keeping a Haiku prompt under the threshold is worth real money.
 */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  longPromptFrom?: number;
  long?: { input: number; output: number; cacheRead: number };
}

/**
 * Update when Anthropic's pricing changes or a new model is used — an unknown
 * model falls back to the Sonnet rate.
 */
export const PRICE_PER_MTOK: Record<string, ModelPrice> = {
  /**
   * Sonnet 5's launch price became its standard price: the rise to $3/$15
   * planned for 1 Sept 2026 was cancelled. Rows logged before then keep the
   * cost they were stored with.
   */
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.1 },
  /**
   * The same token price as Sonnet 5 with cache hits at half the rate (0.05x,
   * $0.10/MTok against $0.20), and a 512-token minimum cacheable prefix rather
   * than 1024. On a cache-heavy route it is strictly cheaper than Sonnet 5.
   */
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.05 },
  /** What a supervisor reads first: the aim, the objectives, the abstract and the independent check. */
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.05 },
  /**
   * 20x cheaper than Sonnet on both sides. Classification and extraction work
   * — reference relevance, citation support, abbreviation expansion — belongs
   * here, as long as the prompt stays under `longPromptFrom`.
   */
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.1,
    longPromptFrom: 100_000,
    long: { input: 0.5, output: 2.5, cacheRead: 0.1 },
  },
};
const FALLBACK_PRICE: ModelPrice = { input: 2, output: 10, cacheRead: 0.1 };

/** Anthropic's server-side web search: $10 per 1,000 searches, on top of the tokens. */
const WEB_SEARCH_USD = 10 / 1000;

/**
 * A cache write costs this multiple of the input price, by the lifetime it
 * buys. The 1-hour entry is worth its extra write only when the next read is
 * more than five minutes away — after a data pause, not between two parts of
 * one chapter.
 */
export const CACHE_WRITE_MULTIPLIER = { "5m": 1.25, "1h": 2 } as const;
export type CacheTtl = keyof typeof CACHE_WRITE_MULTIPLIER;

/** The Message Batches API is half price on every token, and stacks with prompt caching. */
export const BATCH_MULTIPLIER = 0.5;

/** The rates in force for one request, after Haiku's prompt-length tier is applied. */
export function priceFor(model: string, promptTokens = 0): { input: number; output: number; cacheRead: number } {
  const p = PRICE_PER_MTOK[model] ?? FALLBACK_PRICE;
  if (p.long && p.longPromptFrom && promptTokens > p.longPromptFrom) return p.long;
  return { input: p.input, output: p.output, cacheRead: p.cacheRead };
}

/**
 * ₦ per US$ — last-ditch synchronous fallback used when the DB is unreachable
 * (`resolveFxRate()` in `fx-rate.ts` calls this for its "env"/"default" layer).
 * Application code should call `getUsdToNairaRate()` from `fx-rate.ts` for the
 * effective rate (auto-fetched value + margin, or a manual override).
 */
export function usdToNairaRate(): number {
  const n = Number(process.env.USD_NGN_RATE);
  return Number.isFinite(n) && n > 0 ? n : 1500;
}

export interface CacheCost {
  writeTokens?: number;
  readTokens?: number;
  /** Which lifetime the write bought (2x instead of 1.25x). Default "5m". */
  writeTtl?: CacheTtl;
}

/** `inputTokens` is the uncached input; cached tokens are passed separately and priced by the cache multipliers. */
export function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  webSearches = 0,
  cache: CacheCost = {},
  opts: { batch?: boolean } = {},
): number {
  const writeTokens = cache.writeTokens ?? 0;
  const readTokens = cache.readTokens ?? 0;
  // Haiku's length tier counts every input token, cache reads and writes included.
  const p = priceFor(model, inputTokens + writeTokens + readTokens);
  const cachedInput = writeTokens * CACHE_WRITE_MULTIPLIER[cache.writeTtl ?? "5m"] + readTokens * p.cacheRead;
  const tokens = ((inputTokens + cachedInput) * p.input + outputTokens * p.output) / 1_000_000;
  // Batch halves the tokens; a web search is a server-tool charge and is not discounted.
  return tokens * (opts.batch ? BATCH_MULTIPLIER : 1) + webSearches * WEB_SEARCH_USD;
}
