/**
 * Phase D9 — the chapter orchestrator's rules. Pure: no database, no clock of
 * its own, no network, and nothing that runs only on the server (the Report
 * tab's screens read the wording and the types from here). orchestrator.ts
 * reads the facts, asks `decide` what the report needs next, and performs it;
 * `npm run check:orchestrator` proves the rules here without a database or a
 * Claude call.
 *
 * A report is written one chapter at a time, in order. The rules look only at
 * what is on record (the chapters' runs, the data pauses, the dataset, the
 * quality gate's result, the project's pipeline status), so deciding twice
 * from the same facts gives the same answer, and a tick that runs twice
 * changes nothing.
 */

import type { DataFormStatus, DataPauseStatus, GenerationStatus, OrchestratorStatus, ProjectStatus } from "@prisma/client";
import { pausePointsFor, pausesBeforeChapter } from "./pause-points";
import { MAX_CONCURRENT_GENERATIONS, orderQueue, type QueueMember } from "./generation-queue";

// ─── The numbers ─────────────────────────────────────────────────────────────

/** D2's rule: a chapter nobody is working on (its lease lapsed) that has not moved for this long is carried on. */
export const QUIET_MS = 75_000;
/** A quiet chapter is carried on at most this often. */
export const KICK_EVERY_MS = 60_000;
/** The founder's rule: no plan or part saved for this long = stuck. */
export const STALL_AFTER_MS = 90 * 60_000;
/** …but only after the orchestrator has tried to carry it on this many times since it last moved (a scheduler outage is not a stuck chapter). */
export const STALL_MIN_KICKS = 3;
export const MAX_PAUSE_DRAFTS = 2;
export const MAX_FETCH_ATTEMPTS = 3;
export const MAX_GATE_ATTEMPTS = 3;
/** How long a requested quality check may take before it is asked for again (the gate's own lease is 5 minutes). */
export const GATE_WAIT_MS = 6 * 60_000;
/** A run waiting for data or on hold is looked at again this often (the routes that end the wait wake it at once). */
export const PARKED_CHECK_MS = 2 * 60_000;
/** A run waiting for a person. */
export const ATTENTION_CHECK_MS = 5 * 60_000;
/** A report in the QA queue or back from it: a re-generated chapter wakes it at once, this is the backstop. */
export const COMPLETE_CHECK_MS = 30 * 60_000;
/** A tick working on a run holds it this long (longer than a function may run, so a live tick never loses it). */
export const RUN_LEASE_MS = 330_000;
/** Alert keys kept on a run. */
export const ANNOUNCED_KEPT = 60;

// ─── The facts ───────────────────────────────────────────────────────────────

export type RunStatus = OrchestratorStatus;

export type AttentionReason =
  | "CHAPTER_FAILED"
  | "CHAPTER_STALLED"
  | "PAUSE_DRAFT_FAILED"
  | "PAUSE_CANCELLED"
  | "DATA_FETCH_FAILED"
  | "NO_RESEARCH_QUESTIONS"
  | "NO_REFERENCES"
  | "MODE_NOT_APPROVED"
  | "START_REFUSED"
  | "GATE_ERROR"
  | "PASSED_NOT_SUBMITTED";

export type HoldReason = "PROJECT_ON_HOLD" | "AWAITING_CLIENT_INPUT" | "NOT_IN_PROGRESS" | "IN_QA" | "RESEARCH_RUNNING";

export type StopReason = "PROJECT_CANCELLED" | "PROJECT_REFUNDED" | "STOPPED_BY_PERSON";

export interface ChapterFact {
  id: string;
  chapter: number;
  status: GenerationStatus;
  lockedUntil: Date | null;
  lastStepAt: Date | null;
  lastProgressAt: Date | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
}

export interface PauseFact {
  id: string;
  afterChapter: number;
  status: DataPauseStatus;
  formStatus: DataFormStatus;
  formError: string | null;
}

export interface GateFact {
  /** When the latest recorded quality check began (QaReview.qualityRunAt). */
  ranAt: Date | null;
  /** The gate's own lease: a check is running while this is in the future. */
  lockedUntil: Date | null;
  passed: boolean | null;
  score: number | null;
  total: number | null;
  autoSubmittedAt: Date | null;
}

export interface RunFact {
  status: RunStatus;
  currentChapter: number | null;
  reason: string | null;
  allowNoReferences: boolean;
  /** When Chapter One's research questions and hypotheses were last read from its text. */
  statementsReadAt: Date | null;
  /**
   * The lists on the run may be used: they were read (or Chapter One states
   * none), or the founder or the COO chose to continue without them.
   */
  statementsAccepted: boolean;
  pauseDraftAttempts: number;
  fetchAttempts: number;
  gateAttempts: number;
  gateRequestedAt: Date | null;
  gateError: string | null;
  kickCount: number;
  lastKickAt: Date | null;
}

