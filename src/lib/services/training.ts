import { db } from "@/lib/db";
import { execRoleOfWorker } from "@/lib/services/executives";
import { resumeAt, watchComplete } from "@/lib/training/video-rules";
import {
  completedCount,
  episodeComplete,
  episodeUnlocked,
  needsTrainingGate,
  nextRequired,
  playableEpisodes,
  quizPassPercentFor,
  scoreQuiz,
  shuffled,
  watchedCount,
  type EpisodeRule,
  type TrainingAudience,
  type WatchRule,
} from "@/lib/training/rules";

/**
 * Reads and writes the training videos: the COO tutorials and the worker
 * series. The rules themselves are pure (`src/lib/training/rules.ts` and
 * `video-rules.ts`) so `check:training`, the players and these writes agree on
 * what "watched", "unlocked" and "gated" mean; this file is only the database
 * around them.
 *
 * Progress is one `TrainingWatch` row per person per episode, and every write
 * is a claim (position only moves forward, "started" and "watched" are
 * stamped once), so two tabs, a replayed request or requests arriving out of
 * order cannot undo anything.
 */

export class TrainingError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "TrainingError";
  }
}

const EPISODE_SELECT = {
  id: true,
  audience: true,
  episodeNo: true,
  title: true,
  description: true,
  videoUrl: true,
  posterUrl: true,
  durationSeconds: true,
  requiredForGate: true,
  isPublished: true,
  quizPassPercent: true,
} as const;

type EpisodeRow = {
  id: string;
  episodeNo: number;
  title: string;
  description: string | null;
  videoUrl: string;
  posterUrl: string;
  durationSeconds: number | null;
  requiredForGate: boolean;
  isPublished: boolean;
  quizPassPercent: number | null;
};

type WatchRow = {
  videoId: string;
  secondsWatched: number;
  watchedAt: Date | null;
  startedAt: Date | null;
  quizPassedAt: Date | null;
};

/** The set of episode ids (among `ids`) that carry at least one active quiz question. */
async function quizEpisodeIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db.trainingQuizQuestion.groupBy({
    by: ["videoId"],
    where: { isActive: true, videoId: { in: ids } },
    _count: { videoId: true },
  });
  return new Set(rows.filter((r) => r._count.videoId > 0).map((r) => r.videoId));
}

/** DB episodes as the rule functions see them, with `hasQuiz` filled in. */
function asRules(episodes: readonly EpisodeRow[], quizIds: Set<string>): (EpisodeRow & EpisodeRule)[] {
  return episodes.map((e) => ({ ...e, hasQuiz: quizIds.has(e.id) }));
}

export interface EpisodeView {
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
  watchedAt: Date | null;
  startedAt: Date | null;
  /** Phase 3: this episode has a quiz, and whether this viewer has passed it. */
  hasQuiz: boolean;
  quizPassedAt: Date | null;
  /** Watched and (if it has a quiz) the quiz passed. */
  complete: boolean;
  /** Worker series only: may this viewer play it yet? */
  unlocked: boolean;
}

function toViews(episodes: readonly EpisodeRow[], watches: WatchRow[], quizIds: Set<string>, withUnlock: boolean): EpisodeView[] {
  const byId = new Map(watches.map((w) => [w.videoId, w]));
  const rules = asRules(episodes, quizIds);
  return playableEpisodes(rules).map((e) => {
    const w = byId.get(e.id);
    return {
      id: e.id,
      episodeNo: e.episodeNo,
      title: e.title,
      description: e.description,
      videoUrl: e.videoUrl,
      posterUrl: e.posterUrl,
      durationSeconds: e.durationSeconds,
      requiredForGate: e.requiredForGate,
      secondsWatched: w?.secondsWatched ?? 0,
      startAt: resumeAt(w?.secondsWatched ?? 0, e.durationSeconds),
      watchedAt: w?.watchedAt ?? null,
      startedAt: w?.startedAt ?? null,
      hasQuiz: e.hasQuiz ?? false,
      quizPassedAt: w?.quizPassedAt ?? null,
      complete: episodeComplete(e, watches),
      unlocked: withUnlock ? episodeUnlocked(e, rules, watches) : true,
    };
  });
}

// ── The COO tutorials ───────────────────────────────────────────────────────

export interface TutorialsState {
  episodes: EpisodeView[];
  watched: number;
  total: number;
}

