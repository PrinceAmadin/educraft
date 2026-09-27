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
