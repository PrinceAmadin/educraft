/**
 * Week arithmetic for the Ambassador Platform, in West Africa Time (UTC+1,
 * no DST). Weeks start on Monday and are keyed the ISO way ("2026-W38"),
 * which is what `AmbassadorContentLog.week` stores. Pure: no database.
 */

const WAT_OFFSET_MS = 60 * 60 * 1000;
const DAY = 86_400_000;

/** The instant `d`, shifted so that UTC getters read WAT wall-clock values. */
function toWat(d: Date): Date {
  return new Date(d.getTime() + WAT_OFFSET_MS);
}

/** A WAT wall-clock date (built with Date.UTC) back to a real instant. */
function fromWat(wallClock: Date): Date {
  return new Date(wallClock.getTime() - WAT_OFFSET_MS);
}

/** Monday 00:00 WAT of the week containing `d`. */
export function weekStart(d: Date): Date {
  const w = toWat(d);
  const dow = (w.getUTCDay() + 6) % 7; // Monday = 0
  const monday = Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() - dow);
  return fromWat(new Date(monday));
}

/** Monday 00:00 WAT of the week AFTER the one containing `d` (exclusive end). */
export function weekEnd(d: Date): Date {
  return new Date(weekStart(d).getTime() + 7 * DAY);
}

/** ISO week key, "2026-W38". */
export function isoWeekKey(d: Date): string {
  // ISO week number: the week with the year's first Thursday is week 1.
  const w = toWat(d);
  const target = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3); // Thursday of this week
  const isoYear = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** 0 = Monday … 6 = Sunday, in WAT. */
export function watWeekday(d: Date): number {
  return (toWat(d).getUTCDay() + 6) % 7;
}

/** "YYYY-MM-DD" of the instant in WAT. */
export function watDateKey(d: Date): string {
  return toWat(d).toISOString().slice(0, 10);
}

export interface WeekBucket {
  key: string;
  start: Date;
  /** Exclusive. */
  end: Date;
  /** "15 Sep" (the Monday). */
  label: string;
}

/** The last `n` weeks ending with the current one, oldest first. */
export function lastWeeks(n: number, now: Date = new Date()): WeekBucket[] {
  const out: WeekBucket[] = [];
  const thisStart = weekStart(now);
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(thisStart.getTime() - i * 7 * DAY);
    out.push({ key: isoWeekKey(start), start, end: new Date(start.getTime() + 7 * DAY), label: shortDay(start) });
  }
  return out;
}

/** "15 Sep" in WAT. */
export function shortDay(d: Date): string {
  const w = toWat(d);
  return `${w.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][w.getUTCMonth()]}`;
}

/** The instant of a given weekday (0 = Monday) in the week containing `d`, at 00:00 WAT. */
export function dayOfWeek(d: Date, weekday: number): Date {
  return new Date(weekStart(d).getTime() + weekday * DAY);
}
