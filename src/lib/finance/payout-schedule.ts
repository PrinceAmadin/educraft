/**
 * When payout batches are due (Phase 5), pure and WAT-based so it can be checked
 * without a database or a clock. Ambassadors are paid weekly on Saturday; workers
 * and executives on the last Friday of the month; founders on the 1st, for the
 * month just ended. The periodKey is only a label and a uniqueness guard — a
 * batch gathers records by status and bank details, never by the period window.
 */
import { isoWeekKey, watDateKey, watWeekday, weekEnd, weekStart } from "@/lib/ambassadors/weeks";

export type Cohort = "AMBASSADORS" | "WORKERS" | "EXECUTIVES" | "FOUNDERS";
export const COHORTS: Cohort[] = ["AMBASSADORS", "WORKERS", "EXECUTIVES", "FOUNDERS"];

/** Which PayoutRecord recipientType(s) a cohort pays (FOUNDERS pays FounderDraw rows, not records). */
export const COHORT_RECIPIENT_TYPES: Record<Exclude<Cohort, "FOUNDERS">, string[]> = {
  AMBASSADORS: ["AMBASSADOR"],
  WORKERS: ["WORKER"],
  EXECUTIVES: ["EXECUTIVE", "USER"],
};

export const COHORT_LABEL: Record<Cohort, string> = {
  AMBASSADORS: "Ambassadors",
  WORKERS: "Workers",
  EXECUTIVES: "Executives",
  FOUNDERS: "Founders",
};

export interface DueBatch {
  cohort: Cohort;
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM" in WAT. */
export function watMonthKey(d: Date): string {
  return watDateKey(d).slice(0, 7);
}

/** Day of the month (1–31) in WAT. */
export function watDayOfMonth(d: Date): number {
  return Number(watDateKey(d).slice(8, 10));
}

/** Shift a "YYYY-MM" key by whole months. */
export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The UTC midnights bounding a "YYYY-MM" key (informational period window). */
export function monthBounds(key: string): { start: Date; end: Date } {
  const [y, m] = key.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

export function isSaturday(d: Date): boolean {
  return watWeekday(d) === 5; // 0 = Monday … 5 = Saturday
}

export function isFirstOfMonth(d: Date): boolean {
  return watDayOfMonth(d) === 1;
}

/** Friday, with no further Friday left in the WAT month. */
export function isLastFridayOfMonth(d: Date): boolean {
  if (watWeekday(d) !== 4) return false; // 4 = Friday
  return watMonthKey(new Date(d.getTime() + 7 * DAY_MS)) !== watMonthKey(d);
}

/** The batches due to be built on this day (0, 1 or several). */
export function dueBatches(now: Date): DueBatch[] {
  const due: DueBatch[] = [];
  if (isSaturday(now)) {
    due.push({ cohort: "AMBASSADORS", periodKey: isoWeekKey(now), periodStart: weekStart(now), periodEnd: weekEnd(now) });
  }
  if (isLastFridayOfMonth(now)) {
    const key = watMonthKey(now);
    const b = monthBounds(key);
    due.push({ cohort: "WORKERS", periodKey: key, periodStart: b.start, periodEnd: b.end });
    due.push({ cohort: "EXECUTIVES", periodKey: key, periodStart: b.start, periodEnd: b.end });
  }
  if (isFirstOfMonth(now)) {
    const key = shiftMonthKey(watMonthKey(now), -1);
    const b = monthBounds(key);
    due.push({ cohort: "FOUNDERS", periodKey: key, periodStart: b.start, periodEnd: b.end });
  }
  return due;
}

/** The ten-minute undo window: emails go out, and undo closes, at this instant. */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

export function emailsScheduledFor(clearedAt: Date): Date {
  return new Date(clearedAt.getTime() + UNDO_WINDOW_MS);
}

/** Whether the undo window is still open at `now`. */
export function undoOpen(emailsScheduledAt: Date | null, now: Date): boolean {
  return emailsScheduledAt != null && emailsScheduledAt > now;
}
