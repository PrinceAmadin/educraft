/**
 * The training systems' own rules: the COO tutorials (a library on
 * /admin/tutorials, never a gate) and the worker training series (a gate on
 * the worker portal plus a Training tab). Episode data lives in the
 * `TrainingVideo` table; one person's progress in `TrainingWatch`, where the
 * absence of a row means unwatched.
 *
 * Pure — no database, no browser — so `check:training`, the pages and the
 * routes share one definition of "unlocked", "complete" and "gated". The
 * watching mechanics themselves (anti-skip, resume, rotate hints) are in
 * `video-rules.ts`, shared with the ambassador tour.
 *
 * Every sentence a COO or a worker reads is in `TUTORIALS_TEXT` /
 * `TRAINING_TEXT`, so the founder reviews the wording in one place.
 */

export const TRAINING_AUDIENCES = ["COO", "WORKER"] as const;
export type TrainingAudience = (typeof TRAINING_AUDIENCES)[number];

export function isTrainingAudience(value: string | null | undefined): value is TrainingAudience {
  return TRAINING_AUDIENCES.includes(value as TrainingAudience);
}

/** What the rules need to know about an episode. */
export interface EpisodeRule {
  id: string;
  episodeNo: number;
  videoUrl: string;
  requiredForGate: boolean;
  isPublished: boolean;
}

/** What the rules need to know about one person's progress on one episode. */
export interface WatchRule {
  videoId: string;
  watchedAt: Date | string | null;
}

/** An episode a viewer can actually watch: published, with a video uploaded. */
export function isPlayable(episode: EpisodeRule): boolean {
  return episode.isPublished && episode.videoUrl.trim() !== "";
}

/** The watchable series, in order. Drafts and URL-less episodes are nobody's business but the founder's. */
export function playableEpisodes<E extends EpisodeRule>(episodes: readonly E[]): E[] {
  return episodes.filter(isPlayable).sort((a, b) => a.episodeNo - b.episodeNo);
}

export function isWatched(watches: readonly WatchRule[], videoId: string): boolean {
  return watches.some((w) => w.videoId === videoId && w.watchedAt != null);
}

/**
 * Whether this episode may be played yet: every REQUIRED playable episode
 * before it is watched. An optional episode never blocks the one after it, so
 * marking an episode "not required" really does make it skippable.
 */
export function episodeUnlocked(
  episode: EpisodeRule,
  episodes: readonly EpisodeRule[],
  watches: readonly WatchRule[]
): boolean {
  if (!isPlayable(episode)) return false;
  return playableEpisodes(episodes)
    .filter((e) => e.episodeNo < episode.episodeNo && e.requiredForGate)
    .every((e) => isWatched(watches, e.id));
}

/** The first required episode still unwatched — what the gate plays next. Null = none left. */
export function nextRequired<E extends EpisodeRule>(
  episodes: readonly E[],
  watches: readonly WatchRule[]
): E | null {
  return playableEpisodes(episodes).find((e) => e.requiredForGate && !isWatched(watches, e.id)) ?? null;
}

/** Every required playable episode watched. True when nothing is published, so the gate is inert until the founder publishes. */
export function seriesComplete(episodes: readonly EpisodeRule[], watches: readonly WatchRule[]): boolean {
  return nextRequired(episodes, watches) == null;
}

/** How many of the playable episodes this person has watched, for "x of N". */
export function watchedCount(episodes: readonly EpisodeRule[], watches: readonly WatchRule[]): number {
  return playableEpisodes(episodes).filter((e) => isWatched(watches, e.id)).length;
}

/**
 * Whether a worker is held at the portal gate.
 *
 * - Nothing published with a video: never. The structure is inert until the
 *   founder publishes the series, which is his go-live switch.
 * - An executive's own worker record (CEO, COO): never. They built the thing.
 * - Otherwise: as long as any required episode is unwatched. Current workers
 *   are gated too (founder's call, 3 Nov 2026) — there is no backfill.
 */
export function needsTrainingGate(
  episodes: readonly EpisodeRule[],
  watches: readonly WatchRule[],
  isExecutive: boolean
): boolean {
  if (isExecutive) return false;
  return !seriesComplete(episodes, watches);
}

/** "3 of 9 watched" — one spelling everywhere. */
export function completeLine(watched: number, total: number): string {
  return `${watched} of ${total} watched`;
}

/** "Episode 4" — one spelling everywhere. */
export function episodeLabel(episodeNo: number): string {
  return `Episode ${episodeNo}`;
}

// ── Wording ─────────────────────────────────────────────────────────────────

/** Every sentence the COO tutorials page shows. */
export const TUTORIALS_TEXT = {
  pageTitle: "How operations works",
  pageDescription:
    "Your tutorials: the pipeline, the mode matrix, the quality system and what only you can judge. Watch them in order once; they stay here whenever you need them again.",
  neverWatched: "Not watched yet.",
  watchedPrefix: "Watched",
  startedNotFinished: "Started, not finished.",
  resumedNote: "Picking up where you stopped.",
  watchLabel: "Play this tutorial",
  loadError: "The video could not load. Check your connection and reload the page.",
  noEpisodes: "No tutorials are published yet.",
  /** Founder-only management strings live beside the components; these are what the COO reads. */
} as const;

/** Every sentence the worker training series shows. */
export const TRAINING_TEXT = {
  /** The gate. */
  gateTitle: "Welcome to EduCraft training",
  gateBody:
    "Before you take on work, watch the training series. Each episode unlocks the next, your place is saved as you go, and the whole series stays on your Training tab afterwards.",
  lockedHint: "Watch this episode to the end to unlock the next",
  nearlyThere: "Nearly there — keep going.",
  episodeDone: "Episode finished — the next one is open.",
  readyLine: "That is the series. You are all set.",
  nextLabel: "Next episode",
  continueLabel: "Continue to my dashboard",
  signOutLabel: "Sign out",
  resumedNote: "Picking up where you stopped.",
  loadError:
    "The episode could not load. Check your connection and reload the page — you will carry on from where you stopped.",
  /** Shown a few times while the phone is held upright: the video is 16:9. */
  rotateHint: "Turn your phone sideways for a bigger picture",

  /** The Training tab. */
  pageTitle: "Training",
  pageDescription: "How we work: the platform, the standard and your part in it, episode by episode.",
  lockedEpisode: "Locked — finish the episodes before it first",
  optionalTag: "Optional",
  neverWatched: "Not watched yet.",
  watchedPrefix: "Watched",
  upNext: "Up next",
  noEpisodes: "Your training episodes will appear here once they are published.",

  /** The one line added to the approval email while a series is published. */
  emailLine:
    "Your training series is waiting the first time you sign in — watch it through before you take on your first project.",
} as const;