export interface OrchestratorFacts {
  now: Date;
  run: RunFact;
  project: { status: ProjectStatus; hasSpecialist: boolean };
  /** The approved, locked mode; null while the mode card is not approved. */
  mode: number | null;
  /** The project's own chapters (expectedChapters). */
  chapters: number[];
  checkpoints: ChapterFact[];
  pauses: PauseFact[];
  /** Mode 5: a dataset is stored. */
  hasDataset: boolean;
  research: { state: "PASSED" | "RUNNING" | "FAILED" | "NONE"; kept: number };
  gate: GateFact;
}

// ─── What the report needs next ──────────────────────────────────────────────

export type Action =
  /** Nothing to do this tick. */
  | { kind: "WAIT"; why: string }
  | { kind: "STOP"; reason: StopReason; failChapterId: string | null }
  | { kind: "HOLD"; reason: HoldReason }
  /** A chapter is being written and is healthy. */
  | { kind: "WRITING"; chapter: number; checkpointId: string }
  /** A quiet chapter: carry it on. */
  | { kind: "KICK"; chapter: number; checkpointId: string }
  /** A stuck chapter: mark it STALLED and tell the COO. */
  | { kind: "STALL"; chapter: number; checkpointId: string }
  | { kind: "ATTENTION"; reason: AttentionReason; chapter: number | null; checkpointId: string | null; detail: string | null }
  /** Chapter One is written: read its research questions and hypotheses. */
  | { kind: "READ_STATEMENTS" }
  | { kind: "OPEN_PAUSE"; afterChapter: number }
  | { kind: "WAIT_FOR_DATA"; afterChapter: number; pauseId: string }
  | { kind: "FETCH_DATA" }
  /** The next chapter is ready to be written and needs one of the slots. */
  | { kind: "NEED_SLOT"; chapter: number }
  | { kind: "REQUEST_GATE" }
  | { kind: "GATE_RUNNING" }
  | { kind: "PASS"; ranAt: Date; score: number | null; total: number | null }
  | { kind: "FAIL"; ranAt: Date; score: number | null; total: number | null };

const ACTIVE: ReadonlySet<GenerationStatus> = new Set<GenerationStatus>(["PENDING", "OUTLINING", "WRITING"]);
/** The pipeline statuses in which chapters are written and the gate may submit. */
const WORKING: ReadonlySet<ProjectStatus> = new Set<ProjectStatus>(["IN_PROGRESS", "REVISION_NEEDED"]);
const BEFORE_WORK: ReadonlySet<ProjectStatus> = new Set<ProjectStatus>(["NEW", "DOWNPAYMENT_VERIFIED", "REQUIREMENTS_CONFIRMED", "ASSIGNED"]);

export const isChapterActive = (c: Pick<ChapterFact, "status">) => ACTIVE.has(c.status);

/** Carries of the current chapter since it last made progress. */
export function kicksSinceProgress(c: Pick<ChapterFact, "lastProgressAt" | "startedAt" | "createdAt">, run: Pick<RunFact, "kickCount" | "lastKickAt">): number {
  const progress = (c.lastProgressAt ?? c.startedAt ?? c.createdAt).getTime();
  return run.lastKickAt && run.lastKickAt.getTime() > progress ? run.kickCount : 0;
}

/** The watchdog's verdict on a chapter that is being written. */
export function watchChapter(c: ChapterFact, run: Pick<RunFact, "kickCount" | "lastKickAt">, now: Date): "WAIT" | "KICK" | "STALL" {
  const t = now.getTime();
  const progress = (c.lastProgressAt ?? c.startedAt ?? c.createdAt).getTime();
  if (t - progress > STALL_AFTER_MS && kicksSinceProgress(c, run) >= STALL_MIN_KICKS) return "STALL";
  if (c.lockedUntil && c.lockedUntil.getTime() > t) return "WAIT"; // a slice is working on it
  if (t - (c.lastStepAt ?? c.createdAt).getTime() <= QUIET_MS) return "WAIT";
  if (run.lastKickAt && t - run.lastKickAt.getTime() < KICK_EVERY_MS) return "WAIT";
  return "KICK";
}

function holdFor(status: ProjectStatus): HoldReason | null {
  if (status === "ON_HOLD" || status === "DISPUTED") return "PROJECT_ON_HOLD";
  if (status === "AWAITING_CLIENT_INPUT") return "AWAITING_CLIENT_INPUT";
  if (BEFORE_WORK.has(status)) return "NOT_IN_PROGRESS";
  if (!WORKING.has(status)) return "IN_QA"; // SUBMITTED and everything after it
  return null;
}

/**
 * The one rule. A STOPPED run starts nothing new, but a chapter it was
 * writing is still watched to its end (the caller leaves the status alone).
 */
