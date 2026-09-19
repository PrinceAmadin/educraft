import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { readClicks } from "@/lib/services/ambassador-tracking";
import { getPeakHours, NIGERIA_TZ, watDayStart, type InsightVoice, type PeakHoursData } from "@/lib/click-tracking/peak-hours";
import { getRegionName } from "@/lib/click-tracking/region-names";

/**
 * Link analytics for one ambassador's shared link (/EduCraftA/{slot}).
 * Query logic ported from Traqly's links/[id] analytics page.
 *
 * Every function takes an `ambassadorId` and NEVER reads the session: the
 * caller decides whose data this is. The ambassador portal passes the id from
 * the signed-in session; the admin view (Phase 4) passes the id it is looking
 * at. Nothing here accepts an id from a URL or request body.
 *
 * Definitions (the same everywhere so the numbers agree):
 *   recorded  = every non-test, non-archived row, bots included
 *   click     = recorded, minus BOT       (UNIQUE + RETURN + DUPLICATE)
 *   unique    = quality UNIQUE
 * "Today", the 7-day trend and the heatmap are in Nigerian time (WAT, UTC+1).
 */

/** Traqly's REAL_CLICKS: test clicks and archived (reset) clicks never count. */
const REAL = { isTestClick: false, archivedAt: null } satisfies Prisma.ClickEventWhereInput;
/** A visit that counts as a click: real, and not a bot. */
const CLICK_QUALITIES = ["UNIQUE", "RETURN", "DUPLICATE"] as const;
const isClick = (ambassadorId: string) =>
  ({ ambassadorId, ...REAL, quality: { in: [...CLICK_QUALITIES] }, isFraud: false }) satisfies Prisma.ClickEventWhereInput;

const DAY_MS = 86_400_000;
const WAT_OFFSET_MS = 3_600_000; // Nigeria is UTC+1 all year

export { watDayStart };

// ── Date range (admin view) ──────────────────────────────────

