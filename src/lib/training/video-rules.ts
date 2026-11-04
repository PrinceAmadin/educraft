/**
 * The rules of watching a tutorial video, shared by every system that shows
 * one: the ambassador tour (`src/lib/ambassador-tour.ts` re-exports these, so
 * its public API and `check:tour` are unchanged), the COO tutorials and the
 * worker training series.
 *
 * Nothing here touches the database or the browser, so the check scripts and
 * the players share exactly one definition of "watched". Progress is always
 * the furthest point actually played, never a running total: dragging to the
 * end, setting `currentTime` from a console and re-watching the opening earn
 * nothing.
 */

/** Watched enough to count. Not 100%: the last seconds are the sign-off. */
export const WATCHED_FRACTION = 0.95;

/** How often a player saves its position, so a dropped connection resumes. */
export const PROGRESS_SAVE_SECONDS = 10;

/**
 * The largest jump that can count as watching. A real `timeupdate` moves by a
 * fraction of a second; anything larger is a seek, a stall recovering or a
 * backgrounded tab, and credits nothing.
 */
export const MAX_CREDITED_JUMP_SECONDS = 1.5;

/**
 * The fastest a gate player will run. Watching at double speed is still
 * watching; past it each `timeupdate` step grows larger than
 * `MAX_CREDITED_JUMP_SECONDS` and would earn nothing at all, which would look
 * broken rather than strict.
 */
export const MAX_PLAYBACK_RATE = 2;

/** The players' own controls, named for screen readers. */
export const PLAYER_CONTROLS = {
  play: "Play",
  pause: "Pause",
  mute: "Mute",
  unmute: "Unmute",
  fullscreen: "Full screen",
  progress: "How much of the video you have watched",
  rotate: "Turn the video sideways",
  unrotate: "Turn the video back upright",
} as const;

/** "1:35", "12:04". */
export function formatTimestamp(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** "about 6 minutes" — for a section, before the browser knows the duration. */
export function roughLength(durationSeconds: number | null): string | null {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const mins = Math.round(durationSeconds / 60);
  return mins <= 1 ? "about a minute" : `about ${mins} minutes`;
}

/** 0–100, for a progress line. A duration of 0 reads as 0, never NaN. */
export function watchedPercent(secondsWatched: number, durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const safe = Number.isFinite(secondsWatched) ? Math.max(0, secondsWatched) : 0;
  return Math.min(100, Math.round((safe / durationSeconds) * 100));
}

/** Watched enough of it to count as done. */
export function watchComplete(secondsWatched: number, durationSeconds: number): boolean {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return false;
  if (!Number.isFinite(secondsWatched) || secondsWatched <= 0) return false;
  return secondsWatched >= durationSeconds * WATCHED_FRACTION;
}

/**
 * How much of a `timeupdate` counts as watching.
 *
 * Only forward movement, and only small steps: dragging to the end, or the
 * `currentTime` being set from the console, moves far in one tick and earns
 * nothing. Rewinding earns nothing either — it is already paid for.
 */
export function creditedDelta(previousTime: number, currentTime: number): number {
  if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime)) return 0;
  const step = currentTime - previousTime;
  if (step <= 0) return 0;
  return step <= MAX_CREDITED_JUMP_SECONDS ? step : 0;
}

/** Where a player picks up: never the last second, so it can still be finished. */
export function resumeAt(secondsWatched: number, durationSeconds: number | null): number {
  const safe = Number.isFinite(secondsWatched) ? Math.max(0, secondsWatched) : 0;
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return safe;
  return Math.min(safe, Math.max(0, durationSeconds - 1));
}

/**
 * The anti-skip rule for a GATE player, as one decision the players and the
 * check scripts share.
 *
 * Given where progress stands, where playback was and where it now is, it
 * answers: how far have they legitimately watched, and must the element be
 * pulled back?
 *
 * - normal playback (a small forward step past the furthest point) advances it;
 * - a jump well past the furthest point is a seek: nothing is earned and
 *   playback is clamped back to where it had got to;
 * - re-watching an earlier stretch earns nothing, because progress is the
 *   furthest point reached and not a running total.
 */
export function advanceProgress(
  progress: number,
  previousTime: number,
  currentTime: number
): { progress: number; clampTo: number | null } {
  if (currentTime > progress + MAX_CREDITED_JUMP_SECONDS) {
    return { progress, clampTo: progress };
  }
  const step = creditedDelta(previousTime, currentTime);
  if (step > 0 && currentTime > progress) {
    return { progress: currentTime, clampTo: null };
  }
  return { progress, clampTo: null };
}

/**
 * The crediting rule for a TRACKED player (the COO tutorials): seeking is
 * free — nothing is clamped, nobody is held at a gate — but the watched tick
 * still means "really watched", so only small forward steps of real playback
 * past the furthest point earn progress. Skipping ahead and playing from
 * there earns nothing until playback comes back through the skipped stretch.
 */
export function advanceNoClamp(progress: number, previousTime: number, currentTime: number): number {
  const step = creditedDelta(previousTime, currentTime);
  if (step > 0 && currentTime > progress && currentTime - progress <= MAX_CREDITED_JUMP_SECONDS + step) {
    return currentTime;
  }
  return progress;
}

// ── Watching 16:9 on a phone held upright ───────────────────────────────────

/** How long each "turn your phone" hint stays on screen. */
export const ROTATE_HINT_VISIBLE_SECONDS = 6;

/**
 * When to show the "turn your phone sideways" hint, in seconds: just after
 * play, then a third and two thirds of the way through for anyone who picked
 * the phone up mid-video. Only ever shown while the phone is actually upright
 * and the video has not been turned. A hint that could not finish before the
 * video ends is dropped, so the close is never interrupted.
 */
export function rotateHintTimes(durationSeconds: number): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  const times = [4];
  if (durationSeconds >= 60) times.push(Math.round(durationSeconds / 3));
  if (durationSeconds >= 150) times.push(Math.round((durationSeconds * 2) / 3));
  return times.filter((t) => t + ROTATE_HINT_VISIBLE_SECONDS <= durationSeconds);
}

/**
 * Whether a hint belongs on screen at this position. A function of the
 * position alone, so there is no "already shown" bookkeeping to get wrong and
 * rewinding simply shows it again.
 */
export function rotateHintVisible(position: number, times: readonly number[]): boolean {
  if (!Number.isFinite(position)) return false;
  return times.some((t) => position >= t && position < t + ROTATE_HINT_VISIBLE_SECONDS);
}