export function decide(f: OrchestratorFacts): Action {
  const mine = f.checkpoints.filter((c) => f.chapters.includes(c.chapter)).sort((a, b) => a.chapter - b.chapter);
  const active = f.checkpoints.filter(isChapterActive).sort((a, b) => a.chapter - b.chapter);

  if (f.project.status === "CANCELLED" || f.project.status === "REFUNDED") {
    return { kind: "STOP", reason: f.project.status === "CANCELLED" ? "PROJECT_CANCELLED" : "PROJECT_REFUNDED", failChapterId: active[0]?.id ?? null };
  }

  // A. A chapter is being written (whoever started it): it is watched, and it finishes even if the
  //    project is put on hold or generation was stopped.
  if (active.length) {
    const c = active[0];
    const verdict = watchChapter(c, f.run, f.now);
    if (verdict === "STALL") return { kind: "STALL", chapter: c.chapter, checkpointId: c.id };
    if (verdict === "KICK") return { kind: "KICK", chapter: c.chapter, checkpointId: c.id };
    return { kind: "WRITING", chapter: c.chapter, checkpointId: c.id };
  }
  if (f.run.status === "STOPPED") return { kind: "WAIT", why: "stopped" };

  // B. A chapter that stopped needs a person.
  const broken = mine.find((c) => c.status === "FAILED" || c.status === "STALLED");
  if (broken) {
    return {
      kind: "ATTENTION",
      reason: broken.status === "STALLED" ? "CHAPTER_STALLED" : "CHAPTER_FAILED",
      chapter: broken.chapter,
      checkpointId: broken.id,
      detail: broken.errorMessage,
    };
  }

  const done = new Map(mine.filter((c) => c.status === "COMPLETED").map((c) => [c.chapter, c]));
  const next = f.chapters.find((n) => !done.has(n));
  const hold = holdFor(f.project.status);

  // C. Chapters still to write.
  if (next !== undefined) {
    if (hold) return { kind: "HOLD", reason: hold };
    if (f.mode === null) return { kind: "ATTENTION", reason: "MODE_NOT_APPROVED", chapter: next, checkpointId: null, detail: null };
    if (f.research.state === "RUNNING" && f.checkpoints.length === 0) return { kind: "HOLD", reason: "RESEARCH_RUNNING" };
    if (f.research.kept === 0 && !f.run.allowNoReferences) {
      return { kind: "ATTENTION", reason: "NO_REFERENCES", chapter: next, checkpointId: null, detail: null };
    }

    const one = done.get(1);
    if (next > 1 && one) {
      const stale = !f.run.statementsReadAt || (one.completedAt !== null && one.completedAt.getTime() > f.run.statementsReadAt.getTime());
      if (stale) return { kind: "READ_STATEMENTS" };
      if (!f.run.statementsAccepted) return { kind: "ATTENTION", reason: "NO_RESEARCH_QUESTIONS", chapter: 1, checkpointId: one.id, detail: null };
    }

    for (const point of pausesBeforeChapter(f.mode, next)) {
      const pause = f.pauses.find((p) => p.afterChapter === point);
      if (pause?.status === "RESUMED") continue;
      if (pause?.status === "CANCELLED") return { kind: "ATTENTION", reason: "PAUSE_CANCELLED", chapter: next, checkpointId: null, detail: null };
      if (pause && pause.formStatus === "READY") return { kind: "WAIT_FOR_DATA", afterChapter: point, pauseId: pause.id };
      // No request yet, or its draft failed or was cut off: draft it (twice at most, then a person).
      if (f.run.pauseDraftAttempts >= MAX_PAUSE_DRAFTS) {
        return { kind: "ATTENTION", reason: "PAUSE_DRAFT_FAILED", chapter: next, checkpointId: null, detail: pause?.formError ?? null };
      }
      return { kind: "OPEN_PAUSE", afterChapter: point };
    }

    if (f.mode === 5 && next >= 4 && !f.hasDataset) {
      if (f.run.fetchAttempts >= MAX_FETCH_ATTEMPTS) return { kind: "ATTENTION", reason: "DATA_FETCH_FAILED", chapter: next, checkpointId: null, detail: null };
      return { kind: "FETCH_DATA" };
    }
    return { kind: "NEED_SLOT", chapter: next };
  }

  // D. Every chapter is written: the quality gate.
  const latest = Math.max(...[...done.values()].map((c) => c.completedAt?.getTime() ?? 0));
  const g = f.gate;
  const gateBusy = g.lockedUntil !== null && g.lockedUntil.getTime() > f.now.getTime();
  const current = g.ranAt !== null && g.ranAt.getTime() > latest && g.passed !== null;
  if (current && !gateBusy) {
    const base = { ranAt: g.ranAt as Date, score: g.score, total: g.total };
    if (!g.passed) return { kind: "FAIL", ...base };
    const submitted = g.autoSubmittedAt !== null && g.autoSubmittedAt.getTime() >= (g.ranAt as Date).getTime();
    if (submitted || hold === "IN_QA") return { kind: "PASS", ...base };
    return { kind: "ATTENTION", reason: "PASSED_NOT_SUBMITTED", chapter: null, checkpointId: null, detail: null };
  }
  if (gateBusy) return { kind: "GATE_RUNNING" };
  if (hold) return { kind: "HOLD", reason: hold };
  const asked = f.run.gateRequestedAt !== null && f.run.gateRequestedAt.getTime() > latest ? f.run.gateRequestedAt.getTime() : null;
  if (asked !== null && f.now.getTime() - asked < GATE_WAIT_MS) return { kind: "GATE_RUNNING" };
  if (asked !== null && f.run.gateAttempts >= MAX_GATE_ATTEMPTS) {
    return { kind: "ATTENTION", reason: "GATE_ERROR", chapter: null, checkpointId: null, detail: f.run.gateError };
  }
  return { kind: "REQUEST_GATE" };
}

