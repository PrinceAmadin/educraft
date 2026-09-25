/**
 * Command Center time conventions (Phase 5). Pure and client-safe: no
 * database, no `Intl` dependence, nothing server-only.
 *
 * "Today" and "yesterday" are WAT calendar days (Africa/Lagos, UTC+1, no
 * daylight saving) — the same maths as `watDayStart` in
 * src/lib/click-tracking/peak-hours.ts, re-implemented here because that
 * module imports the Prisma client. Months are UTC "YYYY-MM" keys, exactly
 * like the finance services (`currentMonthKey`, `monthKeyOf`,
 * `netRevenueForMonths`), so every Command Center month figure ties to the
 * Finance Platform's. Weeks start Monday 00:00 WAT.
 */

/** Nigeria is UTC+1 all year. */
export const WAT_OFFSET_MS = 3_600_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

// ── WAT days ──────────────────────────────────────────────────────

/** UTC instant of 00:00 WAT for the day containing `now`. */
export function watDayStart(now: Date | number = Date.now()): Date {
  const ms = typeof now === "number" ? now : now.getTime();
  return new Date(Math.floor((ms + WAT_OFFSET_MS) / DAY_MS) * DAY_MS - WAT_OFFSET_MS);
}

export interface DayBounds {
  /** 00:00 WAT today, as a UTC instant (23:00 UTC the day before). */
  start: Date;
  /** 00:00 WAT tomorrow (exclusive). */
  end: Date;
  /** 00:00 WAT yesterday. */
  yesterdayStart: Date;
}

export function watDayBounds(now: Date = new Date()): DayBounds {
  const start = watDayStart(now);
  return {
    start,
    end: new Date(start.getTime() + DAY_MS),
    yesterdayStart: new Date(start.getTime() - DAY_MS),
  };
}

/** The calendar date in WAT, e.g. { year: 2026, month: 9, day: 24, weekday: 4 } (weekday 0 = Sunday). */
function watCalendar(instant: Date): { year: number; month: number; day: number; weekday: number } {
  const shifted = new Date(instant.getTime() + WAT_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

/** Day of the month in WAT (1–31): "is it the 5th yet?" for the payout deadline. */
export function watDayOfMonth(now: Date = new Date()): number {
  return watCalendar(now).day;
}

/**
 * The WAT calendar month key ("2026-11" from 00:00 WAT on 1 November). Pair
 * it with `watDayOfMonth` when a deadline is a WAT date — "last month's
 * payouts are due by the 5th" — so the day and the month never come from two
 * calendars an hour apart.
 */
export function watMonthKey(now: Date = new Date()): string {
  const c = watCalendar(now);
  return `${c.year}-${String(c.month).padStart(2, "0")}`;
}

// ── UTC months ────────────────────────────────────────────────────

function parseMonth(month: string): { y: number; m: number } {
  const [y, m] = month.split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error(`Bad month key "${month}" (expected "YYYY-MM")`);
  }
  return { y, m };
}

function monthKeyOf(y: number, zeroBasedMonth: number): string {
  const d = new Date(Date.UTC(y, zeroBasedMonth, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "2026-09" for the UTC month containing `date` (finance convention). */
export function monthKey(date: Date): string {
  return monthKeyOf(date.getUTCFullYear(), date.getUTCMonth());
}

/** The current UTC month key, e.g. "2026-09". */
export function currentMonthKey(now: Date = new Date()): string {
  return monthKey(now);
}

/** UTC bounds of a month: start inclusive, end exclusive. */
export function monthBounds(month: string): { start: Date; end: Date } {
  const { y, m } = parseMonth(month);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

/** shiftMonth("2026-01", -1) === "2025-12". Same maths as the finance dashboard. */
export function shiftMonth(month: string, delta: number): string {
  const { y, m } = parseMonth(month);
  return monthKeyOf(y, m - 1 + delta);
}

/** The last `n` month keys, oldest first, ending with the current UTC month. */
export function lastMonths(n: number, now: Date = new Date()): string[] {
  const current = currentMonthKey(now);
  const count = Math.max(0, Math.floor(n));
  return Array.from({ length: count }, (_, i) => shiftMonth(current, i - (count - 1)));
}

/** "September 2026" — matches `monthLabel` in the finance services. */
export function monthLongLabel(month: string): string {
  const { y, m } = parseMonth(month);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** "Sep 26" — matches the labels of `getRevenueHistory` on the finance dashboard. */
export function monthShortLabel(month: string): string {
  return `${monthLongLabel(month).slice(0, 3)} ${month.slice(2, 4)}`;
}

/**
 * Percentage change to one decimal: null when there is nothing to compare
 * against (previous 0, current not), 0 when both are 0. Divides by the size
 * of `previous`, so a month that recovers from negative net revenue (refunds
 * above inflows) reads as growth, not as a fall.
 */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/**
 * The same stretch of last month: from its first instant to as far in as
 * `now` is into the current UTC month (capped at last month's end). Comparing
 * "this month so far" with a whole previous month would read as a fall every
 * morning of the 1st, whatever the pace.
 */
export function samePointLastMonth(now: Date = new Date()): { start: Date; end: Date } {
  const month = currentMonthKey(now);
  const current = monthBounds(month);
  const previous = monthBounds(shiftMonth(month, -1));
  const elapsed = Math.max(0, now.getTime() - current.start.getTime());
  return {
    start: previous.start,
    end: new Date(Math.min(previous.start.getTime() + elapsed, previous.end.getTime())),
  };
}

// ── WAT weeks ─────────────────────────────────────────────────────

export interface WeekBucket {
  /** Monday 00:00 WAT, as a UTC instant. */
  start: Date;
  /** The next Monday 00:00 WAT (exclusive). */
  end: Date;
  /** "22 Sep" — the Monday's date in WAT. */
  label: string;
}

/** "22 Sep" for the WAT date of an instant. */
function watShortDateLabel(instant: Date): string {
  const c = watCalendar(instant);
  return `${c.day} ${MONTH_NAMES[c.month - 1].slice(0, 3)}`;
}

/**
 * The last `n` Monday-aligned WAT weeks, oldest first, ending with the
 * current (partial) week.
 */
export function weekBuckets(n: number, now: Date = new Date()): WeekBucket[] {
  const today = watDayStart(now);
  const sinceMonday = (watCalendar(today).weekday + 6) % 7; // Monday → 0, Sunday → 6
  const thisWeekStart = today.getTime() - sinceMonday * DAY_MS;
  const count = Math.max(0, Math.floor(n));
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(thisWeekStart - (count - 1 - i) * WEEK_MS);
    return { start, end: new Date(start.getTime() + WEEK_MS), label: watShortDateLabel(start) };
  });
}

// ── Durations ─────────────────────────────────────────────────────

/** Hours from `a` to `b` (signed, fractional): hoursBetween(submittedAt, now). */
export function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / HOUR_MS;
}
