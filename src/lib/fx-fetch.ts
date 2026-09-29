/**
 * Fetches today's USD → NGN mid-market rate from a free FX API.
 *
 * Default source: `open.er-api.com/v6/latest/USD` (free, no API key, returns
 * `rates.NGN`). Overridable with `FX_RATE_URL` env for future switching. The
 * caller (the daily cron and the "Refresh now" button on Settings) writes the
 * three `ai.fxRateAuto*` Setting rows on a successful fetch; on failure it
 * keeps yesterday's value in place, so a bad day never breaks HQ.
 */

import { db } from "@/lib/db";
import { timedGetJson, type RequestLogEntry } from "@/lib/data-fetchers/timed-fetch";
import { FX_RATE_SETTING_KEYS } from "@/lib/fx-rate";

const DEFAULT_URL = "https://open.er-api.com/v6/latest/USD";

/** Sanity ceiling — a rate above this is almost certainly bad data (Nigeria has never traded that low). */
const MAX_REASONABLE_RATE = 10_000;

export interface FxFetchOk {
  ok: true;
  base: number;
  source: string;
  fetchedAt: string;
  log: RequestLogEntry[];
}

export interface FxFetchFail {
  ok: false;
  reason: string;
  log: RequestLogEntry[];
}

export type FxFetchResult = FxFetchOk | FxFetchFail;

/** Fetches the current mid-market rate; on success, persists it. */
export async function refreshFxRate(): Promise<FxFetchResult> {
  const log: RequestLogEntry[] = [];
  const url = process.env.FX_RATE_URL || DEFAULT_URL;

  let json: unknown;
  try {
    json = await timedGetJson("FX", url, log);
  } catch (error) {
    return { ok: false, reason: (error as Error)?.message ?? "network error", log };
  }

  const parsed = extractNgnRate(json);
  if (parsed == null) return { ok: false, reason: "response did not carry a usable NGN rate", log };
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_REASONABLE_RATE) {
    return { ok: false, reason: `NGN rate ${parsed} looks wrong`, log };
  }

  const sourceLabel = new URL(url).host;
  const fetchedAt = new Date().toISOString();
  await db.$transaction([
    db.setting.upsert({
      where: { key: FX_RATE_SETTING_KEYS.auto },
      update: { value: String(parsed) },
      create: { key: FX_RATE_SETTING_KEYS.auto, value: String(parsed) },
    }),
    db.setting.upsert({
      where: { key: FX_RATE_SETTING_KEYS.autoFetchedAt },
      update: { value: fetchedAt },
      create: { key: FX_RATE_SETTING_KEYS.autoFetchedAt, value: fetchedAt },
    }),
    db.setting.upsert({
      where: { key: FX_RATE_SETTING_KEYS.autoSource },
      update: { value: sourceLabel },
      create: { key: FX_RATE_SETTING_KEYS.autoSource, value: sourceLabel },
    }),
  ]);
  return { ok: true, base: parsed, source: sourceLabel, fetchedAt, log };
}

/** Reads the NGN rate from the well-known response shapes we support. */
function extractNgnRate(json: unknown): number | null {
  if (!json || typeof json !== "object") return null;
  const body = json as Record<string, unknown>;
  // open.er-api.com and exchangerate.host both use `rates: { NGN: number }`.
  const rates = body.rates as Record<string, unknown> | undefined;
  if (rates && typeof rates === "object") {
    const v = rates.NGN;
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  // Fawaz Ahmed's currency-api uses `{ usd: { ngn: number } }`.
  const usd = body.usd as Record<string, unknown> | undefined;
  if (usd && typeof usd === "object") {
    const v = usd.ngn;
    if (typeof v === "number") return v;
  }
  return null;
}