/** The published COO tutorials with this login's own progress. */
export async function getTutorialsState(userId: string): Promise<TutorialsState> {
  const episodes = (await db.trainingVideo.findMany({
    where: { audience: "COO" satisfies TrainingAudience, isPublished: true },
    select: EPISODE_SELECT,
    orderBy: { episodeNo: "asc" },
  })) as EpisodeRow[];
  const playable = playableEpisodes(episodes);
  if (playable.length === 0) return { episodes: [], watched: 0, total: 0 };

  // COO tutorials carry no quizzes, but reading the (empty) set keeps one code
  // path; `watched` is the only count that matters on a library with no gate.
  const quizIds = await quizEpisodeIds(playable.map((e) => e.id));
  const watches = (await db.trainingWatch.findMany({
    where: { userId, videoId: { in: playable.map((e) => e.id) } },
    select: { videoId: true, secondsWatched: true, watchedAt: true, startedAt: true, quizPassedAt: true },
  })) as WatchRow[];
  return {
    episodes: toViews(episodes, watches, quizIds, false),
    watched: watchedCount(episodes, watches),
    total: playable.length,
  };
}

// ── The worker series ───────────────────────────────────────────────────────

export interface WorkerTrainingState {
  /** Held at the portal gate until the required episodes are complete. */
  gated: boolean;
  episodes: EpisodeView[];
  /** The episode the gate shows next. Null once the series is complete. */
  nextRequiredId: string | null;
  /** Episodes watched, and episodes fully completed (watched + quiz). */
  watched: number;
  completed: number;
  total: number;
}

const NO_TRAINING: WorkerTrainingState = {
  gated: false,
  episodes: [],
  nextRequiredId: null,
  watched: 0,
  completed: 0,
  total: 0,
};

/**
 * The worker series as it stands for this login. The published count is read
 * first on purpose: with nothing published this costs one small query and
 * stops, so the worker portal carries no weight until the founder publishes
 * the series — his go-live switch.
 */
export async function getWorkerTrainingState(userId: string): Promise<WorkerTrainingState> {
  const episodes = (await db.trainingVideo.findMany({
    where: { audience: "WORKER" satisfies TrainingAudience, isPublished: true, videoUrl: { not: "" } },
    select: EPISODE_SELECT,
    orderBy: { episodeNo: "asc" },
  })) as EpisodeRow[];
  if (playableEpisodes(episodes).length === 0) return NO_TRAINING;

  const worker = await db.worker.findUnique({ where: { userId }, select: { id: true } });
  if (!worker) return NO_TRAINING;

  const [quizIds, watches] = await Promise.all([
    quizEpisodeIds(episodes.map((e) => e.id)),
    db.trainingWatch.findMany({
      where: { userId, videoId: { in: episodes.map((e) => e.id) } },
      select: { videoId: true, secondsWatched: true, watchedAt: true, startedAt: true, quizPassedAt: true },
    }) as Promise<WatchRow[]>,
  ]);
  const rules = asRules(episodes, quizIds);

  // Only asked when the gate would otherwise fire: it catches the executives'
  // own worker records (the CEO's ECW-0001, the COO's ECW-0003).
  const next = nextRequired(rules, watches);
  const isExecutive = next ? (await execRoleOfWorker(worker.id)) != null : false;

  return {
    gated: needsTrainingGate(rules, watches, isExecutive),
    episodes: toViews(episodes, watches, quizIds, true),
    nextRequiredId: next?.id ?? null,
    watched: watchedCount(rules, watches),
    completed: completedCount(rules, watches),
    total: playableEpisodes(rules).length,
  };
}

/** For the admin worker pages: "x of N watched" without the whole state. */
export async function getTrainingSummaryForUser(
  userId: string | null
): Promise<{ watched: number; started: number; total: number } | null> {
  const episodes = await db.trainingVideo.findMany({
    where: { audience: "WORKER" satisfies TrainingAudience, isPublished: true, videoUrl: { not: "" } },
    select: { id: true },
  });
  if (episodes.length === 0) return null;
  if (!userId) return { watched: 0, started: 0, total: episodes.length };
  const watches = await db.trainingWatch.findMany({
    where: { userId, videoId: { in: episodes.map((e) => e.id) } },
    select: { watchedAt: true, startedAt: true },
  });
  return {
    watched: watches.filter((w) => w.watchedAt != null).length,
    started: watches.filter((w) => w.startedAt != null && w.watchedAt == null).length,
    total: episodes.length,
  };
}

