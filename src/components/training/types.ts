/** The serializable episode shape the training pages hand their client components. */
export function toEpisodeProps(
  e: Omit<EpisodeProps, "watchedAt" | "startedAt" | "quizPassedAt"> & {
    watchedAt: Date | null;
    startedAt: Date | null;
    quizPassedAt: Date | null;
  }
): EpisodeProps {
  return {
    ...e,
    watchedAt: e.watchedAt?.toISOString() ?? null,
    startedAt: e.startedAt?.toISOString() ?? null,
    quizPassedAt: e.quizPassedAt?.toISOString() ?? null,
  };
}

export interface EpisodeProps {
  id: string;
  episodeNo: number;
  title: string;
  description: string | null;
  videoUrl: string;
  posterUrl: string;
  durationSeconds: number | null;
  requiredForGate: boolean;
  /** This viewer's progress. */
  secondsWatched: number;
  startAt: number;
  /** ISO dates, or null. */
  watchedAt: string | null;
  startedAt: string | null;
  /** Phase 3: the episode has a quiz, and whether this viewer has passed it. */
  hasQuiz: boolean;
  quizPassedAt: string | null;
  /** Watched and (if it has a quiz) the quiz passed. */
  complete: boolean;
  /** Worker series: may this viewer play it yet? */
  unlocked: boolean;
}
