import crypto from "crypto";
import { db } from "@/lib/db";
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
 */

/** Clicks from the same visitor to the same link inside this window are DUPLICATE. */
export const CLICK_DEDUPE_WINDOW_SECONDS = 30 * 60;

export interface RecordClickInput {
  /** The link that was hit: "054", "ECCA-001", "ECSA-001-003". */
  slotCode: string;
  headers: Headers;
  /** Link opened with ?test=1: stored, flagged, excluded from every number. */
  isTestClick?: boolean;
}

export async function recordClick({ slotCode, headers, isTestClick = false }: RecordClickInput): Promise<void> {
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
  const ipHash = hashVisitor(rawIp, ua, headers.get("accept-language") ?? "");
  const id = crypto.randomUUID();

  // Explicit casts: in an INSERT ... SELECT, untyped NULL parameters would
  // otherwise be inferred as text and rejected by non-text columns.
  await db.$executeRaw`
    INSERT INTO "ClickEvent" (
      id, "slotCode", "ambassadorId", "timestamp", "ipHash",
      country, city, region, "regionCode", latitude, longitude,
      device, os, browser, referrer, "referrerSource",
      quality, "isFraud", "fraudReason", "isTestClick"
    )
    SELECT
      ${id}::text,
      ${slotCode}::text,
      (SELECT a.id FROM "Ambassador" a WHERE a."legacySlotId" = ${slotCode}::text LIMIT 1),
      (NOW() AT TIME ZONE 'UTC'),
      ${ipHash}::text,
      ${geo.country}::text, ${geo.city}::text, ${geo.region}::text, ${geo.regionCode}::text,
      ${geo.latitude}::double precision, ${geo.longitude}::double precision,
      ${parseDevice(ua)}::text, ${parseOs(ua)}::text, ${parseBrowser(ua)}::text,
      ${referrer}::text, ${classifyReferrer(referrer)}::text,
      (CASE
        WHEN ${isBot}::boolean THEN 'BOT'
        WHEN prev.last IS NULL THEN 'UNIQUE'
        WHEN (NOW() AT TIME ZONE 'UTC') - prev.last < make_interval(secs => ${CLICK_DEDUPE_WINDOW_SECONDS}::int) THEN 'DUPLICATE'
        ELSE 'RETURN'
      END)::"ClickQuality",
      ${isBot}::boolean,
      ${fraudReason}::text,
      ${isTestClick}::boolean
    FROM (
      SELECT MAX("timestamp") AS last
      FROM "ClickEvent"
      WHERE "slotCode" = ${slotCode}::text AND "ipHash" = ${ipHash}::text AND quality <> 'BOT'
    ) prev
  `;
}
