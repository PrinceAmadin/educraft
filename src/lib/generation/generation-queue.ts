import { isDegreeLevel, isPostgraduate, pageTargetFor, parsePageRequirement } from "@/lib/degree-level";

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

/**
 * Two lanes, each with its own slots (founder's call for postgraduate work): a two-hour master's
 * dissertation must not hold a third of capacity while three forty-minute undergraduate reports
 * queue behind it, and a run of dissertations must not shut undergraduate work out either.
 *
 * STANDARD keeps the three slots it has always had, so undergraduate throughput is unchanged; LONG
 * is extra capacity beside it, not a share of it. Both sizes are Settings
 * (`generation_lane_slots:STANDARD` / `:LONG`), as are the starting estimates
 * (`generation_default_minutes:STANDARD` / `:LONG`), so neither needs a deploy.
 */
export const LANES = ["STANDARD", "LONG"] as const;
export type GenerationLane = (typeof LANES)[number];

export const LANE_SLOTS: Record<GenerationLane, number> = { STANDARD: 3, LONG: 1 };
/** Until MIN_FINISHED_FOR_AVERAGE of that lane have finished. 120 min is the measured estimate for a 150-200 page dissertation. */
export const LANE_DEFAULT_MINUTES: Record<GenerationLane, number> = { STANDARD: 40, LONG: 120 };

export const LANE_SLOTS_SETTING = (lane: GenerationLane) => `generation_lane_slots:${lane}`;
export const LANE_MINUTES_SETTING = (lane: GenerationLane) => `generation_default_minutes:${lane}`;

export function isLane(value: unknown): value is GenerationLane {
  return typeof value === "string" && (LANES as readonly string[]).includes(value);
}

/**
 * Which lane a report runs in. Postgraduate work always, and any order whose own page requirement
 * puts it past the top of the undergraduate band -- the length is what makes a job long, not the
 * title on the service.
 */
export function laneFor(input: { degreeLevel?: string | null; minimumPages?: string | null }): GenerationLane {
  const level = isDegreeLevel(input.degreeLevel) ? input.degreeLevel : "UNDERGRADUATE";
  if (isPostgraduate(level)) return "LONG";
  const pages = parsePageRequirement(input.minimumPages);
  return pages !== null && pages > pageTargetFor("UNDERGRADUATE").max ? "LONG" : "STANDARD";
}

/** The undergraduate lane's size, kept under its old name for the checks and the callers that name it. */
export const MAX_CONCURRENT_GENERATIONS = LANE_SLOTS.STANDARD;
export const DEFAULT_PROJECT_MINUTES = LANE_DEFAULT_MINUTES.STANDARD;
export const MIN_FINISHED_FOR_AVERAGE = 3;

export type QueueStatus = "not_ready" | "queued" | "generating" | "paused" | "done";

export interface QueueMember {
  projectId: string;
  isExpress: boolean;
  approvedAt: Date | null;
  /** STANDARD when left out, so an older caller behaves exactly as before. */
  lane?: GenerationLane;
}

/** A member's lane, defaulting to the lane every report was in before there were two. */
export function laneOf(m: QueueMember): GenerationLane {
  return m.lane ?? "STANDARD";
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

/**
 * The mean generation time of that lane's finished projects, once there are enough of them; else
 * the lane's own starting figure. Measured per lane, so one dissertation cannot make every
 * undergraduate report's estimate wrong.
 */
export function averageProjectMinutes(finishedMinutes: number[], fallbackMinutes = DEFAULT_PROJECT_MINUTES): { minutes: number; fromHistory: boolean } {
  const usable = finishedMinutes.filter((m) => Number.isFinite(m) && m > 0);
  if (usable.length < MIN_FINISHED_FOR_AVERAGE) return { minutes: fallbackMinutes, fromHistory: false };
  return { minutes: Math.round(usable.reduce((s, m) => s + m, 0) / usable.length), fromHistory: true };
}

/**
 * When a queued project should start: straight away while a generation slot is
 * free, otherwise after enough projects ahead of it have finished.
 *
 * Null when the lane has no slots at all: a closed lane is not going to start anything, and saying
 * so is better than an arithmetic answer about a queue that is not moving.
 */
export function estimateStart(position: number, generatingNow: number, avgMinutes: number, now: Date, concurrent = MAX_CONCURRENT_GENERATIONS): Date | null {
  if (concurrent <= 0) return null;
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
  /** Slots in use, per lane. A plain number is read as the STANDARD lane's, as it was before lanes. */
  generatingNow: number | Partial<Record<GenerationLane, number>>;
  average: { minutes: number; fromHistory: boolean };
  now: Date;
  /** Slots per lane; the defaults unless a Setting moved them. */
  slots?: Partial<Record<GenerationLane, number>>;
}

export function queueStateFrom(input: QueueInput): QueueState {
  const ordered = orderQueue(input.members);
  const me = ordered.find((m) => m.projectId === input.projectId);
  // A report only ever waits behind its own lane, which is the whole point of having two.
  const lane = me ? laneOf(me) : "STANDARD";
  const concurrent = input.slots?.[lane] ?? LANE_SLOTS[lane];
  const busy = typeof input.generatingNow === "number" ? (lane === "STANDARD" ? input.generatingNow : 0) : (input.generatingNow[lane] ?? 0);
  const inLane = ordered.filter((m) => laneOf(m) === lane);
  const basis = { concurrent, avgMinutes: input.average.minutes, fromHistory: input.average.fromHistory, generatingNow: busy };
  const index = inLane.findIndex((m) => m.projectId === input.projectId);
  if (index < 0) return { status: input.phase, position: null, queueLength: inLane.length, estimatedStartTime: null, basis };
  const position = index + 1;
  return {
    status: "queued",
    position,
    queueLength: inLane.length,
    estimatedStartTime: estimateStart(position, busy, input.average.minutes, input.now, concurrent)?.toISOString() ?? null,
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
