/**
 * The ambassador tutorial video: its rules and every sentence it shows.
 *
 * A new ambassador cannot use the portal until they have watched the tour once.
 * Afterwards it lives in "How the ambassador platform works" on their dashboard
 * home. Nothing here touches the database or the browser, so the check script
 * and the player share exactly one definition of "watched".
 *
 * The wording lives here for the same reason `ambassador-copy.ts` exists: the
 * founder reviews what an ambassador reads in one file, and it cannot drift
 * apart across the gate, the section and the emails.
 *
 * The video itself is NOT in this repo. It is a URL in Settings (the public
 * Blob store, or anywhere else https), so the structure ships before the video
 * exists and nothing renders until it does.
 */

export interface TourChapter {
  title: string;
  /** Where the chapter starts, in seconds from 0. */
  startSeconds: number;
}

/**
 * Bump this and every ambassador watches the new video once — including people
 * who finished the old one. Leave it alone when only re-uploading the same cut.
 */
export const TOUR_VERSION = "1";

/** Watched enough to continue. Not 100%: the last seconds are the sign-off. */
export const WATCHED_FRACTION = 0.95;

/** How often the player saves its position, so a dropped connection resumes. */
export const PROGRESS_SAVE_SECONDS = 10;

/**
 * The largest jump that can count as watching. A real `timeupdate` moves by a
 * fraction of a second; anything larger is a seek, a stall recovering or a
 * backgrounded tab, and credits nothing.
 */
export const MAX_CREDITED_JUMP_SECONDS = 1.5;

/**
 * The chapters, filled in from the approved script once the final cut is
 * rendered and the real start seconds are known (see
 * `docs/ambassador-tour-script.md`). Empty is a valid state: the section then
 * shows the player with no chapter list.
 */
export const TOUR_CHAPTERS: readonly TourChapter[] = [];

/** Every sentence the tour shows an ambassador. */
export const TOUR_TEXT = {
  /** The gate. */
  gateTitle: "Welcome to EduCraft",
  gateBody:
    "Before you start, here is a short tour of your dashboard. It runs about six minutes and covers everything you need. Watch it through once and it will be waiting on your dashboard whenever you want it again.",
  lockedHint: "Watch to the end to continue",
  nearlyThere: "Nearly there — keep going.",
  readyLine: "That is the tour. You are all set.",
  continueLabel: "Continue to my dashboard",
  signOutLabel: "Sign out",
  resumedNote: "Picking up where you stopped.",
  loadError:
    "The tour could not load. Check your connection and reload the page — you will carry on from where you stopped.",

  /** The permanent section on the dashboard home. */
  sectionTitle: "How the ambassador platform works",
  sectionBody:
    "The full tour of your dashboard — your link, your referrals, your commissions and how you move up a tier.",
  sectionChapters: "What is in it",
  watchLabel: "Play the tour",
  neverWatched: "You have not watched this yet.",

  /** The one line added to the welcome email. */
  emailLine:
    "A short tour of your dashboard is waiting the first time you sign in — it takes about six minutes and explains everything.",
} as const;

/** The player's own controls, named for screen readers. */
export const TOUR_CONTROLS = {
  play: "Play",
  pause: "Pause",
  mute: "Mute",
  unmute: "Unmute",
  fullscreen: "Full screen",
  progress: "How much of the tour you have watched",
} as const;

/** "1:35", "12:04". */
export function formatTimestamp(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** "about 6 minutes" — for the section, before the browser knows the duration. */
export function roughLength(durationSeconds: number | null): string | null {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const mins = Math.round(durationSeconds / 60);
  return mins <= 1 ? "about a minute" : `about ${mins} minutes`;
}

/** 0–100, for the gate's progress line. A duration of 0 reads as 0, never NaN. */
export function watchedPercent(secondsWatched: number, durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const safe = Number.isFinite(secondsWatched) ? Math.max(0, secondsWatched) : 0;
  return Math.min(100, Math.round((safe / durationSeconds) * 100));
}

/** Watched enough of it to be let through. */
export function tourComplete(secondsWatched: number, durationSeconds: number): boolean {
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

/**
 * Whether this ambassador is held at the gate.
 *
 * - No video configured: never. The structure is inert until a URL is set.
 * - An executive's own ambassador record (CEO, CFO, HOG, COO): never. They
 *   built the thing.
 * - Anyone who already finished THIS version: never. Existing ambassadors are
 *   stamped by `ambassadors:tour-backfill`, so the gate only ever meets people
 *   approved after it shipped.
 */
export function needsTour(
  ambassador: { tourVersion: string | null },
  hasVideo: boolean,
  isExecutive: boolean
): boolean {
  if (!hasVideo) return false;
  if (isExecutive) return false;
  return ambassador.tourVersion !== TOUR_VERSION;
}

/** Where the player picks up: never the last second, so it can still be finished. */
export function resumeAt(secondsWatched: number, durationSeconds: number | null): number {
  const safe = Number.isFinite(secondsWatched) ? Math.max(0, secondsWatched) : 0;
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return safe;
  return Math.min(safe, Math.max(0, durationSeconds - 1));
}

/**
 * The anti-skip rule, as one decision the player and `check:tour` share.
 *
 * Given where progress stands, where playback was and where it now is, it
 * answers: how far have they legitimately watched, and must the element be
 * pulled back?
 *
 * - normal playback (a small forward step past the furthest point) advances it;
 * - a jump well past the furthest point is a seek: nothing is earned and
 *   playback is clamped back to where it had got to;
 * - re-watching an earlier stretch earns nothing, because progress is the
 *   furthest point reached and not a running total. Watching the first minute
 *   twenty times still leaves you one minute in.
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
 * The fastest the gate's player will run. Watching at double speed is still
 * watching, so this is not a punishment; past it each `timeupdate` step grows
 * larger than `MAX_CREDITED_JUMP_SECONDS` and would earn nothing at all, which
 * would look broken rather than strict.
 */
export const MAX_PLAYBACK_RATE = 2;
