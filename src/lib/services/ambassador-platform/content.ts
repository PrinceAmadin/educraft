import { db } from "@/lib/db";
import { dayOfWeek, isoWeekKey, shortDay, watDateKey, watWeekday, weekEnd, weekStart } from "@/lib/ambassadors/weeks";

/**
 * The HOG's WhatsApp rhythm (Phase 3 Section 1 / Section 8): Monday content
 * drop, Wednesday check-in, Friday spotlight. `AmbassadorContentLog` is the
 * record of what was actually posted; everything else is derived.
 */

export const CONTENT_TYPES = ["MONDAY_FLIER", "WEDS_CHECKIN", "FRIDAY_SPOTLIGHT", "OTHER"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_LABELS: Record<ContentType, string> = {
  MONDAY_FLIER: "Content drop",
  WEDS_CHECKIN: "Midweek check-in",
  FRIDAY_SPOTLIGHT: "Weekly spotlight",
  OTHER: "Other post",
};

/** Which weekday (0 = Monday) each rhythm post belongs to. */
export const RHYTHM: { type: Exclude<ContentType, "OTHER">; weekday: number; day: string; action: string }[] = [
  { type: "MONDAY_FLIER", weekday: 0, day: "Monday", action: "Upload flier" },
  { type: "WEDS_CHECKIN", weekday: 2, day: "Wednesday", action: "Post check-in" },
  { type: "FRIDAY_SPOTLIGHT", weekday: 4, day: "Friday", action: "Pick winner" },
];

export type RhythmState = "DONE" | "DUE_TODAY" | "UPCOMING" | "MISSED";

export interface RhythmDay {
  type: Exclude<ContentType, "OTHER">;
  day: string;
  label: string;
  action: string;
  date: string;
  state: RhythmState;
  postedAt: string | null;
  note: string | null;
}

export interface WeekRhythm {
  week: string;
  /** "15 – 21 Sep" */
  label: string;
  days: RhythmDay[];
}

/** This week's three posts and where each stands. */
export async function weekRhythm(now: Date = new Date()): Promise<WeekRhythm> {
  const week = isoWeekKey(now);
  const logs = await db.ambassadorContentLog.findMany({ where: { week }, orderBy: { postedAt: "asc" }, select: { contentType: true, postedAt: true, note: true } });
  const today = watWeekday(now);
  const days: RhythmDay[] = RHYTHM.map((r) => {
    const log = logs.find((l) => l.contentType === r.type);
    const state: RhythmState = log ? "DONE" : today === r.weekday ? "DUE_TODAY" : today > r.weekday ? "MISSED" : "UPCOMING";
    return { type: r.type, day: r.day, label: CONTENT_LABELS[r.type], action: r.action, date: watDateKey(dayOfWeek(now, r.weekday)), state, postedAt: log?.postedAt.toISOString() ?? null, note: log?.note ?? null };
  });
  const start = weekStart(now);
  const end = new Date(weekEnd(now).getTime() - 1);
  return { week, label: `${shortDay(start)} – ${shortDay(end)}`, days };
}

export interface LogContentInput {
  contentType: ContentType;
  /** ISO date-time; defaults to now. */
  postedAt?: string;
  note?: string;
}

/** "Log content posted": one row per post, keyed to the ISO week it was posted in. */
export async function logContent(input: LogContentInput, loggedBy: string): Promise<{ id: string; week: string }> {
  const postedAt = input.postedAt ? new Date(input.postedAt) : new Date();
  const week = isoWeekKey(postedAt);
  return db.ambassadorContentLog.create({
    data: { contentType: input.contentType, postedAt, week, note: input.note?.trim() || null, loggedBy },
    select: { id: true, week: true },
  });
}