// ── Progress ────────────────────────────────────────────────────────────────

/**
 * Records how far someone has watched an episode, and marks it watched once
 * they are past `WATCHED_FRACTION`. `enforceOrder` is the worker series'
 * sequential unlock, checked on the server so a hand-crafted request cannot
 * watch episode four first.
 */
export async function saveTrainingProgress(
  userId: string,
  videoId: string,
  input: { secondsWatched: number; durationSeconds: number },
  opts: { audience: TrainingAudience; enforceOrder?: boolean }
): Promise<{ watched: boolean; secondsWatched: number }> {
  const episode = await db.trainingVideo.findUnique({ where: { id: videoId }, select: EPISODE_SELECT });
  if (!episode || episode.audience !== opts.audience) throw new TrainingError("No such episode", 404);
  if (!episode.isPublished || episode.videoUrl.trim() === "") {
    throw new TrainingError("There is no video to watch", 409);
  }

  if (opts.enforceOrder) {
    const siblings = (await db.trainingVideo.findMany({
      where: { audience: episode.audience, isPublished: true },
      select: EPISODE_SELECT,
    })) as EpisodeRow[];
    const quizIds = await quizEpisodeIds(siblings.map((e) => e.id));
    const watches = (await db.trainingWatch.findMany({
      where: { userId, videoId: { in: siblings.map((e) => e.id) } },
      select: { videoId: true, watchedAt: true, quizPassedAt: true },
    })) as WatchRule[];
    const rules = asRules(siblings, quizIds);
    const self = rules.find((e) => e.id === episode.id) ?? { ...episode, hasQuiz: quizIds.has(episode.id) };
    if (!episodeUnlocked(self, rules, watches)) {
      throw new TrainingError("Finish the episodes before this one first", 403);
    }
  }

  const duration = Math.round(input.durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 4 * 60 * 60) {
    throw new TrainingError("Unusable video length", 400);
  }
  // Clamped to the cut they are watching: a client claiming more than the
  // video is long proves nothing.
  const seconds = Math.min(Math.max(0, Math.round(input.secondsWatched)), duration);
  const finished = watchComplete(seconds, duration);
  const now = new Date();

  await db.trainingWatch.upsert({
    where: { videoId_userId: { videoId, userId } },
    create: { videoId, userId, secondsWatched: 0 },
    update: {},
  });
  await db.trainingWatch.updateMany({
    where: { videoId, userId, secondsWatched: { lt: seconds } },
    data: { secondsWatched: seconds, durationSeconds: duration },
  });
  await db.trainingWatch.updateMany({
    where: { videoId, userId, startedAt: null },
    data: { startedAt: now },
  });
  if (finished) {
    await db.trainingWatch.updateMany({
      where: { videoId, userId, watchedAt: null },
      data: { watchedAt: now },
    });
  }

  const after = await db.trainingWatch.findUnique({
    where: { videoId_userId: { videoId, userId } },
    select: { watchedAt: true, secondsWatched: true },
  });
  return { watched: after?.watchedAt != null, secondsWatched: after?.secondsWatched ?? seconds };
}

// ── Quizzes (Phase 3) ───────────────────────────────────────────────────────

type OptionText = { key: number; text: string };

/** The quiz a worker takes: questions and options shuffled, the answer withheld. */
export interface ViewerQuiz {
  passPercent: number;
  alreadyPassed: boolean;
  questions: { id: string; prompt: string; options: OptionText[] }[];
}