/** Half-open range [from, to) in UTC instants, built from WAT calendar days. */
export interface DateRange {
  from: Date;
  to: Date;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

/**
 * "2026-09-01" .. "2026-09-19" (inclusive, Nigerian calendar days) -> the
 * instants that bound them. Returns undefined for a missing or invalid range so
 * a bad query string falls back to "all time" instead of erroring.
 */
export function parseRange(from?: string | null, to?: string | null): DateRange | undefined {
  if (!from || !to || !YMD.test(from) || !YMD.test(to)) return undefined;
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return undefined;
  if (end < start || (end.getTime() - start.getTime()) / DAY_MS >= MAX_RANGE_DAYS) return undefined;
  // 00:00 WAT on `from` is 23:00 UTC the day before; `to` is inclusive, so +1 day.
  return {
    from: new Date(start.getTime() - WAT_OFFSET_MS),
    to: new Date(end.getTime() + DAY_MS - WAT_OFFSET_MS),
  };
}

const inRange = (range?: DateRange) =>
  (range ? { timestamp: { gte: range.from, lt: range.to } } : {}) satisfies Prisma.ClickEventWhereInput;

const DEAD_PROJECT_STATUSES = ["CANCELLED", "REFUNDED"];

// ── Own performance (private to the ambassador) ──────────────

export interface OwnPerformance {
  /** HQ projects credited to this ambassador (cancelled/refunded excluded). */
  orders: number;
  /** Unique visitors tracked on their link (this counting period). */
  uniqueVisitors: number;
  /** orders / uniqueVisitors as a percentage, 1 decimal. null until they have visitors. */
  conversion: number | null;
}

/**
 * Orders and conversion are business data: an ambassador sees their OWN only
 * (My Link and Earnings). They are deliberately absent from the leaderboard,
 * which every ambassador can read. Admin views can pass any ambassadorId.
 */
export async function getOwnPerformance(ambassadorId: string): Promise<OwnPerformance> {
  const [orders, uniqueVisitors] = await Promise.all([
    db.project.count({ where: { ambassadorId, status: { notIn: DEAD_PROJECT_STATUSES as never[] } } }),
    db.clickEvent.count({ where: { ...isClick(ambassadorId), quality: "UNIQUE" } }),
  ]);
  return {
    orders,
    uniqueVisitors,
    conversion: uniqueVisitors > 0 ? Math.round((orders / uniqueVisitors) * 1000) / 10 : null,
  };
}

// ── Link ─────────────────────────────────────────────────────

export interface AmbassadorLink {
  slotCode: string;
  linkPath: string;
}

/** The ambassador's shared link, or null when they were created without a slot. */
export async function getAmbassadorLink(ambassadorId: string): Promise<AmbassadorLink | null> {
  const a = await db.ambassador.findUnique({ where: { id: ambassadorId }, select: { legacySlotId: true } });
  if (!a?.legacySlotId) return null;
  const isSub = a.legacySlotId.startsWith("ECSA-");
  const isCore = a.legacySlotId.startsWith("ECCA-");
  return {
    slotCode: a.legacySlotId,
    linkPath: isCore
      ? `/ECCA/${a.legacySlotId}`
      : isSub
        ? `/ECSA/${a.legacySlotId.replace(/^ECSA/, "")}`
        : `/EduCraftA/${a.legacySlotId}`,
  };
}

// ── Overview ─────────────────────────────────────────────────

export interface TrendPoint {
  /** YYYY-MM-DD in WAT. */
  date: string;
  /** "Mon" */
  label: string;
  clicks: number;
  unique: number;
}

export interface OverviewData {
  clicksToday: number;
  /** Unique clicks in the last 7 days (today + the 6 before, WAT). */
  uniqueThisWeek: number;
  /** Clicks recorded since tracking began (this counting period). */
  trackedClicks: number;
  /** The old Redis counter, from before tracking began. null if unavailable. */
  legacyClicks: number | null;
  totalClicks: number;
  /** HQ projects allocated to this ambassador (cancelled/refunded excluded). */
  orders: number;
  /** orders / unique visitors, %. null until they have visitors. */
  conversion: number | null;
  trend: TrendPoint[];
  /** First tracked click, for "tracking since". */
  trackingSince: Date | null;
}

const WEEKDAY = new Intl.DateTimeFormat("en-NG", { weekday: "short", timeZone: NIGERIA_TZ });

export async function getOverview(ambassadorId: string, slotCode: string): Promise<OverviewData> {
  const todayStart = watDayStart();
  const weekStart = new Date(todayStart.getTime() - 6 * DAY_MS);
  const where = isClick(ambassadorId);

  const [clicksToday, uniqueThisWeek, trackedClicks, first, perf, trendRows, legacy] = await Promise.all([
    db.clickEvent.count({ where: { ...where, timestamp: { gte: todayStart } } }),
    db.clickEvent.count({ where: { ...where, quality: "UNIQUE", timestamp: { gte: weekStart } } }),
    db.clickEvent.count({ where }),
    db.clickEvent.findFirst({ where: { ambassadorId, ...REAL }, orderBy: { timestamp: "asc" }, select: { timestamp: true } }),
    getOwnPerformance(ambassadorId),
    db.$queryRaw<{ d: string; total: number; uniq: number }[]>`
      SELECT
        to_char((("timestamp" AT TIME ZONE 'UTC') AT TIME ZONE ${NIGERIA_TZ}::text)::date, 'YYYY-MM-DD') AS d,
        COUNT(*)::int AS total,
        (COUNT(*) FILTER (WHERE quality = 'UNIQUE'))::int AS uniq
      FROM "ClickEvent"
      WHERE "ambassadorId" = ${ambassadorId}::text
        AND "timestamp" >= ${weekStart.toISOString()}::timestamp
        AND "isTestClick" = false AND "archivedAt" IS NULL
        AND "isFraud" = false AND quality <> 'BOT'
      GROUP BY 1
    `,
    readClicks([slotCode]),
  ]);

  // One point per day for the last 7 days, zero-filled, oldest first.
  const byDay = new Map(trendRows.map((r) => [r.d, r]));
  const trend: TrendPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(todayStart.getTime() - i * DAY_MS);
    // 12:00 UTC on that WAT date is unambiguous for both the key and the label.
    const key = new Date(dayStart.getTime() + WAT_OFFSET_MS).toISOString().slice(0, 10);
    const row = byDay.get(key);
    trend.push({ date: key, label: WEEKDAY.format(new Date(dayStart.getTime() + 12 * 3_600_000)), clicks: row?.total ?? 0, unique: row?.uniq ?? 0 });
  }