/**
 * The run status an action leaves behind (null: the status is not changed by
 * it). A project keeps its slot from its first chapter until it pauses,
 * finishes, fails or stops: between two chapters the next one starts at once,
 * while a project that gave its slot up (a pause, a hold, a person's
 * decision) waits in the queue for the next free one. A stopped run stays
 * stopped whatever its last chapter does.
 */
export function statusAfter(action: Action, current: RunStatus): RunStatus | null {
  if (action.kind === "STOP") return "STOPPED";
  if (current === "STOPPED") return null;
  switch (action.kind) {
    case "WAIT":
      return null;
    case "HOLD":
      return "HELD";
    case "WRITING":
    case "KICK":
      return "GENERATING";
    case "STALL":
    case "ATTENTION":
      return "NEEDS_ATTENTION";
    case "READ_STATEMENTS":
      return null;
    case "OPEN_PAUSE":
    case "WAIT_FOR_DATA":
      return "WAITING_FOR_DATA";
    case "FETCH_DATA":
      return "FETCHING_DATA";
    case "NEED_SLOT":
      return holdsSlot(current) ? "GENERATING" : "QUEUED";
    case "REQUEST_GATE":
    case "GATE_RUNNING":
      return "QUALITY_CHECK";
    case "PASS":
      return "COMPLETE";
    case "FAIL":
      return "QUALITY_FAILED";
  }
}

/** A run in one of these statuses has nothing pressing: it is not looked at on every tick. */
export function isParked(status: RunStatus): boolean {
  return status === "COMPLETE" || status === "QUALITY_FAILED" || status === "NEEDS_ATTENTION" || status === "HELD" || status === "WAITING_FOR_DATA" || status === "STOPPED";
}

/** Past QA: nothing the orchestrator does can matter any more. */
const SETTLED: ReadonlySet<ProjectStatus> = new Set<ProjectStatus>(["APPROVED", "BALANCE_VERIFIED", "DELIVERED", "SUPERVISOR_CORRECTIONS", "COMPLETED", "CANCELLED", "REFUNDED"]);

/**
 * How long until a run is looked at again: 0 = on the next tick, null = not
 * until something wakes it (Start, a chapter re-generated, a data request
 * verified). `watching` = one of its chapters is being written.
 */
export function nextCheckDelayMs(status: RunStatus, projectStatus: ProjectStatus, watching: boolean): number | null {
  if (watching) return 0;
  switch (status) {
    case "QUEUED":
    case "GENERATING":
    case "FETCHING_DATA":
    case "QUALITY_CHECK":
      return 0;
    case "WAITING_FOR_DATA":
    case "HELD":
      return PARKED_CHECK_MS;
    case "NEEDS_ATTENTION":
    case "QUALITY_FAILED":
      return ATTENTION_CHECK_MS;
    case "COMPLETE":
      return SETTLED.has(projectStatus) ? null : COMPLETE_CHECK_MS;
    case "STOPPED":
      return null;
  }
}

// ─── The slots ───────────────────────────────────────────────────────────────

/** Hoisted: statusAfter uses it. */
export function holdsSlot(status: RunStatus): boolean {
  return status === "GENERATING" || status === "FETCHING_DATA";
}

/**
 * The projects that hold a slot: every run that is writing or fetching, and
 * every project with a chapter being written (which covers a chapter the COO
 * re-generates by hand).
 */
export function slotHolders(runs: { projectId: string; status: RunStatus }[], projectsWithActiveChapter: string[]): Set<string> {
  return new Set([...runs.filter((r) => holdsSlot(r.status)).map((r) => r.projectId), ...projectsWithActiveChapter]);
}

/** The queued projects to start now: express first, then the earliest approval, as many as there are free slots. */
export function pickStarts<T extends QueueMember>(queued: T[], holders: number, max = MAX_CONCURRENT_GENERATIONS): T[] {
  const free = Math.max(0, max - holders);
  return orderQueue(queued).slice(0, free);
}

// ─── The sequence, for display and for the check script ──────────────────────

export type SequenceStep = { kind: "chapter"; chapter: number } | { kind: "pause"; afterChapter: number } | { kind: "fetch" } | { kind: "gate" };

/** What a report goes through, in order, for its mode and its chapters. */
export function sequenceFor(mode: number, chapters: readonly number[]): SequenceStep[] {
  const out: SequenceStep[] = [];
  const pauses = new Set(pausePointsFor(mode));
  chapters.forEach((n, i) => {
    out.push({ kind: "chapter", chapter: n });
    const more = i < chapters.length - 1;
    if (more && pauses.has(n)) out.push({ kind: "pause", afterChapter: n });
    if (more && mode === 5 && n === 3) out.push({ kind: "fetch" });
  });
  out.push({ kind: "gate" });
  return out;
}

// ─── Before Start ────────────────────────────────────────────────────────────

