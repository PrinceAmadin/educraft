/**
 * Phase D6: the generation queue's database reads (the rules are in
 * src/lib/generation/generation-queue.ts). Two small queries per read, plus a
 * five-minute in-process cache of the average generation time, so the
 * progress stream can ask every few seconds without load.
 */

import type { GenerationStatus, ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { averageProjectMinutes, queueStateFrom, type QueueMember, type QueueState, type QueueStatus } from "@/lib/generation/generation-queue";

/** A project with an approved mode waits in the queue only while it is live work. */
export const QUEUE_PROJECT_STATUSES: ProjectStatus[] = ["DOWNPAYMENT_VERIFIED", "REQUIREMENTS_CONFIRMED", "ASSIGNED", "IN_PROGRESS", "AWAITING_CLIENT_INPUT"];
const ACTIVE_RUN: GenerationStatus[] = ["PENDING", "OUTLINING", "WRITING"];

export async function loadQueueMembers(): Promise<QueueMember[]> {
  const rows = await db.researchMode.findMany({
    where: { isLocked: true, project: { status: { in: QUEUE_PROJECT_STATUSES }, generationCheckpoints: { none: {} } } },
    select: { projectId: true, cooApprovedAt: true, project: { select: { isExpressDelivery: true } } },
  });
  return rows.map((r) => ({ projectId: r.projectId, isExpress: r.project.isExpressDelivery, approvedAt: r.cooApprovedAt }));
}

/** Projects with a chapter running right now. */
export async function generatingNowCount(): Promise<number> {
  const rows = await db.generationCheckpoint.findMany({ where: { status: { in: ACTIVE_RUN } }, distinct: ["projectId"], select: { projectId: true } });
  return rows.length;
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
    select: { projectId: true, chapterNumber: true, startedAt: true, completedAt: true, project: { select: { chapterCount: true } } },
  });
  const byProject = new Map<string, { chapters: Set<number>; minutes: number; needed: number }>();
  for (const r of runs) {
    const entry = byProject.get(r.projectId) ?? { chapters: new Set<number>(), minutes: 0, needed: Math.min(5, Math.max(1, r.project.chapterCount ?? 5)) };
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
