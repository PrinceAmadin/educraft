/**
 * Phase D6: what the progress dashboard shows and the events that keep it
 * live, on top of D2's chapter events (generation-events.ts). Pure.
 *
 *   pipeline_paused   { pauseId, pausePhase, afterChapter, title, message, uploadRequired, status, statusLine, dataFrom, round, clientFiles, specialistFiles, note }
 *   pipeline_resumed  { pauseId, pausePhase, afterChapter, verifiedAt | cancelledAt }
 *   queue_position    { status, position, queueLength, estimatedStartTime, basis }
 *   run_state         the report's run as the Report tab shows it (D9, orchestrator-view.ts)
 *
 * Every sentence a worker reads about a pause is in PAUSE_PHASE_TEXT and
 * PAUSE_STATUS_TEXT, for the founder to review.
 */
import type { GenerationEvent } from "./generation-events";
import type { QueueState } from "./generation-queue";
import { runViewKey, type RunView } from "./orchestrator-rules";

export type PausePhase = "SURVEY_DATA" | "BUILD_SPECIFICATION" | "TEST_RESULTS" | "LAB_DATA";
export type PauseDisplayStatus = "preparing" | "draft_failed" | "waiting_for_client" | "client_sent";

/** Where each mode waits (D3c: Mode 2 and 4 after Chapter 3, Mode 3 after Chapters 2 and 3). */
export function pausePhaseFor(mode: number, afterChapter: number): PausePhase | null {
  if (mode === 2 && afterChapter === 3) return "SURVEY_DATA";
  if (mode === 3 && afterChapter === 2) return "BUILD_SPECIFICATION";
  if (mode === 3 && afterChapter === 3) return "TEST_RESULTS";
  if (mode === 4 && afterChapter === 3) return "LAB_DATA";
  return null;
}

/** The worker's banner, per phase. `dataFrom` RAW = the order includes our data analysis. */
export const PAUSE_PHASE_TEXT: Record<PausePhase, { title: string; message: (dataFrom: "RAW" | "ANALYSED" | null) => string; uploadRequired: string[] }> = {
  SURVEY_DATA: {
    title: "Waiting for the survey results",
    message: (dataFrom) =>
      `Chapters 1 to 3 are written. Chapter 4 needs the survey results. ${
        dataFrom === "RAW"
          ? "This order includes our data analysis: the client sends their completed questionnaires or data sheet, and you run the analysis and upload the SPSS or Excel output here."
          : "The client sends their own SPSS or Excel output."
      }`,
    uploadRequired: ["SPSS output or Excel export", "Reliability test (Cronbach's Alpha)", "Hypothesis test tables (t-test, ANOVA, chi-square or regression)"],
  },
  BUILD_SPECIFICATION: {
    title: "Waiting for the build specification",
    message: () => "Chapters 1 and 2 are written. Chapter 3 needs the build specification: the tools and technologies, the system architecture and the modules to be built.",
    uploadRequired: ["Tools and technologies (languages, frameworks, hardware)", "Architecture or design diagrams", "List of modules or features", "Screenshots or mock-ups, if any"],
  },
  TEST_RESULTS: {
    title: "Waiting for the test results",
    message: () => "Chapter 3 is written. Chapter 4 needs the test results from the working system.",
    uploadRequired: ["Test cases with pass/fail results", "Performance measurements or benchmarks", "User acceptance feedback", "Screenshots of the working system"],
  },
  LAB_DATA: {
    title: "Waiting for the lab results",
    message: () => "Chapters 1 to 3 are written. Chapter 4 needs the laboratory results.",
    uploadRequired: ["Tabulated measurements", "ANOVA or other statistical output", "Post-hoc test results", "Figures or graphs"],
  },
};

export const PAUSE_STATUS_TEXT: Record<PauseDisplayStatus, (clientFiles: number) => string> = {
  preparing: () => "The data request is being drafted.",
  draft_failed: () => "The data request could not be drafted; the COO has been told.",
  waiting_for_client: () => "Waiting for the client's files; their delivery date is paused. You can add your own files now.",
  client_sent: (n) => `The client sent ${n} file${n === 1 ? "" : "s"}. Check them, add yours if needed, then mark them verified.`,
};