export interface StartFacts {
  isReport: boolean;
  modeApproved: boolean;
  projectStatus: ProjectStatus;
  hasSpecialist: boolean;
  chapters: number[];
  research: OrchestratorFacts["research"];
  /** The run the project already has, if any. */
  existing: RunStatus | null;
  chaptersWritten: number;
  confirmNoReferences: boolean;
}

export interface StartVerdict {
  /** Why Start is refused; empty = it may go ahead. */
  refusals: string[];
  /** Shown before Start; `needsConfirmation` means Start must be pressed again with the confirmation. */
  warnings: string[];
  needsConfirmation: boolean;
}

export function checkStart(f: StartFacts): StartVerdict {
  const refusals: string[] = [];
  const warnings: string[] = [];
  if (!f.isReport) refusals.push(ORCHESTRATOR_TEXT.refuse.notReport);
  if (!f.modeApproved) refusals.push(ORCHESTRATOR_TEXT.refuse.modeNotApproved);
  if (f.existing && f.existing !== "STOPPED") refusals.push(ORCHESTRATOR_TEXT.refuse.alreadyStarted);
  if (f.projectStatus === "CANCELLED" || f.projectStatus === "REFUNDED") refusals.push(ORCHESTRATOR_TEXT.refuse.closed);
  else if (!WORKING.has(f.projectStatus)) refusals.push(f.hasSpecialist ? ORCHESTRATOR_TEXT.refuse.notInProgress : ORCHESTRATOR_TEXT.refuse.noSpecialist);
  if (f.chapters.length === 0 || !f.chapters.every((n, i) => n === i + 1)) refusals.push(ORCHESTRATOR_TEXT.refuse.gaps(f.chapters));
  if (f.research.state === "RUNNING") refusals.push(ORCHESTRATOR_TEXT.refuse.researchRunning);
  let needsConfirmation = false;
  if (f.research.state !== "RUNNING" && f.research.kept === 0) {
    warnings.push(ORCHESTRATOR_TEXT.warnNoReferences);
    needsConfirmation = !f.confirmNoReferences;
  }
  return { refusals, warnings, needsConfirmation: refusals.length === 0 && needsConfirmation };
}

// ─── Alerts, sent once ───────────────────────────────────────────────────────

/** One key per event. A key already on the run's `announced` list is never sent again. */
export const noticeKey = {
  chapterFailed: (checkpointId: string, at: Date | null) => `failed:${checkpointId}:${at?.getTime() ?? 0}`,
  chapterStalled: (checkpointId: string, at: Date | null) => `stalled:${checkpointId}:${at?.getTime() ?? 0}`,
  reportReady: (ranAt: Date) => `ready:${ranAt.getTime()}`,
  gateFailed: (ranAt: Date) => `gate-failed:${ranAt.getTime()}`,
  passedNotSubmitted: (ranAt: Date | null) => `passed-not-submitted:${ranAt?.getTime() ?? 0}`,
  attention: (reason: AttentionReason, chapter: number | null) => `attention:${reason}:${chapter ?? 0}`,
};

/** True when the key is new; the caller then adds it to the run. */
export const isNewNotice = (announced: readonly string[], key: string) => !announced.includes(key);

export const withNotice = (announced: readonly string[], key: string) => [...announced.filter((k) => k !== key), key].slice(-ANNOUNCED_KEPT);

// ─── Wording ─────────────────────────────────────────────────────────────────

const WORDS = ["", "One", "Two", "Three", "Four", "Five"];
const chapterName = (n: number | null | undefined) => (n ? `Chapter ${WORDS[n] ?? n}` : "the chapter");
/** "Chapter 3", "Chapters 1 and 3", "Chapters 1, 3, 4 and 5". */
export function chapterList(chapters: readonly number[]): string {
  if (chapters.length <= 1) return `Chapter ${chapters[0] ?? ""}`.trim();
  return `Chapters ${chapters.slice(0, -1).join(", ")} and ${chapters[chapters.length - 1]}`;
}
/** What happens after a failed quality check: the founder and the COO can re-generate, a specialist cannot. */
const QUALITY_FAILED_NEXT = {
  staff: "Re-generate the chapters that failed; the check runs again by itself.",
  specialist: "The COO decides which chapters are written again; the check then runs again by itself.",
} as const;

/**
 * Every sentence the orchestrator shows or sends, for the founder to review.
 * Staff and specialists read these; nothing here goes to a client.
 */
