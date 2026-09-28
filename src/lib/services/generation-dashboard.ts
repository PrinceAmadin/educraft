/**
 * Phase D6: the progress dashboard's reads. Light on purpose (no Claude,
 * Excel or Blob code): the progress stream calls these every couple of
 * seconds, and the worker and admin pages call generationDashboardFor for the
 * first, server-rendered state.
 */

import type { GenerationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { expectedChapters } from "@/lib/deliverables";
import { countWords } from "@/lib/generation/chapter-plan";
import { isReportTemplate } from "@/lib/generation/generation-state";
import { listGenerationSnapshots, type GenerationSnapshot } from "@/lib/generation/generate-chapter";
import { projectPhase, type QueueState } from "@/lib/generation/generation-queue";
import {
  chapterTitle,
  isPauseActive,
  pauseView,
  waitingReason,
  type ChapterCardView,
  type PauseSnapshot,
  type PauseView,
} from "@/lib/generation/progress-events";
import { queueStateFor } from "@/lib/services/generation-queue";
import { getRunView, runViewForWorker, type RunView } from "@/lib/generation/orchestrator-view";

const ACTIVE_RUN: GenerationStatus[] = ["PENDING", "OUTLINING", "WRITING"];

/** Every pause of a project (two at most), with its file counts. */
export async function listPauseSnapshots(projectId: string): Promise<PauseSnapshot[]> {
  const rows = await db.pipelinePause.findMany({
    where: { projectId },
    orderBy: { afterChapter: "asc" },
    select: {
      id: true,
      afterChapter: true,
      mode: true,
      status: true,
      formStatus: true,
      formSpec: true,
      round: true,
      workerNote: true,
      resumedAt: true,
      cancelledAt: true,
      updatedAt: true,
      files: { where: { deletedAt: null }, select: { uploaderRole: true } },
    },
  });
  return rows.map((r) => {
    const dataFrom = (r.formSpec as { dataFrom?: unknown } | null)?.dataFrom;
    return {
      id: r.id,
      afterChapter: r.afterChapter,
      mode: r.mode,
      status: r.status,
      formStatus: r.formStatus,
      round: r.round,
      workerNote: r.workerNote,
      dataFrom: dataFrom === "RAW" || dataFrom === "ANALYSED" ? dataFrom : null,
      clientFiles: r.files.filter((f) => f.uploaderRole === "CLIENT").length,
      specialistFiles: r.files.filter((f) => f.uploaderRole !== "CLIENT").length,
      resumedAt: r.resumedAt,
      cancelledAt: r.cancelledAt,
      updatedAt: r.updatedAt,
    };
  });
}

export { projectPhase };

export interface ProjectGenerationContext {
  projectId: string;
  projectCode: string;
  /** How many chapters the project has (chapters.length). */
  chapterCount: number;
  /** The project's own chapters, in order (expectedChapters): 1 to 5, or the ones a chapter-based order bought. */
  chapters: number[];
  mode: number | null;
  approved: boolean;
  thematic: { chapter3: string | null; chapter4: string | null };
}

/** The facts the dashboard needs that rarely change (read once per stream / page). */
export async function generationContext(projectId: string): Promise<ProjectGenerationContext | null> {
  const p = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      projectId: true,
      chapterCount: true,
      additionalData: true,
      service: { select: { intakeFormTemplate: true, serviceCode: true } },
      researchMode: { select: { modeNumber: true, isLocked: true, thematicTitleChapter3: true, thematicTitleChapter4: true } },
    },
  });
  if (!p || !isReportTemplate(p.service.intakeFormTemplate)) return null;
  const chapters = expectedChapters({ serviceCode: p.service.serviceCode, additionalData: p.additionalData, chapterCount: p.chapterCount });
  return {
    projectId: p.id,
    projectCode: p.projectId,
    chapterCount: chapters.length,
    chapters,
    mode: p.researchMode?.isLocked ? p.researchMode.modeNumber : null,
    approved: Boolean(p.researchMode?.isLocked),
    thematic: { chapter3: p.researchMode?.thematicTitleChapter3 ?? null, chapter4: p.researchMode?.thematicTitleChapter4 ?? null },
  };
}

