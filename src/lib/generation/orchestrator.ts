/**
 * Phase D9 — the chapter orchestrator. One Start click, then the report writes
 * itself: the chapters in order, a pause where the mode needs the client's
 * data, the Mode 5 dataset, the quality gate after the last chapter, and the
 * report in front of the COO.
 *
 * Everything is driven by the TICK. A tick reads what is on record, asks the
 * rules (orchestrator-rules.ts) what each report needs next, and performs it.
 * It runs every 30 seconds from the scheduler (a Supabase job that calls
 * /api/internal/orchestrator/tick) and once straight after Start, a data
 * verification, a retry or a restart. It holds no connection between ticks,
 * and running it twice changes nothing:
 *
 *  - a tick works on a run only while it holds the run's lease, so two ticks
 *    never act on one project at once;
 *  - the three generation slots are counted and claimed in one short
 *    transaction under a database lock, so two ticks never both take the last
 *    one;
 *  - every alert has a key that is recorded on the run before it is sent.
 *
 * The quality gate is never imported here: it is asked for over HTTP
 * (/api/internal/quality/run) and its result is read from the QaReview row,
 * so the two stay independent.
 *
 * Request depth: Vercel refuses a chain of functions more than 5 deep. A tick
 * fired by the scheduler is function 1 and hands chapters to the runner as
 * hop 2; a tick fired from inside a route is function 2 and hands them over
 * as hop 3. `depth` carries that.
 */

