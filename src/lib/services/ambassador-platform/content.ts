import { db } from "@/lib/db";
import { dayOfWeek, isoWeekKey, lastWeeks, shortDay, watDateKey, watWeekday, weekEnd, weekStart } from "@/lib/ambassadors/weeks";
import { CAMPAIGN_LEAD_WEEKS, CAMPAIGN_MILESTONES, CONSISTENCY_GOOD, CONTENT_LABELS, RHYTHM, type ContentType, type MilestoneKey, type RhythmType } from "@/lib/ambassadors/content-types";
import { monthLabel } from "@/lib/services/finance/surplus";

/**
 * The HOG's WhatsApp rhythm (Phase 3 Section 1 / Section 8): Monday content
 * drop, Wednesday check-in, Friday spotlight. `AmbassadorContentLog` is the
 * record of what was actually posted; everything else is derived. Weeks are
 * Monday-start ISO weeks in WAT (a Monday flier logged on Tuesday still
 * fills that week's Monday slot).
 */

export { CONTENT_TYPES, CONTENT_LABELS, RHYTHM } from "@/lib/ambassadors/content-types";
export type { ContentType } from "@/lib/ambassadors/content-types";

const DAY = 86_400_000;

export type RhythmState = "DONE" | "DUE_TODAY" | "UPCOMING" | "MISSED";

