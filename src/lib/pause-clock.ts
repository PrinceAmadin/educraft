/**
 * The deadline clock while a project waits for its client: the paused span is
 * added back onto the dates when the wait ends. One rule for both pauses, the
 * AWAITING_CLIENT_INPUT status and a report's data pause (D4). Pure.
 */

const DAY_MS = 86_400_000;

/** Whole days paused, rounded up (a paused afternoon counts as a day); never negative. */
export function pausedDaysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / DAY_MS));
}

/** The project fields to write when a pause of `days` ends: both dates move on, and the running total grows. */
export function shiftedDeadlines(
  project: { internalDeadline: Date | null; expectedDeliveryAt: Date | null },
  days: number
): { internalDeadline?: Date; expectedDeliveryAt?: Date; deadlinePausedDays?: { increment: number } } {
  if (days <= 0) return {};
  return {
    deadlinePausedDays: { increment: days },
    ...(project.internalDeadline ? { internalDeadline: new Date(project.internalDeadline.getTime() + days * DAY_MS) } : {}),
    // The client's date waits for them too.
    ...(project.expectedDeliveryAt ? { expectedDeliveryAt: new Date(project.expectedDeliveryAt.getTime() + days * DAY_MS) } : {}),
  };
}

// ── Is the clock paused right now? ──────────────────────────────────────────

/**
 * Why a project's clock is stopped. `deadlinePausedAt` is the one field that
 * says it is stopped, whatever stopped it; the status says what to call it.
 * A project paused while still IN_PROGRESS is waiting on its data files.
 */
export type PauseReason = "CLIENT_INPUT" | "HOLD" | "DISPUTE" | "DATA";

export interface ClockPause {
  /** When the clock stopped. */
  since: Date;
  /** Whole days paused so far — the days a resume will add back. */
  days: number;
  reason: PauseReason;
  /** What staff see on the chip: "Paused · 41 days". */
  label: string;
  /** The line under it: why it is paused. */
  detail: string;
}

/** What staff read on a paused project. Plain words, no jargon. */
export const PAUSE_TEXT: Record<PauseReason, string> = {
  CLIENT_INPUT: "Waiting on the client",
  HOLD: "Put on hold by EduCraft",
  DISPUTE: "Held while we look into a dispute",
  DATA: "Waiting for the client's data files",
};

/**
 * Statuses that mean the work is stopped whatever the clock says. A project
 * held before the clock was wired up has no `deadlinePausedAt`, and it must
 * still never read as late for standing still.
 */
const HELD_STATUSES = new Set(["ON_HOLD", "DISPUTED"]);

function reasonFor(status: string): PauseReason {
  if (status === "AWAITING_CLIENT_INPUT") return "CLIENT_INPUT";
  if (status === "ON_HOLD") return "HOLD";
  if (status === "DISPUTED") return "DISPUTE";
  return "DATA";
}

/** Whole days a running pause has lasted so far. */
export function pausedSoFar(pausedAt: Date | string | null | undefined, now: Date = new Date()): number {
  if (!pausedAt) return 0;
  const at = pausedAt instanceof Date ? pausedAt : new Date(pausedAt);
  if (Number.isNaN(at.getTime())) return 0;
  return pausedDaysBetween(at, now);
}

/**
 * The pause a project is under right now, or null when its clock is running.
 * Pure: every screen asks this one question so they all agree.
 */
export function clockPause(
  project: { status: string; deadlinePausedAt: Date | string | null | undefined },
  now: Date = new Date()
): ClockPause | null {
  const stamped = project.deadlinePausedAt
    ? project.deadlinePausedAt instanceof Date
      ? project.deadlinePausedAt
      : new Date(project.deadlinePausedAt)
    : null;
  const valid = stamped && !Number.isNaN(stamped.getTime()) ? stamped : null;

  // Held, but nothing recorded when: say it is paused and never call it late.
  // No day count, because we do not know it, and the date does not move.
  if (!valid) {
    if (!HELD_STATUSES.has(project.status)) return null;
    const reason = reasonFor(project.status);
    return { since: now, days: 0, reason, label: "Paused", detail: PAUSE_TEXT[reason] };
  }

  const since = valid;
  const days = pausedDaysBetween(since, now);
  const reason = reasonFor(project.status);
  return {
    since,
    days,
    reason,
    label: days <= 0 ? "Paused" : `Paused · ${days} day${days === 1 ? "" : "s"}`,
    detail: PAUSE_TEXT[reason],
  };
}

/**
 * The deadline as it stands today. While the clock is paused the date moves
 * with the pause — the very days the resume will add back — so a paused
 * project keeps the time it had left instead of drifting into "overdue"
 * for every day it waits. Running clock: the date is unchanged.
 */
export function liveDeadline(
  deadline: Date | string | null | undefined,
  pause: ClockPause | null,
  _now?: Date
): Date | null {
  if (deadline == null) return null;
  const d = deadline instanceof Date ? deadline : new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  if (!pause || pause.days <= 0) return d;
  return new Date(d.getTime() + pause.days * DAY_MS);
}