import crypto from "crypto";
import { Prisma, type OrchestratorRun, type ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { expectedChapters } from "@/lib/deliverables";
import { selfBaseUrl } from "@/lib/self-base-url";
import { notifyOperations, notifyUsers } from "@/lib/services/notifications";
import { alertReportReady, alertReportStopped } from "@/lib/services/team-alerts";
import { openDataPause } from "@/lib/services/data-pause";
import { runSecondaryDataFetch } from "@/lib/services/secondary-data";
import { ModeNotApprovedError } from "@/lib/services/mode-errors";
import { approvedChapterInput } from "./approved-inputs";
import { readChapterOneStatements, statementsUnreadable } from "./chapter-one-statements";
import { ACTIVE_STATUSES, GenerationError, failChapterGeneration, stallChapterGeneration, startChapterGeneration } from "./generate-chapter";
import { scheduleGenerationStep } from "./generation-runner";
import { isReportTemplate } from "./generation-state";
import { PromptAssemblyError, loadChapterPrompt, type ChapterNumber } from "./prompt-loader";
import {
  START_SELECT,
  currentRunner,
  generationPaused,
  getRunView,
  researchState,
  schedulerQuiet,
  schedulerSeenAt,
  schedulerSeenSetting,
  startVerdict,
  type RunView,
  type StartProject,
} from "./orchestrator-view";
import {
  ORCHESTRATOR_TEXT,
  RUN_LEASE_MS,
  attentionLine,
  decide,
  holdsSlot,
  isNewNotice,
  kicksSinceProgress,
  nextCheckDelayMs,
  noticeKey,
  pickStarts,
  schedulerNoteIsDue,
  slotHolders,
  statusAfter,
  withNotice,
  type Action,
  type AttentionReason,
  type OrchestratorFacts,
} from "./orchestrator-rules";

export { GENERATION_PAUSED_SETTING, currentRunner, generationPaused, getRunView, runViewKey, schedulerQuiet, type RunView } from "./orchestrator-view";

const TAG = "[orchestrator]";
/** The most runs one tick works on (the rest wait for the next, 30 seconds later). */
const RUNS_PER_TICK = 40;
/** Runs are worked on a few at a time. */
const RUN_CONCURRENCY = 4;
/** One run may take several small steps in a tick (read the statements, then start the chapter). */
const STEPS_PER_RUN = 4;
/** The slots are claimed under this advisory lock (any fixed number; "EDUC" + "D9"). */
const SLOT_LOCK_KEY = 4_544_539_009;

// ─── The internal calls ──────────────────────────────────────────────────────

function secret(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

const sign = (text: string) => crypto.createHmac("sha256", secret()).update(text).digest("hex");

function sameToken(expected: string, given: string | null): boolean {
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const signTickToken = () => sign("orchestrator-tick");
export const signQualityToken = (projectDbId: string) => sign(`quality-run:${projectDbId}`);
export const verifyQualityToken = (projectDbId: string, token: string | null) => sameToken(signQualityToken(projectDbId), token);

/**
 * A tick request is ours when it carries our own signature (a route firing a
 * tick) or the scheduler's secret (the Supabase job). Without
 * ORCHESTRATOR_TICK_SECRET the scheduler is simply refused.
 */
export function tickCaller(headers: Headers): "route" | "scheduler" | null {
  if (sameToken(signTickToken(), headers.get("x-orchestrator-token"))) return "route";
  const scheduler = process.env.ORCHESTRATOR_TICK_SECRET;
  if (!scheduler) return null;
  return sameToken(`Bearer ${scheduler}`, headers.get("authorization")) ? "scheduler" : null;
}

export const verifyTickRequest = (headers: Headers): boolean => tickCaller(headers) !== null;

/**
 * Writes down that the scheduler called, at most once a minute. Start and the
 * Report tab read it: a scheduler that has stopped calling is the one thing
 * the watchdog cannot notice, because the watchdog runs on its calls.
 */
export async function noteSchedulerTick(): Promise<void> {
  try {
    const now = new Date();
    if (!schedulerNoteIsDue(await schedulerSeenAt(), now)) return;
    const key = schedulerSeenSetting(currentRunner());
    await db.setting.upsert({ where: { key }, update: { value: now.toISOString() }, create: { key, value: now.toISOString() } });
  } catch (error) {
    console.warn(`${TAG} the scheduler's call could not be written down`, error instanceof Error ? error.message : error);
  }
}

function internalHeaders(extra: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return headers;
}

/**
 * Fires a tick in a fresh invocation and returns once it is accepted. Called
 * by routes (Start, a verified data request, a retry), so the tick it fires is
 * function 2 of the chain. A failure is only logged: the scheduler's next
 * tick does the same work within 30 seconds.
 */
export async function requestTick(only?: string): Promise<void> {
  try {
    const res = await fetch(`${selfBaseUrl()}/api/internal/orchestrator/tick`, {
      method: "POST",
      headers: internalHeaders({ "x-orchestrator-token": signTickToken() }),
      body: JSON.stringify({ depth: 2, ...(only ? { only } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.warn(`${TAG} a tick was not accepted (HTTP ${res.status}); the scheduler's next one will do`);
  } catch (error) {
    console.warn(`${TAG} a tick could not be fired; the scheduler's next one will do`, error instanceof Error ? error.message : error);
  }
}

/** Makes the next tick look at this project's run, whatever it was waiting for. */
export async function wakeRun(projectDbId: string): Promise<void> {
  await db.orchestratorRun.updateMany({ where: { projectId: projectDbId }, data: { nextCheckAt: new Date() } }).catch((error) => console.warn(`${TAG} could not wake a run`, projectDbId, error));
}

/** Wake the run and fire a tick: what a route does after something the orchestrator waits for has happened. */
export async function nudge(projectDbId: string): Promise<void> {
  await wakeRun(projectDbId);
  await requestTick(projectDbId);
}

// ─── The facts ───────────────────────────────────────────────────────────────

const PROJECT_FACTS = {
  id: true,
  projectId: true,
  projectTitle: true,
  status: true,
  workerId: true,
  chapterCount: true,
  additionalData: true,
  service: { select: { serviceCode: true, intakeFormTemplate: true } },
  worker: { select: { userId: true } },
  researchMode: { select: { modeNumber: true, isLocked: true } },
  researchJob: { select: { status: true } },
  qaReview: { select: { qualityRunAt: true, qualityRunLockedUntil: true, qualityPassed: true, qualityScore: true, qualityTotal: true, autoSubmittedAt: true } },
  generationCheckpoints: {
    select: { id: true, chapterNumber: true, status: true, lockedUntil: true, lastStepAt: true, lastProgressAt: true, createdAt: true, startedAt: true, completedAt: true, errorMessage: true },
  },
  pauses: { select: { id: true, afterChapter: true, status: true, formStatus: true, formError: true } },
  _count: { select: { references: { where: { status: "KEPT" as const } }, files: { where: { category: "secondary_data", deletedAt: null } } } },
} satisfies Prisma.ProjectSelect;

type ProjectFacts = Prisma.ProjectGetPayload<{ select: typeof PROJECT_FACTS }>;

function factsFrom(run: OrchestratorRun, p: ProjectFacts, now: Date): OrchestratorFacts {
  return {
    now,
    run: {
      status: run.status,
      currentChapter: run.currentChapter,
      reason: run.reason,
      allowNoReferences: run.allowNoReferences,
      statementsReadAt: run.statementsReadAt,
      statementsAccepted: run.statementsAccepted,
      pauseDraftAttempts: run.pauseDraftAttempts,
      fetchAttempts: run.fetchAttempts,
      gateAttempts: run.gateAttempts,
      gateRequestedAt: run.gateRequestedAt,
      gateError: run.gateError,
      kickCount: run.kickCount,
      lastKickAt: run.lastKickAt,
    },
    project: { status: p.status, hasSpecialist: Boolean(p.workerId) },
    mode: p.researchMode?.isLocked ? p.researchMode.modeNumber : null,
    chapters: expectedChapters({ serviceCode: p.service.serviceCode, additionalData: p.additionalData, chapterCount: p.chapterCount }),
    checkpoints: p.generationCheckpoints.map((c) => ({
      id: c.id,
      chapter: c.chapterNumber,
      status: c.status,
      lockedUntil: c.lockedUntil,
      lastStepAt: c.lastStepAt,
      lastProgressAt: c.lastProgressAt,
      createdAt: c.createdAt,
      startedAt: c.startedAt,
      completedAt: c.completedAt,
      errorMessage: c.errorMessage,
    })),
    pauses: p.pauses,
    hasDataset: p._count.files > 0,
    research: { state: researchState(p.researchJob), kept: p._count.references },
    gate: {
      ranAt: p.qaReview?.qualityRunAt ?? null,
      lockedUntil: p.qaReview?.qualityRunLockedUntil ?? null,
      passed: p.qaReview?.qualityPassed ?? null,
      score: p.qaReview?.qualityScore ?? null,
      total: p.qaReview?.qualityTotal ?? null,
      autoSubmittedAt: p.qaReview?.autoSubmittedAt ?? null,
    },
  };
}

// ─── Alerts, sent once ───────────────────────────────────────────────────────

/**
 * Records the key on the run, then sends. A key already there is never sent
 * again. The claim is compare-and-set on the run's last change, so two writers
 * cannot both take it (a list filter would be simpler, but it never matches a
 * list that is NULL in the database, and then nothing would ever be sent).
 */
async function announceOnce(runId: string, key: string, send: () => Promise<unknown> | void): Promise<boolean> {
  const run = await db.orchestratorRun.findUnique({ where: { id: runId }, select: { announced: true, updatedAt: true } });
  if (!run || !isNewNotice(run.announced, key)) return false;
  const claimed = await db.orchestratorRun.updateMany({ where: { id: runId, updatedAt: run.updatedAt }, data: { announced: withNotice(run.announced, key) } });
  if (claimed.count === 0) {
    // The run changed between the read and the write: look once more, under the run's lease nobody else is sending.
    const again = await db.orchestratorRun.findUnique({ where: { id: runId }, select: { announced: true, updatedAt: true } });
    if (!again || !isNewNotice(again.announced, key)) return false;
    const second = await db.orchestratorRun.updateMany({ where: { id: runId, updatedAt: again.updatedAt }, data: { announced: withNotice(again.announced, key) } });
    if (second.count === 0) return false;
  }
  try {
    await send();
  } catch (error) {
    console.error(`${TAG} an alert could not be sent (${key})`, error);
  }
  return true;
}

const reportTab = (code: string, root: "admin" | "worker" = "admin") => `/${root}/projects/${code}?tab=report`;

interface GateFailure {
  chapter: number | null;
  message: string;
  fix: string | null;
}

/** The latest quality run's failures, as the gate stored them. */
function readFailures(json: unknown): GateFailure[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((f): GateFailure[] => {
    if (!f || typeof f !== "object") return [];
    const o = f as { chapter?: unknown; message?: unknown; fix?: unknown; locations?: unknown };
    if (typeof o.message !== "string") return [];
    const located = Array.isArray(o.locations) ? (o.locations as { chapter?: unknown }[]).map((l) => l?.chapter).find((c) => typeof c === "number") : undefined;
    const chapter = typeof o.chapter === "number" ? o.chapter : typeof located === "number" ? located : null;
    return [{ chapter, message: o.message, fix: typeof o.fix === "string" ? o.fix : null }];
  });
}

// ─── Performing what the rules decide ────────────────────────────────────────

interface Ctx {
  run: OrchestratorRun;
  project: ProjectFacts;
  facts: OrchestratorFacts;
  depth: number;
  now: Date;
}

interface Outcome {
  /** Decide again in this tick (a small step was taken and the next one can follow at once). */
  again: boolean;
}

const update = (id: string, data: Prisma.OrchestratorRunUpdateInput) => db.orchestratorRun.update({ where: { id }, data });

/** The fields that start a fresh chapter: the watchdog's and the gate's counters begin again. */
const FRESH_CHAPTER = { kickCount: 0, lastKickAt: null, gateAttempts: 0, gateRequestedAt: null, gateError: null, reason: null, reasonDetail: null } as const;

function isTransient(error: unknown): boolean {
  if (error instanceof GenerationError || error instanceof PromptAssemblyError || error instanceof ModeNotApprovedError) return false;
  if (error instanceof Prisma.PrismaClientKnownRequestError) return ["P1001", "P1002", "P1008", "P1017", "P2024", "P2028", "P2034"].includes(error.code);
  if (error instanceof Prisma.PrismaClientInitializationError || error instanceof Prisma.PrismaClientRustPanicError || error instanceof Prisma.PrismaClientUnknownRequestError) return true;
  return false;
}

/**
 * Starts a chapter for a run that holds a slot. A chapter that turns out to
 * be running already is fine; a refusal needs a person; a dropped connection
 * is simply tried again on the next tick.
 */
async function startChapter(ctx: Pick<Ctx, "run" | "project" | "depth">, chapter: number): Promise<void> {
  const { run, project, depth } = ctx;
  try {
    const extracted = chapter > 1 ? { researchQuestions: run.researchQuestions, hypotheses: run.hypotheses } : {};
    const input = await approvedChapterInput(project.id, chapter as ChapterNumber, extracted);
    // The orchestrator tells the founder and the COO itself if the chapter stops, so the row carries no starter (the runner would tell them again).
    const created = await startChapterGeneration({ project: project.id, prompt: input, requestedById: null });
    await update(run.id, { status: "GENERATING", currentChapter: chapter, startedAt: run.startedAt ?? new Date(), ...FRESH_CHAPTER });
    console.info(`${TAG} ${project.projectId}: Chapter ${chapter} started`);
    await scheduleGenerationStep(created.id, 0, depth + 1).catch((error) => {
      // The watchdog carries a chapter on when it is quiet, so a failed hand-over only costs a minute.
      console.warn(`${TAG} ${project.projectId}: Chapter ${chapter} was created but not handed to the runner yet`, error instanceof Error ? error.message : error);
    });
  } catch (error) {
    if (error instanceof GenerationError && (error.code === "ALREADY_RUNNING" || error.code === "ALREADY_EXISTS")) {
      // Someone started or finished it in the meantime: the next tick reads what is there.
      await update(run.id, { status: "GENERATING", currentChapter: chapter });
      return;
    }
    if (isTransient(error)) {
      console.warn(`${TAG} ${project.projectId}: Chapter ${chapter} could not be started this time; it is tried again`, error instanceof Error ? error.message : error);
      await update(run.id, { status: "QUEUED", currentChapter: chapter }).catch(() => {});
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${TAG} ${project.projectId}: Chapter ${chapter} was refused`, error);
    await update(run.id, { status: "NEEDS_ATTENTION", reason: "START_REFUSED", reasonDetail: message.slice(0, 1000), currentChapter: chapter });
    await announceAttention(run.id, project, "START_REFUSED", chapter, message);
  }
}

async function announceAttention(runId: string, project: ProjectFacts, reason: AttentionReason, chapter: number | null, detail: string | null, extraKey = ""): Promise<void> {
  // The data request's own drafting already told the founder and the COO when it failed.
  if (reason === "PAUSE_DRAFT_FAILED") return;
  const code = project.projectId;
  await announceOnce(runId, `${noticeKey.attention(reason, chapter)}${extraKey}`, () =>
    notifyOperations({
      title: ORCHESTRATOR_TEXT.notice.attentionTitle(code),
      message: `${code}: ${attentionLine(reason, chapter)}${detail ? ` (${detail.slice(0, 160)})` : ""}`,
      type: "warning",
      link: reportTab(code),
    }),
  );
}

async function perform(ctx: Ctx, action: Action): Promise<Outcome> {
  const { run, project, facts, depth, now } = ctx;
  const code = project.projectId;
  const next = statusAfter(action, run.status);

  switch (action.kind) {
    case "WAIT":
      return { again: false };

    case "STOP": {
      const why = ORCHESTRATOR_TEXT.stop[action.reason === "PROJECT_REFUNDED" ? "PROJECT_REFUNDED" : "PROJECT_CANCELLED"];
      if (action.failChapterId) await failChapterGeneration(action.failChapterId, ORCHESTRATOR_TEXT.stoppedChapter(why), 0);
      if (run.status !== "STOPPED" || run.reason !== action.reason) await update(run.id, { status: "STOPPED", reason: action.reason, reasonDetail: why, finishedAt: now });
      return { again: false };
    }

    case "HOLD":
      if (run.status !== "HELD" || run.reason !== action.reason) {
        await update(run.id, { status: "HELD", reason: action.reason, reasonDetail: null, resumeStatus: run.status === "HELD" ? run.resumeStatus : run.status });
      }
      return { again: false };

    case "WRITING":
      if (next && (run.status !== next || run.currentChapter !== action.chapter)) await update(run.id, { status: next, currentChapter: action.chapter, reason: null, reasonDetail: null });
      return { again: false };

    case "KICK": {
      const chapter = facts.checkpoints.find((c) => c.id === action.checkpointId);
      const kicks = chapter ? kicksSinceProgress(chapter, run) : 0;
      await update(run.id, { ...(next ? { status: next, reason: null, reasonDetail: null } : {}), currentChapter: action.chapter, kickCount: kicks + 1, lastKickAt: now });
      await scheduleGenerationStep(action.checkpointId, 0, depth + 1).catch((error) =>
        console.warn(`${TAG} ${code}: Chapter ${action.chapter} could not be carried on this time`, error instanceof Error ? error.message : error),
      );
      return { again: false };
    }

    case "STALL": {
      const stalled = await stallChapterGeneration(action.checkpointId, ORCHESTRATOR_TEXT.stalledChapter);
      if (stalled) console.warn(`${TAG} ${code}: Chapter ${action.chapter} made no progress for 90 minutes and was stopped`);
      // The next step finds the STALLED chapter and tells the founder and the COO, once.
      return { again: true };
    }

    case "ATTENTION": {
      if (next && (run.status !== next || run.reason !== action.reason || run.currentChapter !== (action.chapter ?? run.currentChapter))) {
        await update(run.id, { status: next, reason: action.reason, reasonDetail: action.detail?.slice(0, 1000) ?? run.reasonDetail ?? null, ...(action.chapter ? { currentChapter: action.chapter } : {}) });
      }
      const at = facts.checkpoints.find((c) => c.id === action.checkpointId)?.lastStepAt ?? null;
      if (action.reason === "CHAPTER_STALLED" && action.checkpointId && action.chapter) {
        const chapter = action.chapter;
        await announceOnce(run.id, noticeKey.chapterStalled(action.checkpointId, at), async () => {
          await notifyOperations({ title: ORCHESTRATOR_TEXT.notice.stalledTitle(code, chapter), message: ORCHESTRATOR_TEXT.notice.stalledMessage(code, chapter), type: "urgent", link: reportTab(code) });
          alertReportStopped(project.id, {
            headline: (c) => ORCHESTRATOR_TEXT.notice.stalledTitle(c, chapter),
            what: (c) => ORCHESTRATOR_TEXT.notice.stalledMessage(c, chapter),
            chapter,
            detail: action.detail,
            at: at ?? now,
          });
        });
      } else if (action.reason === "CHAPTER_FAILED" && action.checkpointId && action.chapter) {
        const chapter = action.chapter;
        await announceOnce(run.id, noticeKey.chapterFailed(action.checkpointId, at), async () => {
          await notifyOperations({ title: ORCHESTRATOR_TEXT.notice.failedTitle(code, chapter), message: ORCHESTRATOR_TEXT.notice.failedMessage(code, chapter, action.detail), type: "urgent", link: reportTab(code) });
          alertReportStopped(project.id, {
            headline: (c) => ORCHESTRATOR_TEXT.notice.failedTitle(c, chapter),
            what: (c) => ORCHESTRATOR_TEXT.notice.failedMessage(c, chapter, null),
            chapter,
            detail: action.detail,
            at: at ?? now,
          });
        });
      } else if (action.reason === "PASSED_NOT_SUBMITTED") {
        await announceOnce(run.id, noticeKey.passedNotSubmitted(facts.gate.ranAt), async () => {
          const what = `${code} passed the quality check (${facts.gate.score ?? "—"} of ${facts.gate.total ?? 89}) but could not be sent to QA. ${project.workerId ? "Open the Report tab for the reason." : "It has no specialist assigned."}`;
          await notifyOperations({ title: ORCHESTRATOR_TEXT.notice.passedNotSubmittedTitle(code), message: what, type: "urgent", link: reportTab(code) });
          alertReportStopped(project.id, { headline: (c) => ORCHESTRATOR_TEXT.notice.passedNotSubmittedTitle(c), what: () => what, chapter: null, detail: run.gateError, at: now });
        });
      } else {
        await announceAttention(run.id, project, action.reason, action.chapter, action.detail);
      }
      return { again: false };
    }

    case "READ_STATEMENTS": {
      const one = await db.generationCheckpoint.findUnique({ where: { projectId_chapterNumber: { projectId: project.id, chapterNumber: 1 } }, select: { fullOutput: true } });
      const read = readChapterOneStatements(one?.fullOutput ?? "");
      const unreadable = statementsUnreadable(read);
      if (unreadable) console.warn(`${TAG} ${code}: Chapter One has a research questions or hypotheses section, but nothing could be read from it`);
      await update(run.id, { researchQuestions: read.researchQuestions, hypotheses: read.hypotheses, statementsReadAt: now, statementsAccepted: !unreadable });
      return { again: true };
    }

    case "OPEN_PAUSE": {
      await update(run.id, { status: "WAITING_FOR_DATA", currentChapter: action.afterChapter, pauseDraftAttempts: { increment: 1 }, reason: null, reasonDetail: null });
      try {
        await openDataPause(project.id, action.afterChapter, { userId: run.startedById });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`${TAG} ${code}: the data request after Chapter ${action.afterChapter} could not be opened`, message);
        await update(run.id, { reasonDetail: message.slice(0, 1000) }).catch(() => {});
        return { again: false };
      }
      return { again: true };
    }

    case "WAIT_FOR_DATA":
      if (run.status !== "WAITING_FOR_DATA" || run.currentChapter !== action.afterChapter || run.pauseDraftAttempts !== 0) {
        await update(run.id, { ...(next ? { status: next } : {}), currentChapter: action.afterChapter, pauseDraftAttempts: 0, reason: null, reasonDetail: null });
      }
      return { again: false };

    case "FETCH_DATA": {
      await update(run.id, { status: "FETCHING_DATA", fetchAttempts: { increment: 1 }, reason: null, reasonDetail: null });
      try {
        await runSecondaryDataFetch(project.id, { userId: run.startedById, role: "ADMIN" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`${TAG} ${code}: the dataset could not be fetched`, message);
        await update(run.id, { reasonDetail: message.slice(0, 1000) }).catch(() => {});
        return { again: false };
      }
      await update(run.id, { fetchAttempts: 0 });
      return { again: true };
    }

    case "NEED_SLOT":
      if (run.status === "STOPPED") return { again: false };
      if (holdsSlot(run.status)) {
        // Between two chapters the project keeps its slot.
        await startChapter({ run, project, depth }, action.chapter);
        return { again: false };
      }
      if (run.status !== "QUEUED" || run.currentChapter !== action.chapter) {
        await update(run.id, { status: "QUEUED", currentChapter: action.chapter, reason: null, reasonDetail: null });
      }
      return { again: false };

    case "REQUEST_GATE": {
      const latest = Math.max(0, ...facts.checkpoints.map((c) => c.completedAt?.getTime() ?? 0));
      const counts = run.gateRequestedAt !== null && run.gateRequestedAt.getTime() > latest;
      // Always later than the last chapter's finish, or the next tick would not see that the check was asked for.
      const askedAt = new Date(Math.max(Date.now(), latest + 1));
      const claimed = await db.orchestratorRun.updateMany({
        where: { id: run.id, gateRequestedAt: run.gateRequestedAt },
        data: { status: "QUALITY_CHECK", gateRequestedAt: askedAt, gateAttempts: counts ? run.gateAttempts + 1 : 1, gateError: null, reason: null, reasonDetail: null },
      });
      if (claimed.count === 0) return { again: false }; // another tick asked a moment ago
      await requestQualityGate(project.id, depth).catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`${TAG} ${code}: the quality check could not be asked for`, message);
        await update(run.id, { gateError: message.slice(0, 500) }).catch(() => {});
      });
      return { again: false };
    }

    case "GATE_RUNNING":
      if (next && run.status !== next) await update(run.id, { status: next, reason: null, reasonDetail: null });
      return { again: false };

    case "PASS": {
      if (next && run.status !== next) await update(run.id, { status: next, reason: null, reasonDetail: null, finishedAt: now, currentChapter: null });
      const submitted = facts.gate.autoSubmittedAt !== null && facts.gate.autoSubmittedAt.getTime() >= action.ranAt.getTime();
      // The bell is the submission's own notice ("Report ready for your review"); this adds the email.
      if (submitted) {
        await announceOnce(run.id, noticeKey.reportReady(action.ranAt), () => alertReportReady(project.id, { score: action.score, total: action.total, passedAt: action.ranAt }));
      }
      return { again: false };
    }

    case "FAIL": {
      if (next && run.status !== next) await update(run.id, { status: next, reason: null, reasonDetail: null, currentChapter: null });
      await announceOnce(run.id, noticeKey.gateFailed(action.ranAt), async () => {
        const review = await db.qaReview.findUnique({ where: { projectId: project.id }, select: { failuresJson: true } });
        const failures = readFailures(review?.failuresJson);
        // Two findings in one section read the same in a sentence: each line is said once.
        const all = [...new Set(failures.map((f) => `${f.chapter ? `Chapter ${f.chapter}: ` : ""}${f.message}`))];
        const lines = all.slice(0, 3);
        const chapters = [...new Set(failures.map((f) => f.chapter).filter((c): c is number => typeof c === "number"))].sort((a, b) => a - b);
        const n = ORCHESTRATOR_TEXT.notice;
        await notifyUsers([project.worker?.userId], {
          title: n.gateFailedTitle(code),
          message: n.gateFailedSpecialist(code, action.score, action.total, lines, Math.max(0, all.length - lines.length)),
          type: "warning",
          link: reportTab(code, "worker"),
        });
        await notifyOperations({ title: n.gateFailedTitle(code), message: n.gateFailedOperations(code, action.score, action.total, chapters), type: "warning", link: reportTab(code) });
      });
      return { again: false };
    }
  }
}

/** Asks for the quality gate over HTTP; the result is read from the QaReview row on a later tick. */
async function requestQualityGate(projectDbId: string, depth: number): Promise<void> {
  const res = await fetch(`${selfBaseUrl()}/api/internal/quality/run`, {
    method: "POST",
    headers: internalHeaders({ "x-quality-token": signQualityToken(projectDbId) }),
    body: JSON.stringify({ projectId: projectDbId, depth: depth + 1 }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 120);
    throw new Error(`HTTP ${res.status}${detail ? ` ${detail}` : ""}`);
  }
}

// ─── One run ─────────────────────────────────────────────────────────────────

async function takeLease(runId: string, now: Date): Promise<Date | null> {
  const until = new Date(now.getTime() + RUN_LEASE_MS);
  const got = await db.orchestratorRun.updateMany({ where: { id: runId, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] }, data: { lockedUntil: until } });
  return got.count === 1 ? until : null;
}

async function processRun(runId: string, depth: number): Promise<string[]> {
  const lease = await takeLease(runId, new Date());
  if (!lease) return [];
  const done: string[] = [];
  let projectStatus: ProjectStatus | null = null;
  let watching = false;
  try {
    for (let step = 0; step < STEPS_PER_RUN; step++) {
      const run = await db.orchestratorRun.findUnique({ where: { id: runId } });
      if (!run) return done;
      const project = await db.project.findUnique({ where: { id: run.projectId }, select: PROJECT_FACTS });
      if (!project) return done;
      projectStatus = project.status;
      // Taken after the reads: a chapter that finished while they ran must not look later than "now".
      const now = new Date();
      const facts = factsFrom(run, project, now);
      const action = decide(facts);
      watching = action.kind === "WRITING" || action.kind === "KICK" || facts.checkpoints.some((c) => ACTIVE_STATUSES.includes(c.status));
      done.push(action.kind);
      const outcome = await perform({ run, project, facts, depth, now }, action);
      if (!outcome.again) break;
    }
  } catch (error) {
    console.error(`${TAG} a run could not be worked on; the next tick tries again`, runId, error);
  } finally {
    const after = await db.orchestratorRun.findUnique({ where: { id: runId }, select: { status: true } }).catch(() => null);
    const delay = after && projectStatus ? nextCheckDelayMs(after.status, projectStatus, watching) : 0;
    const now = new Date();
    await db.orchestratorRun
      .updateMany({
        where: { id: runId, lockedUntil: lease },
        data: { lockedUntil: null, lastTickAt: now, nextCheckAt: delay === null ? ASLEEP : delay === 0 ? null : new Date(now.getTime() + delay) },
      })
      .catch((error) => console.warn(`${TAG} a run's lease could not be released; it lapses by itself`, runId, error));
  }
  return done;
}

/** "Not until something wakes it": far enough ahead that no tick reaches it. */
const ASLEEP = new Date("2099-01-01T00:00:00.000Z");

async function inBatches<T>(items: T[], size: number, work: (item: T) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map((item) => work(item).catch((error) => console.error(`${TAG} batch item failed`, error))));
}

// ─── The slots ───────────────────────────────────────────────────────────────

/**
 * Counts the slots in use and gives the free ones to the queue, express first,
 * then the earliest approval. One short transaction under a database lock, so
 * two ticks can never both take the last slot. Returns the runs to start.
 */
async function claimSlots(runner: string): Promise<{ id: string; projectId: string; chapter: number }[]> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SLOT_LOCK_KEY}::bigint)`;
      const [runs, active] = await Promise.all([
        tx.orchestratorRun.findMany({
          where: { status: { in: ["QUEUED", "GENERATING", "FETCHING_DATA"] } },
          select: { id: true, projectId: true, status: true, runner: true, currentChapter: true, project: { select: { isExpressDelivery: true, researchMode: { select: { cooApprovedAt: true } } } } },
        }),
        tx.generationCheckpoint.findMany({ where: { status: { in: ACTIVE_STATUSES } }, distinct: ["projectId"], select: { projectId: true } }),
      ]);
      const holders = slotHolders(runs, active.map((a) => a.projectId));
      const queued = runs
        .filter((r) => r.status === "QUEUED" && r.runner === runner && r.currentChapter !== null && !holders.has(r.projectId))
        .map((r) => ({ id: r.id, projectId: r.projectId, chapter: r.currentChapter as number, isExpress: r.project.isExpressDelivery, approvedAt: r.project.researchMode?.cooApprovedAt ?? null }));
      const claimed: { id: string; projectId: string; chapter: number }[] = [];
      for (const pick of pickStarts(queued, holders.size)) {
        const got = await tx.orchestratorRun.updateMany({ where: { id: pick.id, status: "QUEUED" }, data: { status: "GENERATING" } });
        if (got.count === 1) claimed.push({ id: pick.id, projectId: pick.projectId, chapter: pick.chapter });
      }
      return claimed;
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

async function startClaimed(claim: { id: string; chapter: number }, depth: number): Promise<void> {
  const now = new Date();
  const lease = await takeLease(claim.id, now);
  if (!lease) {
    // Another tick is on this run: give the slot back and let it decide.
    await db.orchestratorRun.updateMany({ where: { id: claim.id, status: "GENERATING" }, data: { status: "QUEUED" } });
    return;
  }
  try {
    const run = await db.orchestratorRun.findUnique({ where: { id: claim.id } });
    const project = run ? await db.project.findUnique({ where: { id: run.projectId }, select: PROJECT_FACTS }) : null;
    if (!run || !project) return;
    // The facts may have moved since the run queued: the rules are asked once more before a credit is spent.
    const action = decide(factsFrom(run, project, now));
    if (action.kind === "NEED_SLOT") await startChapter({ run, project, depth }, action.chapter);
    else await perform({ run, project, facts: factsFrom(run, project, now), depth, now }, action);
  } finally {
    await db.orchestratorRun.updateMany({ where: { id: claim.id, lockedUntil: lease }, data: { lockedUntil: null, lastTickAt: new Date(), nextCheckAt: null } }).catch(() => {});
  }
}

// ─── The tick ────────────────────────────────────────────────────────────────

export interface TickReport {
  runner: string;
  looked: number;
  actions: Record<string, number>;
  started: number;
  paused: boolean;
  ms: number;
}

/**
 * One tick. `only` limits it to one project (a route that has just changed
 * something for that project); the scheduler's ticks leave it out.
 */
export async function tickOrchestrator(opts: { depth?: number; only?: string } = {}): Promise<TickReport> {
  const began = Date.now();
  const depth = Math.min(3, Math.max(1, Math.floor(opts.depth ?? 1)));
  const runner = currentRunner();
  const now = new Date();
  const due = await db.orchestratorRun.findMany({
    where: {
      runner,
      ...(opts.only ? { projectId: opts.only } : {}),
      AND: [{ OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: now } }] }, { OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] }],
    },
    orderBy: { lastTickAt: { sort: "asc", nulls: "first" } },
    take: RUNS_PER_TICK,
    select: { id: true },
  });

  const actions: Record<string, number> = {};
  await inBatches(due, RUN_CONCURRENCY, async (r) => {
    for (const kind of await processRun(r.id, depth)) actions[kind] = (actions[kind] ?? 0) + 1;
  });

  let started = 0;
  const paused = await generationPaused();
  if (!paused) {
    const claims = await claimSlots(runner).catch((error) => {
      console.error(`${TAG} the slots could not be counted this time`, error);
      return [];
    });
    await inBatches(claims, RUN_CONCURRENCY, (c) => startClaimed(c, depth));
    started = claims.length;
  }
  const report = { runner, looked: due.length, actions, started, paused, ms: Date.now() - began };
  if (due.length || started) console.info(`${TAG} tick`, JSON.stringify(report));
  return report;
}

// ─── Start, Stop, Continue ───────────────────────────────────────────────────

export class OrchestratorError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 409,
    readonly code: string = "REFUSED",
    readonly details: { refusals?: string[]; warnings?: string[] } = {},
  ) {
    super(message);
  }
}

export interface OrchestratorActor {
  userId: string;
  name: string;
}

async function startProject(idOrCode: string): Promise<StartProject> {
  const project = await db.project.findFirst({ where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] }, select: START_SELECT });
  if (!project) throw new OrchestratorError("Project not found", 404, "NOT_FOUND");
  return project;
}

/**
 * Start: checks everything a chapter needs before a credit is spent (Chapter
 * One's whole prompt is assembled once as a rehearsal), then puts the project
 * in the queue. The tick starts it when a slot is free.
 */
export async function requestGeneration(idOrCode: string, actor: OrchestratorActor, opts: { confirmNoReferences?: boolean } = {}): Promise<RunView> {
  const project = await startProject(idOrCode);
  const verdict = startVerdict(project, Boolean(opts.confirmNoReferences), await schedulerQuiet());
  if (verdict.refusals.length) {
    const already = verdict.refusals.includes(ORCHESTRATOR_TEXT.refuse.alreadyStarted);
    throw new OrchestratorError(verdict.refusals[0], 409, already ? "ALREADY_STARTED" : "NOT_READY", { refusals: verdict.refusals, warnings: verdict.warnings });
  }
  if (verdict.needsConfirmation) throw new OrchestratorError(verdict.warnings[0], 409, "NEEDS_CONFIRMATION", { warnings: verdict.warnings });

  const written = new Set(project.generationCheckpoints.filter((c) => c.status === "COMPLETED").map((c) => c.chapterNumber));
  const first = verdict.chapters.find((n) => !written.has(n)) ?? null;
  if (first === 1) {
    try {
      await loadChapterPrompt(await approvedChapterInput(project.id, 1));
    } catch (error) {
      if (error instanceof PromptAssemblyError || error instanceof ModeNotApprovedError) throw new OrchestratorError(error.message, 409, "NOT_READY", { refusals: [error.message] });
      throw error;
    }
  }

  const fresh = { status: "QUEUED" as const, currentChapter: first, reason: null, reasonDetail: null, runner: currentRunner(), startedById: actor.userId, startedByName: actor.name, requestedAt: new Date(), nextCheckAt: null, stoppedById: null };
  if (project.orchestratorRun) {
    const restarted = await db.orchestratorRun.updateMany({
      where: { id: project.orchestratorRun.id, status: "STOPPED" },
      data: { ...fresh, allowNoReferences: project.orchestratorRun.allowNoReferences || Boolean(opts.confirmNoReferences), pauseDraftAttempts: 0, fetchAttempts: 0, gateAttempts: 0, gateRequestedAt: null, gateError: null, finishedAt: null },
    });
    if (restarted.count === 0) throw new OrchestratorError(ORCHESTRATOR_TEXT.refuse.alreadyStarted, 409, "ALREADY_STARTED");
  } else {
    try {
      await db.orchestratorRun.create({ data: { ...fresh, projectId: project.id, allowNoReferences: Boolean(opts.confirmNoReferences) } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new OrchestratorError(ORCHESTRATOR_TEXT.refuse.alreadyStarted, 409, "ALREADY_STARTED");
      throw error;
    }
  }
  console.info(`${TAG} ${project.projectId}: Start pressed by ${actor.name}`);
  return (await getRunView(project.id)) as RunView;
}

/** Stop: nothing new starts. The chapter being written finishes, so nothing paid for is lost. */
export async function stopGeneration(idOrCode: string, actor: OrchestratorActor): Promise<RunView> {
  const project = await startProject(idOrCode);
  const run = project.orchestratorRun;
  if (!run) throw new OrchestratorError("Generation has not been started for this project.", 409, "NOT_STARTED");
  if (run.status === "STOPPED") throw new OrchestratorError("Generation is already stopped.", 409, "ALREADY_STOPPED");
  if (run.status === "COMPLETE") throw new OrchestratorError("The report is already written and in the QA queue.", 409, "ALREADY_COMPLETE");
  const stopped = await db.orchestratorRun.updateMany({
    where: { id: run.id, status: run.status },
    data: { status: "STOPPED", reason: "STOPPED_BY_PERSON", reasonDetail: ORCHESTRATOR_TEXT.stop.STOPPED_BY_PERSON(actor.name), stoppedById: actor.userId, nextCheckAt: null },
  });
  if (stopped.count === 0) throw new OrchestratorError("The report moved on just now. Refresh the page.", 409, "CHANGED");
  console.info(`${TAG} ${project.projectId}: stopped by ${actor.name}`);
  return (await getRunView(project.id)) as RunView;
}

export type ContinueChoice = "continue" | "accept_no_statements" | "rewrite_chapter_one" | "confirm_no_references";

/**
 * Continue, after something needed a person. The attempt counters begin
 * again and the report goes back to the queue; the next tick reads the facts
 * afresh, so a problem that is still there is simply shown again.
 */
export async function continueGeneration(idOrCode: string, actor: OrchestratorActor, choice: ContinueChoice = "continue"): Promise<RunView> {
  const project = await startProject(idOrCode);
  const run = project.orchestratorRun;
  if (!run) throw new OrchestratorError("Generation has not been started for this project.", 409, "NOT_STARTED");
  if (run.status !== "NEEDS_ATTENTION") throw new OrchestratorError("The report is not waiting for a decision.", 409, "NOT_WAITING");
  if ((choice === "accept_no_statements" || choice === "rewrite_chapter_one") && run.reason !== "NO_RESEARCH_QUESTIONS") {
    throw new OrchestratorError("That choice is for a Chapter One whose research questions could not be read.", 400, "WRONG_CHOICE");
  }

  if (choice === "rewrite_chapter_one") {
    const input = await approvedChapterInput(project.id, 1);
    let created;
    try {
      created = await startChapterGeneration({ project: project.id, prompt: input, requestedById: null, replace: true });
    } catch (error) {
      if (error instanceof GenerationError) throw new OrchestratorError(error.message, 409, error.code ?? "REFUSED");
      throw error;
    }
    await update(run.id, { status: "GENERATING", currentChapter: 1, statementsReadAt: null, statementsAccepted: false, researchQuestions: [], hypotheses: [], nextCheckAt: null, ...FRESH_CHAPTER });
    await scheduleGenerationStep(created.id).catch((error) => console.warn(`${TAG} ${project.projectId}: Chapter 1 was created but not handed to the runner yet`, error));
    console.info(`${TAG} ${project.projectId}: Chapter One is written again (${actor.name})`);
    return (await getRunView(project.id)) as RunView;
  }

  const moved = await db.orchestratorRun.updateMany({
    where: { id: run.id, status: "NEEDS_ATTENTION" },
    data: {
      status: "QUEUED",
      reason: null,
      reasonDetail: null,
      pauseDraftAttempts: 0,
      fetchAttempts: 0,
      gateAttempts: 0,
      gateRequestedAt: null,
      gateError: null,
      nextCheckAt: null,
      ...(choice === "accept_no_statements" ? { statementsAccepted: true } : {}),
      ...(choice === "confirm_no_references" ? { allowNoReferences: true } : {}),
    },
  });
  if (moved.count === 0) throw new OrchestratorError("The report moved on just now. Refresh the page.", 409, "CHANGED");
  console.info(`${TAG} ${project.projectId}: continued by ${actor.name} (${choice})`);
  return (await getRunView(project.id)) as RunView;
}
