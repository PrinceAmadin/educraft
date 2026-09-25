import { revalidateTag, unstable_cache } from "next/cache";

/**
 * Server-side TTL cache for the Command Center aggregations (Phase 5), the
 * same `unstable_cache` idiom as the ambassador click leaderboard. Only the
 * pure database aggregation goes inside: never `auth()`, `headers()` or
 * anything request-bound, and the cached value must be JSON-serialisable
 * (ISO strings, numbers, null — no Date). Every route still answers with
 * `Cache-Control: no-store`; this cache is between the route and the
 * database, not between the browser and the route.
 *
 * Bump CC_CACHE_VERSION whenever a payload shape changes so a redeploy never
 * serves a stale shape to new client code.
 */
export const CC_CACHE_VERSION = "3";

export const CACHE = {
  health: { tag: "cc-health", seconds: 300 },
  growth: { tag: "cc-growth", seconds: 600 },
  finance: { tag: "cc-finance", seconds: 300 },
  settings: { tag: "cc-settings", seconds: 3600 },
} as const;

export type CacheEntry = (typeof CACHE)[keyof typeof CACHE];

/** Every Command Center tag, for a full flush. */
export const CC_CACHE_TAGS: readonly string[] = Object.values(CACHE).map((e) => e.tag);

/** JSON responses from these routes are never stored by the browser or CDN. */
export const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

/**
 * Run `fn` through the tag's cache. Anything `fn` closes over that changes
 * the result must be part of `keyParts`, because the key is what the cache
 * looks up by.
 */
export function cached<T>(entry: CacheEntry, keyParts: string[], fn: () => Promise<T>): Promise<T> {
  return unstable_cache(fn, ["command-center", entry.tag, ...keyParts, CC_CACHE_VERSION], {
    revalidate: entry.seconds,
    tags: [entry.tag],
  })();
}

/**
 * A tab payload from its cache, but never older than the tag's TTL.
 *
 * Next 14.2's `unstable_cache` is stale-while-revalidate: once the TTL has
 * passed it still returns the old entry (however old — Friday's figures on a
 * Monday morning) and only refreshes it in the background. The spec allows a
 * tab to be at most its TTL stale, so a hit whose `generatedAt` is older than
 * that is recomputed here; the background refresh `unstable_cache` has just
 * started stores a newer entry for the next request.
 */
export async function cachedPayload<T extends { generatedAt: string }>(
  entry: CacheEntry,
  fn: () => Promise<T>
): Promise<T> {
  const hit = await cached(entry, [], fn);
  const age = Date.now() - Date.parse(hit.generatedAt);
  return Number.isFinite(age) && age <= entry.seconds * 1000 ? hit : fn();
}

/**
 * Refresh (`?fresh=1`): compute now and invalidate the tag, so the next
 * ordinary load recomputes as well instead of serving the snapshot from
 * before this one — figures never go back in time after a Refresh.
 */
export async function freshPayload<T>(entry: CacheEntry, fn: () => Promise<T>): Promise<T> {
  revalidateTag(entry.tag);
  return fn();
}

/** Flush the given tags (default: all four). Called after a settings PATCH. */
export function revalidateCommandCenter(tags: readonly string[] = CC_CACHE_TAGS): void {
  for (const tag of tags) revalidateTag(tag);
}
