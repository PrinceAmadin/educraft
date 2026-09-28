/**
 * Phase D9 — what the Report tab shows about a report's run, and what Start
 * checks. Reads only (and light on purpose: the progress stream asks for the
 * view every few seconds, so nothing here pulls in the chapter generator, the
 * Excel reader or the file store). The actions are in orchestrator.ts.
 */

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { expectedChapters } from "@/lib/deliverables";
import { isReportTemplate } from "./generation-state";
import { ORCHESTRATOR_TEXT, actionsFor, checkStart, runLine, schedulerIsQuiet, type AttentionReason, type OrchestratorFacts, type RunView, type StartVerdict } from "./orchestrator-rules";

export { runViewForWorker, runViewKey, type RunView } from "./orchestrator-rules";

export const GENERATION_PAUSED_SETTING = "generation_paused";

/** A run belongs to the server that started it; a tick only works on its own server's runs. */
export function currentRunner(): string {
  return process.env.ORCHESTRATOR_RUNNER || process.env.VERCEL_ENV || "development";
}

/** The off switch: nothing new starts while it is on; chapters being written finish. */
export async function generationPaused(): Promise<boolean> {
  const row = await db.setting.findUnique({ where: { key: GENERATION_PAUSED_SETTING }, select: { value: true } }).catch(() => null);
  return row?.value === "true";
}

/** Where this server writes down the scheduler's last call (one row per server, so a test never vouches for production). */
export const schedulerSeenSetting = (runner: string) => `orchestrator_scheduler_seen:${runner}`;

/** When the scheduler last called this server; null if it never has. */
export async function schedulerSeenAt(): Promise<Date | null> {
  const row = await db.setting.findUnique({ where: { key: schedulerSeenSetting(currentRunner()) }, select: { value: true } });
  const at = row ? Date.parse(row.value) : NaN;
  return Number.isFinite(at) ? new Date(at) : null;
}

/**
 * True when the scheduler has not called for five minutes. If the row cannot
 * be read (a dropped connection), the answer is "not quiet": a page must not
 * say the scheduler is down because one read failed.
 */
export async function schedulerQuiet(): Promise<boolean> {
  try {
    return schedulerIsQuiet(await schedulerSeenAt(), new Date());
  } catch (error) {
    console.warn("[orchestrator] the scheduler's last call could not be read", error instanceof Error ? error.message : error);
    return false;
  }
}

export function researchState(job: { status: string } | null): OrchestratorFacts["research"]["state"] {
  if (!job) return "NONE";
  if (job.status === "PASSED") return "PASSED";
  if (job.status === "FAILED_NEEDS_REVIEW") return "FAILED";
  return "RUNNING";
}

export const START_SELECT = {
  id: true,
  projectId: true,
  status: true,
  workerId: true,
  chapterCount: true,
  additionalData: true,
  service: { select: { serviceCode: true, intakeFormTemplate: true } },
  researchMode: { select: { isLocked: true } },
  researchJob: { select: { status: true } },
  orchestratorRun: true,
  qaReview: { select: { qualityScore: true, qualityTotal: true, qualityRunAt: true } },
  generationCheckpoints: { select: { chapterNumber: true, status: true } },
  pauses: { where: { status: "CANCELLED" as const }, orderBy: { afterChapter: "asc" as const }, select: { id: true, afterChapter: true } },
  _count: { select: { references: { where: { status: "KEPT" as const } } } },
} satisfies Prisma.ProjectSelect;

export type StartProject = Prisma.ProjectGetPayload<{ select: typeof START_SELECT }>;

/** What Start would say for this project, with the chapters it would write. */
export function startVerdict(p: StartProject, confirmNoReferences: boolean, quiet: boolean): StartVerdict & { chapters: number[] } {
  const chapters = expectedChapters({ serviceCode: p.service.serviceCode, additionalData: p.additionalData, chapterCount: p.chapterCount });
  return {
    chapters,
    ...checkStart({
      schedulerQuiet: quiet,
      isReport: isReportTemplate(p.service.intakeFormTemplate),
      modeApproved: Boolean(p.researchMode?.isLocked),
      projectStatus: p.status,
      hasSpecialist: Boolean(p.workerId),
      chapters,
      research: { state: researchState(p.researchJob), kept: p._count.references },
      existing: p.orchestratorRun?.status ?? null,
      chaptersWritten: p.generationCheckpoints.filter((c) => c.status === "COMPLETED").length,
      confirmNoReferences,
    }),
  };
}

export function runViewFrom(project: StartProject, paused: boolean, quiet: boolean): RunView | null {
  if (!isReportTemplate(project.service.intakeFormTemplate)) return null;
  const run = project.orchestratorRun;
  const generationStarted = project.generationCheckpoints.length > 0;
  const verdict = !run || run.status === "STOPPED" ? startVerdict(project, false, quiet) : null;
  const start = verdict
    ? { refusals: verdict.refusals, warnings: [...verdict.warnings, ...(paused ? [ORCHESTRATOR_TEXT.refuse.paused] : [])], needsConfirmation: verdict.needsConfirmation }
    : null;
  const shared = {
    paused,
    schedulerQuiet: quiet,
    generationStarted,
    references: project._count.references,
    research: researchState(project.researchJob),
    gateRanAt: project.qaReview?.qualityRunAt?.toISOString() ?? null,
    cancelledPauseId: project.pauses[0]?.id ?? null,
  };
  if (!run) {
    return {
      status: "NOT_STARTED",
      label: ORCHESTRATOR_TEXT.notStarted,
      line: project.researchMode?.isLocked ? ORCHESTRATOR_TEXT.line.notStarted : ORCHESTRATOR_TEXT.refuse.modeNotApproved,
      detail: null,
      reason: null,
      currentChapter: null,
      actions: [],
      canStart: Boolean(start && start.refusals.length === 0),
      canStop: false,
      start,
      startedByName: null,
      requestedAt: null,
      ...shared,
    };
  }
  const gate = { score: project.qaReview?.qualityScore ?? null, total: project.qaReview?.qualityTotal ?? null };
  return {
    status: run.status,
    label: ORCHESTRATOR_TEXT.status[run.status],
    line: runLine(run, gate),
    // A stalled chapter's record says what the sentence above it already says.
    detail: (run.status === "NEEDS_ATTENTION" && run.reason !== "CHAPTER_STALLED") || run.status === "STOPPED" ? run.reasonDetail : null,
    reason: run.reason,
    currentChapter: run.currentChapter,
    actions: run.status === "NEEDS_ATTENTION" ? actionsFor(run.reason as AttentionReason | null) : [],
    canStart: run.status === "STOPPED" && Boolean(start && start.refusals.length === 0),
    canStop: run.status !== "STOPPED" && run.status !== "COMPLETE",
    start,
    startedByName: run.startedByName,
    requestedAt: run.requestedAt.toISOString(),
    ...shared,
  };
}

/** The run as the Report tab shows it; null for a project that is not a written report. */
export async function getRunView(projectDbId: string): Promise<RunView | null> {
  const [project, paused, quiet] = await Promise.all([db.project.findUnique({ where: { id: projectDbId }, select: START_SELECT }), generationPaused(), schedulerQuiet()]);
  return project ? runViewFrom(project, paused, quiet) : null;
}
