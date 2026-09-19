import { db } from "@/lib/db";

/**
 * "When do people actually click this link?" Ported from Traqly's
 * lib/peak-hours.ts.
 *
 * Aggregation happens in Postgres, not JavaScript, so the hours come out in
 * Nigerian time: an ambassador told their peak is "7 AM" when their audience
 * shows up at 8 AM has been given advice that is wrong by an hour. Traqly took
 * the timezone from the browser; EduCraft is a Nigerian business, so it is
 * fixed to WAT (Africa/Lagos, UTC+1, no daylight saving).
 *
 * Differences from Traqly: HQ stores `timestamp` as UTC without a time zone,
 * so it is converted with `AT TIME ZONE 'UTC'` first; and it is scoped by
 * ambassador, not by link ids.
 */

export const NIGERIA_TZ = "Africa/Lagos";
export const NIGERIA_TZ_LABEL = "WAT";

export const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

export interface HourBucket { hour: number; clicks: number }
export interface DayBucket { dayIndex: number; day: string; clicks: number }
export interface HeatCell { dayIndex: number; hour: number; clicks: number }

export interface PeakHoursData {
  timezoneLabel: string;
  days: number;
  totalClicks: number;
  hourly: HourBucket[];
  daily: DayBucket[];
  heatmap: HeatCell[];
  peakHour: number | null;
  peakDay: string | null;
  /** Share of clicks inside the 3-hour window centred on the peak, 0-100. */
  peakWindowShare: number;
  insight: string | null;
  /** Same analysis over today alone. */
  today: { totalClicks: number; peakHour: number | null; insight: string | null };
}

/** "8:00 AM", the format insight sentences read naturally in. */
export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${suffix}`;
}

function formatWindow(start: number, end: number): string {
  return `${formatHour(start).replace(":00", "")} to ${formatHour(end).replace(":00", "")}`;
}

const DAY_MS = 86_400_000;
const WAT_OFFSET_MS = 3_600_000; // Nigeria is UTC+1 all year

/** UTC instant of 00:00 WAT for the day containing `now`. */
export function watDayStart(now = Date.now()): Date {
  return new Date(Math.floor((now + WAT_OFFSET_MS) / DAY_MS) * DAY_MS - WAT_OFFSET_MS);
}

interface RawBucket { day_index: number; hour: number; clicks: number }

/**
 * Clicks bucketed by weekday and hour in WAT. Counts real visits only: not
 * test clicks, not archived (reset) clicks, not bots.
 */
async function fetchBuckets(ambassadorId: string, since: Date): Promise<RawBucket[]> {
  return db.$queryRaw<RawBucket[]>`
    SELECT
      EXTRACT(DOW  FROM ("timestamp" AT TIME ZONE 'UTC') AT TIME ZONE ${NIGERIA_TZ}::text)::int AS day_index,
      EXTRACT(HOUR FROM ("timestamp" AT TIME ZONE 'UTC') AT TIME ZONE ${NIGERIA_TZ}::text)::int AS hour,
      COUNT(*)::int AS clicks
    FROM "ClickEvent"
    WHERE "ambassadorId" = ${ambassadorId}::text
      AND "timestamp" >= ${since.toISOString()}::timestamp
      AND "isTestClick" = false
      AND "archivedAt" IS NULL
      AND "isFraud" = false
      AND quality <> 'BOT'
    GROUP BY 1, 2
  `;
}

const emptyHourly = (): HourBucket[] => Array.from({ length: 24 }, (_, hour) => ({ hour, clicks: 0 }));

function buildInsight(
  hourly: HourBucket[],
  peakHour: number | null,
  peakDay: string | null,
  total: number,
  days: number
): { insight: string | null; share: number } {
  if (peakHour === null || total === 0) return { insight: null, share: 0 };

  // 3-hour window centred on the peak; modulo handles a peak at 00:00 / 23:00.
  const window = [peakHour - 1, peakHour, peakHour + 1].map((h) => ((h % 24) + 24) % 24);
  const windowClicks = hourly.filter((h) => window.includes(h.hour)).reduce((s, h) => s + h.clicks, 0);
  const share = Math.round((windowClicks / total) * 100);

  const range = formatWindow(window[0], window[2]);
  const period = days === 1 ? "today" : `over the past ${days} days`;
  const dayPart = peakDay && days > 1 ? ` on ${peakDay}s` : "";

  return {
    insight:
      `Your audience is most active around ${formatHour(peakHour)} ${NIGERIA_TZ_LABEL}${dayPart}. ` +
      `The ${range} window brought ${share}% of your clicks ${period}. ` +
      `Share your link in that window to reach the most people.`,
    share,
  };
}

export async function getPeakHours(ambassadorId: string, days = 30): Promise<PeakHoursData> {
  const span = Math.min(Math.max(days, 1), 90);
  const [buckets, todayBuckets] = await Promise.all([
    fetchBuckets(ambassadorId, new Date(Date.now() - span * DAY_MS)),
    // "Today" is today in Lagos (00:00 WAT), the same day "Clicks Today" counts.
    fetchBuckets(ambassadorId, watDayStart()),
  ]);

  const hourly = emptyHourly();
  const daily: DayBucket[] = DAY_NAMES.map((day, dayIndex) => ({ dayIndex, day, clicks: 0 }));
  const heatmap: HeatCell[] = [];
  for (const b of buckets) {
    hourly[b.hour].clicks += b.clicks;
    daily[b.day_index].clicks += b.clicks;
    heatmap.push({ dayIndex: b.day_index, hour: b.hour, clicks: b.clicks });
  }

  const totalClicks = hourly.reduce((s, h) => s + h.clicks, 0);
  // null rather than 0 when there is nothing to report: an insight claiming
  // midnight is the peak because every hour tied at zero is worse than silence.
  const peakHour =
    totalClicks > 0 ? hourly.reduce((best, h) => (h.clicks > best.clicks ? h : best), hourly[0]).hour : null;
  const peakDayBucket =
    totalClicks > 0 ? daily.reduce((best, d) => (d.clicks > best.clicks ? d : best), daily[0]) : null;
  const peakDay = peakDayBucket && peakDayBucket.clicks > 0 ? peakDayBucket.day : null;
  const { insight, share } = buildInsight(hourly, peakHour, peakDay, totalClicks, span);

  // "Today it was 8 o'clock", computed the same way over one day.
  const todayHourly = emptyHourly();
  for (const b of todayBuckets) todayHourly[b.hour].clicks += b.clicks;
  const todayTotal = todayHourly.reduce((s, h) => s + h.clicks, 0);
  const todayPeak =
    todayTotal > 0 ? todayHourly.reduce((best, h) => (h.clicks > best.clicks ? h : best), todayHourly[0]).hour : null;

  return {
    timezoneLabel: NIGERIA_TZ_LABEL,
    days: span,
    totalClicks,
    hourly,
    daily,
    heatmap,
    peakHour,
    peakDay,
    peakWindowShare: share,
    insight,
    today: {
      totalClicks: todayTotal,
      peakHour: todayPeak,
      insight:
        todayPeak !== null && todayTotal > 0
          ? `Today, most clicks came in around ${formatHour(todayPeak)} ${NIGERIA_TZ_LABEL} ` +
            `(${todayTotal} click${todayTotal === 1 ? "" : "s"} so far).`
          : null,
    },
  };
}