export const ORCHESTRATOR_TEXT = {
  status: {
    QUEUED: "In the queue",
    GENERATING: "Writing",
    WAITING_FOR_DATA: "Waiting for data",
    FETCHING_DATA: "Fetching the dataset",
    QUALITY_CHECK: "Quality check running",
    QUALITY_FAILED: "Quality check failed",
    HELD: "On hold",
    NEEDS_ATTENTION: "Needs attention",
    COMPLETE: "Sent to QA",
    STOPPED: "Stopped",
  } satisfies Record<RunStatus, string>,
  notStarted: "Not started",
  line: {
    notStarted: "The research mode is approved. Press Start to write the report.",
    QUEUED: (chapter: number | null) => `${chapterName(chapter)} starts as soon as a slot is free.`,
    GENERATING: (chapter: number | null) => `${chapterName(chapter)} is being written.`,
    WAITING_FOR_DATA: (after: number | null) => `${chapterName(after)} is written. The report carries on once the data is verified.`,
    FETCHING_DATA: "Chapter Three is written. The dataset for Chapter Four is being fetched.",
    QUALITY_CHECK: "Every chapter is written. The quality check is running.",
    QUALITY_FAILED: (score: number | null, total: number | null) => `The report scored ${score ?? "—"} of ${total ?? 89}. It needs 85 with no critical failure. ${QUALITY_FAILED_NEXT.staff}`,
    COMPLETE: (score: number | null, total: number | null) => `The report passed the quality check (${score ?? "—"} of ${total ?? 89}) and is in the QA queue.`,
    STOPPED: "Generation was stopped. Press Start to carry on from where it stopped.",
  },
  /** What a specialist reads where the founder's or the COO's sentence tells them to press something. */
  specialist: {
    notStarted: "The research mode is approved. The report is written once the COO starts it.",
    stopped: "Generation was stopped. It carries on when the COO starts it again.",
    needsAttention: "The report needs the COO before it can carry on.",
  },
  hold: {
    PROJECT_ON_HOLD: "The project is on hold. Generation carries on by itself when it is back in progress.",
    AWAITING_CLIENT_INPUT: "The project is waiting for the client. Generation carries on by itself when it is back in progress.",
    NOT_IN_PROGRESS: "The project is not in progress (it needs a specialist who has accepted it). Generation carries on by itself when it is.",
    IN_QA: "The report is with QA. Nothing is written while it is there.",
    RESEARCH_RUNNING: "The research is running again. Generation starts when it finishes.",
  } satisfies Record<HoldReason, string>,
  attention: {
    CHAPTER_FAILED: (chapter: number | null) => `${chapterName(chapter)} stopped after several failed attempts. The parts already written are kept.`,
    CHAPTER_STALLED: (chapter: number | null) => `${chapterName(chapter)} made no progress for 90 minutes and was stopped. The parts already written are kept.`,
    PAUSE_DRAFT_FAILED: "The data request could not be drafted. Draft it again on the request card below.",
    PAUSE_CANCELLED: (chapter: number | null) => `The data request was cancelled, and ${chapterName(chapter)} cannot be written without the data. Reopen the request to carry on.`,
    DATA_FETCH_FAILED: "The dataset could not be fetched. Use Fetch data on the card below, then Continue.",
    NO_RESEARCH_QUESTIONS: "Chapter One has a research questions or hypotheses section, but none could be read from it. Write Chapter One again, or continue without them.",
    NO_REFERENCES: "The project has no verified references. Run the research first, or start again and confirm a report without sources.",
    MODE_NOT_APPROVED: "The research mode is no longer approved. Approve the mode card, then Continue.",
    START_REFUSED: (chapter: number | null) => `${chapterName(chapter)} could not be started.`,
    GATE_ERROR: "The quality check could not run. Ask for it again below.",
    PASSED_NOT_SUBMITTED: "The report passed the quality check but could not be sent to QA. Once the reason below is fixed, press Continue.",
  },
  stop: {
    PROJECT_CANCELLED: "The project was cancelled.",
    PROJECT_REFUNDED: "The project was refunded.",
    STOPPED_BY_PERSON: (name: string) => `Stopped by ${name}.`,
  },
  stoppedChapter: (why: string) => `Generation was stopped: ${why} The parts already written are kept.`,
  stalledChapter: "No part was finished for 90 minutes although the chapter was carried on, so it was stopped. The parts already written are kept.",
  refuse: {
    notReport: "This project is not a written report.",
    modeNotApproved: "Approve the research mode first.",
    alreadyStarted: "Generation has already been started for this project.",
    closed: "The project is cancelled or refunded.",
    notInProgress: "The project must be in progress before its report is written.",
    noSpecialist: "Assign a specialist first: the project must be in progress before its report is written.",
    gaps: (chapters: readonly number[]) =>
      chapters.length === 0
        ? "The order has no chapters."
        : `This order is for Chapter ${chapters.join(", ")}. Orders that do not run from Chapter 1 without a gap are written by the specialist, because each chapter is written from the ones before it.`,
    researchRunning: "The research is still running. Start once it has finished.",
    paused: "Generation is switched off in the settings. Nothing new starts until it is switched on.",
  },
  warnNoReferences: "This project has no verified references. The chapters would be written without sources and the report will fail the quality check.",
  // Bell and email
  notice: {
    readyTitle: (code: string) => `Report ready for your review — ${code}`,
    readyMessage: (code: string, score: number | null, total: number | null) => `${code} passed the quality check (${score ?? "—"} of ${total ?? 89}) and is in the QA queue.`,
    gateFailedTitle: (code: string) => `${code} did not pass the quality check`,
    gateFailedSpecialist: (code: string, score: number | null, total: number | null, lines: string[], more: number) =>
      `${code} scored ${score ?? "—"} of ${total ?? 89}; it needs 85.${lines.length ? ` To fix: ${lines.join(" ")}` : ""}${more > 0 ? ` And ${more} more on the Report tab.` : ""}`,
    gateFailedOperations: (code: string, score: number | null, total: number | null, chapters: number[]) =>
      `${code} scored ${score ?? "—"} of ${total ?? 89}; it needs 85.${chapters.length ? ` ${chapterList(chapters)} can be re-generated from the Report tab.` : " See the Report tab."}`,
    stalledTitle: (code: string, chapter: number) => `${code}: Chapter ${chapter} has stalled`,
    stalledMessage: (code: string, chapter: number) => `Chapter ${chapter} of ${code} made no progress for 90 minutes and was stopped. Restart it from the Report tab; the parts already written are kept.`,
    failedTitle: (code: string, chapter: number) => `${code}: Chapter ${chapter} stopped`,
    failedMessage: (code: string, chapter: number, error: string | null) =>
      `Chapter ${chapter} of ${code} stopped${error ? `: ${error}` : "."} Try it again from the Report tab; the parts already written are kept.`,
    attentionTitle: (code: string) => `${code}: report generation needs you`,
    passedNotSubmittedTitle: (code: string) => `${code} passed the quality check but is not in QA`,
  },
} as const;

