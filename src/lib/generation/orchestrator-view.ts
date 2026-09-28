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
import { ORCHESTRATOR_TEXT, actionsFor, checkStart, runLine, type AttentionReason, type OrchestratorFacts, type RunView, type StartVerdict } from "./orchestrator-rules";

export { runViewForWorker, runViewKey, type RunView } from "./orchestrator-rules";

export const GENERATION_PAUSED_SETTING = "generation_paused";

/** The off switch: nothing new starts while it is on; chapters being written finish. */
export async function generationPaused(): Promise<boolean> {
  const row = await db.setting.findUnique({ where: { key: GENERATION_PAUSED_SETTING }, select: { value: true } }).catch(() => null);
  return row?.value === "true";
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
export function startVerdict(p: StartProject, confirmNoReferences: boolean): StartVerdict & { chapters: number[] } {
  const chapters = expectedChapters({ serviceCode: p.service.serviceCode, additionalData: p.additionalData, chapterCount: p.chapterCount });
  return {
    chapters,
    ...checkStart({
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

export function runViewFrom(project: StartProject, paused: boolean): RunView | null {
  if (!isReportTemplate(project.service.intakeFormTemplate)) return null;
  const run = project.orchestratorRun;
  const generationStarted = project.generationCheckpoints.length > 0;
  const verdict = !run || run.status === "STOPPED" ? startVerdict(project, false) : null;
  const start = verdict
    ? { refusals: verdict.refusals, warnings: [...verdict.warnings, ...(paused ? [ORCHESTRATOR_TEXT.refuse.paused] : [])], needsConfirmation: verdict.needsConfirmation }
    : null;
  const shared = {
    paused,
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
  const [project, paused] = await Promise.all([db.project.findUnique({ where: { id: projectDbId }, select: START_SELECT }), generationPaused()]);
  return project ? runViewFrom(project, paused) : null;
}