function parseOptions(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

async function loadQuizEpisode(userId: string, videoId: string): Promise<{ passPercent: number; watched: boolean }> {
  const episode = await db.trainingVideo.findUnique({
    where: { id: videoId },
    select: { id: true, audience: true, isPublished: true, videoUrl: true, quizPassPercent: true },
  });
  if (!episode || episode.audience !== "WORKER") throw new TrainingError("No such episode", 404);
  if (!episode.isPublished || episode.videoUrl.trim() === "") throw new TrainingError("There is no episode to take", 409);
  const watch = await db.trainingWatch.findUnique({
    where: { videoId_userId: { videoId, userId } },
    select: { watchedAt: true, quizPassedAt: true },
  });
  if (!watch?.watchedAt) throw new TrainingError("Watch the episode first", 403);
  return { passPercent: quizPassPercentFor(episode), watched: true };
}

/** The quiz to show this worker, or empty questions if the episode has none. */
export async function getQuizForViewer(userId: string, videoId: string): Promise<ViewerQuiz> {
  const { passPercent } = await loadQuizEpisode(userId, videoId);
  const watch = await db.trainingWatch.findUnique({
    where: { videoId_userId: { videoId, userId } },
    select: { quizPassedAt: true },
  });
  const questions = await db.trainingQuizQuestion.findMany({
    where: { videoId, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, prompt: true, options: true },
  });
  return {
    passPercent,
    alreadyPassed: watch?.quizPassedAt != null,
    questions: shuffled(questions).map((q) => ({
      id: q.id,
      prompt: q.prompt,
      // Each option keeps its ORIGINAL index as the key the client submits, so
      // the order on screen carries no information and nothing has to be
      // remembered between serving and scoring.
      options: shuffled(parseOptions(q.options).map((text, key) => ({ key, text }))),
    })),
  };
}

export interface QuizOutcome {
  score: number;
  total: number;
  passed: boolean;
  passPercent: number;
  results: {
    questionId: string;
    prompt: string;
    options: string[];
    chosen: number | null;
    correctIndex: number;
    correct: boolean;
    explanation: string | null;
  }[];
}

/** Scores a worker's answers, records the attempt, and stamps the pass when earned. */
export async function submitQuizAttempt(
  userId: string,
  videoId: string,
  answers: Record<string, number>
): Promise<QuizOutcome> {
  const { passPercent } = await loadQuizEpisode(userId, videoId);
  const questions = await db.trainingQuizQuestion.findMany({
    where: { videoId, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, prompt: true, options: true, correctIndex: true, explanation: true },
  });
  if (questions.length === 0) throw new TrainingError("This episode has no quiz", 400);

  const { score, total, passed } = scoreQuiz(
    questions.map((q) => ({ id: q.id, correctIndex: q.correctIndex, isActive: true })),
    answers,
    passPercent
  );
  const now = new Date();

  await db.trainingQuizAttempt.create({
    data: { videoId, userId, answers, score, total, passed },
  });
  if (passed) {
    // Claim the pass once: the first passing timestamp sticks, so a later
    // weaker attempt cannot un-pass the episode.
    await db.trainingWatch.updateMany({
      where: { videoId, userId, quizPassedAt: null },
      data: { quizPassedAt: now },
    });
  }

  return {
    score,
    total,
    passed,
    passPercent,
    results: questions.map((q) => {
      const chosen = typeof answers[q.id] === "number" ? answers[q.id] : null;
      return {
        questionId: q.id,
        prompt: q.prompt,
        options: parseOptions(q.options),
        chosen,
        correctIndex: q.correctIndex,
        correct: chosen === q.correctIndex,
        explanation: q.explanation,
      };
    }),
  };
}

// ── Quiz authoring (founder) ────────────────────────────────────────────────

export interface QuizQuestionAdmin {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  isActive: boolean;
  sortOrder: number;
}

/** The questions on an episode, answers included — founder only. */
export async function listQuizQuestions(videoId: string): Promise<QuizQuestionAdmin[]> {
  const rows = await db.trainingQuizQuestion.findMany({
    where: { videoId },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    options: parseOptions(q.options),
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    isActive: q.isActive,
    sortOrder: q.sortOrder,
  }));
}

function validateQuestion(input: { prompt: string; options: string[]; correctIndex: number }): {
  prompt: string;
  options: string[];
  correctIndex: number;
} {
  const prompt = input.prompt.trim();
  if (!prompt) throw new TrainingError("The question needs a prompt", 400);
  const options = input.options.map((o) => o.trim()).filter((o) => o !== "");
  if (options.length < 2 || options.length > 6) throw new TrainingError("A question needs between 2 and 6 answers", 400);
  if (!Number.isInteger(input.correctIndex) || input.correctIndex < 0 || input.correctIndex >= options.length) {
    throw new TrainingError("Mark which answer is correct", 400);
  }
  return { prompt, options, correctIndex: input.correctIndex };
}

