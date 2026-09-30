/**
 * Phase D9: the chapter orchestrator's rules, proven without a database or any
 * Claude call. `npm run check:orchestrator`.
 *
 * A report is walked from Start to the QA queue by applying what `decide`
 * returns to a set of facts, the way orchestrator.ts applies it to the
 * database: each of the five modes, the data pauses, the Mode 5 dataset, the
 * three slots, the watchdog, the quality gate, holds and stops.
 */
import {
  GATE_WAIT_MS,
  KICK_EVERY_MS,
  MAX_FETCH_ATTEMPTS,
  MAX_GATE_ATTEMPTS,
  MAX_PAUSE_DRAFTS,
  SCHEDULER_NOTE_EVERY_MS,
  SCHEDULER_QUIET_MS,
  ACTION_TEXT,
  ORCHESTRATOR_TEXT,
  QUIET_MS,
  RESEARCH_LOCKED_TOOLTIP,
  START_TEXT,
  STALL_AFTER_MS,
  STALL_MIN_KICKS,
  actionsFor,
  approvalReason,
  attentionLine,
  latestChange,
  pendingFromReason,
  chapterList,
  checkStart,
  decide,
  holdsSlot,
  isNewNotice,
  isParked,
  kicksSinceProgress,
  nextCheckDelayMs,
  noticeKey,
  pickStarts,
  runLine,
  runViewForWorker,
  runViewKey,
  schedulerIsQuiet,
  schedulerNoteIsDue,
  sequenceFor,
  slotHolders,
  statusAfter,
  watchChapter,
  withNotice,
  type Action,
  type ChapterFact,
  type OrchestratorFacts,
  type PauseFact,
  type RunFact,
  type RunView,
  type StartFacts,
} from "../src/lib/generation/orchestrator-rules";
import { MAX_CONCURRENT_GENERATIONS } from "../src/lib/generation/generation-queue";
import { gateReason, gateReasonChapter } from "../src/lib/generation/orchestrator-rules";
import type { ChapterGateFact } from "../src/lib/quality/chapter-gate";
import { expectedChapters, runsFromChapterOne } from "../src/lib/deliverables";
import { readChapterOneStatements, statementsUnreadable } from "../src/lib/generation/chapter-one-statements";

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else {
    failures.push(label);
    console.log(`FAIL ${label}${detail === undefined ? "" : `\n     ${JSON.stringify(detail)}`}`);
  }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const T0 = new Date("2026-09-28T09:00:00.000Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const secs = (base: Date, s: number) => new Date(base.getTime() + s * 1000);

const RUN: RunFact = {
  status: "QUEUED",
  currentChapter: 1,
  reason: null,
  allowNoReferences: false,
  statementsReadAt: null,
  statementsAccepted: false,
  pauseDraftAttempts: 0,
  fetchAttempts: 0,
  gateAttempts: 0,
  gateRequestedAt: null,
  gateError: null,
  kickCount: 0,
  lastKickAt: null,
};

function facts(over: Partial<Omit<OrchestratorFacts, "run">> & { run?: Partial<RunFact> } = {}): OrchestratorFacts {
  const { run, ...rest } = over;
  return {
    now: T0,
    project: { status: "IN_PROGRESS", hasSpecialist: true },
    mode: 2,
    chapters: [1, 2, 3, 4, 5],
    checkpoints: [],
    pauses: [],
    hasDataset: false,
    research: { state: "PASSED", kept: 50 },
    gate: { ranAt: null, lockedUntil: null, passed: null, score: null, total: null, autoSubmittedAt: null },
    ...rest,
    run: { ...RUN, ...run },
  };
}

function chapter(n: number, status: ChapterFact["status"], over: Partial<ChapterFact> = {}): ChapterFact {
  const created = at(n * 10);
  return {
    id: `cp-${n}`,
    chapter: n,
    status,
    lockedUntil: null,
    lastStepAt: status === "COMPLETED" ? at(n * 10 + 8) : created,
    lastProgressAt: status === "COMPLETED" ? at(n * 10 + 8) : created,
    createdAt: created,
    startedAt: created,
    completedAt: status === "COMPLETED" ? at(n * 10 + 8) : null,
    errorMessage: null,
    ...over,
  };
}
const written = (...ns: number[]) => ns.map((n) => chapter(n, "COMPLETED"));
const pause = (afterChapter: number, status: PauseFact["status"], formStatus: PauseFact["formStatus"] = "READY"): PauseFact => ({ id: `pause-${afterChapter}`, afterChapter, status, formStatus, formError: null });
/** A run that has read Chapter One's statements (after it was written). */
const READ = { statementsReadAt: at(60), statementsAccepted: true };

// ─── 1. The sequence of each mode ────────────────────────────────────────────

const seq = (mode: number, chapters = [1, 2, 3, 4, 5]) =>
  sequenceFor(mode, chapters)
    .map((s) => (s.kind === "chapter" ? `Ch${s.chapter}` : s.kind === "pause" ? `pause${s.afterChapter}` : s.kind))
    .join(" ");
check("sequence: Mode 1 has no pause", seq(1) === "Ch1 Ch2 Ch3 Ch4 Ch5 gate", seq(1));
check("sequence: Mode 2 pauses after Chapter 3", seq(2) === "Ch1 Ch2 Ch3 pause3 Ch4 Ch5 gate", seq(2));
check("sequence: Mode 3 pauses after Chapters 2 and 3", seq(3) === "Ch1 Ch2 pause2 Ch3 pause3 Ch4 Ch5 gate", seq(3));
check("sequence: Mode 4 pauses after Chapter 3", seq(4) === "Ch1 Ch2 Ch3 pause3 Ch4 Ch5 gate", seq(4));
check("sequence: Mode 5 fetches the dataset after Chapter 3", seq(5) === "Ch1 Ch2 Ch3 fetch Ch4 Ch5 gate", seq(5));
check("sequence: an order for Chapters 1 to 3 never pauses after its last chapter", seq(2, [1, 2, 3]) === "Ch1 Ch2 Ch3 gate", seq(2, [1, 2, 3]));
check("sequence: nor fetches a dataset it will not use", seq(5, [1, 2, 3]) === "Ch1 Ch2 Ch3 gate");

/**
 * Walks a report: applies each action to the facts as orchestrator.ts applies
 * it to the database, and returns what happened in order.
 */
function walk(mode: number, chapters = [1, 2, 3, 4, 5]): string[] {
  let f = facts({ mode, chapters });
  const log: string[] = [];
  let minute = 0;
  for (let i = 0; i < 60; i++) {
    f = { ...f, now: at(++minute) };
    const a = decide(f);
    const status = statusAfter(a, f.run.status);
    if (status) f = { ...f, run: { ...f.run, status } };
    switch (a.kind) {
      case "NEED_SLOT":
        log.push(`Ch${a.chapter}`);
        // The slot is given and the chapter written.
        f = { ...f, checkpoints: [...f.checkpoints, chapter(a.chapter, "COMPLETED", { completedAt: at(minute), lastProgressAt: at(minute), lastStepAt: at(minute) })], run: { ...f.run, status: "GENERATING", gateAttempts: 0, gateRequestedAt: null } };
        break;
      case "READ_STATEMENTS":
        log.push("read");
        f = { ...f, run: { ...f.run, statementsReadAt: at(minute), statementsAccepted: true } };
        break;
      case "OPEN_PAUSE":
        log.push(`open${a.afterChapter}`);
        f = { ...f, pauses: [...f.pauses, pause(a.afterChapter, "OPEN")], run: { ...f.run, pauseDraftAttempts: f.run.pauseDraftAttempts + 1 } };
        break;
      case "WAIT_FOR_DATA":
        log.push(`wait${a.afterChapter}`);
        // The client sends the files and the specialist verifies them.
        f = { ...f, pauses: f.pauses.map((p) => (p.afterChapter === a.afterChapter ? { ...p, status: "RESUMED" as const } : p)), run: { ...f.run, pauseDraftAttempts: 0 } };
        break;
      case "FETCH_DATA":
        log.push("fetch");
        f = { ...f, hasDataset: true };
        break;
      case "REQUEST_GATE":
        log.push("gate");
        f = { ...f, run: { ...f.run, gateRequestedAt: at(minute), gateAttempts: f.run.gateAttempts + 1 }, gate: { ranAt: at(minute), lockedUntil: null, passed: true, score: 87, total: 89, autoSubmittedAt: at(minute + 1) }, project: { ...f.project, status: "SUBMITTED" } };
        break;
      case "PASS":
        log.push("pass");
        return log;
      default:
        log.push(a.kind);
        return log;
    }
  }
  log.push("never finished");
  return log;
}
const story = (mode: number, chapters?: number[]) => walk(mode, chapters).join(" ");
check("walk: Mode 1 writes five chapters in order, then the gate", story(1) === "Ch1 read Ch2 Ch3 Ch4 Ch5 gate pass", story(1));
check("walk: Mode 2 opens its pause after Chapter 3 and carries on once the data is verified", story(2) === "Ch1 read Ch2 Ch3 open3 wait3 Ch4 Ch5 gate pass", story(2));
check("walk: Mode 3 pauses twice", story(3) === "Ch1 read Ch2 open2 wait2 Ch3 open3 wait3 Ch4 Ch5 gate pass", story(3));
check("walk: Mode 4 pauses after Chapter 3", story(4) === "Ch1 read Ch2 Ch3 open3 wait3 Ch4 Ch5 gate pass", story(4));
check("walk: Mode 5 fetches the dataset before Chapter 4", story(5) === "Ch1 read Ch2 Ch3 fetch Ch4 Ch5 gate pass", story(5));
check("walk: an order for Chapters 1 and 2", story(2, [1, 2]) === "Ch1 read Ch2 gate pass", story(2, [1, 2]));
check("walk: a one-chapter order goes straight to the gate", story(1, [1]) === "Ch1 gate pass", story(1, [1]));

// Chapters never run in parallel: while one is being written nothing else is started.
{
  const writing = facts({ mode: 1, checkpoints: [...written(1), chapter(2, "WRITING", { lockedUntil: at(62) })], now: at(61), run: READ });
  check("one at a time: while Chapter 2 is written, nothing is started", decide(writing).kind === "WRITING", decide(writing));
}

// ─── 2. Mode 5: the dataset ──────────────────────────────────────────────────
{
  const f3 = facts({ mode: 5, checkpoints: written(1, 2, 3), run: READ });
  check("Mode 5: the dataset is fetched before Chapter 4", decide(f3).kind === "FETCH_DATA");
  check("Mode 5: a stored dataset is not fetched again", same(decide({ ...f3, hasDataset: true }), { kind: "NEED_SLOT", chapter: 4 }));
  check("Mode 5: fetching holds a slot", statusAfter({ kind: "FETCH_DATA" }, "GENERATING") === "FETCHING_DATA" && holdsSlot("FETCHING_DATA"));
  const tired = decide({ ...f3, run: { ...f3.run, fetchAttempts: MAX_FETCH_ATTEMPTS } });
  check("Mode 5: three failed fetches need a person", tired.kind === "ATTENTION" && tired.reason === "DATA_FETCH_FAILED", tired);
  check("Mode 5: two failed fetches try again", decide({ ...f3, run: { ...f3.run, fetchAttempts: MAX_FETCH_ATTEMPTS - 1 } }).kind === "FETCH_DATA");
  check("Mode 5: Chapters 1 to 3 need no dataset", same(decide(facts({ mode: 5, checkpoints: written(1), run: READ })), { kind: "NEED_SLOT", chapter: 2 }));
  check("only Mode 5 fetches", same(decide(facts({ mode: 1, checkpoints: written(1, 2, 3), run: READ })), { kind: "NEED_SLOT", chapter: 4 }));
}

// ─── 3. The data pauses ──────────────────────────────────────────────────────
{
  const after3 = (p: PauseFact[], run: Partial<RunFact> = {}) => decide(facts({ mode: 2, checkpoints: written(1, 2, 3), pauses: p, run: { ...READ, ...run } }));
  check("pause: no request yet -> it is opened", same(after3([]), { kind: "OPEN_PAUSE", afterChapter: 3 }));
  check("pause: open and waiting for the client -> nothing is written", after3([pause(3, "OPEN")]).kind === "WAIT_FOR_DATA");
  check("pause: sent but not verified -> nothing is written", after3([pause(3, "SUBMITTED")]).kind === "WAIT_FOR_DATA");
  check("pause: verified -> Chapter 4 waits for a slot, it does not jump the queue", same(after3([pause(3, "RESUMED")]), { kind: "NEED_SLOT", chapter: 4 }));
  check("pause: waiting releases the slot", statusAfter({ kind: "WAIT_FOR_DATA", afterChapter: 3, pauseId: "p" }, "GENERATING") === "WAITING_FOR_DATA" && !holdsSlot("WAITING_FOR_DATA"));
  check("pause: once verified, the project waits in the queue for a slot", statusAfter({ kind: "NEED_SLOT", chapter: 4 }, "WAITING_FOR_DATA") === "QUEUED");
  const cancelled = after3([pause(3, "CANCELLED")]);
  check("pause: a cancelled request needs a person (Chapter 4 cannot be written without data)", cancelled.kind === "ATTENTION" && cancelled.reason === "PAUSE_CANCELLED", cancelled);
  check("pause: a failed draft is drafted again", same(after3([pause(3, "OPEN", "FAILED")], { pauseDraftAttempts: 1 }), { kind: "OPEN_PAUSE", afterChapter: 3 }));
  const gaveUp = after3([pause(3, "OPEN", "FAILED")], { pauseDraftAttempts: MAX_PAUSE_DRAFTS });
  check("pause: two failed drafts need a person", gaveUp.kind === "ATTENTION" && gaveUp.reason === "PAUSE_DRAFT_FAILED", gaveUp);
  check("pause: a draft cut off half way is drafted again", same(after3([pause(3, "OPEN", "GENERATING")], { pauseDraftAttempts: 1 }), { kind: "OPEN_PAUSE", afterChapter: 3 }));
  const m3 = (checkpoints: ChapterFact[], p: PauseFact[]) => decide(facts({ mode: 3, checkpoints, pauses: p, run: READ }));
  check("Mode 3: the build specification is asked for after Chapter 2", same(m3(written(1, 2), []), { kind: "OPEN_PAUSE", afterChapter: 2 }));
  check("Mode 3: Chapter 3 needs only the first pause", same(m3(written(1, 2), [pause(2, "RESUMED")]), { kind: "NEED_SLOT", chapter: 3 }));
  check("Mode 3: the test results are asked for after Chapter 3", same(m3(written(1, 2, 3), [pause(2, "RESUMED")]), { kind: "OPEN_PAUSE", afterChapter: 3 }));
  check("Mode 3: Chapter 4 needs both", same(m3(written(1, 2, 3), [pause(2, "RESUMED"), pause(3, "RESUMED")]), { kind: "NEED_SLOT", chapter: 4 }));
  check("Mode 1 never pauses", same(decide(facts({ mode: 1, checkpoints: written(1, 2, 3), run: READ })), { kind: "NEED_SLOT", chapter: 4 }));
}

// ─── 4. Chapter One's research questions and hypotheses ──────────────────────
{
  check("statements: read once Chapter 1 is written", decide(facts({ checkpoints: written(1) })).kind === "READ_STATEMENTS");
  check("statements: not needed for Chapter 1 itself", same(decide(facts()), { kind: "NEED_SLOT", chapter: 1 }));
  check("statements: read again when Chapter 1 is written again", decide(facts({ checkpoints: [chapter(1, "COMPLETED", { completedAt: at(90) })], run: { statementsReadAt: at(60), statementsAccepted: true } })).kind === "READ_STATEMENTS");
  const unreadable = decide(facts({ checkpoints: written(1), run: { statementsReadAt: at(60), statementsAccepted: false } }));
  check("statements: unreadable ones stop the report for a person", unreadable.kind === "ATTENTION" && unreadable.reason === "NO_RESEARCH_QUESTIONS", unreadable);
  check("statements: …until someone continues without them", same(decide(facts({ checkpoints: written(1), run: READ })), { kind: "NEED_SLOT", chapter: 2 }));

  const one = "[H1] CHAPTER ONE\n\n[H1] INTRODUCTION\n\n[H2] 1.1 Background of the Study\n\nMobile money has grown.\n\n[H2] 1.4 Research Questions\n\n1. What is the level of mobile money adoption among market traders in Lagos State?\n2. How does mobile money adoption affect the sales of market traders?\n\n[H2] 1.5 Research Hypotheses\n\nH01: There is no significant relationship between mobile money adoption and sales performance.\n\n[H2] 1.6 Significance of the Study\n\nThe study matters.";
  const read = readChapterOneStatements(one);
  check("reader: both research questions", read.researchQuestions.length === 2 && read.researchQuestions[0].startsWith("What is the level"), read.researchQuestions);
  check("reader: the hypothesis without its label", same(read.hypotheses, ["There is no significant relationship between mobile money adoption and sales performance."]), read.hypotheses);
  check("reader: readable", !statementsUnreadable(read));
  const joint = readChapterOneStatements("[H2] 1.4 Research Questions and Hypotheses\n\n1. What is the level of adoption among the traders?\n\nH01: There is no significant relationship between adoption and sales.");
  check("reader: under a joint heading the questions and the hypotheses are told apart", joint.researchQuestions.length === 1 && joint.hypotheses.length === 1 && !joint.hypotheses[0].includes("?"), joint);
  const nested = readChapterOneStatements("[H2] 1.4 Research Questions\n\n[H3] 1.4.1 Main questions\n\n1. What is the effect of the scheme on enrolment?\n\n[H2] 1.5 Scope\n\n1. Is this a question about something else entirely?");
  check("reader: a sub-section under the heading still belongs to it", same(nested.researchQuestions, ["What is the effect of the scheme on enrolment?"]), nested.researchQuestions);
  const none = readChapterOneStatements("[H2] 1.1 Background\n\nText.\n\n[H2] 1.2 Aim and Objectives\n\n1. To design the meter.");
  check("reader: a chapter that states none is not unreadable", none.researchQuestions.length === 0 && !statementsUnreadable(none));
  const empty = readChapterOneStatements("[H2] 1.4 Research Questions\n\nThe study is guided by the questions below.\n\n[H2] 1.5 Scope\n\nLagos.");
  check("reader: a heading with nothing readable under it is unreadable", statementsUnreadable(empty), empty);
}

// ─── 5. Readiness ────────────────────────────────────────────────────────────
{
  const noMode = decide(facts({ mode: null }));
  check("readiness: a mode that is not approved starts nothing", noMode.kind === "ATTENTION" && noMode.reason === "MODE_NOT_APPROVED", noMode);
  check("readiness: research running again holds the project", same(decide(facts({ research: { state: "RUNNING", kept: 0 } })), { kind: "HOLD", reason: "RESEARCH_RUNNING" }));
  const noRefs = decide(facts({ research: { state: "NONE", kept: 0 } }));
  check("readiness: no references and no confirmation starts nothing", noRefs.kind === "ATTENTION" && noRefs.reason === "NO_REFERENCES", noRefs);
  check("readiness: …but a confirmed start goes ahead", same(decide(facts({ research: { state: "NONE", kept: 0 }, run: { allowNoReferences: true } })), { kind: "NEED_SLOT", chapter: 1 }));

  const start: StartFacts = { schedulerQuiet: false, isReport: true, modeApproved: true, projectStatus: "IN_PROGRESS", hasSpecialist: true, chapters: [1, 2, 3, 4, 5], research: { state: "PASSED", kept: 50 }, existing: null, chaptersWritten: 0, confirmNoReferences: false };
  check("Start: a ready project", same(checkStart(start), { refusals: [], warnings: [], needsConfirmation: false }));
  check("Start: refused before the mode is approved", checkStart({ ...start, modeApproved: false }).refusals.includes(ORCHESTRATOR_TEXT.refuse.modeNotApproved));
  check("Start: refused for a project that is not a report", checkStart({ ...start, isReport: false }).refusals.includes(ORCHESTRATOR_TEXT.refuse.notReport));
  check("Start: refused twice (409)", checkStart({ ...start, existing: "GENERATING" }).refusals.includes(ORCHESTRATOR_TEXT.refuse.alreadyStarted));
  check("Start: allowed again after Stop", checkStart({ ...start, existing: "STOPPED" }).refusals.length === 0);
  check("Start: refused without a specialist", checkStart({ ...start, projectStatus: "REQUIREMENTS_CONFIRMED", hasSpecialist: false }).refusals.includes(ORCHESTRATOR_TEXT.refuse.noSpecialist));
  check("Start: refused until the specialist has accepted", checkStart({ ...start, projectStatus: "ASSIGNED" }).refusals.includes(ORCHESTRATOR_TEXT.refuse.notInProgress));
  check("Start: refused while the research is running", checkStart({ ...start, research: { state: "RUNNING", kept: 0 } }).refusals.includes(ORCHESTRATOR_TEXT.refuse.researchRunning));
  check("Start: refused for a cancelled project", checkStart({ ...start, projectStatus: "CANCELLED" }).refusals.includes(ORCHESTRATOR_TEXT.refuse.closed));
  const gaps = checkStart({ ...start, chapters: [2, 4] });
  check("Start: an order with gaps is refused, with the reason", gaps.refusals.length === 1 && gaps.refusals[0].startsWith("This order is for Chapters 2 and 4."), gaps);

  // The scheduler's calls carry a report from chapter to chapter, and the watchdog runs on them.
  const at = new Date("2026-09-28T10:00:00.000Z");
  const ago = (ms: number) => new Date(at.getTime() - ms);
  check("scheduler: never seen is quiet", schedulerIsQuiet(null, at));
  check("scheduler: seen 90 seconds ago is not quiet", !schedulerIsQuiet(ago(90_000), at));
  check("scheduler: seen exactly five minutes ago is not quiet yet", !schedulerIsQuiet(ago(SCHEDULER_QUIET_MS), at));
  check("scheduler: seen six minutes ago is quiet", schedulerIsQuiet(ago(6 * 60_000), at));
  check("scheduler: its call is written down at most once a minute", schedulerNoteIsDue(null, at) && !schedulerNoteIsDue(ago(30_000), at) && schedulerNoteIsDue(ago(60_000), at));
  check("scheduler: the note is written often enough that a calling scheduler never reads as quiet", SCHEDULER_NOTE_EVERY_MS + 2 * 30_000 < SCHEDULER_QUIET_MS);
  const quiet = checkStart({ ...start, schedulerQuiet: true });
  check("Start: refused while the scheduler is not calling, with the reason", quiet.refusals.length === 1 && quiet.refusals[0] === ORCHESTRATOR_TEXT.refuse.schedulerQuiet && !quiet.needsConfirmation, quiet);
  check("Start: a quiet scheduler also stops Start again after Stop", checkStart({ ...start, existing: "STOPPED", schedulerQuiet: true }).refusals.includes(ORCHESTRATOR_TEXT.refuse.schedulerQuiet));
  check("Start: Chapter 4 alone is refused", checkStart({ ...start, chapters: [4] }).refusals.length === 1);
  check("Start: Chapters 1 to 3 are fine", checkStart({ ...start, chapters: [1, 2, 3] }).refusals.length === 0);
  const bare = checkStart({ ...start, research: { state: "NONE", kept: 0 } });
  check("Start: no references asks for a second confirmation", bare.refusals.length === 0 && bare.needsConfirmation && bare.warnings.includes(ORCHESTRATOR_TEXT.warnNoReferences), bare);
  check("Start: confirmed, it goes ahead with the warning", !checkStart({ ...start, research: { state: "NONE", kept: 0 }, confirmNoReferences: true }).needsConfirmation);

  check("chapters: a full report", same(expectedChapters({ serviceCode: "FYP-FULL", additionalData: null, chapterCount: 5 }), [1, 2, 3, 4, 5]));
  check("chapters: a four-chapter report", same(expectedChapters({ serviceCode: "THESIS", additionalData: null, chapterCount: 4 }), [1, 2, 3, 4]));
  check("chapters: never more than five", same(expectedChapters({ serviceCode: "FYP-FULL", additionalData: null, chapterCount: 6 }), [1, 2, 3, 4, 5]));
  check("chapters: a chapter-based order writes the chapters ordered", same(expectedChapters({ serviceCode: "FYP-CHAPTERS", additionalData: { chapters: [4, 2] }, chapterCount: 2 }), [2, 4]));
  check("chapters: the chapters of another service are ignored", same(expectedChapters({ serviceCode: "FYP-FULL", additionalData: { chapters: [2, 4] }, chapterCount: 5 }), [1, 2, 3, 4, 5]));
  check("chapters: Chapter 4 only", same(expectedChapters({ serviceCode: "FYP-CH4", additionalData: null, chapterCount: null }), [4]));
  check("chapters: 1 to N with no gap", runsFromChapterOne([1, 2, 3]) && !runsFromChapterOne([2, 3]) && !runsFromChapterOne([1, 3]) && !runsFromChapterOne([]));
}

// ─── 6. The three slots ──────────────────────────────────────────────────────
{
  const member = (projectId: string, isExpress: boolean, minute: number | null) => ({ projectId, isExpress, approvedAt: minute === null ? null : at(minute) });
  const queue = [member("d", false, 40), member("a", false, 10), member("x", true, 90), member("b", false, 20)];
  const ids = (list: { projectId: string }[]) => list.map((m) => m.projectId).join("");
  check("slots: the limit is three", MAX_CONCURRENT_GENERATIONS === 3);
  check("slots: three holders and four queued -> none starts", pickStarts(queue, 3).length === 0);
  check("slots: four holders (a manual re-generation) -> still none", pickStarts(queue, 4).length === 0);
  check("slots: one free -> the express order first", ids(pickStarts(queue, 2)) === "x");
  check("slots: two free -> express, then the earliest approval", ids(pickStarts(queue, 1)) === "xa");
  check("slots: all free -> three start, the fourth waits", ids(pickStarts(queue, 0)) === "xab");
  check("slots: equal approval times fall back to the id, so the order is stable", ids(pickStarts([member("n", false, 5), member("m", false, 5)], 2)) === "m");
  check("slots: a project never approved goes last", ids(pickStarts([member("z", false, null), member("y", false, 99)], 2)) === "y");
  const holders = slotHolders(
    [
      { projectId: "p1", status: "GENERATING" },
      { projectId: "p2", status: "FETCHING_DATA" },
      { projectId: "p3", status: "WAITING_FOR_DATA" },
      { projectId: "p4", status: "QUALITY_FAILED" },
      { projectId: "p5", status: "QUEUED" },
      { projectId: "p6", status: "NEEDS_ATTENTION" },
      { projectId: "p7", status: "QUALITY_CHECK" },
      { projectId: "p8", status: "STOPPED" },
    ],
    ["p4", "p1"],
  );
  check("slots: writing and fetching hold one; a pause, the gate, a failure and a stop do not", same([...holders].sort(), ["p1", "p2", "p4"]), [...holders]);
  check("slots: a chapter re-generated by hand counts against the slots", holders.has("p4"));
  check("slots: a project is counted once", slotHolders([{ projectId: "p1", status: "GENERATING" }], ["p1", "p1"]).size === 1);
  check("slots: a project that has just started waits in the queue", statusAfter({ kind: "NEED_SLOT", chapter: 1 }, "QUEUED") === "QUEUED" && !holdsSlot("QUEUED"));
  check("slots: between two chapters a project keeps its slot", statusAfter({ kind: "NEED_SLOT", chapter: 2 }, "GENERATING") === "GENERATING");
  check("slots: …and after the dataset is fetched", statusAfter({ kind: "NEED_SLOT", chapter: 4 }, "FETCHING_DATA") === "GENERATING");
  check(
    "slots: a project that gave its slot up queues again (a hold, a person's decision, a failed gate)",
    (["HELD", "NEEDS_ATTENTION", "QUALITY_FAILED", "COMPLETE", "WAITING_FOR_DATA"] as const).every((s) => statusAfter({ kind: "NEED_SLOT", chapter: 3 }, s) === "QUEUED"),
  );
}

// ─── 7. The watchdog ─────────────────────────────────────────────────────────
{
  const quiet = (over: Partial<ChapterFact>, run: Partial<RunFact>, now: Date) => watchChapter(chapter(2, "WRITING", over), { ...RUN, ...run }, now);
  const began = at(20);
  check("watchdog: the rules are 75 seconds and 90 minutes", QUIET_MS === 75_000 && STALL_AFTER_MS === 90 * 60_000 && STALL_MIN_KICKS === 3);
  check("watchdog: a chapter a slice is working on is left alone", quiet({ lockedUntil: secs(began, 200) }, {}, secs(began, 100)) === "WAIT");
  check("watchdog: a lapsed lease but a recent step -> wait", quiet({ lastStepAt: secs(began, 60) }, {}, secs(began, 100)) === "WAIT");
  check("watchdog: quiet for 76 seconds -> carried on", quiet({ lastStepAt: began }, {}, secs(began, 76)) === "KICK");
  check("watchdog: quiet for 75 seconds exactly -> not yet", quiet({ lastStepAt: began }, {}, secs(began, 75)) === "WAIT");
  check("watchdog: carried on at most once a minute", KICK_EVERY_MS === 60_000 && quiet({ lastStepAt: began }, { kickCount: 1, lastKickAt: secs(began, 80) }, secs(began, 120)) === "WAIT");
  check("watchdog: …and again after the minute", quiet({ lastStepAt: began }, { kickCount: 1, lastKickAt: secs(began, 80) }, secs(began, 141)) === "KICK");
  const late = new Date(began.getTime() + STALL_AFTER_MS + 60_000);
  check("watchdog: 91 minutes and 3 attempts -> stalled", quiet({ lastProgressAt: began, lastStepAt: began }, { kickCount: 3, lastKickAt: secs(began, 3000) }, late) === "STALL");
  check("watchdog: 91 minutes and no attempt (the scheduler was down) -> carried on, not stalled", quiet({ lastProgressAt: began, lastStepAt: began }, {}, late) === "KICK");
  check("watchdog: 91 minutes and 2 attempts -> carried on once more", quiet({ lastProgressAt: began, lastStepAt: began }, { kickCount: 2, lastKickAt: secs(began, 3000) }, late) === "KICK");
  check("watchdog: 89 minutes and 3 attempts -> not yet", quiet({ lastProgressAt: began, lastStepAt: began }, { kickCount: 3, lastKickAt: secs(began, 3000) }, new Date(began.getTime() + STALL_AFTER_MS - 60_000)) !== "STALL");
  check(
    "watchdog: a draft save or a failed attempt (lastStepAt) does not reset the clock",
    quiet({ lastProgressAt: began, lastStepAt: new Date(late.getTime() - 5000) }, { kickCount: 3, lastKickAt: secs(began, 3000) }, late) === "STALL",
  );
  check(
    "watchdog: a held lease does not hide a stuck chapter",
    quiet({ lastProgressAt: began, lastStepAt: began, lockedUntil: new Date(late.getTime() + 60_000) }, { kickCount: 3, lastKickAt: secs(began, 3000) }, late) === "STALL",
  );
  check("watchdog: a finished part resets the clock", quiet({ lastProgressAt: new Date(late.getTime() - 60_000), lastStepAt: new Date(late.getTime() - 60_000) }, { kickCount: 3, lastKickAt: secs(began, 3000) }, late) !== "STALL");
  check("watchdog: attempts made before the last progress do not count", kicksSinceProgress({ lastProgressAt: secs(began, 600), startedAt: began, createdAt: began }, { kickCount: 5, lastKickAt: secs(began, 300) }) === 0);
  check("watchdog: attempts since it do", kicksSinceProgress({ lastProgressAt: secs(began, 600), startedAt: began, createdAt: began }, { kickCount: 2, lastKickAt: secs(began, 700) }) === 2);

  const stuck = decide(facts({ mode: 1, now: late, checkpoints: [...written(1), chapter(2, "WRITING", { lastProgressAt: began, lastStepAt: began })], run: { ...READ, kickCount: 3, lastKickAt: secs(began, 3000) } }));
  check("watchdog: the stuck chapter is named", same(stuck, { kind: "STALL", chapter: 2, checkpointId: "cp-2" }));
  check("watchdog: a stalled chapter releases the slot and needs a person", statusAfter(stuck, "GENERATING") === "NEEDS_ATTENTION" && !holdsSlot("NEEDS_ATTENTION"));
  const stalled = decide(facts({ mode: 1, checkpoints: [...written(1), chapter(2, "STALLED", { errorMessage: "no progress" })], run: READ }));
  check("watchdog: a STALLED chapter is never restarted by the orchestrator", stalled.kind === "ATTENTION" && stalled.reason === "CHAPTER_STALLED" && same(actionsFor("CHAPTER_STALLED"), ["RETRY_CHAPTER"]), stalled);
  const failed = decide(facts({ mode: 1, checkpoints: [...written(1), chapter(2, "FAILED", { errorMessage: "Claude declined" })], run: READ }));
  check("watchdog: nor a FAILED one, and its error is shown", failed.kind === "ATTENTION" && failed.reason === "CHAPTER_FAILED" && failed.detail === "Claude declined", failed);
  check("watchdog: once a person restarts it, it is written again", decide(facts({ mode: 1, checkpoints: [...written(1), chapter(2, "WRITING", { lockedUntil: at(999) })], run: { ...READ, status: "NEEDS_ATTENTION", reason: "CHAPTER_FAILED" } })).kind === "WRITING");
}

// ─── 8. The quality gate ─────────────────────────────────────────────────────
{
  const all = written(1, 2, 3, 4, 5); // Chapter 5 finished at minute 58
  const done = (over: Partial<Omit<OrchestratorFacts, "run">> & { run?: Partial<RunFact> } = {}) => facts({ mode: 1, checkpoints: all, now: at(70), ...over, run: { ...READ, ...over.run } });
  check("gate: asked for once the last chapter is written", decide(done()).kind === "REQUEST_GATE");
  check("gate: never while a chapter is being written", decide(done({ checkpoints: [...written(1, 2, 3, 4), chapter(5, "WRITING", { lockedUntil: at(71) })] })).kind === "WRITING");
  check("gate: never for a report with a chapter missing", same(decide(done({ checkpoints: written(1, 2, 3, 4) })), { kind: "NEED_SLOT", chapter: 5 }));
  check("gate: asked for and still running -> wait", decide(done({ run: { gateRequestedAt: at(68), gateAttempts: 1 } })).kind === "GATE_RUNNING");
  check("gate: the gate's own lease -> wait", decide(done({ gate: { ranAt: null, lockedUntil: at(73), passed: null, score: null, total: null, autoSubmittedAt: null } })).kind === "GATE_RUNNING");
  const waited = new Date(at(68).getTime() + GATE_WAIT_MS + 1000);
  check("gate: no answer after six minutes -> asked again", decide(done({ now: waited, run: { gateRequestedAt: at(68), gateAttempts: 1 } })).kind === "REQUEST_GATE");
  const gaveUp = decide(done({ now: waited, run: { gateRequestedAt: at(68), gateAttempts: MAX_GATE_ATTEMPTS, gateError: "boom" } }));
  check("gate: three unanswered requests need a person", gaveUp.kind === "ATTENTION" && gaveUp.reason === "GATE_ERROR" && gaveUp.detail === "boom", gaveUp);

  const gate = (passed: boolean, ranAtMinute: number, submittedAtMinute: number | null, lockedUntil: Date | null = null) => ({ ranAt: at(ranAtMinute), lockedUntil, passed, score: passed ? 87 : 82, total: 89, autoSubmittedAt: submittedAtMinute === null ? null : at(submittedAtMinute) });
  const pass = decide(done({ gate: gate(true, 69, 70), project: { status: "SUBMITTED", hasSpecialist: true } }));
  check("gate: passed and sent to QA -> complete", pass.kind === "PASS" && statusAfter(pass, "QUALITY_CHECK") === "COMPLETE", pass);
  check("gate: the quality check holds no slot", statusAfter({ kind: "REQUEST_GATE" }, "GENERATING") === "QUALITY_CHECK" && !holdsSlot("QUALITY_CHECK"));
  const fail = decide(done({ gate: gate(false, 69, null) }));
  check("gate: failed -> waits for a person, nothing is re-generated", fail.kind === "FAIL" && statusAfter(fail, "QUALITY_CHECK") === "QUALITY_FAILED", fail);
  check("gate: a failed report holds no slot", !holdsSlot("QUALITY_FAILED"));
  const notSent = decide(done({ gate: gate(true, 69, null) }));
  check("gate: passed but not sent to QA -> a person is told", notSent.kind === "ATTENTION" && notSent.reason === "PASSED_NOT_SUBMITTED", notSent);
  check("gate: a result being saved (lease still held) is not read yet", decide(done({ gate: gate(true, 69, null, at(72)) })).kind === "GATE_RUNNING");
  check("gate: a result older than the last chapter is ignored", decide(done({ gate: gate(true, 50, 51) })).kind === "REQUEST_GATE");
  check("gate: an old submission does not count for a new pass", decide(done({ gate: gate(true, 69, 40) })).kind === "ATTENTION");

  // After a fail: the COO re-generates Chapter 5, and the gate runs again by itself.
  const failedRun = { status: "QUALITY_FAILED" as const, gateRequestedAt: at(68), gateAttempts: 1 };
  check("after a fail: nothing happens until a chapter is re-generated", decide(done({ gate: gate(false, 69, null), run: failedRun })).kind === "FAIL");
  const rewriting = decide(done({ now: at(80), gate: gate(false, 69, null), run: failedRun, checkpoints: [...written(1, 2, 3, 4), chapter(5, "WRITING", { createdAt: at(79), lastStepAt: at(79), lastProgressAt: at(79), lockedUntil: at(81) })] }));
  check("after a fail: a re-generated chapter is written", rewriting.kind === "WRITING" && statusAfter(rewriting, "QUALITY_FAILED") === "GENERATING", rewriting);
  const rewritten = [...written(1, 2, 3, 4), chapter(5, "COMPLETED", { completedAt: at(88) })];
  check("after a fail: once it is written, the gate is asked for again", decide(done({ now: at(90), gate: gate(false, 69, null), run: failedRun, checkpoints: rewritten })).kind === "REQUEST_GATE");
  check("after a fail: the earlier request does not count as a fresh one", decide(done({ now: at(89), gate: gate(false, 69, null), run: { ...failedRun, gateAttempts: MAX_GATE_ATTEMPTS }, checkpoints: rewritten })).kind === "REQUEST_GATE");

  // After a QA revision the same loop applies.
  const revision = { status: "REVISION_NEEDED" as const, hasSpecialist: true };
  check("QA revision: a passed report stays complete", decide(done({ gate: gate(true, 69, 70), project: revision, run: { status: "COMPLETE" } })).kind === "PASS");
  check("QA revision: a re-generated chapter brings the gate back", decide(done({ now: at(95), gate: gate(true, 69, 70), project: revision, run: { status: "COMPLETE" }, checkpoints: rewritten })).kind === "REQUEST_GATE");
  check("recall: a recalled report stays complete until a chapter changes", decide(done({ gate: gate(true, 69, 70), project: { status: "IN_PROGRESS", hasSpecialist: true }, run: { status: "COMPLETE" } })).kind === "PASS");
  check("in QA: the gate is never run on a report the specialist submitted by hand", same(decide(done({ project: { status: "SUBMITTED", hasSpecialist: true } })), { kind: "HOLD", reason: "IN_QA" }));
}

// ─── 9. The project's pipeline status ────────────────────────────────────────
{
  const mid = (status: OrchestratorFacts["project"]["status"], checkpoints = written(1)) => decide(facts({ mode: 1, checkpoints, project: { status, hasSpecialist: true }, run: { ...READ, status: "GENERATING" } }));
  check("status: cancelled stops", same(mid("CANCELLED"), { kind: "STOP", reason: "PROJECT_CANCELLED", failChapterId: null }));
  check("status: refunded stops", same(mid("REFUNDED"), { kind: "STOP", reason: "PROJECT_REFUNDED", failChapterId: null }));
  check("status: cancelled ends the chapter being written", same(mid("CANCELLED", [...written(1), chapter(2, "WRITING")]), { kind: "STOP", reason: "PROJECT_CANCELLED", failChapterId: "cp-2" }));
  check("status: on hold holds", same(mid("ON_HOLD"), { kind: "HOLD", reason: "PROJECT_ON_HOLD" }));
  check("status: disputed holds", same(mid("DISPUTED"), { kind: "HOLD", reason: "PROJECT_ON_HOLD" }));
  check("status: waiting for the client holds", same(mid("AWAITING_CLIENT_INPUT"), { kind: "HOLD", reason: "AWAITING_CLIENT_INPUT" }));
  check("status: a specialist removed mid-report holds", same(mid("REQUIREMENTS_CONFIRMED"), { kind: "HOLD", reason: "NOT_IN_PROGRESS" }));
  check("status: on hold, the chapter being written still finishes", mid("ON_HOLD", [...written(1), chapter(2, "WRITING", { lockedUntil: at(99) })]).kind === "WRITING");
  check("status: on hold, no data request is opened", decide(facts({ mode: 2, checkpoints: written(1, 2, 3), project: { status: "ON_HOLD", hasSpecialist: true }, run: READ })).kind === "HOLD");
  check("status: back in progress, it carries on by itself", same(decide(facts({ mode: 1, checkpoints: written(1), run: { ...READ, status: "HELD", reason: "PROJECT_ON_HOLD" } })), { kind: "NEED_SLOT", chapter: 2 }));
  check("status: a revision is a working status", same(mid("REVISION_NEEDED"), { kind: "NEED_SLOT", chapter: 2 }));

  const stopped = (checkpoints: ChapterFact[]) => decide(facts({ mode: 1, checkpoints, now: at(70), run: { ...READ, status: "STOPPED" } }));
  check("Stop: a stopped run starts nothing", stopped(written(1)).kind === "WAIT");
  check("Stop: …not even the gate", stopped(written(1, 2, 3, 4, 5)).kind === "WAIT");
  check("Stop: the chapter being written is still watched to its end", stopped([...written(1), chapter(2, "WRITING", { lastStepAt: at(60), lastProgressAt: at(60), lockedUntil: null })]).kind === "KICK");
  check("Stop: …and left alone while a slice is working on it", stopped([...written(1), chapter(2, "WRITING", { lastStepAt: at(69), lockedUntil: at(71) })]).kind === "WRITING");
  check(
    "Stop: whatever its last chapter does, a stopped run stays stopped",
    statusAfter({ kind: "WRITING", chapter: 2, checkpointId: "c" }, "STOPPED") === null &&
      statusAfter({ kind: "KICK", chapter: 2, checkpointId: "c" }, "STOPPED") === null &&
      statusAfter({ kind: "NEED_SLOT", chapter: 3 }, "STOPPED") === null &&
      statusAfter({ kind: "STALL", chapter: 2, checkpointId: "c" }, "STOPPED") === null,
  );
  check("Stop: a cancelled project stops a run in any state", statusAfter({ kind: "STOP", reason: "PROJECT_CANCELLED", failChapterId: null }, "GENERATING") === "STOPPED");
}

// ─── 10. Repeating a tick, and alerts sent once ──────────────────────────────
{
  const cases: OrchestratorFacts[] = [
    facts(),
    facts({ mode: 2, checkpoints: written(1, 2, 3), run: READ }),
    facts({ mode: 2, checkpoints: written(1, 2, 3), pauses: [pause(3, "OPEN")], run: READ }),
    facts({ mode: 5, checkpoints: written(1, 2, 3), run: READ }),
    facts({ mode: 1, checkpoints: written(1, 2, 3, 4, 5), now: at(70), run: READ }),
    facts({ mode: 1, checkpoints: [...written(1), chapter(2, "FAILED")], run: READ }),
    facts({ mode: 1, checkpoints: written(1), project: { status: "ON_HOLD", hasSpecialist: true }, run: READ }),
  ];
  check("repeat: the same facts give the same action", cases.every((f) => same(decide(f), decide(f))));
  // Once an action's status is on the run and nothing else changed, deciding again asks for the same thing.
  const settled = cases.every((f) => {
    const a = decide(f);
    const status = statusAfter(a, f.run.status);
    const again = decide({ ...f, run: { ...f.run, status: status ?? f.run.status } });
    return same(a, again);
  });
  check("repeat: a second tick on unchanged facts changes nothing", settled);

  const key = noticeKey.chapterStalled("cp-2", at(100));
  check("alerts: a new key is sent", isNewNotice([], key));
  check("alerts: a key already on the run is not sent again", !isNewNotice(withNotice([], key), key));
  check("alerts: the same chapter failing again later is a new event", noticeKey.chapterFailed("cp-2", at(100)) !== noticeKey.chapterFailed("cp-2", at(130)));
  check("alerts: one key per quality result", noticeKey.reportReady(at(69)) !== noticeKey.reportReady(at(95)) && noticeKey.reportReady(at(69)) === noticeKey.reportReady(at(69)));
  check("alerts: a failed and a passed result have different keys", noticeKey.gateFailed(at(69)) !== noticeKey.reportReady(at(69)));
  let list: string[] = [];
  for (let i = 0; i < 200; i++) list = withNotice(list, `k${i}`);
  check("alerts: the list on a run stays short", list.length === 60 && list[list.length - 1] === "k199");
  check("alerts: adding a key twice keeps one", withNotice(withNotice([], "a"), "a").length === 1);

  check("parked: a run with nothing pressing is not looked at on every tick", ["COMPLETE", "QUALITY_FAILED", "NEEDS_ATTENTION", "HELD", "WAITING_FOR_DATA", "STOPPED"].every((s) => isParked(s as RunFact["status"])));
  check("parked: a run that is writing, queued or at the gate is looked at every tick", (["GENERATING", "QUEUED", "QUALITY_CHECK", "FETCHING_DATA"] as const).every((s) => !isParked(s) && nextCheckDelayMs(s, "IN_PROGRESS", false) === 0));
  check("parked: waiting for data or on hold -> every two minutes", nextCheckDelayMs("WAITING_FOR_DATA", "IN_PROGRESS", false) === 120_000 && nextCheckDelayMs("HELD", "ON_HOLD", false) === 120_000);
  check("parked: waiting for a person -> every five minutes", nextCheckDelayMs("NEEDS_ATTENTION", "IN_PROGRESS", false) === 300_000 && nextCheckDelayMs("QUALITY_FAILED", "IN_PROGRESS", false) === 300_000);
  check("parked: a report in QA -> every half hour", nextCheckDelayMs("COMPLETE", "SUBMITTED", false) === 1_800_000 && nextCheckDelayMs("COMPLETE", "REVISION_NEEDED", false) === 1_800_000);
  check("parked: a report past QA is never looked at again", (["APPROVED", "BALANCE_VERIFIED", "DELIVERED", "COMPLETED"] as const).every((p) => nextCheckDelayMs("COMPLETE", p, false) === null));
  check("parked: a stopped run sleeps until Start", nextCheckDelayMs("STOPPED", "IN_PROGRESS", false) === null);
  check("parked: …but its last chapter is watched on every tick", nextCheckDelayMs("STOPPED", "IN_PROGRESS", true) === 0);
}

// ─── 11. Wording ─────────────────────────────────────────────────────────────
{
  const collect = (value: unknown, out: string[] = []): string[] => {
    if (typeof value === "string") out.push(value);
    else if (typeof value === "function") {
      try {
        const made = (value as (...a: unknown[]) => unknown)("EC-00012", 3, 89, ["Fix one."], 2);
        collect(made, out);
      } catch {
        // a function that needs other arguments is covered by runLine below
      }
    } else if (value && typeof value === "object") for (const v of Object.values(value)) collect(v, out);
    return out;
  };
  const all = [
    ...collect(ORCHESTRATOR_TEXT),
    ...collect(START_TEXT),
    ...(Object.keys(ACTION_TEXT) as (keyof typeof ACTION_TEXT)[]).flatMap((k) => [ACTION_TEXT[k].label(3), ACTION_TEXT[k].confirm?.(3) ?? ""]).filter(Boolean),
    ...(["QUEUED", "GENERATING", "WAITING_FOR_DATA", "FETCHING_DATA", "QUALITY_CHECK", "QUALITY_FAILED", "HELD", "NEEDS_ATTENTION", "COMPLETE", "STOPPED"] as const).map((status) =>
      runLine({ status, currentChapter: 3, reason: status === "HELD" ? "PROJECT_ON_HOLD" : status === "NEEDS_ATTENTION" ? "CHAPTER_STALLED" : null }, { score: 82, total: 89 }),
    ),
    ...(["CHAPTER_FAILED", "CHAPTER_STALLED", "PAUSE_DRAFT_FAILED", "PAUSE_CANCELLED", "DATA_FETCH_FAILED", "NO_RESEARCH_QUESTIONS", "NO_REFERENCES", "MODE_NOT_APPROVED", "START_REFUSED", "GATE_ERROR", "PASSED_NOT_SUBMITTED"] as const).map((r) => attentionLine(r, 4)),
  ];
  const banned = /\b(AI|A\.I\.|Claude|Anthropic|LLM|GPT|chatbot|the model|language model|tokens?|prompt)\b/;
  const bad = all.filter((s) => banned.test(s));
  check("wording: nothing mentions AI, Claude or how the writing is done", bad.length === 0, bad);
  check("wording: every sentence was read", all.length > 60, all.length);
  check("wording: no emoji", all.every((s) => !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s)));
  check("wording: the greyed-out research button's tooltip is the founder's", RESEARCH_LOCKED_TOOLTIP === "Generation has started — research cannot be changed");
  check("wording: the COO's notice is the founder's", ORCHESTRATOR_TEXT.notice.readyTitle("EC-00012") === "Report ready for your review — EC-00012");
  check("wording: a quality check that could not run is simply asked for again", same(actionsFor("GATE_ERROR"), ["RUN_GATE"]));
  check("wording: a report with no references needs its own confirmation", same(actionsFor("NO_REFERENCES"), ["CONFIRM_NO_REFERENCES"]));
  check("wording: every button has a label, and every one that spends or changes something asks first", (Object.keys(ACTION_TEXT) as (keyof typeof ACTION_TEXT)[]).every((k) => ACTION_TEXT[k].label(3).length > 3 && (k === "CONTINUE" || k === "RUN_GATE" || ACTION_TEXT[k].confirm !== null)));
  check("wording: Start says what it spends", START_TEXT.confirm(5).includes("5 chapters") && START_TEXT.confirm(5).includes("credits") && START_TEXT.confirm(1).includes("chapter is"));
  check("wording: every reason has a way out", (["CHAPTER_FAILED", "CHAPTER_STALLED", "PAUSE_DRAFT_FAILED", "PAUSE_CANCELLED", "DATA_FETCH_FAILED", "NO_RESEARCH_QUESTIONS", "NO_REFERENCES", "MODE_NOT_APPROVED", "START_REFUSED", "GATE_ERROR", "PASSED_NOT_SUBMITTED"] as const).every((r) => actionsFor(r).length > 0));
  check("wording: a stalled chapter's line names the chapter", attentionLine("CHAPTER_STALLED", 4).startsWith("Chapter Four made no progress for 90 minutes"));
  check("wording: the failed line gives the score and the pass mark", runLine({ status: "QUALITY_FAILED", currentChapter: 5, reason: null }, { score: 82, total: 89 }).startsWith("The report scored 82 of 89. It needs 85"));

  // Found by the live test (28 Sept): "Chapter 1, 3, 4, 5 can be re-generated".
  check("wording: one chapter is named alone", chapterList([3]) === "Chapter 3");
  check("wording: two chapters are joined with and", chapterList([1, 3]) === "Chapters 1 and 3");
  check("wording: several chapters read as a list", chapterList([1, 3, 4, 5]) === "Chapters 1, 3, 4 and 5");
  check(
    "wording: the COO's failed notice names the chapters in plain English",
    ORCHESTRATOR_TEXT.notice.gateFailedOperations("EC-00012", 84, 89, [1, 3, 4, 5]) === "EC-00012 scored 84 of 89; it needs 85. Chapters 1, 3, 4 and 5 can be re-generated from the Report tab.",
  );

  // A specialist has no Start, Re-generate or Continue button: their sentence never tells them to press one.
  const view = (status: RunView["status"], line: string, reason: string | null = null): RunView => ({
    status,
    label: "",
    line,
    detail: "the reason on record",
    reason,
    currentChapter: 3,
    actions: ["RETRY_CHAPTER"],
    canStart: true,
    canStop: true,
    start: { refusals: [], warnings: [], needsConfirmation: false },
    startedByName: "Emmanuel",
    requestedAt: null,
    paused: false,
    schedulerQuiet: true,
    generationStarted: true,
    references: 50,
    research: "PASSED",
    gateRanAt: null,
    cancelledPauseId: "p1",
  });
  const staffFailed = runLine({ status: "QUALITY_FAILED", currentChapter: 5, reason: null }, { score: 84, total: 89 });
  const forSpecialist = [
    runViewForWorker(view("NOT_STARTED", ORCHESTRATOR_TEXT.line.notStarted)),
    runViewForWorker(view("QUALITY_FAILED", staffFailed)),
    runViewForWorker(view("STOPPED", ORCHESTRATOR_TEXT.line.STOPPED, "STOPPED_BY_PERSON")),
    runViewForWorker(view("NEEDS_ATTENTION", attentionLine("PAUSE_DRAFT_FAILED", 4), "PAUSE_DRAFT_FAILED")),
    runViewForWorker(view("NEEDS_ATTENTION", attentionLine("GATE_ERROR", null), "GATE_ERROR")),
  ];
  const pressing = /\b(Press|Re-generate|Draft it again|Ask for it again|Reopen|Continue|Use Fetch data)\b/;
  check("specialist: no sentence tells them to press a button they do not have", forSpecialist.every((v) => !pressing.test(v.line)), forSpecialist.map((v) => v.line));
  check("specialist: the failed check still gives the score and says who decides", forSpecialist[1].line === "The report scored 84 of 89. It needs 85 with no critical failure. The COO decides which chapters are written again; the check then runs again by itself.");
  check("specialist: the founder's and the COO's sentence is unchanged", staffFailed.endsWith("Re-generate the chapters that failed; the check runs again by itself."));
  check("specialist: a cancelled or refunded project is still said plainly", runViewForWorker(view("STOPPED", ORCHESTRATOR_TEXT.stop.PROJECT_CANCELLED, "PROJECT_CANCELLED")).line === "The project was cancelled.");
  check(
    "specialist: a chapter that stalled or failed is said as it is",
    runViewForWorker(view("NEEDS_ATTENTION", attentionLine("CHAPTER_STALLED", 3), "CHAPTER_STALLED")).line === attentionLine("CHAPTER_STALLED", 3) &&
      runViewForWorker(view("NEEDS_ATTENTION", attentionLine("CHAPTER_FAILED", 2), "CHAPTER_FAILED")).line === attentionLine("CHAPTER_FAILED", 2),
  );
  check("specialist: a chapter being written reads the same for everyone",runViewForWorker(view("GENERATING", "Chapter Three is being written.")).line === "Chapter Three is being written.");
  check(
    "specialist: no buttons, no reasons, no names",
    forSpecialist.every((v) => v.actions.length === 0 && !v.canStart && !v.canStop && v.start === null && v.detail === null && v.startedByName === null && v.cancelledPauseId === null),
  );
  check("specialist: the scheduler is the founder's and the COO's matter", forSpecialist.every((v) => v.schedulerQuiet === false));
  const live = view("GENERATING", "Chapter Three is being written.");
  check("the Report tab is sent again when the scheduler goes quiet or comes back", runViewKey(live) !== runViewKey({ ...live, schedulerQuiet: false }));
}