  const legacyClicks = legacy ? (legacy.get(slotCode) ?? 0) : null;
  return {
    clicksToday,
    uniqueThisWeek,
    trackedClicks,
    legacyClicks,
    totalClicks: trackedClicks + (legacyClicks ?? 0),
    orders: perf.orders,
    conversion: perf.conversion,
    trend,
    trackingSince: first?.timestamp ?? null,
  };
}

// ── Analytics ────────────────────────────────────────────────

export interface BreakdownRow {
  label: string;
  /** Secondary text, e.g. the country for a region. */
  detail: string | null;
  clicks: number;
  /** 0-100 */
  share: number;
}

export interface AnalyticsData {
  peak: PeakHoursData;
  totalClicks: number;
  country: BreakdownRow[];
  region: BreakdownRow[];
  city: BreakdownRow[];
  device: BreakdownRow[];
  os: BreakdownRow[];
  browser: BreakdownRow[];
  source: BreakdownRow[];
}

function countryName(code: string | null): string {
  if (!code) return "Unknown";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Stored values are lower-case keys ("ios", "whatsapp"); these read properly. */
const LABELS: Record<string, string> = {
  ios: "iOS", macos: "macOS", chromeos: "ChromeOS", android: "Android", windows: "Windows", linux: "Linux",
  whatsapp: "WhatsApp", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube", twitter: "Twitter/X",
};
const title = (s: string | null) =>
  s ? (LABELS[s.toLowerCase()] ?? s.charAt(0).toUpperCase() + s.slice(1)) : "Unknown";

function rows(
  entries: { label: string; detail?: string | null; clicks: number }[],
  total: number,
  limit = 25
): BreakdownRow[] {
  return entries
    .sort((a, b) => b.clicks - a.clicks || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((e) => ({ label: e.label, detail: e.detail ?? null, clicks: e.clicks, share: total ? Math.round((e.clicks / total) * 100) : 0 }));
}

export async function getAnalytics(
  ambassadorId: string,
  range?: DateRange,
  voice: InsightVoice = "you"
): Promise<AnalyticsData> {
  const where = { ...isClick(ambassadorId), ...inRange(range) };
  const [peak, geo, device, os, browser, source] = await Promise.all([
    getPeakHours(ambassadorId, range ?? 30, voice),
    // ONE grouped query drives the country -> region -> city breakdowns, so
    // the three tables always agree with each other (same as Traqly).
    db.clickEvent.groupBy({ by: ["country", "regionCode", "region", "city"], where, _count: { _all: true } }),
    db.clickEvent.groupBy({ by: ["device"], where, _count: { _all: true } }),
    db.clickEvent.groupBy({ by: ["os"], where, _count: { _all: true } }),
    db.clickEvent.groupBy({ by: ["browser"], where, _count: { _all: true } }),
    db.clickEvent.groupBy({ by: ["referrerSource"], where, _count: { _all: true } }),
  ]);

  const total = geo.reduce((s, g) => s + g._count._all, 0);

  const sum = (key: (g: (typeof geo)[number]) => string, detail?: (g: (typeof geo)[number]) => string | null) => {
    const m = new Map<string, { label: string; detail: string | null; clicks: number }>();
    for (const g of geo) {
      const k = key(g);
      const cur = m.get(k) ?? { label: k.split("\u0000")[0], detail: detail?.(g) ?? null, clicks: 0 };
      cur.clicks += g._count._all;
      m.set(k, cur);
    }
    return [...m.values()];
  };
  const flat = (g: { _count: { _all: number } } & Record<string, unknown>, field: string) => ({
    label: title(g[field] as string | null),
    clicks: g._count._all,
  });

  return {
    peak,
    totalClicks: total,
    country: rows(sum((g) => countryName(g.country)), total),
    // Region and city keep their country so "Edo State, Nigeria" stays distinct
    // from a same-named place elsewhere.
    region: rows(
      sum(
        (g) => `${g.region ?? getRegionName(g.country, g.regionCode) ?? "Unknown"}\u0000${g.country ?? ""}`,
        (g) => (g.country ? countryName(g.country) : null)
      ),
      total
    ),
    city: rows(
      sum(
        (g) => `${g.city ?? "Unknown"}\u0000${g.country ?? ""}`,
        (g) => (g.country ? countryName(g.country) : null)
      ),
      total
    ),
    device: rows(device.map((g) => flat(g, "device")), total),
    os: rows(os.map((g) => flat(g, "os")), total),
    browser: rows(browser.map((g) => flat(g, "browser")), total),
    source: rows(source.map((g) => flat(g, "referrerSource")), total),
  };
}

// ── Quality ──────────────────────────────────────────────────

export interface QualityData {
  unique: number;
  return: number;
  duplicate: number;
  bot: number;
  /** Every recorded visit, bots included. */
  recorded: number;
  /** unique / recorded, 0-100. null when nothing is recorded yet. */
  integrityScore: number | null;
  fraudEvents: {
    id: string;
    timestamp: Date;
    country: string | null;
    device: string | null;
    browser: string | null;
    reason: string | null;
  }[];
}

export async function getQuality(ambassadorId: string, range?: DateRange): Promise<QualityData> {
  const base = { ambassadorId, ...REAL, ...inRange(range) };
  const [groups, fraud] = await Promise.all([
    db.clickEvent.groupBy({ by: ["quality"], where: base, _count: { _all: true } }),
    db.clickEvent.findMany({
      where: { ...base, isFraud: true },
      orderBy: { timestamp: "desc" },
      take: 20,
      select: { id: true, timestamp: true, country: true, device: true, browser: true, fraudReason: true },
    }),
  ]);
  const n = (q: string) => groups.find((g) => g.quality === q)?._count._all ?? 0;
  const recorded = groups.reduce((s, g) => s + g._count._all, 0);
  return {
    unique: n("UNIQUE"),
    return: n("RETURN"),
    duplicate: n("DUPLICATE"),
    bot: n("BOT"),
    recorded,
    integrityScore: recorded ? Math.round((n("UNIQUE") / recorded) * 100) : null,
    fraudEvents: fraud.map((f) => ({ id: f.id, timestamp: f.timestamp, country: f.country, device: f.device, browser: f.browser, reason: f.fraudReason })),
  };
}

// ── History (archived periods) ───────────────────────────────

export interface HistoryPeriod {
  /** When the reset happened. */
  archivedAt: Date;
  start: Date;
  end: Date;
  clicks: number;
  unique: number;
}

/**
 * Periods closed by an admin reset. A reset stamps every current row with the
 * same `archivedAt` and never deletes anything, so a period IS one distinct
 * archive stamp; its dates and totals are derived from the rows themselves
 * (no separate snapshot table needed). Test clicks are excluded.
 */
export async function getHistory(ambassadorId: string): Promise<HistoryPeriod[]> {
  const base = { ambassadorId, isTestClick: false, archivedAt: { not: null } } satisfies Prisma.ClickEventWhereInput;
  const notBot = { ...base, quality: { in: [...CLICK_QUALITIES] } };
  const [all, unique] = await Promise.all([
    db.clickEvent.groupBy({ by: ["archivedAt"], where: notBot, _count: { _all: true }, _min: { timestamp: true }, _max: { timestamp: true } }),
    db.clickEvent.groupBy({ by: ["archivedAt"], where: { ...notBot, quality: "UNIQUE" }, _count: { _all: true } }),
  ]);
  const uniqueBy = new Map(unique.map((u) => [u.archivedAt!.getTime(), u._count._all]));
  return all
    .map((p) => ({
      archivedAt: p.archivedAt!,
      start: p._min.timestamp!,
      end: p._max.timestamp!,
      clicks: p._count._all,
      unique: uniqueBy.get(p.archivedAt!.getTime()) ?? 0,
    }))
    .sort((a, b) => b.archivedAt.getTime() - a.archivedAt.getTime());
}

// ── Raw log + export ─────────────────────────────────────────

export const RAW_LOG_PAGE_SIZE = 50;

export interface RawLogRow {
  id: string;
  timestamp: Date;
  country: string | null;
  region: string | null;
  city: string | null;
  device: string | null;
  os: string | null;
  browser: string | null;
  source: string | null;
  quality: string;
  isFraud: boolean;
}

/** Fields returned to the ambassador. Never the visitor hash, coordinates or raw referrer. */
const LOG_SELECT = {
  id: true, timestamp: true, country: true, region: true, city: true, device: true,
  os: true, browser: true, referrerSource: true, quality: true, isFraud: true,
} satisfies Prisma.ClickEventSelect;

const toLogRow = (r: Prisma.ClickEventGetPayload<{ select: typeof LOG_SELECT }>): RawLogRow => ({
  id: r.id, timestamp: r.timestamp, country: r.country, region: r.region, city: r.city,
  device: r.device, os: r.os, browser: r.browser, source: r.referrerSource, quality: r.quality, isFraud: r.isFraud,
});

/** Every recorded visit (bots and fraud included, so the Quality columns mean something). */
export async function getRawLog(ambassadorId: string, page: number, range?: DateRange) {
  const where = { ambassadorId, ...REAL, ...inRange(range) };
  const pageNo = Math.max(1, Math.floor(page) || 1);
  const [total, rowsRaw] = await Promise.all([
    db.clickEvent.count({ where }),
    db.clickEvent.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (pageNo - 1) * RAW_LOG_PAGE_SIZE,
      take: RAW_LOG_PAGE_SIZE,
      select: LOG_SELECT,
    }),
  ]);
  return {
    rows: rowsRaw.map(toLogRow),
    total,
    page: pageNo,
    pageCount: Math.max(1, Math.ceil(total / RAW_LOG_PAGE_SIZE)),
  };
}