export async function createQuizQuestion(
  videoId: string,
  input: { prompt: string; options: string[]; correctIndex: number; explanation?: string | null }
): Promise<{ id: string }> {
  const episode = await db.trainingVideo.findUnique({ where: { id: videoId }, select: { audience: true } });
  if (!episode) throw new TrainingError("No such episode", 404);
  if (episode.audience !== "WORKER") throw new TrainingError("Quizzes are for the worker series only", 400);
  const clean = validateQuestion(input);
  const last = await db.trainingQuizQuestion.findFirst({
    where: { videoId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const row = await db.trainingQuizQuestion.create({
    data: {
      videoId,
      prompt: clean.prompt,
      options: clean.options,
      correctIndex: clean.correctIndex,
      explanation: input.explanation?.trim() || null,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
    select: { id: true },
  });
  return row;
}

export async function updateQuizQuestion(
  questionId: string,
  input: {
    prompt?: string;
    options?: string[];
    correctIndex?: number;
    explanation?: string | null;
    isActive?: boolean;
  }
): Promise<void> {
  const existing = await db.trainingQuizQuestion.findUnique({
    where: { id: questionId },
    select: { prompt: true, options: true, correctIndex: true },
  });
  if (!existing) throw new TrainingError("No such question", 404);
  const data: Record<string, unknown> = {};
  if (input.prompt !== undefined || input.options !== undefined || input.correctIndex !== undefined) {
    const clean = validateQuestion({
      prompt: input.prompt ?? existing.prompt,
      options: input.options ?? parseOptions(existing.options),
      correctIndex: input.correctIndex ?? existing.correctIndex,
    });
    data.prompt = clean.prompt;
    data.options = clean.options;
    data.correctIndex = clean.correctIndex;
  }
  if (input.explanation !== undefined) data.explanation = input.explanation?.trim() || null;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (Object.keys(data).length === 0) return;
  await db.trainingQuizQuestion.update({ where: { id: questionId }, data });
}

export async function deleteQuizQuestion(questionId: string): Promise<void> {
  const existing = await db.trainingQuizQuestion.findUnique({ where: { id: questionId }, select: { id: true } });
  if (!existing) throw new TrainingError("No such question", 404);
  await db.trainingQuizQuestion.delete({ where: { id: questionId } });
}

// ── The founder's management ────────────────────────────────────────────────

export interface ManagedEpisode {
  id: string;
  audience: TrainingAudience;
  episodeNo: number;
  title: string;
  description: string | null;
  videoUrl: string;
  posterUrl: string;
  durationSeconds: number | null;
  requiredForGate: boolean;
  isPublished: boolean;
  quizPassPercent: number | null;
  /** Active quiz questions on this episode (worker series only). */
  questionCount: number;
  /** How many people have finished it (worker series: everyone; tutorials: the COO logins). */
  watchedCount: number;
}

export interface CooViewerState {
  userId: string;
  name: string;
  /** Per episode id: this viewer's state. */
  episodes: Record<string, { watchedAt: Date | null; startedAt: Date | null }>;
}

/** Everything on the management side of /admin/tutorials, founder only. */
export async function getTrainingManagement(): Promise<{
  episodes: ManagedEpisode[];
  cooViewers: CooViewerState[];
}> {
  const [episodes, counts, questionCounts] = await Promise.all([
    db.trainingVideo.findMany({ select: EPISODE_SELECT, orderBy: [{ audience: "asc" }, { episodeNo: "asc" }] }),
    db.trainingWatch.groupBy({
      by: ["videoId"],
      where: { watchedAt: { not: null } },
      _count: { videoId: true },
    }),
    db.trainingQuizQuestion.groupBy({
      by: ["videoId"],
      where: { isActive: true },
      _count: { videoId: true },
    }),
  ]);
  const countById = new Map(counts.map((c) => [c.videoId, c._count.videoId]));
  const questionsById = new Map(questionCounts.map((c) => [c.videoId, c._count.videoId]));

  // The COO logins (the retired OPS_MANAGER counts as COO), for the
  // per-tutorial "has he watched it" line the founder asked for.
  const cooUsers = await db.user.findMany({
    where: { role: { in: ["COO", "OPS_MANAGER"] }, isActive: true },
    select: { id: true, displayName: true, email: true, execProfile: { select: { fullName: true } } },
  });
  const cooEpisodeIds = episodes.filter((e) => e.audience === "COO").map((e) => e.id);
  const cooWatches = cooUsers.length
    ? await db.trainingWatch.findMany({
        where: { userId: { in: cooUsers.map((u) => u.id) }, videoId: { in: cooEpisodeIds } },
        select: { userId: true, videoId: true, watchedAt: true, startedAt: true },
      })
    : [];

  return {
    episodes: episodes.map((e) => ({
      ...e,
      audience: e.audience as TrainingAudience,
      questionCount: questionsById.get(e.id) ?? 0,
      watchedCount: countById.get(e.id) ?? 0,
    })),
    cooViewers: cooUsers.map((u) => ({
      userId: u.id,
      name: u.execProfile?.fullName ?? u.displayName ?? u.email,
      episodes: Object.fromEntries(
        cooWatches
          .filter((w) => w.userId === u.id)
          .map((w) => [w.videoId, { watchedAt: w.watchedAt, startedAt: w.startedAt }])
      ),
    })),
  };
}

export async function createEpisode(input: {
  audience: TrainingAudience;
  title: string;
  description?: string | null;
  requiredForGate?: boolean;
}): Promise<{ id: string }> {
  const title = input.title.trim();
  if (!title) throw new TrainingError("The episode needs a title", 400);
  const last = await db.trainingVideo.findFirst({
    where: { audience: input.audience },
    orderBy: { episodeNo: "desc" },
    select: { episodeNo: true },
  });
  const row = await db.trainingVideo.create({
    data: {
      audience: input.audience,
      episodeNo: (last?.episodeNo ?? 0) + 1,
      title,
      description: input.description?.trim() || null,
      requiredForGate: input.requiredForGate ?? true,
    },
    select: { id: true },
  });
  return row;
}

export async function updateEpisode(
  id: string,
  input: {
    title?: string;
    description?: string | null;
    videoUrl?: string;
    posterUrl?: string;
    requiredForGate?: boolean;
    isPublished?: boolean;
    quizPassPercent?: number;
  }
): Promise<void> {
  const episode = await db.trainingVideo.findUnique({ where: { id }, select: { id: true, videoUrl: true } });
  if (!episode) throw new TrainingError("No such episode", 404);
  const title = input.title?.trim();
  if (input.title !== undefined && !title) throw new TrainingError("The episode needs a title", 400);
  // Publishing an episode with no video would gate workers on something they
  // cannot watch; the rules treat it as not playable anyway, but refuse the
  // obvious mistake here so the founder hears about it.
  const videoAfter = input.videoUrl !== undefined ? input.videoUrl.trim() : episode.videoUrl;
  if (input.isPublished === true && videoAfter === "") {
    throw new TrainingError("Upload the video before publishing this episode", 400);
  }
  await db.trainingVideo.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.videoUrl !== undefined ? { videoUrl: input.videoUrl.trim() } : {}),
      ...(input.posterUrl !== undefined ? { posterUrl: input.posterUrl.trim() } : {}),
      ...(input.requiredForGate !== undefined ? { requiredForGate: input.requiredForGate } : {}),
      ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
      ...(input.quizPassPercent !== undefined
        ? { quizPassPercent: Math.min(100, Math.max(1, Math.round(input.quizPassPercent))) }
        : {}),
    },
  });
}