/** One card per chapter from the runs (a chapter with no run is pending, with the reason when known). */
export function chapterCards(ctx: ProjectGenerationContext, runs: GenerationSnapshot[], opts: { activePauseAfter: number | null; hasSecondaryData: boolean; words?: Map<number, number> }): ChapterCardView[] {
  return ctx.chapters.map((n) => {
    const run = runs.find((r) => r.chapterNumber === n);
    const base: ChapterCardView = {
      chapterNum: n,
      title: chapterTitle(ctx.mode, n, ctx.thematic),
      status: "pending",
      stage: null,
      progressPercent: 0,
      part: 0,
      partCount: 0,
      retryingAttempt: null,
      words: null,
      durationSeconds: null,
      error: null,
      waitingFor: waitingReason(n, { activePauseAfter: opts.activePauseAfter, mode: ctx.mode, hasSecondaryData: opts.hasSecondaryData }),
    };
    if (!run) return base;
    if (run.status === "COMPLETED") {
      return {
        ...base,
        status: "complete",
        progressPercent: 100,
        part: run.partCount,
        partCount: run.partCount,
        words: opts.words?.get(n) ?? null,
        durationSeconds: run.startedAt && run.completedAt ? Math.round((run.completedAt.getTime() - run.startedAt.getTime()) / 1000) : null,
        waitingFor: null,
      };
    }
    if (run.status === "FAILED" || run.status === "STALLED") {
      return {
        ...base,
        status: run.status === "STALLED" ? "stalled" : "failed",
        progressPercent: run.progressPercent,
        part: run.partCursor,
        partCount: run.partCount,
        error: run.errorMessage ?? run.lastError ?? "Generation stopped",
        waitingFor: null,
      };
    }
    return {
      ...base,
      status: run.status === "PENDING" ? "pending" : "generating",
      stage: run.status === "OUTLINING" ? "outlining" : run.status === "WRITING" ? "writing" : null,
      progressPercent: run.progressPercent,
      part: run.partCount ? Math.min(run.partCursor + 1, run.partCount) : 0,
      partCount: run.partCount,
      retryingAttempt: run.failedSteps > 0 ? run.failedSteps + 1 : null,
      waitingFor: run.status === "PENDING" ? "Starting" : null,
    };
  });
}

export interface GenerationDashboardState {
  projectCode: string;
  mode: number | null;
  chapters: ChapterCardView[];
  pause: PauseView | null;
  queue: QueueState;
  /** D9: where the report's run stands (Start, the queue, a pause, the quality check). */
  run: RunView | null;
}

/**
 * The first, server-rendered state of the dashboard; null for projects that
 * are not written reports. A specialist gets the run's state without the
 * founder's and the COO's buttons.
 */
export async function generationDashboardFor(projectId: string, audience: "admin" | "worker" = "admin"): Promise<GenerationDashboardState | null> {
  const ctx = await generationContext(projectId);
  if (!ctx) return null;
  const [runs, pauses, dataset, runView] = await Promise.all([
    listGenerationSnapshots(projectId),
    listPauseSnapshots(projectId),
    ctx.mode === 5 ? db.projectFile.count({ where: { projectId, category: "secondary_data", deletedAt: null } }) : Promise.resolve(0),
    getRunView(projectId),
  ]);
  const active = pauses.find(isPauseActive) ?? null;
  const words = await completedWords(runs);
  const phase = projectPhase({ approved: ctx.approved, runs, activePause: Boolean(active), chapterCount: ctx.chapterCount, chapters: ctx.chapters });
  return {
    projectCode: ctx.projectCode,
    mode: ctx.mode,
    chapters: chapterCards(ctx, runs, { activePauseAfter: active?.afterChapter ?? null, hasSecondaryData: dataset > 0, words }),
    pause: active ? pauseView(active) : null,
    queue: await queueStateFor(projectId, phase),
    run: runView && audience === "worker" ? runViewForWorker(runView) : runView,
  };
}

/** Word counts of finished chapters (read only for completed runs). */
export async function completedWords(runs: GenerationSnapshot[]): Promise<Map<number, number>> {
  const done = runs.filter((r) => r.status === "COMPLETED");
  if (!done.length) return new Map();
  const rows = await db.generationCheckpoint.findMany({ where: { id: { in: done.map((r) => r.id) } }, select: { chapterNumber: true, fullOutput: true } });
  return new Map(rows.map((r) => [r.chapterNumber, countWords(r.fullOutput)]));
}

export { ACTIVE_RUN };