/** All rows for the CSV export, newest first, capped so one request stays bounded. */
export const EXPORT_ROW_CAP = 50_000;
export async function getExportRows(ambassadorId: string, range?: DateRange): Promise<RawLogRow[]> {
  const r = await db.clickEvent.findMany({
    where: { ambassadorId, ...REAL, ...inRange(range) },
    orderBy: { timestamp: "desc" },
    take: EXPORT_ROW_CAP,
    select: LOG_SELECT,
  });
  return r.map(toLogRow);
}

/** Rows a reset would archive (every live row, bots included). */
export const countLiveClicks = (ambassadorId: string) =>
  db.clickEvent.count({ where: { ambassadorId, archivedAt: null } });

// ── Reset (admin only) ───────────────────────────────────────

/**
 * Closes the current counting period: every live click is stamped with the same
 * `archivedAt` and moves to History. NOTHING is deleted; the numbers simply
 * restart from zero (this also restarts the ambassador's leaderboard count).
 * Callers must be admins; this function does not check.
 */
export async function resetClickCount(ambassadorId: string): Promise<{ archived: number }> {
  const stamp = new Date();
  const { count } = await db.clickEvent.updateMany({
    where: { ambassadorId, archivedAt: null },
    data: { archivedAt: stamp },
  });
  return { archived: count };
}
