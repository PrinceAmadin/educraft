/**
 * Phase D6: the report generation queue, derived from existing rows (founder,
 * 27 Sept: no new table). Pure.
 *
 * A report project joins the queue when the founder or the COO presses Start
 * (D9; until then an approved project simply waits for that) and leaves when
 * it gets a slot. Express orders go first, then the order of approval. The
 * chapter orchestrator (orchestrator.ts) starts projects in exactly this
 * order, MAX_CONCURRENT_GENERATIONS at a time. The estimated start assumes
 * each takes the average time of finished projects (DEFAULT_PROJECT_MINUTES
 * until MIN_FINISHED_FOR_AVERAGE have finished), so it is an estimate and the
 * card says so. D10 turns the two numbers into settings.
 */

export const MAX_CONCURRENT_GENERATIONS = 3;
export const DEFAULT_PROJECT_MINUTES = 40;
export const MIN_FINISHED_FOR_AVERAGE = 3;

export type QueueStatus = "not_ready" | "queued" | "generating" | "paused" | "done";

export interface QueueMember {
  projectId: string;
  isExpress: boolean;
  approvedAt: Date | null;
}

export interface QueueState {
  status: QueueStatus;
  /** 1-based place in the queue, only while queued. */
  position: number | null;
  /** How many projects are waiting in all. */
  queueLength: number;
  /** ISO time, only while queued. */
  estimatedStartTime: string | null;
  basis: { concurrent: number; avgMinutes: number; fromHistory: boolean; generatingNow: number };
}

/** Express first, then by approval time (never approved last), then by id so the order is stable. */
export function orderQueue<T extends QueueMember>(members: T[]): T[] {
  return [...members].sort((a, b) => {
    if (a.isExpress !== b.isExpress) return a.isExpress ? -1 : 1;
    const ta = a.approvedAt ? a.approvedAt.getTime() : Number.MAX_SAFE_INTEGER;
    const tb = b.approvedAt ? b.approvedAt.getTime() : Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    return a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0;
  });
}

/** The mean generation time of finished projects, once there are enough of them; else the default. */
export function averageProjectMinutes(finishedMinutes: number[]): { minutes: number; fromHistory: boolean } {
  const usable = finishedMinutes.filter((m) => Number.isFinite(m) && m > 0);
  if (usable.length < MIN_FINISHED_FOR_AVERAGE) return { minutes: DEFAULT_PROJECT_MINUTES, fromHistory: false };
  return { minutes: Math.round(usable.reduce((s, m) => s + m, 0) / usable.length), fromHistory: true };
}

/**
 * When a queued project should start: straight away while a generation slot is
 * free, otherwise after enough projects ahead of it have finished.
 */
export function estimateStart(position: number, generatingNow: number, avgMinutes: number, now: Date, concurrent = MAX_CONCURRENT_GENERATIONS): Date {
  const free = Math.max(0, concurrent - generatingNow);
  if (position <= free) return now;
  const rounds = Math.ceil((position - free) / concurrent);
  return new Date(now.getTime() + rounds * avgMinutes * 60_000);
}

export interface QueueInput {
  projectId: string;
  /** The project's own state; "queued" is decided here from the members. */
  phase: Exclude<QueueStatus, "queued">;
  members: QueueMember[];
  generatingNow: number;
  average: { minutes: number; fromHistory: boolean };
  now: Date;
}

export function queueStateFrom(input: QueueInput): QueueState {
  const ordered = orderQueue(input.members);
  const basis = { concurrent: MAX_CONCURRENT_GENERATIONS, avgMinutes: input.average.minutes, fromHistory: input.average.fromHistory, generatingNow: input.generatingNow };
  const index = ordered.findIndex((m) => m.projectId === input.projectId);
  if (index < 0) return { status: input.phase, position: null, queueLength: ordered.length, estimatedStartTime: null, basis };
  const position = index + 1;
  return {
    status: "queued",
    position,
    queueLength: ordered.length,
    estimatedStartTime: estimateStart(position, input.generatingNow, input.average.minutes, input.now).toISOString(),
    basis,
  };
}

/**
 * The project's own place in the pipeline, when it is not simply waiting in
 * the queue: paused for data, done (every chapter complete), generating (a
 * chapter has started), else not ready (queueStateFrom turns a queue member
 * into "queued").
 */
export function projectPhase(opts: {
  runs: { chapterNumber: number; status: string }[];
  activePause: boolean;
  chapterCount: number;
  /** The project's own chapters (expectedChapters); 1 to chapterCount when left out. */
  chapters?: readonly number[];
  approved?: boolean;
}): Exclude<QueueStatus, "queued"> {
  if (opts.activePause) return "paused";
  const completed = new Set(opts.runs.filter((r) => r.status === "COMPLETED").map((r) => r.chapterNumber));
  const chapters = opts.chapters?.length ? opts.chapters : Array.from({ length: opts.chapterCount }, (_, i) => i + 1);
  if (opts.runs.length && chapters.every((n) => completed.has(n))) return "done";
  if (opts.runs.length) return "generating";
  return "not_ready";
}

/** "1st", "2nd", "3rd", "11th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
}