export interface RhythmDay {
  type: RhythmType;
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

function stateFor(posted: boolean, due: Date, now: Date): RhythmState {
  if (posted) return "DONE";
  const dueKey = watDateKey(due);
  const todayKey = watDateKey(now);
  return dueKey === todayKey ? "DUE_TODAY" : dueKey < todayKey ? "MISSED" : "UPCOMING";
}

/** This week's three posts and where each stands. */
export async function weekRhythm(now: Date = new Date()): Promise<WeekRhythm> {
  const week = isoWeekKey(now);
  const logs = await db.ambassadorContentLog.findMany({ where: { week }, orderBy: { postedAt: "asc" }, select: { contentType: true, postedAt: true, note: true } });
  const days: RhythmDay[] = RHYTHM.map((r) => {
    const log = logs.find((l) => l.contentType === r.type);
    const due = dayOfWeek(now, r.weekday);
    return { type: r.type, day: r.day, label: CONTENT_LABELS[r.type], action: r.action, date: watDateKey(due), state: stateFor(Boolean(log), due, now), postedAt: log?.postedAt.toISOString() ?? null, note: log?.note ?? null };
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

/** Undo a mistaken log. */
export async function deleteContentLog(id: string): Promise<boolean> {
  const res = await db.ambassadorContentLog.deleteMany({ where: { id } });
  return res.count === 1;
}

// ── Monthly calendar ─────────────────────────────────────────────────────

export interface CalendarSlot {
  type: RhythmType;
  label: string;
  due: string;
  state: RhythmState;
  logId: string | null;
  postedAt: string | null;
  note: string | null;
}

export interface CalendarWeek {
  week: string;
  /** "31 Aug – 6 Sep" */
  label: string;
  isCurrent: boolean;
  slots: CalendarSlot[];
  others: { id: string; postedAt: string; note: string | null }[];
}

export interface ContentCalendar {
  month: string;
  label: string;
  weeks: CalendarWeek[];
}

/** Every Monday-start week that touches the month, with its three posts and any extra ones. */
export async function monthCalendar(month: string, now: Date = new Date()): Promise<ContentCalendar> {
  const [y, m] = month.split("-").map(Number);
  // Noon WAT on the 1st, and the first instant of next month in WAT (00:00 WAT = 23:00 UTC the day before).
  const first = new Date(Date.UTC(y, m - 1, 1, 11));
  const monthEnd = new Date(Date.UTC(y, m, 1) - 3_600_000);
  const starts: Date[] = [];
  for (let s = weekStart(first); s.getTime() < monthEnd.getTime(); s = new Date(s.getTime() + 7 * DAY)) starts.push(s);
  const keys = starts.map((s) => isoWeekKey(new Date(s.getTime() + 12 * 3_600_000)));
  const logs = await db.ambassadorContentLog.findMany({ where: { week: { in: keys } }, orderBy: { postedAt: "asc" }, select: { id: true, week: true, contentType: true, postedAt: true, note: true } });
  const currentKey = isoWeekKey(now);
  return {
    month,
    label: monthLabel(month),
    weeks: starts.map((start, i) => {
      const key = keys[i];
      const mine = logs.filter((l) => l.week === key);
      return {
        week: key,
        label: `${shortDay(start)} – ${shortDay(new Date(start.getTime() + 6 * DAY + 3_600_000))}`,
        isCurrent: key === currentKey,
        slots: RHYTHM.map((r) => {
          const log = mine.find((l) => l.contentType === r.type);
          const due = new Date(start.getTime() + r.weekday * DAY);
          return { type: r.type, label: CONTENT_LABELS[r.type], due: due.toISOString(), state: stateFor(Boolean(log), due, now), logId: log?.id ?? null, postedAt: log?.postedAt.toISOString() ?? null, note: log?.note ?? null };
        }),
        others: mine.filter((l) => l.contentType === "OTHER").map((l) => ({ id: l.id, postedAt: l.postedAt.toISOString(), note: l.note })),
      };
    }),
  };
}

// ── Consistency analytics (last 12 completed weeks) ──────────────────────

export interface ConsistencyRow {
  type: RhythmType;
  label: string;
  weeks: number;
  of: number;
  percent: number;
  status: "ON_TARGET" | "GOOD" | "WARN";
}

export interface ContentConsistency {
  weeks: number;
  from: string;
  to: string;
  rows: ConsistencyRow[];
  correlation: {
    weeksAllThree: number;
    weeksMissing: number;
    avgAllThree: number | null;
    avgMissing: number | null;
    /** +50 means 50% more conversions in weeks with all three posts. Null when either group is empty or the baseline is zero. */
    impactPercent: number | null;
  };
}

/**
 * How consistently each post went out over the last 12 full weeks (the
 * current week is left out: it may not have reached Friday yet), and the
 * conversions in weeks with all three posts against weeks missing one — a
 * visible pattern, not a statistical claim.
 */
export async function contentConsistency(now: Date = new Date()): Promise<ContentConsistency> {
  const weeks = lastWeeks(13, now).slice(0, 12);
  const keys = weeks.map((w) => w.key);
  const [logs, conversions] = await Promise.all([
    db.ambassadorContentLog.findMany({ where: { week: { in: keys }, contentType: { in: RHYTHM.map((r) => r.type) } }, select: { week: true, contentType: true } }),
    db.ambassadorReferral.findMany({ where: { status: "CONVERTED", convertedAt: { gte: weeks[0].start, lt: weeks[weeks.length - 1].end } }, select: { convertedAt: true } }),
  ]);
  const has = (week: string, type: string) => logs.some((l) => l.week === week && l.contentType === type);
  const rows: ConsistencyRow[] = RHYTHM.map((r) => {
    const count = keys.filter((k) => has(k, r.type)).length;
    const percent = Math.round((count / keys.length) * 100);
    return { type: r.type, label: CONTENT_LABELS[r.type], weeks: count, of: keys.length, percent, status: percent >= 100 ? "ON_TARGET" : percent >= CONSISTENCY_GOOD ? "GOOD" : "WARN" };
  });
  const perWeek = weeks.map((w) => conversions.filter((c) => c.convertedAt! >= w.start && c.convertedAt! < w.end).length);
  const all = weeks.map((w) => RHYTHM.every((r) => has(w.key, r.type)));
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
  const withAll = perWeek.filter((_, i) => all[i]);
  const without = perWeek.filter((_, i) => !all[i]);
  const avgAllThree = avg(withAll);
  const avgMissing = avg(without);
  return {
    weeks: weeks.length,
    from: weeks[0].start.toISOString(),
    to: new Date(weeks[weeks.length - 1].end.getTime() - 1).toISOString(),
    rows,
    correlation: {
      weeksAllThree: withAll.length,
      weeksMissing: without.length,
      avgAllThree,
      avgMissing,
      impactPercent: avgAllThree != null && avgMissing != null && avgMissing > 0 ? Math.round(((avgAllThree - avgMissing) / avgMissing) * 100) : null,
    },
  };
}

// ── Pre-season campaign tracker ──────────────────────────────────────────

const CAMPAIGN_KEY = "ambassador_campaign";

interface CampaignConfig {
  label: string;
  /** YYYY-MM-DD */
  semesterStart: string;
  done: MilestoneKey[];
}

export type MilestoneState = "DONE" | "THIS_WEEK" | "PLANNED" | "MISSED" | "BEGUN";

export interface CampaignView {
  label: string;
  semesterStart: string;
  campaignStart: string;
  /** Whole weeks until the campaign starts (0 once it has started). */
  weeksAway: number;
  milestones: { key: MilestoneKey; label: string; weeksBefore: number; date: string; state: MilestoneState; done: boolean }[];
}

async function readCampaign(): Promise<CampaignConfig | null> {
  const row = await db.setting.findUnique({ where: { key: CAMPAIGN_KEY } });
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as Partial<CampaignConfig>;
    if (!parsed.semesterStart || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.semesterStart)) return null;
    return { label: parsed.label || "Next semester", semesterStart: parsed.semesterStart, done: (parsed.done ?? []).filter((k): k is MilestoneKey => CAMPAIGN_MILESTONES.some((m) => m.key === k)) };
  } catch {
    return null;
  }
}

async function writeCampaign(config: CampaignConfig): Promise<void> {
  const value = JSON.stringify(config);
  await db.setting.upsert({ where: { key: CAMPAIGN_KEY }, create: { key: CAMPAIGN_KEY, value }, update: { value } });
}

export async function getCampaign(now: Date = new Date()): Promise<CampaignView | null> {
  const c = await readCampaign();
  if (!c) return null;
  const start = new Date(`${c.semesterStart}T00:00:00.000Z`);
  const campaignStart = new Date(start.getTime() - CAMPAIGN_LEAD_WEEKS * 7 * DAY);
  const thisWeek = weekStart(now);
  const nextWeek = weekEnd(now);
  return {
    label: c.label,
    semesterStart: c.semesterStart,
    campaignStart: campaignStart.toISOString().slice(0, 10),
    weeksAway: Math.max(0, Math.ceil((campaignStart.getTime() - now.getTime()) / (7 * DAY))),
    milestones: CAMPAIGN_MILESTONES.map((m) => {
      const date = new Date(start.getTime() - m.weeksBefore * 7 * DAY);
      const done = c.done.includes(m.key);
      // Compare by the WAT day at noon so the milestone's own day counts as "this week".
      const at = new Date(date.getTime() + 11 * 3_600_000);
      const state: MilestoneState = done ? "DONE" : at >= thisWeek && at < nextWeek ? "THIS_WEEK" : at >= nextWeek ? "PLANNED" : m.key === "SEMESTER" ? "BEGUN" : "MISSED";
      return { key: m.key, label: m.label, weeksBefore: m.weeksBefore, date: date.toISOString().slice(0, 10), state, done };
    }),
  };
}

/** Set (or change) the next semester. A new start date begins a fresh campaign. */
export async function saveCampaign(input: { label: string; semesterStart: string }): Promise<void> {
  const current = await readCampaign();
  await writeCampaign({ label: input.label.trim(), semesterStart: input.semesterStart, done: current && current.semesterStart === input.semesterStart ? current.done : [] });
}

export class CampaignError extends Error {}

export async function setMilestoneDone(key: MilestoneKey, done: boolean): Promise<void> {
  const current = await readCampaign();
  if (!current) throw new CampaignError("Set the semester start date first");
  const set = new Set(current.done);
  if (done) set.add(key);
  else set.delete(key);
  await writeCampaign({ ...current, done: CAMPAIGN_MILESTONES.map((m) => m.key).filter((k) => set.has(k)) });
}
