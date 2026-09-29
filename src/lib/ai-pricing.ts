/** Claude prices and the naira rate. Pure (no database), so the check scripts can test the maths. */

/**
 * USD per million tokens. Update when Anthropic's pricing changes or a new
 * model is used — an unknown model falls back to the Sonnet rate.
 * Sonnet 5 is $2 in / $10 out: the launch price became the standard price and
 * the rise to $3/$15 planned for 1 Sept 2026 was cancelled (checked 26 Sept
 * 2026). Rows logged before then keep the cost they were stored with.
 */
export const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2, output: 10 },
};
const FALLBACK_PRICE = { input: 2, output: 10 };
/** Anthropic's server-side web search: $10 per 1,000 searches, on top of the tokens. */
const WEB_SEARCH_USD = 10 / 1000;
/** Prompt cache: a write (5-minute entry) costs 1.25x the input price, a read 0.1x. */
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

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

/** `inputTokens` is the uncached input; cached tokens are passed separately and priced by the cache multipliers. */
export function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  webSearches = 0,
  cache: { writeTokens?: number; readTokens?: number } = {},
): number {
  const p = PRICE_PER_MTOK[model] ?? FALLBACK_PRICE;
  const cachedInput = (cache.writeTokens ?? 0) * CACHE_WRITE_MULTIPLIER + (cache.readTokens ?? 0) * CACHE_READ_MULTIPLIER;
  return ((inputTokens + cachedInput) * p.input + outputTokens * p.output) / 1_000_000 + webSearches * WEB_SEARCH_USD;
}