/** The fields of a PipelinePause the dashboard reads (plus its file counts). */
export interface PauseSnapshot {
  id: string;
  afterChapter: number;
  mode: number;
  status: "OPEN" | "SUBMITTED" | "RESUMED" | "CANCELLED";
  formStatus: "GENERATING" | "READY" | "FAILED";
  round: number;
  workerNote: string | null;
  dataFrom: "RAW" | "ANALYSED" | null;
  clientFiles: number;
  specialistFiles: number;
  resumedAt: Date | null;
  cancelledAt: Date | null;
  updatedAt: Date;
}

export function isPauseActive(p: Pick<PauseSnapshot, "status">): boolean {
  return p.status === "OPEN" || p.status === "SUBMITTED";
}

export function pauseDisplayStatus(p: Pick<PauseSnapshot, "status" | "formStatus">): PauseDisplayStatus {
  if (p.formStatus === "GENERATING") return "preparing";
  if (p.formStatus === "FAILED") return "draft_failed";
  return p.status === "SUBMITTED" ? "client_sent" : "waiting_for_client";
}

/** What the banner shows (also the data of pipeline_paused). */
export interface PauseView {
  pauseId: string;
  pausePhase: PausePhase | null;
  afterChapter: number;
  title: string;
  message: string;
  uploadRequired: string[];
  status: PauseDisplayStatus;
  statusLine: string;
  dataFrom: "RAW" | "ANALYSED" | null;
  round: number;
  clientFiles: number;
  specialistFiles: number;
  note: string | null;
}

export function pauseView(p: PauseSnapshot): PauseView {
  const phase = pausePhaseFor(p.mode, p.afterChapter);
  const text = phase ? PAUSE_PHASE_TEXT[phase] : null;
  const status = pauseDisplayStatus(p);
  return {
    pauseId: p.id,
    pausePhase: phase,
    afterChapter: p.afterChapter,
    title: text?.title ?? `Waiting for the data after Chapter ${p.afterChapter}`,
    message: text?.message(p.dataFrom) ?? `Chapter ${p.afterChapter + 1} needs the project's data.`,
    uploadRequired: text?.uploadRequired ?? [],
    status,
    statusLine: PAUSE_STATUS_TEXT[status](p.clientFiles),
    dataFrom: p.dataFrom,
    round: p.round,
    clientFiles: p.clientFiles,
    specialistFiles: p.specialistFiles,
    note: p.status === "OPEN" && p.round > 1 ? p.workerNote : null,
  };
}

/** Changes whenever something the banner shows changes. */
export function pauseKey(p: PauseSnapshot): string {
  return [p.status, p.formStatus, p.round, p.clientFiles, p.specialistFiles, p.dataFrom ?? ""].join("|");
}

export function pausedEvent(p: PauseSnapshot): GenerationEvent {
  return { event: "pipeline_paused", id: `${p.id}:${pauseKey(p)}`, data: pauseView(p) as unknown as Record<string, unknown> };
}

export function resumedEvent(p: PauseSnapshot): GenerationEvent {
  return {
    event: "pipeline_resumed",
    id: `${p.id}:${p.status}`,
    data: {
      pauseId: p.id,
      pausePhase: pausePhaseFor(p.mode, p.afterChapter),
      afterChapter: p.afterChapter,
      ...(p.status === "RESUMED" ? { verifiedAt: (p.resumedAt ?? p.updatedAt).toISOString() } : { cancelledAt: (p.cancelledAt ?? p.updatedAt).toISOString() }),
    },
  };
}

/** The estimate is compared to the minute, so a queue event is not sent for a few seconds of drift. */
export function queueKey(q: QueueState): string {
  const eta = q.estimatedStartTime ? Math.round(new Date(q.estimatedStartTime).getTime() / 60_000) : "";
  return [q.status, q.position ?? "", q.queueLength, eta].join("|");
}

