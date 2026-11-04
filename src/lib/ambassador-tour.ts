/**
 * The ambassador tutorial video: its rules and every sentence it shows.
 *
 * A new ambassador cannot use the portal until they have watched the tour once.
 * Afterwards it lives in "How the ambassador platform works" on their dashboard
 * home. Nothing here touches the database or the browser, so the check script
 * and the player share exactly one definition of "watched".
 *
 * The watching mechanics (anti-skip, resume, rotate hints) are shared with the
 * COO tutorials and the worker training series and live in
 * `src/lib/training/video-rules.ts`; this file re-exports them under its
 * original names so `check:tour`, the player and the gate are unchanged. What
 * stays here is what is the tour's alone: the version, the chapters, the gate
 * rule and the wording.
 *
 * The wording lives here for the same reason `ambassador-copy.ts` exists: the
 * founder reviews what an ambassador reads in one file, and it cannot drift
 * apart across the gate, the section and the emails.
 *
 * The video itself is NOT in this repo. It is a URL in Settings (the public
 * Blob store, or anywhere else https), so the structure ships before the video
 * exists and nothing renders until it does.
 */
import { watchComplete, PLAYER_CONTROLS } from "@/lib/training/video-rules";

export {
  WATCHED_FRACTION,
  PROGRESS_SAVE_SECONDS,
  MAX_CREDITED_JUMP_SECONDS,
  MAX_PLAYBACK_RATE,
  ROTATE_HINT_VISIBLE_SECONDS,
  formatTimestamp,
  roughLength,
  watchedPercent,
  creditedDelta,
  resumeAt,
  advanceProgress,
  rotateHintTimes,
  rotateHintVisible,
} from "@/lib/training/video-rules";

/** Watched enough of the tour to be let through. */
export const tourComplete = watchComplete;

/** The player's own controls, named for screen readers. */
export const TOUR_CONTROLS = PLAYER_CONTROLS;

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
  /** Shown a few times while the phone is held upright: the video is 16:9. */
  rotateHint: "Turn your phone sideways for a bigger picture",

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