/** The sentence under the run's status, for the Report tab. */
export function runLine(run: { status: RunStatus; currentChapter: number | null; reason: string | null; reasonDetail?: string | null }, gate: { score: number | null; total: number | null }): string {
  const t = ORCHESTRATOR_TEXT;
  switch (run.status) {
    case "QUEUED":
      return t.line.QUEUED(run.currentChapter);
    case "GENERATING":
      return t.line.GENERATING(run.currentChapter);
    case "WAITING_FOR_DATA":
      return t.line.WAITING_FOR_DATA(run.currentChapter);
    case "FETCHING_DATA":
      return t.line.FETCHING_DATA;
    case "QUALITY_CHECK":
      return t.line.QUALITY_CHECK;
    case "QUALITY_FAILED":
      return t.line.QUALITY_FAILED(gate.score, gate.total);
    case "COMPLETE":
      return t.line.COMPLETE(gate.score, gate.total);
    case "STOPPED":
      return run.reason && run.reason in t.stop && run.reason !== "STOPPED_BY_PERSON" ? `${t.stop[run.reason as "PROJECT_CANCELLED" | "PROJECT_REFUNDED"]}` : t.line.STOPPED;
    case "HELD":
      return run.reason && run.reason in t.hold ? t.hold[run.reason as HoldReason] : t.hold.PROJECT_ON_HOLD;
    case "NEEDS_ATTENTION":
      return attentionLine(run.reason as AttentionReason | null, run.currentChapter);
  }
}

export function attentionLine(reason: AttentionReason | null, chapter: number | null): string {
  const a = ORCHESTRATOR_TEXT.attention;
  switch (reason) {
    case "CHAPTER_FAILED":
      return a.CHAPTER_FAILED(chapter);
    case "CHAPTER_STALLED":
      return a.CHAPTER_STALLED(chapter);
    case "PAUSE_CANCELLED":
      return a.PAUSE_CANCELLED(chapter);
    case "START_REFUSED":
      return a.START_REFUSED(chapter);
    case "PAUSE_DRAFT_FAILED":
    case "DATA_FETCH_FAILED":
    case "NO_RESEARCH_QUESTIONS":
    case "NO_REFERENCES":
    case "MODE_NOT_APPROVED":
    case "GATE_ERROR":
    case "PASSED_NOT_SUBMITTED":
      return a[reason];
    default:
      return "Something needs a person before the report can carry on.";
  }
}

/** What the founder or the COO can press for a reason (the panel shows these). */
export type AttentionAction = "RETRY_CHAPTER" | "REOPEN_PAUSE" | "CONTINUE" | "REWRITE_CHAPTER_ONE" | "ACCEPT_NO_STATEMENTS" | "RUN_GATE" | "CONFIRM_NO_REFERENCES";

/** The button for each, and what the founder or the COO confirms before it spends anything. */
export const ACTION_TEXT: Record<AttentionAction, { label: (chapter: number | null) => string; confirm: ((chapter: number | null) => string) | null }> = {
  RETRY_CHAPTER: {
    label: (n) => `Try Chapter ${n ?? ""} again`.replace("  ", " "),
    confirm: (n) => `Chapter ${n ?? ""} carries on from the part that stopped; the parts already written are kept. It starts at once and spends credits.`.replace("  ", " "),
  },
  REOPEN_PAUSE: { label: () => "Reopen data request", confirm: () => "The client is asked for the data files again, and their delivery date pauses until the data is verified." },
  CONTINUE: { label: () => "Continue", confirm: null },
  REWRITE_CHAPTER_ONE: { label: () => "Write Chapter 1 again", confirm: () => "Chapter 1 is written again and replaces the one there. It starts at once and spends credits." },
  ACCEPT_NO_STATEMENTS: { label: () => "Continue without them", confirm: () => "Chapters 4 and 5 are then told that Chapter 1 states no research questions or hypotheses." },
  RUN_GATE: { label: () => "Run the quality check again", confirm: null },
  CONFIRM_NO_REFERENCES: { label: () => "Write it without references", confirm: () => ORCHESTRATOR_TEXT.warnNoReferences },
};