export function queueEvent(q: QueueState): GenerationEvent {
  return { event: "queue_position", id: `queue:${queueKey(q)}`, data: q as unknown as Record<string, unknown> };
}

/** D9: the report's run. Sent on connect and whenever what the panel shows changes. */
export function runStateEvent(v: RunView): GenerationEvent {
  return { event: "run_state", data: v as unknown as Record<string, unknown> };
}

export { runViewKey };

// ─── Chapter titles on the cards ─────────────────────────────────────────────

const STANDARD_TITLES: Record<number, string[]> = {
  2: ["Introduction", "Literature review", "Research methodology", "Data presentation and analysis", "Summary, conclusion and recommendations"],
  3: ["Introduction", "Literature review", "System analysis and design", "Implementation and testing", "Summary, conclusion and recommendations"],
  4: ["Introduction", "Literature review", "Materials and methods", "Results and discussion", "Summary, conclusion and recommendations"],
  5: ["Introduction", "Literature review", "Methodology", "Data presentation and analysis", "Summary, conclusion and recommendations"],
};

/** "Methodology" etc.; Mode 1 (thematic) uses the COO's own titles for Chapters 3 and 4. */
export function chapterTitle(mode: number | null, chapter: number, thematic: { chapter3?: string | null; chapter4?: string | null } = {}): string {
  if (mode === 1) {
    if (chapter === 3 && thematic.chapter3?.trim()) return thematic.chapter3.trim();
    if (chapter === 4 && thematic.chapter4?.trim()) return thematic.chapter4.trim();
    return ["Introduction", "Literature review", "First thematic chapter", "Second thematic chapter", "Conclusion"][chapter - 1] ?? `Chapter ${chapter}`;
  }
  return (STANDARD_TITLES[mode ?? 2] ?? STANDARD_TITLES[2])[chapter - 1] ?? `Chapter ${chapter}`;
}

// ─── One chapter card ────────────────────────────────────────────────────────

export type ChapterCardStatus = "pending" | "generating" | "complete" | "failed" | "stalled";

export interface ChapterCardView {
  chapterNum: number;
  title: string;
  status: ChapterCardStatus;
  /** "outlining" | "writing" while generating. */
  stage: "outlining" | "writing" | null;
  progressPercent: number;
  part: number;
  partCount: number;
  retryingAttempt: number | null;
  words: number | null;
  durationSeconds: number | null;
  error: string | null;
  /** Why a chapter that has not started is waiting, when known. */
  waitingFor: string | null;
}

export const CHAPTER_WAIT_TEXT = {
  pause: (afterChapter: number) => `Waiting for the data (pause after Chapter ${afterChapter})`,
  secondaryData: "Waiting for the secondary data",
  notStarted: "Not started",
} as const;

/** Why chapter `n` is waiting: an active pause before it, or (Mode 5) the dataset. */
export function waitingReason(n: number, opts: { activePauseAfter: number | null; mode: number | null; hasSecondaryData: boolean }): string {
  if (opts.activePauseAfter !== null && opts.activePauseAfter < n) return CHAPTER_WAIT_TEXT.pause(opts.activePauseAfter);
  if (opts.mode === 5 && n >= 4 && !opts.hasSecondaryData) return CHAPTER_WAIT_TEXT.secondaryData;
  return CHAPTER_WAIT_TEXT.notStarted;
}

/** Overall progress: the mean of the chapters, a complete chapter counting 100. */
export function overallPercent(cards: Pick<ChapterCardView, "status" | "progressPercent">[]): number {
  if (!cards.length) return 0;
  const sum = cards.reduce((s, c) => s + (c.status === "complete" ? 100 : c.status === "pending" ? 0 : Math.max(0, Math.min(100, c.progressPercent))), 0); // a failed or stalled chapter counts what it wrote
  return Math.round(sum / cards.length);
}
