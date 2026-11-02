import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getAmbassadorTourVideo } from "@/lib/services/settings";
import { execRoleOfAmbassador } from "@/lib/services/executives";
import {
  TOUR_CHAPTERS,
  TOUR_VERSION,
  needsTour,
  resumeAt,
  tourComplete,
  type TourChapter,
} from "@/lib/ambassador-tour";

/**
 * Reads and writes one ambassador's progress through the tutorial video.
 *
 * The rule itself is pure (`src/lib/ambassador-tour.ts`) so `check:tour` and the
 * player agree on what "watched" means. This file is only the database and the
 * settings around it.
 */

export interface TourState {
  /** Empty when no video is configured — then nothing renders anywhere. */
  videoUrl: string;
  posterUrl: string;
  /** Held at the gate: cannot use the portal until it is watched. */
  required: boolean;
  /** Where the player picks up, in seconds. */
  startAt: number;
  secondsWatched: number;
  durationSeconds: number | null;
  watchedAt: Date | null;
  chapters: readonly TourChapter[];
}

const NO_TOUR: TourState = {
  videoUrl: "",
  posterUrl: "",
  required: false,
  startAt: 0,
  secondsWatched: 0,
  durationSeconds: null,
  watchedAt: null,
  chapters: [],
};

/**
 * The tour as it stands for this login, or `NO_TOUR` when there is no video or
 * no ambassador profile.
 *
 * The settings are read first on purpose: with no video configured this costs
 * one small query and stops, so the ambassador portal carries no weight at all
 * until the founder uploads the film.
 */
export async function getTourStateForUser(userId: string): Promise<TourState> {
  const { videoUrl, posterUrl } = await getAmbassadorTourVideo();
  if (!videoUrl) return NO_TOUR;

  const ambassador = await db.ambassador.findUnique({
    where: { userId },
    select: {
      id: true,
      tourVersion: true,
      tourWatchedAt: true,
      tourSecondsWatched: true,
      tourDurationSeconds: true,
    },
  });
  if (!ambassador) return NO_TOUR;

  // Only asked when the gate would otherwise fire, which — because every
  // ambassador that existed when this shipped was stamped by the backfill — is
  // rare. It catches an executive given a new ambassador record afterwards.
  const unwatched = ambassador.tourVersion !== TOUR_VERSION;
  const isExecutive = unwatched ? (await execRoleOfAmbassador(ambassador.id)) != null : false;

  return {
    videoUrl,
    posterUrl,
    required: needsTour(ambassador, true, isExecutive),
    startAt: resumeAt(ambassador.tourSecondsWatched, ambassador.tourDurationSeconds),
    secondsWatched: ambassador.tourSecondsWatched,
    durationSeconds: ambassador.tourDurationSeconds,
    watchedAt: ambassador.tourWatchedAt,
    chapters: TOUR_CHAPTERS,
  };
}

/**
 * Ambassadors who have not finished the current video.
 *
 * It has to spell out the NULL: in SQL `NOT (tourVersion = '1')` is NULL for a
 * row that has never been stamped, so a plain `NOT`/`not` filter silently
 * skips exactly the people the gate exists for — every brand-new ambassador.
 */
export const NOT_THIS_VERSION: Prisma.AmbassadorWhereInput = {
  OR: [{ tourVersion: null }, { tourVersion: { not: TOUR_VERSION } }],
};

export class TourError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "TourError";
  }
}

/**
 * Records how far an ambassador has watched, and marks the tour done once they
 * are past `WATCHED_FRACTION`.
 *
 * Every write is a claim, so two tabs, a replay of the same request or a
 * request arriving out of order cannot undo progress:
 *   - the position only ever moves forward (`tourSecondsWatched: { lt: … }`);
 *   - "finished" is stamped only while the stored version is not the current
 *     one, which makes it idempotent and still works when TOUR_VERSION is
 *     bumped for someone who finished the previous video.
 */
export async function saveTourProgress(
  ambassadorId: string,
  input: { secondsWatched: number; durationSeconds: number }
): Promise<{ watched: boolean; secondsWatched: number }> {
  const { videoUrl } = await getAmbassadorTourVideo();
  if (!videoUrl) throw new TourError("There is no tour to watch", 409);

  const duration = Math.round(input.durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 4 * 60 * 60) {
    throw new TourError("Unusable video length", 400);
  }
  // Clamped to the cut they are watching: a client claiming more than the video
  // is long proves nothing.
  const seconds = Math.min(Math.max(0, Math.round(input.secondsWatched)), duration);
  const finished = tourComplete(seconds, duration);
  const now = new Date();

  await db.ambassador.updateMany({
    where: { id: ambassadorId, tourSecondsWatched: { lt: seconds } },
    data: { tourSecondsWatched: seconds, tourDurationSeconds: duration },
  });
  await db.ambassador.updateMany({
    where: { id: ambassadorId, tourStartedAt: null },
    data: { tourStartedAt: now },
  });
  if (finished) {
    await db.ambassador.updateMany({
      where: { id: ambassadorId, ...NOT_THIS_VERSION },
      data: { tourVersion: TOUR_VERSION, tourWatchedAt: now },
    });
  }

  const after = await db.ambassador.findUnique({
    where: { id: ambassadorId },
    select: { tourVersion: true, tourSecondsWatched: true },
  });
  return {
    watched: after?.tourVersion === TOUR_VERSION,
    secondsWatched: after?.tourSecondsWatched ?? seconds,
  };
}