// ─── Chapter review: the COO's approvals before the quality check (30 Sept 2026) ─
{
  const all = written(1, 2, 3, 4, 5);
  const approvedAt = (ns: number[], minute: number) => Object.fromEntries(ns.map((n) => [n, at(minute)]));
  const base = { mode: 1, checkpoints: all, run: READ, now: at(90) } as const;

  const none = decide(facts({ ...base, review: { pending: [1, 2, 3, 4, 5], approvedAt: {} } }));
  check("approvals: none approved, the report waits (no slot, no gate)", none.kind === "WAIT_FOR_APPROVAL" && same(none.pending, [1, 2, 3, 4, 5]), none);
  check("approvals: waiting holds no slot", !holdsSlot("WAITING_FOR_APPROVAL") && isParked("WAITING_FOR_APPROVAL"));
  check("approvals: looked at again every 30 minutes as a backstop", nextCheckDelayMs("WAITING_FOR_APPROVAL", "IN_PROGRESS", false) === 30 * 60_000);
  const some = decide(facts({ ...base, review: { pending: [4, 5], approvedAt: approvedAt([1, 2, 3], 70) } }));
  check("approvals: some approved, still waiting for the rest", some.kind === "WAIT_FOR_APPROVAL" && same(some.pending, [4, 5]), some);
  const done = decide(facts({ ...base, review: { pending: [], approvedAt: approvedAt([1, 2, 3, 4, 5], 80) } }));
  check("approvals: all approved, the quality check is asked for", done.kind === "REQUEST_GATE", done);
  check("approvals: wait is the run's status", statusAfter(none, "GENERATING") === "WAITING_FOR_APPROVAL");

  // Chapters keep being written while earlier ones are reviewed.
  const writingOn = decide(facts({ mode: 1, checkpoints: written(1, 2), run: READ, now: at(90), review: { pending: [1, 2, 3, 4, 5], approvedAt: {} } }));
  check("approvals: never hold up writing the next chapter", writingOn.kind === "NEED_SLOT" && writingOn.chapter === 3, writingOn);

  // A gate result older than an approval is stale; one newer is current.
  const gateAt = (m: number, passed: boolean, submittedAt: number | null) => ({ ranAt: at(m), lockedUntil: null, passed, score: passed ? 87 : 80, total: 89, autoSubmittedAt: submittedAt === null ? null : at(submittedAt) });
  const stale = decide(facts({ ...base, review: { pending: [], approvedAt: approvedAt([1, 2, 3, 4, 5], 85) }, gate: gateAt(82, false, null) }));
  check("staleness: a failed check before the last approval is asked for again", stale.kind === "REQUEST_GATE", stale);
  const fresh = decide(facts({ ...base, review: { pending: [], approvedAt: approvedAt([1, 2, 3, 4, 5], 80) }, gate: gateAt(82, false, null) }));
  check("staleness: a check after the last approval stands", fresh.kind === "FAIL", fresh);
  const asked = decide(facts({ ...base, now: at(86), review: { pending: [], approvedAt: approvedAt([1, 2, 3, 4, 5], 85) }, run: { ...READ, gateRequestedAt: at(84) } }));
  check("staleness: a request made before the last approval does not count as asked", asked.kind === "REQUEST_GATE", asked);
  check("staleness: one rule for both (latestChange)", latestChange({ review: { pending: [], approvedAt: { 2: at(99) } } }, all) === at(99).getTime());

  // A report already in QA settles as before; a hold beats the wait; a pass on a working copy waits for approvals.
  const legacy = decide(facts({ ...base, project: { status: "SUBMITTED", hasSpecialist: true }, review: { pending: [1, 2, 3, 4, 5], approvedAt: {} }, gate: gateAt(70, true, 71) }));
  check("legacy: a report sent to QA before chapter review stays complete", legacy.kind === "PASS", legacy);
  const held = decide(facts({ ...base, project: { status: "ON_HOLD", hasSpecialist: true }, review: { pending: [3], approvedAt: {} } }));
  check("a hold beats the wait for approvals", held.kind === "HOLD", held);
  const passedWorking = decide(facts({ ...base, review: { pending: [5], approvedAt: approvedAt([1, 2, 3, 4], 60) }, gate: gateAt(70, true, null) }));
  check("a pass on a working copy waits for the approvals (it is never sent)", passedWorking.kind === "WAIT_FOR_APPROVAL", passedWorking);
  const recalled = decide(facts({ ...base, review: { pending: [], approvedAt: approvedAt([1, 2, 3, 4, 5], 60) }, gate: gateAt(70, true, 71) }));
  check("recall: a passed, sent report brought back stays sent until something changes", recalled.kind === "PASS", recalled);
  const reapproved = decide(facts({ ...base, review: { pending: [], approvedAt: { ...approvedAt([1, 2, 3, 4], 60), 5: at(80) } }, gate: gateAt(70, true, 71) }));
  check("recall: a chapter approved again after the check asks for a new one", reapproved.kind === "REQUEST_GATE", reapproved);
  const failedThenApproved = decide(facts({ ...base, review: { pending: [], approvedAt: approvedAt([1, 2, 3, 4, 5], 88) }, gate: gateAt(75, false, null), run: { ...READ, status: "QUALITY_FAILED" } }));
  check("a failed check, then new approvals: the check runs again by itself", failedThenApproved.kind === "REQUEST_GATE", failedThenApproved);

  // Wording.
  const line = runLine({ status: "WAITING_FOR_APPROVAL", currentChapter: null, reason: approvalReason([2, 4]) }, { score: null, total: null });
  check("wording: the line names the chapters to approve", line.includes("Chapters 2 and 4"), line);
  check("wording: the reason round-trips", same(pendingFromReason(approvalReason([1, 3, 5])), [1, 3, 5]) && same(pendingFromReason("NO_REFERENCES"), []));
  const worker = runViewForWorker({
    status: "WAITING_FOR_APPROVAL",
    label: "",
    line,
    detail: null,
    reason: approvalReason([2, 4]),
    currentChapter: null,
    actions: [],
    canStart: false,
    canStop: true,
    start: null,
    startedByName: "Emmanuel",
    requestedAt: null,
    paused: false,
    schedulerQuiet: false,
    generationStarted: true,
    references: 50,
    research: "PASSED",
    gateRanAt: null,
    cancelledPauseId: null,
  });
  check("wording: the specialist reads 'as you reviewed'", worker.line.includes("as you reviewed") && !worker.line.includes("the specialist"), worker.line);
  check("wording: the status has a label", ORCHESTRATOR_TEXT.status.WAITING_FOR_APPROVAL === "Waiting for approval");
}

