/**
 * Phase D6: the generation queue's database reads (the rules are in
 * src/lib/generation/generation-queue.ts). Two small queries per read, plus a
 * five-minute in-process cache of the average generation time, so the
 * progress stream can ask every few seconds without load.
 *
 * Since D9 the queue is the chapter orchestrator's: a report is queued once
 * the founder or the COO has pressed Start (its run is QUEUED) and leaves when
 * it gets one of the slots. A project coming back from a data pause queues
 * again in the same order.
 */

import type { GenerationStatus, ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { expectedChapters } from "@/lib/deliverables";
import { averageProjectMinutes, queueStateFrom, type QueueMember, type QueueState, type QueueStatus } from "@/lib/generation/generation-queue";
import { slotHolders } from "@/lib/generation/orchestrator-rules";

/** The pipeline statuses in which a report's chapters are written. */
export const QUEUE_PROJECT_STATUSES: ProjectStatus[] = ["IN_PROGRESS", "REVISION_NEEDED"];
const ACTIVE_RUN: GenerationStatus[] = ["PENDING", "OUTLINING", "WRITING"];

/** The reports waiting for a slot: Start was pressed, or their data has just been verified. */
export async function loadQueueMembers(): Promise<QueueMember[]> {
  const rows = await db.orchestratorRun.findMany({
    where: { status: "QUEUED", project: { status: { in: QUEUE_PROJECT_STATUSES } } },
    select: { projectId: true, project: { select: { isExpressDelivery: true, researchMode: { select: { cooApprovedAt: true } } } } },
  });
  return rows.map((r) => ({ projectId: r.projectId, isExpress: r.project.isExpressDelivery, approvedAt: r.project.researchMode?.cooApprovedAt ?? null }));
}

/** The slots in use: reports being written or fetching their dataset, and any project with a chapter running. */
export async function generatingNowCount(): Promise<number> {
  const [runs, active] = await Promise.all([
    db.orchestratorRun.findMany({ where: { status: { in: ["GENERATING", "FETCHING_DATA"] } }, select: { projectId: true, status: true } }),
    db.generationCheckpoint.findMany({ where: { status: { in: ACTIVE_RUN } }, distinct: ["projectId"], select: { projectId: true } }),
  ]);
  return slotHolders(runs, active.map((a) => a.projectId)).size;
}

let averageCache: { at: number; value: { minutes: number; fromHistory: boolean } } | null = null;
const AVERAGE_TTL_MS = 5 * 60_000;

/** Minutes each finished project took to generate (its chapters' run times added up; data pauses are not counted). */
export async function averageGeneration(now = Date.now()): Promise<{ minutes: number; fromHistory: boolean }> {
  if (averageCache && now - averageCache.at < AVERAGE_TTL_MS) return averageCache.value;
  const runs = await db.generationCheckpoint.findMany({
    where: { status: "COMPLETED", startedAt: { not: null }, completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    take: 500,
    select: {
      projectId: true,
      chapterNumber: true,
      startedAt: true,
      completedAt: true,
      project: { select: { chapterCount: true, additionalData: true, service: { select: { serviceCode: true } } } },
    },
  });
  const byProject = new Map<string, { chapters: Set<number>; minutes: number; needed: number }>();
  for (const r of runs) {
    const entry = byProject.get(r.projectId) ?? { chapters: new Set<number>(), minutes: 0, needed: expectedChapters({ serviceCode: r.project.service.serviceCode, additionalData: r.project.additionalData, chapterCount: r.project.chapterCount }).length };
    if (!entry.chapters.has(r.chapterNumber)) {
      entry.chapters.add(r.chapterNumber);
      entry.minutes += (r.completedAt!.getTime() - r.startedAt!.getTime()) / 60_000;
    }
    byProject.set(r.projectId, entry);
  }
  const finished = [...byProject.values()].filter((e) => e.chapters.size >= e.needed).map((e) => e.minutes);
  const value = averageProjectMinutes(finished);
  averageCache = { at: now, value };
  return value;
}

/** The queue as one project sees it. `phase` is the project's own state when it is not waiting in the queue. */
export async function queueStateFor(projectId: string, phase: Exclude<QueueStatus, "queued">, now = new Date()): Promise<QueueState> {
  const [members, generatingNow, average] = await Promise.all([loadQueueMembers(), generatingNowCount(), averageGeneration(now.getTime())]);
  return queueStateFrom({ projectId, phase, members, generatingNow, average, now });
}