/** Swap an episode with its neighbour. The unique (audience, episodeNo) needs a three-step swap. */
export async function moveEpisode(id: string, direction: "up" | "down"): Promise<void> {
  await db.$transaction(async (tx) => {
    const episode = await tx.trainingVideo.findUnique({
      where: { id },
      select: { id: true, audience: true, episodeNo: true },
    });
    if (!episode) throw new TrainingError("No such episode", 404);
    const neighbour = await tx.trainingVideo.findFirst({
      where: {
        audience: episode.audience,
        episodeNo: direction === "up" ? { lt: episode.episodeNo } : { gt: episode.episodeNo },
      },
      orderBy: { episodeNo: direction === "up" ? "desc" : "asc" },
      select: { id: true, episodeNo: true },
    });
    if (!neighbour) return; // already first/last
    const temp = -1 * (episode.episodeNo + 1000);
    await tx.trainingVideo.update({ where: { id: episode.id }, data: { episodeNo: temp } });
    await tx.trainingVideo.update({ where: { id: neighbour.id }, data: { episodeNo: episode.episodeNo } });
    await tx.trainingVideo.update({ where: { id: episode.id }, data: { episodeNo: neighbour.episodeNo } });
  });
}

export async function deleteEpisode(id: string): Promise<void> {
  const episode = await db.trainingVideo.findUnique({ where: { id }, select: { id: true } });
  if (!episode) throw new TrainingError("No such episode", 404);
  await db.trainingVideo.delete({ where: { id } }); // watches cascade
}

/** Forcing a rewatch: everyone's progress on this episode starts over. */
export async function resetEpisodeWatches(id: string): Promise<number> {
  const result = await db.trainingWatch.deleteMany({ where: { videoId: id } });
  return result.count;
}
