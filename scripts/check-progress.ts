/**
 * Phase D6 checks: the progress dashboard's rules, with no database, no
 * network and no Claude call. Pause phases and their text per mode, pause
 * statuses and events, the derived generation queue (order, position,
 * estimate, keys), the project's phase, chapter titles and waiting reasons,
 * overall progress, and the chapter events per audience (the D2 /events shape
 * unchanged; workers never get Claude costs). D9: the stalled-chapter event and
 * the report's run as each audience sees it.
 *
 *   npm run check:progress
 */
import { eventForSnapshot, formatSse, isActive, isStalled, type SnapshotLike } from "../src/lib/generation/generation-events";
import { runViewForWorker, runViewKey, type RunView } from "../src/lib/generation/orchestrator-rules";
import {
  averageProjectMinutes,
  DEFAULT_PROJECT_MINUTES,
  estimateStart,
  MAX_CONCURRENT_GENERATIONS,
  ordinal,
  orderQueue,
  projectPhase,
  queueStateFrom,
  type QueueMember,
} from "../src/lib/generation/generation-queue";
import {
  CHAPTER_WAIT_TEXT,
  chapterTitle,
  overallPercent,
  PAUSE_PHASE_TEXT,
  pauseDisplayStatus,
  pausedEvent,
  pauseKey,
  pausePhaseFor,
  pauseView,
  queueEvent,
  queueKey,
  resumedEvent,
  runStateEvent,
  waitingReason,
  type PauseSnapshot,
} from "../src/lib/generation/progress-events";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failures.push(`${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

// ─── Pause phases (D3c's pause points) ───────────────────────────────────────
check("Mode 2 after Chapter 3 = survey data", pausePhaseFor(2, 3) === "SURVEY_DATA");
check("Mode 3 after Chapter 2 = build specification", pausePhaseFor(3, 2) === "BUILD_SPECIFICATION");
check("Mode 3 after Chapter 3 = test results", pausePhaseFor(3, 3) === "TEST_RESULTS");
check("Mode 4 after Chapter 3 = lab data", pausePhaseFor(4, 3) === "LAB_DATA");
check("Modes 1 and 5 never pause", pausePhaseFor(1, 3) === null && pausePhaseFor(5, 3) === null);
check("no phase at points D3c never pauses at", pausePhaseFor(2, 2) === null && pausePhaseFor(4, 2) === null);
const titles = Object.values(PAUSE_PHASE_TEXT).map((t) => t.title);
check("each phase has its own title", new Set(titles).size === 4, titles);
check("every phase says what to upload", Object.values(PAUSE_PHASE_TEXT).every((t) => t.uploadRequired.length >= 3));
check("the survey message depends on the order (raw data vs the client's own output)", PAUSE_PHASE_TEXT.SURVEY_DATA.message("RAW") !== PAUSE_PHASE_TEXT.SURVEY_DATA.message("ANALYSED") && /you run the analysis/.test(PAUSE_PHASE_TEXT.SURVEY_DATA.message("RAW")) && /their own SPSS or Excel output/.test(PAUSE_PHASE_TEXT.SURVEY_DATA.message("ANALYSED")));
check("the Mode 3 messages name the chapter each pause feeds", /Chapter 3 needs the build specification/.test(PAUSE_PHASE_TEXT.BUILD_SPECIFICATION.message(null)) && /Chapter 4 needs the test results/.test(PAUSE_PHASE_TEXT.TEST_RESULTS.message(null)));
check("no pause text mentions AI or Claude", !/\b(AI|Claude)\b/.test(JSON.stringify(Object.values(PAUSE_PHASE_TEXT).map((t) => [t.title, t.message("RAW"), t.message(null), t.uploadRequired]))));

const snap = (over: Partial<PauseSnapshot> = {}): PauseSnapshot => ({
  id: "cpause00000000000001",
  afterChapter: 3,
  mode: 2,
  status: "OPEN",
  formStatus: "READY",
  round: 1,
  workerNote: null,
  dataFrom: "RAW",
  clientFiles: 0,
  specialistFiles: 0,
  resumedAt: null,
  cancelledAt: null,
  updatedAt: new Date("2026-09-27T12:00:00Z"),
  ...over,
});
check("a request still being drafted is 'preparing'", pauseDisplayStatus(snap({ formStatus: "GENERATING" })) === "preparing");
check("a failed draft is 'draft_failed'", pauseDisplayStatus(snap({ formStatus: "FAILED" })) === "draft_failed");
check("an open, ready request waits for the client", pauseDisplayStatus(snap()) === "waiting_for_client");
check("a submitted pause is 'client_sent'", pauseDisplayStatus(snap({ status: "SUBMITTED" })) === "client_sent");
const sent = pauseView(snap({ status: "SUBMITTED", clientFiles: 3 }));
check("the client_sent line counts the files", sent.statusLine.startsWith("The client sent 3 files."), sent.statusLine);
check("…in the singular too", pauseView(snap({ status: "SUBMITTED", clientFiles: 1 })).statusLine.startsWith("The client sent 1 file."));
check("the banner carries the phase, title and upload list", sent.pausePhase === "SURVEY_DATA" && sent.title === PAUSE_PHASE_TEXT.SURVEY_DATA.title && sent.uploadRequired.length === 3);
check("the note shows only when the specialist asked for more and it is open again", pauseView(snap({ round: 2, workerNote: "Also the codebook" })).note === "Also the codebook" && pauseView(snap({ round: 1, workerNote: "x" })).note === null && pauseView(snap({ status: "SUBMITTED", round: 2, workerNote: "x" })).note === null);
check("a pause at an unexpected point still gets a sensible banner", pauseView(snap({ mode: 5 })).title === "Waiting for the data after Chapter 3");
check("the pause key changes with the files, the round and the status", pauseKey(snap()) !== pauseKey(snap({ clientFiles: 1 })) && pauseKey(snap()) !== pauseKey(snap({ round: 2 })) && pauseKey(snap()) !== pauseKey(snap({ status: "SUBMITTED" })));
check("…and not otherwise", pauseKey(snap()) === pauseKey(snap({ updatedAt: new Date() })));
const pausedFrame = formatSse(pausedEvent(snap({ status: "SUBMITTED", clientFiles: 2 })));
check("pipeline_paused is one SSE frame with one line of JSON", /^id: [^\n]+\nevent: pipeline_paused\ndata: \{[^\n]+\}\n\n$/.test(pausedFrame), pausedFrame);
check("pipeline_paused carries pausePhase and message", (() => {
  const d = JSON.parse(pausedFrame.split("data: ")[1]);
  return d.pausePhase === "SURVEY_DATA" && typeof d.message === "string" && d.status === "client_sent" && d.clientFiles === 2;
})());
const resumed = resumedEvent(snap({ status: "RESUMED", resumedAt: new Date("2026-09-28T09:00:00Z") }));
check("pipeline_resumed on verify carries verifiedAt", resumed.event === "pipeline_resumed" && resumed.data.verifiedAt === "2026-09-28T09:00:00.000Z" && !("cancelledAt" in resumed.data));
check("…and on cancel, cancelledAt", "cancelledAt" in resumedEvent(snap({ status: "CANCELLED", cancelledAt: new Date() })).data);

// ─── The derived queue ───────────────────────────────────────────────────────
const at = (m: number) => new Date(Date.UTC(2026, 8, 27, 10, m));
const members: QueueMember[] = [
  { projectId: "p-a", isExpress: false, approvedAt: at(1) },
  { projectId: "p-b", isExpress: false, approvedAt: at(5) },
  { projectId: "p-c", isExpress: true, approvedAt: at(9) },
  { projectId: "p-d", isExpress: false, approvedAt: null },
  { projectId: "p-e", isExpress: false, approvedAt: at(3) },
];
check("queue order: express first, then approval time, never-approved last", orderQueue(members).map((m) => m.projectId).join() === "p-c,p-a,p-e,p-b,p-d", orderQueue(members).map((m) => m.projectId));
check("queue order is stable on equal times", orderQueue([{ projectId: "z", isExpress: false, approvedAt: at(1) }, { projectId: "y", isExpress: false, approvedAt: at(1) }])[0].projectId === "y");
const now = new Date("2026-09-27T12:00:00Z");
check("a free slot means start now", estimateStart(1, 0, 40, now).getTime() === now.getTime() && estimateStart(3, 0, 40, now).getTime() === now.getTime());
check("all slots busy: one round of the average", estimateStart(1, 3, 40, now).getTime() === now.getTime() + 40 * 60_000);
check("7th with 1 generating: 2 free, then ceil(5/3) = 2 rounds", estimateStart(7, 1, 40, now).getTime() === now.getTime() + 80 * 60_000);
check("the estimate assumes 3 at a time", MAX_CONCURRENT_GENERATIONS === 3);
check("fewer than 3 finished reports: the 40-minute starting figure", JSON.stringify(averageProjectMinutes([30, 50])) === JSON.stringify({ minutes: DEFAULT_PROJECT_MINUTES, fromHistory: false }) && DEFAULT_PROJECT_MINUTES === 40);
check("three or more: their mean", JSON.stringify(averageProjectMinutes([30, 50, 70])) === JSON.stringify({ minutes: 50, fromHistory: true }));
check("bad durations are ignored", averageProjectMinutes([30, 50, NaN, -5]).fromHistory === false);
const q = queueStateFrom({ projectId: "p-b", phase: "not_ready", members, generatingNow: 3, average: { minutes: 40, fromHistory: false }, now });
check("a queued project gets its place and the queue length", q.status === "queued" && q.position === 4 && q.queueLength === 5, q);
check("…and an estimated start", q.estimatedStartTime === new Date(now.getTime() + 80 * 60_000).toISOString(), q.estimatedStartTime);
const outside = queueStateFrom({ projectId: "p-z", phase: "generating", members, generatingNow: 1, average: { minutes: 40, fromHistory: false }, now });
check("a project outside the queue keeps its own phase, no place, no estimate", outside.status === "generating" && outside.position === null && outside.estimatedStartTime === null && outside.queueLength === 5);
check("queue key ignores seconds of drift in the estimate", queueKey({ ...q, estimatedStartTime: "2026-09-27T13:20:10.000Z" }) === queueKey({ ...q, estimatedStartTime: "2026-09-27T13:20:20.000Z" }));
check("…but not a minute's change or a new place", queueKey(q) !== queueKey({ ...q, estimatedStartTime: "2026-09-27T13:25:00.000Z" }) && queueKey(q) !== queueKey({ ...q, position: 3 }));
check("queue_position carries position and estimatedStartTime", (() => {
  const e = queueEvent(q);
  return e.event === "queue_position" && e.data.position === 4 && typeof e.data.estimatedStartTime === "string";
})());
check("ordinals", ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "111th"].join() === [1, 2, 3, 4, 11, 12, 13, 21, 22, 111].map(ordinal).join());

// ─── The project's phase ─────────────────────────────────────────────────────
const run = (chapterNumber: number, status: string) => ({ chapterNumber, status });
check("an active pause wins", projectPhase({ runs: [run(1, "COMPLETED")], activePause: true, chapterCount: 5 }) === "paused");
check("every chapter complete = done", projectPhase({ runs: [1, 2, 3].map((n) => run(n, "COMPLETED")), activePause: false, chapterCount: 3 }) === "done");
check("any chapter started = generating", projectPhase({ runs: [run(1, "COMPLETED")], activePause: false, chapterCount: 5 }) === "generating");
check("no chapter yet = not ready (the queue decides 'queued')", projectPhase({ runs: [], activePause: false, chapterCount: 5, approved: true }) === "not_ready");

// ─── Cards ──────────────────────────────────────────────────────────────────
check("Mode 2 chapter titles", chapterTitle(2, 3) === "Research methodology" && chapterTitle(2, 4) === "Data presentation and analysis");
check("Mode 3 and 4 titles differ where the work differs", chapterTitle(3, 3) === "System analysis and design" && chapterTitle(4, 3) === "Materials and methods");
check("Mode 1 uses the COO's thematic titles", chapterTitle(1, 3, { chapter3: "Oil and the Niger Delta" }) === "Oil and the Niger Delta" && chapterTitle(1, 4, {}) === "Second thematic chapter");
check("no approved mode: standard titles", chapterTitle(null, 1) === "Introduction");
check("a chapter after an open pause waits for the data", waitingReason(4, { activePauseAfter: 3, mode: 2, hasSecondaryData: false }) === CHAPTER_WAIT_TEXT.pause(3));
check("…but not a chapter before it", waitingReason(3, { activePauseAfter: 3, mode: 2, hasSecondaryData: false }) === CHAPTER_WAIT_TEXT.notStarted);
check("Mode 5 chapters 4–5 wait for the secondary data", waitingReason(4, { activePauseAfter: null, mode: 5, hasSecondaryData: false }) === CHAPTER_WAIT_TEXT.secondaryData && waitingReason(4, { activePauseAfter: null, mode: 5, hasSecondaryData: true }) === CHAPTER_WAIT_TEXT.notStarted);
check("overall progress: complete counts 100, pending 0", overallPercent([{ status: "complete", progressPercent: 100 }, { status: "generating", progressPercent: 50 }, { status: "pending", progressPercent: 30 }, { status: "pending", progressPercent: 0 }]) === 38);
check("overall progress of nothing is 0", overallPercent([]) === 0);

// ─── Chapter events per audience ─────────────────────────────────────────────
const base: SnapshotLike = {
  id: "ccheck0000000000001",
  chapterNumber: 2,
  status: "COMPLETED",
  progressPercent: 100,
  partCursor: 2,
  partCount: 2,
  failedSteps: 0,
  errorMessage: null,
  lastError: null,
  lockedUntil: null,
  lastStepAt: null,
  createdAt: new Date("2026-09-27T10:00:00Z"),
  updatedAt: new Date("2026-09-27T10:06:00Z"),
  inputTokens: 1000,
  outputTokens: 2000,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  costUsd: 0.1,
  startedAt: new Date("2026-09-27T10:00:00Z"),
  completedAt: new Date("2026-09-27T10:06:33Z"),
};
const output = { outputLength: 12000, words: 2200 };
const legacy = eventForSnapshot(base, { nairaRate: 1500, output }).data;
check("the D2 /events shape is unchanged", JSON.stringify(Object.keys(legacy).sort()) === JSON.stringify(["chapterNum", "costNaira", "outputLength", "outputTokens", "tokensUsed", "words"]), Object.keys(legacy));
const worker = eventForSnapshot(base, { nairaRate: 1500, output, audience: "worker" }).data;
check("workers get words and the time taken, never Claude costs", worker.words === 2200 && worker.durationSeconds === 393 && !("costNaira" in worker) && !("tokensUsed" in worker), worker);
const admin = eventForSnapshot(base, { nairaRate: 1500, output, audience: "admin" }).data;
check("the founder/COO also get the cost", admin.costNaira === 150 && admin.durationSeconds === 393, admin);
const progress = eventForSnapshot({ ...base, status: "WRITING", progressPercent: 42, partCursor: 1 }, { nairaRate: 1500, audience: "worker" });
check("chapter_progress carries chapterNum and progressPercent", progress.event === "chapter_progress" && progress.data.chapterNum === 2 && progress.data.progressPercent === 42 && progress.data.status === "writing");
const failed = eventForSnapshot({ ...base, status: "FAILED", errorMessage: "Claude was overloaded" }, { nairaRate: 1500, audience: "worker" });
check("chapter_failed carries chapterNum and error", failed.event === "chapter_failed" && failed.data.error === "Claude was overloaded");

// ─── D9: a stalled chapter, and the report's run ─────────────────────────────
const stalled = eventForSnapshot({ ...base, status: "STALLED", progressPercent: 61, partCursor: 1, errorMessage: "No part was finished for 90 minutes." }, { nairaRate: 1500, audience: "worker" });
check("chapter_stalled is its own event, with the chapter, the reason and how far it got", stalled.event === "chapter_stalled" && stalled.data.chapterNum === 2 && stalled.data.error === "No part was finished for 90 minutes." && stalled.data.partsWritten === 1 && stalled.data.progressPercent === 61, stalled);
check("a failed chapter also says how far it got", failed.data.progressPercent === 100);
check("a stalled chapter is not being written", !isActive({ status: "STALLED" }) && !isActive({ status: "FAILED" }) && isActive({ status: "WRITING" }));
check("a stalled chapter is never carried on by the stream", !isStalled({ ...base, status: "STALLED", lastStepAt: new Date("2026-09-27T10:00:00Z") }, new Date("2026-09-27T13:00:00Z").getTime()));
check("a stalled chapter counts what it wrote towards the whole", overallPercent([{ status: "complete", progressPercent: 100 }, { status: "stalled", progressPercent: 40 }]) === 70);

const view: RunView = {
  status: "NEEDS_ATTENTION",
  label: "Needs attention",
  line: "Chapter Three made no progress for 90 minutes and was stopped. The parts already written are kept.",
  detail: "No part was finished for 90 minutes.",
  reason: "CHAPTER_STALLED",
  currentChapter: 3,
  actions: ["RETRY_CHAPTER"],
  canStart: false,
  canStop: true,
  start: null,
  startedByName: "Emmanuel Mebawondu",
  requestedAt: "2026-09-28T09:00:00.000Z",
  paused: false,
  schedulerQuiet: false,
  generationStarted: true,
  references: 52,
  research: "PASSED",
  gateRanAt: null,
  cancelledPauseId: "pause-1",
};
const runFrame = formatSse(runStateEvent(view));
check("run_state is one SSE frame with the run as the Report tab shows it", runFrame.startsWith("event: run_state\ndata: ") && runFrame.endsWith("\n\n") && JSON.parse(runFrame.split("data: ")[1]).status === "NEEDS_ATTENTION");
const forWorker = runViewForWorker(view);
check("a specialist sees the state and its sentence", forWorker.status === view.status && forWorker.line === view.line && forWorker.currentChapter === 3 && forWorker.generationStarted);
check("…never the buttons, who started it, the error on record or the request to reopen", forWorker.actions.length === 0 && !forWorker.canStop && !forWorker.canStart && forWorker.startedByName === null && forWorker.detail === null && forWorker.cancelledPauseId === null && forWorker.start === null, forWorker);
check("the run is sent again only when what it shows changes", runViewKey(view) === runViewKey({ ...view }) && runViewKey(view) !== runViewKey({ ...view, status: "GENERATING" }) && runViewKey(view) !== runViewKey({ ...view, currentChapter: 4 }));
check("…a new quality result and the first chapter both count as a change", runViewKey(view) !== runViewKey({ ...view, gateRanAt: "2026-09-28T10:00:00.000Z" }) && runViewKey(view) !== runViewKey({ ...view, generationStarted: false }));
check("the run carries no cost", !/cost|naira|token/i.test(JSON.stringify(view)));

if (failures.length) {
  console.error(`${failures.length} FAILED:\n  - ${failures.join("\n  - ")}`);
  console.error(`${passed} passed.`);
  process.exit(1);
}
console.log(`${passed} checks passed. The Phase D6 progress rules hold, with D9's run state.`);
