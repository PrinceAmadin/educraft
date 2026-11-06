import crypto from "crypto";
import type { db as DbClient } from "@/lib/db";
import { db } from "@/lib/db";
import { sqlTable, sqlType } from "@/lib/db-schema";
import { redisConfigured, withRedis } from "@/lib/ambassador-panel/redis";
import { readGeo } from "@/lib/click-tracking/geo-headers";
import {
  classifyReferrer,
  hashVisitor,
  isBotUserAgent,
  isHeadless,
  parseBrowser,
  parseDevice,
  parseOs,
} from "@/lib/click-tracking/parse";

/**
 * Turns one hit on a referral link into a ClickEvent row. Ported from
 * Traqly's lib/record-click.ts + lib/click-store.ts.
 *
 * Quality is decided INSIDE the INSERT (a subquery finds this visitor's most
 * recent real click on this link), so there is no read-then-write race: two
 * simultaneous clicks cannot both see "no previous click" and both count as
 * UNIQUE.
 *
 *   no earlier click            -> UNIQUE
 *   earlier click < 30 min ago  -> DUPLICATE
 *   earlier click >= 30 min ago -> RETURN
 *   bot / headless client       -> BOT (stored for the Quality tab, never counted)
 *
 * A CLICK IS NEVER SILENTLY LOST. The write runs inside `waitUntil`, after the
 * student has already been redirected, so there is time to be stubborn about
 * it: a failed INSERT (the shared Prisma pool can time out, P2024, when
 * dashboard pages hold every connection) is retried in-process, and if it
 * still fails the full click is queued in Redis — a different datastore, so a
 * Postgres hiccup cannot take both — and replayed by later clicks
 * (`drainClickRetryQueue`). The row id travels with the payload and the INSERT
 * is `ON CONFLICT (id) DO NOTHING`, so a replay can never double-count a click
 * whose first attempt actually landed.
 */

/** Clicks from the same visitor to the same link inside this window are DUPLICATE. */
export const CLICK_DEDUPE_WINDOW_SECONDS = 30 * 60;

/**
 * First-party cookie carrying the anonymous visitor id, set by the redirect.
 * It makes "same visitor" mean "same device": campuses share one Wi-Fi
 * address and Nigerian carriers put thousands of phones behind one IP (CGNAT),
 * so without it two different students on similar phones collapse into one
 * visitor (their clicks wrongly DUPLICATE), while one phone whose carrier
 * rotates its IP looks like a new visitor on every click (wrongly UNIQUE).
 * The value is a random id — never the IP, never anything about the person.
 */
export const VISITOR_COOKIE = "ecv";
export const VISITOR_COOKIE_MAX_AGE_SECONDS = 365 * 86_400;
const VISITOR_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** Redis list holding clicks whose INSERT failed, waiting to be replayed. */
const RETRY_QUEUE_KEY = "click-tracking:retry";
/** A queued click that will not insert after this many replay attempts is dropped (loudly). */
const MAX_REPLAY_ATTEMPTS = 8;
/** In-process attempts before a click goes to the Redis queue. */
const INSERT_ATTEMPTS = 3;
const INSERT_RETRY_DELAYS_MS = [1_500, 6_000];

export interface RecordClickInput {
  /** The link that was hit: "054", "ECCA-001", "ECSA-001-003". */
  slotCode: string;
  headers: Headers;
  /** Link opened with ?test=1: stored, flagged, excluded from every number. */
  isTestClick?: boolean;
  /**
   * The visitor id the redirect read from (or is about to set as) the `ecv`
   * cookie. When present it IS the visitor key; the IP+UA+language hash is
   * only the fallback for clients that keep no cookies.
   */
  visitorId?: string | null;
}