/** The founder's wording on the greyed-out "Re-run research" button once any chapter exists. */
export const RESEARCH_LOCKED_TOOLTIP = "Generation has started — research cannot be changed";

/** What Start and Stop ask before they act. */
export const START_TEXT = {
  start: "Start writing",
  startAgain: "Start again",
  confirm: (chapters: number) =>
    `The report's ${chapters === 1 ? "chapter is" : `${chapters} chapters are`} written one after another, the quality check runs after the last, and a report that passes goes to the QA queue. It spends credits from the first chapter.`,
  stop: "Stop",
  stopConfirm: "Nothing new starts. A chapter that is being written finishes first, so nothing already paid for is lost. Start carries on from the next chapter.",
  restartStalled: (n: number | null) => `Restart Chapter ${n ?? ""}`.replace("  ", " ").trim(),
} as const;

export function actionsFor(reason: AttentionReason | null): AttentionAction[] {
  switch (reason) {
    case "CHAPTER_FAILED":
    case "CHAPTER_STALLED":
      return ["RETRY_CHAPTER"];
    case "PAUSE_CANCELLED":
      return ["REOPEN_PAUSE"];
    case "NO_RESEARCH_QUESTIONS":
      return ["REWRITE_CHAPTER_ONE", "ACCEPT_NO_STATEMENTS"];
    case "GATE_ERROR":
      return ["RUN_GATE"];
    case "NO_REFERENCES":
      return ["CONFIRM_NO_REFERENCES"];
    case "PAUSE_DRAFT_FAILED":
    case "DATA_FETCH_FAILED":
    case "MODE_NOT_APPROVED":
    case "START_REFUSED":
    case "PASSED_NOT_SUBMITTED":
      return ["CONTINUE"];
    default:
      return ["CONTINUE"];
  }
}

// ─── The run as the Report tab shows it ──────────────────────────────────────

export interface RunView {
  status: RunStatus | "NOT_STARTED";
  label: string;
  line: string;
  /** The error or reason on record, as it is. */
  detail: string | null;
  reason: string | null;
  currentChapter: number | null;
  /** What the founder or the COO can press while the report needs them. */
  actions: AttentionAction[];
  canStart: boolean;
  canStop: boolean;
  /** Why Start would be refused, and what it warns about. */
  start: { refusals: string[]; warnings: string[]; needsConfirmation: boolean } | null;
  startedByName: string | null;
  requestedAt: string | null;
  /** The off switch is on: nothing new starts. */
  paused: boolean;
  /** Any chapter exists: the research can no longer be re-run. */
  generationStarted: boolean;
  /** Verified references on the project, for the Research line. */
  references: number;
  /** PASSED, RUNNING, FAILED or NONE. */
  research: OrchestratorFacts["research"]["state"];
  /** When the quality check last ran: the quality panel reloads when this changes. */
  gateRanAt: string | null;
  /** The cancelled data request the report is stopped at, for "Reopen data request". */
  cancelledPauseId: string | null;
}

/** Changes whenever something the panel shows changes; the progress stream sends the view only then. */
export function runViewKey(v: RunView): string {
  return [
    v.status,
    v.currentChapter ?? "",
    v.reason ?? "",
    v.detail ?? "",
    v.canStart,
    v.canStop,
    v.paused,
    v.generationStarted,
    v.references,
    v.research,
    v.gateRanAt ?? "",
    v.cancelledPauseId ?? "",
    v.line,
    (v.start?.refusals ?? []).join("|"),
    (v.start?.warnings ?? []).join("|"),
  ].join("¦");
}

/**
 * What a specialist may see of the run: its state and sentence, never the
 * buttons or the reasons Start gives the COO. Where the sentence tells the
 * founder or the COO to press something, the specialist reads who decides.
 */
export function runViewForWorker(v: RunView): RunView {
  const s = ORCHESTRATOR_TEXT.specialist;
  // A chapter that stopped is said as it is (its card says who decides); the other reasons are instructions to the COO.
  const chapterStopped = v.reason === "CHAPTER_FAILED" || v.reason === "CHAPTER_STALLED";
  const line =
    v.status === "NOT_STARTED"
      ? s.notStarted
      : v.status === "NEEDS_ATTENTION"
        ? chapterStopped
          ? v.line
          : s.needsAttention
        : v.status === "STOPPED" && v.line === ORCHESTRATOR_TEXT.line.STOPPED
          ? s.stopped
          : v.status === "QUALITY_FAILED"
            ? v.line.replace(QUALITY_FAILED_NEXT.staff, QUALITY_FAILED_NEXT.specialist)
            : v.line;
  return { ...v, line, actions: [], canStart: false, canStop: false, start: null, detail: null, startedByName: null, cancelledPauseId: null };
}
