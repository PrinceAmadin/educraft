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
import {
  LANES,
  LANE_DEFAULT_MINUTES,
  LANE_MINUTES_SETTING,
  LANE_SLOTS,
  LANE_SLOTS_SETTING,
  averageProjectMinutes,
  laneFor,
  queueStateFrom,
  type GenerationLane,
  type QueueMember,
  type QueueState,
  type QueueStatus,
} from "@/lib/generation/generation-queue";
import { laneHolders, slotHolders } from "@/lib/generation/orchestrator-rules";

/** The pipeline statuses in which a report's chapters are written. */
export const QUEUE_PROJECT_STATUSES: ProjectStatus[] = ["IN_PROGRESS", "REVISION_NEEDED"];
const ACTIVE_RUN: GenerationStatus[] = ["PENDING", "OUTLINING", "WRITING"];

/** The reports waiting for a slot: Start was pressed, or their data has just been verified. */
export async function loadQueueMembers(): Promise<QueueMember[]> {
  const rows = await db.orchestratorRun.findMany({
    where: { status: "QUEUED", project: { status: { in: QUEUE_PROJECT_STATUSES } } },
    select: { projectId: true, project: { select: { isExpressDelivery: true, degreeLevel: true, minimumPages: true, researchMode: { select: { cooApprovedAt: true } } } } },
  });
  return rows.map((r) => ({
    projectId: r.projectId,
    isExpress: r.project.isExpressDelivery,
    approvedAt: r.project.researchMode?.cooApprovedAt ?? null,
    lane: laneFor(r.project),
  }));
}

/**
 * The slots in use in each lane: reports being written or fetching their dataset, and any project
 * with a chapter running. Counted per lane, because that is how they are claimed.
 */
export async function generatingNowCount(): Promise<Record<GenerationLane, number>> {
  const [runs, active] = await Promise.all([
    db.orchestratorRun.findMany({ where: { status: { in: ["GENERATING", "FETCHING_DATA"] } }, select: { projectId: true, status: true } }),
    db.generationCheckpoint.findMany({ where: { status: { in: ACTIVE_RUN } }, distinct: ["projectId"], select: { projectId: true } }),
  ]);
  const holders = [...slotHolders(runs, active.map((a) => a.projectId))];
  if (holders.length === 0) return { STANDARD: 0, LONG: 0 };
  const rows = await db.project.findMany({ where: { id: { in: holders } }, select: { id: true, degreeLevel: true, minimumPages: true } });
  const laneByProject = new Map(rows.map((r) => [r.id, laneFor(r)]));
  return laneHolders(holders.map((id) => ({ projectId: id, lane: laneByProject.get(id) ?? "STANDARD" })));
}

/** The slots each lane has, from its Setting; the shipped sizes when unset or out of range. */
export async function laneSlots(): Promise<Record<GenerationLane, number>> {
  const rows = await db.setting
    .findMany({ where: { key: { in: LANES.map((l) => LANE_SLOTS_SETTING(l)) } }, select: { key: true, value: true } })
    .catch(() => [] as { key: string; value: string }[]);
  const out = { ...LANE_SLOTS };
  for (const lane of LANES) {
    const n = Number(rows.find((r) => r.key === LANE_SLOTS_SETTING(lane))?.value?.trim() ?? NaN);
    if (Number.isInteger(n) && n >= 0 && n <= 20) out[lane] = n;
  }
  return out;
}

/** The starting estimate for a lane with too little history, from its Setting; else the shipped figure. */
async function laneDefaultMinutes(lane: GenerationLane): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: LANE_MINUTES_SETTING(lane) }, select: { value: true } }).catch(() => null);
  const n = Number(row?.value?.trim() ?? NaN);
  return Number.isFinite(n) && n > 0 && n <= 1440 ? Math.round(n) : LANE_DEFAULT_MINUTES[lane];
}

const averageCache = new Map<GenerationLane, { at: number; value: { minutes: number; fromHistory: boolean } }>();
const AVERAGE_TTL_MS = 5 * 60_000;

/**
 * Minutes a finished project of this lane took to generate (its chapters' run times added up; data
 * pauses are not counted). Per lane, so a two-hour dissertation never makes an undergraduate
 * report's estimate wrong, and the other way round.
 */
export async function averageGeneration(lane: GenerationLane = "STANDARD", now = Date.now()): Promise<{ minutes: number; fromHistory: boolean }> {
  const cached = averageCache.get(lane);
  if (cached && now - cached.at < AVERAGE_TTL_MS) return cached.value;
  const [runs, fallback] = await Promise.all([
    db.generationCheckpoint.findMany({
      where: { status: "COMPLETED", startedAt: { not: null }, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      take: 500,
      select: {
        projectId: true,
        chapterNumber: true,
        startedAt: true,
        completedAt: true,
        project: { select: { chapterCount: true, additionalData: true, degreeLevel: true, minimumPages: true, service: { select: { serviceCode: true } } } },
      },
    }),
    laneDefaultMinutes(lane),
  ]);
  const byProject = new Map<string, { chapters: Set<number>; minutes: number; needed: number; lane: GenerationLane }>();
  for (const r of runs) {
    const entry = byProject.get(r.projectId) ?? {
      chapters: new Set<number>(),
      minutes: 0,
      needed: expectedChapters({ serviceCode: r.project.service.serviceCode, additionalData: r.project.additionalData, chapterCount: r.project.chapterCount }).length,
      lane: laneFor(r.project),
    };
    if (!entry.chapters.has(r.chapterNumber)) {
      entry.chapters.add(r.chapterNumber);
      entry.minutes += (r.completedAt!.getTime() - r.startedAt!.getTime()) / 60_000;
    }
    byProject.set(r.projectId, entry);
  }
  const finished = [...byProject.values()].filter((e) => e.lane === lane && e.chapters.size >= e.needed).map((e) => e.minutes);
  const value = averageProjectMinutes(finished, fallback);
  averageCache.set(lane, { at: now, value });
  return value;
}

/** The queue as one project sees it. `phase` is the project's own state when it is not waiting in the queue. */
export async function queueStateFor(projectId: string, phase: Exclude<QueueStatus, "queued">, now = new Date()): Promise<QueueState> {
  const [members, generatingNow, slots] = await Promise.all([loadQueueMembers(), generatingNowCount(), laneSlots()]);
  const lane = members.find((m) => m.projectId === projectId)?.lane ?? (await projectLane(projectId));
  const average = await averageGeneration(lane, now.getTime());
  return queueStateFrom({ projectId, phase, members, generatingNow, average, now, slots });
}

/** A project's lane when it is not in the queue (so its estimate is still read against its own lane). */
async function projectLane(projectId: string): Promise<GenerationLane> {
  const row = await db.project.findUnique({ where: { id: projectId }, select: { degreeLevel: true, minimumPages: true } }).catch(() => null);
  return row ? laneFor(row) : "STANDARD";
}