// ─── Chapter gate: every chapter checked on its own before its draft goes out (30 Sept 2026) ─
{
  const lease = (m: number) => at(m);
  const gate = (n: number, over: Partial<ChapterGateFact> = {}, check: ChapterGateFact["check"] = null): ChapterGateFact => ({
    chapter: n,
    outputHash: `h${n}`,
    rewritesUsed: 0,
    check,
    barred: null,
    ...over,
  });
  const passed: ChapterGateFact["check"] = { status: "PASSED", lockedUntil: null, attempts: 0, rewritable: true, lines: [] };
  const failed: ChapterGateFact["check"] = { status: "FAILED", lockedUntil: null, attempts: 0, rewritable: true, lines: ["[REF] X (2020) is cited but is not among the verified references."] };
  const running = (until: number): ChapterGateFact["check"] => ({ status: "RUNNING", lockedUntil: lease(until), attempts: 0, rewritable: null, lines: [] });

  // Chapter One: checked before its statements are read, rewritten before them too.
  const one = decide(facts({ mode: 2, checkpoints: written(1), now: at(20), chapterGate: [gate(1)] }));
  check("gate: a written Chapter One is checked before anything else", one.kind === "CHECK_CHAPTER" && one.chapter === 1, one);
  check("gate: asking for a check changes no status", statusAfter(one, "GENERATING") === null && statusAfter(one, "NEEDS_ATTENTION") === null);
  const oneRunning = decide(facts({ mode: 2, checkpoints: written(1), now: at(20), chapterGate: [gate(1, {}, running(24))] }));
  check("gate: while the check runs, nothing moves on", oneRunning.kind === "CHECKING_CHAPTER" && oneRunning.chapter === 1, oneRunning);
  const oneLapsed = decide(facts({ mode: 2, checkpoints: written(1), now: at(30), chapterGate: [gate(1, {}, running(24))] }));
  check("gate: a check whose lease lapsed is asked for again", oneLapsed.kind === "CHECK_CHAPTER", oneLapsed);
  const oneFailed = decide(facts({ mode: 2, checkpoints: written(1), now: at(20), chapterGate: [gate(1, {}, failed)] }));
  check("gate: a failed Chapter One is rewritten before its statements are read", oneFailed.kind === "REWRITE_CHAPTER" && oneFailed.chapter === 1 && oneFailed.checkpointId === "cp-1" && oneFailed.lines.length === 1, oneFailed);
  check("gate: a rewrite keeps a writing run's slot", statusAfter(oneFailed, "GENERATING") === "GENERATING");
  check("gate: a parked run queues for a slot to rewrite", statusAfter(oneFailed, "NEEDS_ATTENTION") === "QUEUED" && statusAfter(oneFailed, "WAITING_FOR_APPROVAL") === "QUEUED");
  const onePassed = decide(facts({ mode: 2, checkpoints: written(1), now: at(20), chapterGate: [gate(1, {}, passed)] }));
  check("gate: a passed Chapter One lets its statements be read", onePassed.kind === "READ_STATEMENTS", onePassed);
  const twoRewrites = decide(facts({ mode: 2, checkpoints: written(1), now: at(20), chapterGate: [gate(1, { rewritesUsed: 2 }, failed)] }));
  check("gate: after two rewrites the draft goes over and the report moves on", twoRewrites.kind === "READ_STATEMENTS", twoRewrites);
  const settingOff = decide(facts({ mode: 2, checkpoints: written(1), now: at(20), chapterGate: [gate(1, {}, failed)], maxRewrites: 0 }));
  check("gate: the Setting at 0 switches rewrites off", settingOff.kind === "READ_STATEMENTS", settingOff);
  const builder = decide(facts({ mode: 2, checkpoints: written(1), now: at(20), chapterGate: [gate(1, {}, { ...failed!, rewritable: false })] }));
  check("gate: a failure a rewrite cannot fix (our Word file) is never rewritten", builder.kind === "READ_STATEMENTS", builder);

  // Before a data pause, and before the Mode 5 dataset.
  const three = written(1, 2, 3);
  const beforePause = decide(facts({ mode: 2, checkpoints: three, run: READ, now: at(40), chapterGate: [gate(1, {}, passed), gate(2, {}, passed), gate(3, {}, failed)] }));
  check("gate: Chapter Three is rewritten before its data request is drafted", beforePause.kind === "REWRITE_CHAPTER" && beforePause.chapter === 3, beforePause);
  const barredByPause = decide(facts({ mode: 2, checkpoints: three, run: READ, now: at(40), pauses: [pause(3, "OPEN")], chapterGate: [gate(1, {}, passed), gate(2, {}, passed), gate(3, { barred: "a data request after Chapter 3 already exists" }, failed)] }));
  check("gate: once its data request exists, Chapter Three is not rewritten (its blanks would come back)", barredByPause.kind === "WAIT_FOR_DATA", barredByPause);
  const mode5 = decide(facts({ mode: 5, checkpoints: three, run: READ, now: at(40), chapterGate: [gate(1, {}, passed), gate(2, {}, passed), gate(3, {}, failed)] }));
  check("gate: Mode 5 Chapter Three is rewritten before the dataset is fetched", mode5.kind === "REWRITE_CHAPTER" && mode5.chapter === 3, mode5);
  const mode5Barred = decide(facts({ mode: 5, checkpoints: three, run: READ, now: at(40), hasDataset: true, chapterGate: [gate(1, {}, passed), gate(2, {}, passed), gate(3, { barred: "the Mode 5 dataset was built from this chapter" }, failed)] }));
  check("gate: with its dataset stored, Mode 5 Chapter Three is handed over, and Chapter Four comes next", mode5Barred.kind === "NEED_SLOT" && mode5Barred.chapter === 4, mode5Barred);

  // Stopped and held runs: checks still happen, rewrites do not.
  const stoppedCheck = decide(facts({ mode: 2, checkpoints: written(1, 2), run: { ...READ, status: "STOPPED" }, now: at(30), chapterGate: [gate(1, {}, passed), gate(2)] }));
  check("gate: a stopped run still has its chapters checked (their drafts must not wait)", stoppedCheck.kind === "CHECK_CHAPTER" && stoppedCheck.chapter === 2, stoppedCheck);
  const stoppedFailed = decide(facts({ mode: 2, checkpoints: written(1, 2), run: { ...READ, status: "STOPPED" }, now: at(30), chapterGate: [gate(1, {}, passed), gate(2, {}, failed)] }));
  check("gate: a stopped run never rewrites (the draft goes over)", stoppedFailed.kind === "WAIT", stoppedFailed);
  const heldFailed = decide(facts({ mode: 2, checkpoints: written(1, 2), run: READ, project: { status: "ON_HOLD", hasSpecialist: true }, now: at(30), chapterGate: [gate(1, {}, passed), gate(2, {}, failed)] }));
  check("gate: a held project rewrites once it is back (the hold comes first)", heldFailed.kind === "HOLD", heldFailed);
  const heldCheck = decide(facts({ mode: 2, checkpoints: written(1, 2), run: READ, project: { status: "ON_HOLD", hasSpecialist: true }, now: at(30), chapterGate: [gate(1, {}, passed), gate(2)] }));
  check("gate: a held project still has its chapters checked", heldCheck.kind === "CHECK_CHAPTER" && heldCheck.chapter === 2, heldCheck);

  // Every chapter written: the report's own gate only once every chapter is settled; lowest chapter first.
  const all = written(1, 2, 3, 4, 5);
  const allSettled = [1, 2, 3, 4, 5].map((n) => gate(n, {}, passed));
  const lastRunning = decide(facts({ mode: 1, checkpoints: all, run: READ, now: at(90), review: { pending: [], approvedAt: {} }, chapterGate: [...allSettled.slice(0, 4), gate(5, {}, running(95))] }));
  check("gate: the report's quality check waits for the last chapter's check", lastRunning.kind === "CHECKING_CHAPTER" && lastRunning.chapter === 5, lastRunning);
  const lowestFirst = decide(facts({ mode: 1, checkpoints: all, run: READ, now: at(90), chapterGate: [gate(4), gate(2)] }));
  check("gate: chapters are settled lowest first", lowestFirst.kind === "CHECK_CHAPTER" && lowestFirst.chapter === 2, lowestFirst);
  const settled = decide(facts({ mode: 1, checkpoints: all, run: READ, now: at(90), review: { pending: [], approvedAt: {} }, chapterGate: allSettled }));
  check("gate: every chapter settled, the report's check is asked for", settled.kind === "REQUEST_GATE", settled);
  const legacyNoHash = decide(facts({ mode: 1, checkpoints: all, run: READ, now: at(90), chapterGate: [gate(1, { outputHash: null })] }));
  check("gate: a chapter written before the gate (no hash) is checked", legacyNoHash.kind === "CHECK_CHAPTER" && legacyNoHash.chapter === 1, legacyNoHash);
  const errors = decide(facts({ mode: 1, checkpoints: written(1), run: READ, now: at(90), chapterGate: [gate(1, {}, { status: "ERROR", lockedUntil: null, attempts: 3, rewritable: null, lines: [] })] }));
  check("gate: a check that failed to run three times hands the draft over", errors.kind === "NEED_SLOT" && errors.chapter === 2, errors);
  const oneError = decide(facts({ mode: 1, checkpoints: written(1), run: READ, now: at(90), chapterGate: [gate(1, {}, { status: "ERROR", lockedUntil: null, attempts: 1, rewritable: null, lines: [] })] }));
  check("gate: a check that failed to run is asked for again", oneError.kind === "CHECK_CHAPTER", oneError);
  const noFacts = decide(facts({ mode: 1, checkpoints: written(1), run: READ, now: at(90) }));
  check("gate: a report written before the gate (no facts) runs as before", noFacts.kind === "NEED_SLOT" && noFacts.chapter === 2, noFacts);

  // Wording.
  const checking = runLine({ status: "GENERATING", currentChapter: 2, reason: gateReason("CHECKING", 2) }, { score: null, total: null });
  check("wording: a checking run says which chapter", checking.includes("Chapter Two") && checking.includes("checked"), checking);
  const rewriting = runLine({ status: "GENERATING", currentChapter: 3, reason: gateReason("REWRITING", 3) }, { score: null, total: null });
  check("wording: a rewriting run says so", rewriting.includes("Chapter Three") && rewriting.includes("written again"), rewriting);
  const queued = runLine({ status: "QUEUED", currentChapter: 3, reason: gateReason("REWRITING", 3) }, { score: null, total: null });
  check("wording: a rewrite waiting for a slot says so", queued.includes("slot"), queued);
  check("wording: the reason round-trips", gateReasonChapter(gateReason("CHECKING", 4), "CHECKING") === 4 && gateReasonChapter("NO_REFERENCES", "CHECKING") === null);
}

// ─── Result ──────────────────────────────────────────────────────────────────
const actionKinds: Action["kind"][] = ["WAIT", "STOP", "HOLD", "WRITING", "KICK", "STALL", "ATTENTION", "READ_STATEMENTS", "OPEN_PAUSE", "WAIT_FOR_DATA", "FETCH_DATA", "NEED_SLOT", "CHECK_CHAPTER", "CHECKING_CHAPTER", "REWRITE_CHAPTER", "WAIT_FOR_APPROVAL", "REQUEST_GATE", "GATE_RUNNING", "PASS", "FAIL"];
check("every action has a status rule", actionKinds.length === 20);

if (failures.length) {
  console.error(`check:orchestrator — ${failures.length} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`check:orchestrator — all ${passed} checks passed`);