/** Everything one ClickEvent INSERT needs — serialisable, so it can wait in Redis. */
export interface ClickPayload {
  id: string;
  slotCode: string;
  /** Click time, ISO UTC. A replayed click keeps its original time. */
  at: string;
  ipHash: string;
  country: string | null;
  city: string | null;
  region: string | null;
  regionCode: string | null;
  latitude: number | null;
  longitude: number | null;
  device: string;
  os: string;
  browser: string;
  referrer: string | null;
  referrerSource: string;
  isBot: boolean;
  fraudReason: string | null;
  isTestClick: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Read the visitor id from the Cookie header; null when absent or malformed. */
export function readVisitorId(headers: Headers): string | null {
  const cookie = headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([^;]+)`));
  const value = match?.[1]?.trim() ?? "";
  return VISITOR_ID_PATTERN.test(value) ? value : null;
}

export function buildClickPayload({ slotCode, headers, isTestClick = false, visitorId }: RecordClickInput): ClickPayload {
  const ua = headers.get("user-agent") ?? "";
  const rawIp =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers.get("x-real-ip") ?? "unknown";
  const referrer = headers.get("referer") ?? null;

  let isBot = false;
  let fraudReason: string | null = null;
  if (isBotUserAgent(ua)) {
    isBot = true;
    fraudReason = "bot_user_agent";
  } else if (isHeadless(ua)) {
    isBot = true;
    fraudReason = "headless_browser";
  }

  const geo = readGeo(headers);
  return {
    id: crypto.randomUUID(),
    slotCode,
    at: new Date().toISOString(),
    // The device cookie is the visitor key; the hash only covers cookie-less
    // clients. (The `ipHash` column name is kept; it holds this visitor key.)
    ipHash: visitorId ?? hashVisitor(rawIp, ua, headers.get("accept-language") ?? ""),
    country: geo.country,
    city: geo.city,
    region: geo.region,
    regionCode: geo.regionCode,
    latitude: geo.latitude,
    longitude: geo.longitude,
    device: parseDevice(ua),
    os: parseOs(ua),
    browser: parseBrowser(ua),
    referrer,
    referrerSource: classifyReferrer(referrer),
    isBot,
    fraudReason,
    isTestClick,
  };
}

/**
 * The one INSERT. Idempotent by id, so retries and replays are safe. Explicit
 * casts: in an INSERT ... SELECT, untyped NULL parameters would otherwise be
 * inferred as text and rejected by non-text columns.
 */
async function insertClick(p: ClickPayload): Promise<void> {
  await db.$executeRaw`
    INSERT INTO ${sqlTable("ClickEvent")} (
      id, "slotCode", "ambassadorId", "timestamp", "ipHash",
      country, city, region, "regionCode", latitude, longitude,
      device, os, browser, referrer, "referrerSource",
      quality, "isFraud", "fraudReason", "isTestClick"
    )
    SELECT
      ${p.id}::text,
      ${p.slotCode}::text,
      (SELECT a.id FROM ${sqlTable("Ambassador")} a WHERE a."legacySlotId" = ${p.slotCode}::text LIMIT 1),
      ${p.at}::timestamp,
      ${p.ipHash}::text,
      ${p.country}::text, ${p.city}::text, ${p.region}::text, ${p.regionCode}::text,
      ${p.latitude}::double precision, ${p.longitude}::double precision,
      ${p.device}::text, ${p.os}::text, ${p.browser}::text,
      ${p.referrer}::text, ${p.referrerSource}::text,
      (CASE
        WHEN ${p.isBot}::boolean THEN 'BOT'
        WHEN prev.last IS NULL THEN 'UNIQUE'
        WHEN ${p.at}::timestamp - prev.last < make_interval(secs => ${CLICK_DEDUPE_WINDOW_SECONDS}::int) THEN 'DUPLICATE'
        ELSE 'RETURN'
      END)::${sqlType("ClickQuality")},
      ${p.isBot}::boolean,
      ${p.fraudReason}::text,
      ${p.isTestClick}::boolean
    FROM (
      SELECT MAX("timestamp") AS last
      FROM ${sqlTable("ClickEvent")}
      WHERE "slotCode" = ${p.slotCode}::text AND "ipHash" = ${p.ipHash}::text AND quality <> 'BOT'
    ) prev
    ON CONFLICT (id) DO NOTHING
  `;
}

interface QueuedClick {
  v: 1;
  attempts: number;
  p: ClickPayload;
}

async function queueForReplay(p: ClickPayload, cause: unknown): Promise<void> {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (!redisConfigured()) {
    // The last resort failed too. Say exactly what was lost, so the log line
    // alone could reconstruct the click by hand.
    console.error(`[click-tracking] CLICK LOST (no Redis to queue it): ${message} payload=${JSON.stringify(p)}`);
    return;
  }
  try {
    const entry: QueuedClick = { v: 1, attempts: 0, p };
    await withRedis((client) => client.rPush(RETRY_QUEUE_KEY, JSON.stringify(entry)));
    console.error(`[click-tracking] ClickEvent write failed after ${INSERT_ATTEMPTS} attempts — queued for replay: ${message}`);
  } catch (redisError) {
    console.error(
      `[click-tracking] CLICK LOST (write failed: ${message}; queueing failed too: ${
        redisError instanceof Error ? redisError.message : redisError
      }) payload=${JSON.stringify(p)}`
    );
  }
}

/**
 * Record one click. Runs inside `waitUntil` (never on the redirect's critical
 * path), retries the INSERT in-process, and queues the click in Redis if
 * Postgres will not take it. Never throws.
 */
export async function recordClick(input: RecordClickInput): Promise<void> {
  const payload = buildClickPayload(input);
  let lastError: unknown = null;
  for (let attempt = 0; attempt < INSERT_ATTEMPTS; attempt++) {
    try {
      await insertClick(payload);
      return;
    } catch (error) {
      lastError = error;
      const delay = INSERT_RETRY_DELAYS_MS[attempt];
      if (delay !== undefined) await sleep(delay);
    }
  }
  await queueForReplay(payload, lastError);
}

/**
 * Replay clicks whose INSERT failed earlier. Called opportunistically from the
 * redirect's own `waitUntil` after each recorded click, so the queue drains on
 * ordinary traffic with no cron. One failed replay puts the click back and
 * stops (Postgres is likely still unhealthy); a click that will not insert
 * after MAX_REPLAY_ATTEMPTS replays is dropped with its full payload in the
 * log. Never throws.
 */
export async function drainClickRetryQueue(limit = 10): Promise<number> {
  if (!redisConfigured()) return 0;
  let replayed = 0;
  try {
    await withRedis(async (client) => {
      for (let i = 0; i < limit; i++) {
        const raw = await client.lPop(RETRY_QUEUE_KEY);
        if (!raw) return;
        let entry: QueuedClick;
        try {
          entry = JSON.parse(raw) as QueuedClick;
          if (entry?.v !== 1 || !entry.p?.id) throw new Error("not a queued click");
        } catch {
          console.error(`[click-tracking] dropping unreadable replay entry: ${raw.slice(0, 500)}`);
          continue;
        }
        try {
          await insertClick(entry.p);
          replayed++;
        } catch (error) {
          entry.attempts += 1;
          if (entry.attempts >= MAX_REPLAY_ATTEMPTS) {
            console.error(
              `[click-tracking] CLICK LOST (replay failed ${entry.attempts} times): payload=${JSON.stringify(entry.p)}`
            );
          } else {
            await client.rPush(RETRY_QUEUE_KEY, JSON.stringify(entry));
          }
          return; // Postgres is unhappy — stop; the next click tries again.
        }
      }
    });
  } catch (error) {
    // Redis unreachable: the queue keeps its entries; nothing to do now.
    console.error(
      `[click-tracking] replay drain skipped: ${error instanceof Error ? error.message : error}`
    );
  }
  return replayed;
}

/**
 * Attribute the clicks already recorded on a slot's link to the ambassador who
 * now owns that slot. Attribution is normally decided inside the INSERT, which
 * finds nobody when the slot's person has no HQ record yet — those rows stay
 * `ambassadorId = NULL` and are invisible on the leaderboard and in their
 * analytics. Called when an application is approved onto a slot (and by the
 * `clicks:attribute` backfill); idempotent — it only ever fills NULLs.
 */
export async function claimSlotClicks(
  client: Pick<typeof DbClient, "clickEvent">,
  ambassadorId: string,
  slotCode: string
): Promise<number> {
  const { count } = await client.clickEvent.updateMany({
    where: { slotCode, ambassadorId: null },
    data: { ambassadorId },
  });
  return count;
}
