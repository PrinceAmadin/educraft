/**
 * Phase D2 — the progress events of chapter generation, as server-sent events.
 * Pure (types only from Prisma): the stream that polls the database and
 * sends these is generation-stream.ts.
 *
 *   chapter_progress  { chapterNum, progressPercent, status, part, partCount, retrying? }
 *   chapter_complete  { chapterNum, outputLength, words, tokensUsed, outputTokens, costNaira }
 *   chapter_failed    { chapterNum, error, partsWritten, partCount }
 *   chapter_stalled   { chapterNum, error, partsWritten, partCount }  (D9: the watchdog stopped it)
 *   generation_idle   { chapters }  (nothing running for the chapters watched)
 *
 * Events describe the current state, so a reconnecting client simply gets
 * the state again; clients treat them as idempotent.
 */
import type { GenerationStatus } from "@prisma/client";

export type GenerationEventName =
  | "chapter_progress"
  | "chapter_complete"
  | "chapter_failed"
  | "chapter_stalled"
  | "generation_idle"
  // D6 (progress-events.ts): the data pauses and the generation queue.
  | "pipeline_paused"
  | "pipeline_resumed"
  | "queue_position"
  // D9: where the report's run stands (the orchestrator).
  | "run_state";

/**
 * Who a stream is for. "legacy" is D2's /events shape (unchanged); "worker"
 * leaves out Claude costs; "admin" (founder/COO) keeps them.
 */
export type EventAudience = "legacy" | "worker" | "admin";

export interface GenerationEvent {
  event: GenerationEventName;
  data: Record<string, unknown>;
  id?: string;
}

/** The fields of a checkpoint the events read (GenerationSnapshot has all of them). */
export interface SnapshotLike {
  id: string;
  chapterNumber: number;
  status: GenerationStatus;
  progressPercent: number;
  partCursor: number;
  partCount: number;
  failedSteps: number;
  errorMessage: string | null;
  lastError: string | null;
  lockedUntil: Date | null;
  lastStepAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

const ACTIVE = new Set<GenerationStatus>(["PENDING", "OUTLINING", "WRITING"]);

export function isActive(s: Pick<SnapshotLike, "status">): boolean {
  return ACTIVE.has(s.status);
}

/** Lower-case status for clients: pending, outlining, writing, completed, failed, stalled. */
export function statusName(status: GenerationStatus): string {
  return status.toLowerCase();
}

/** Changes whenever something a client shows changes; the stream sends an event only then. */
export function snapshotKey(s: SnapshotLike): string {
  return [s.status, s.progressPercent, s.partCursor, s.partCount, s.failedSteps, s.lastError ?? ""].join("|");
}

export function tokensUsed(s: Pick<SnapshotLike, "inputTokens" | "outputTokens" | "cacheWriteTokens" | "cacheReadTokens">): number {
  return s.inputTokens + s.cacheWriteTokens + s.cacheReadTokens + s.outputTokens;
}

export function durationSeconds(s: Pick<SnapshotLike, "startedAt" | "completedAt">): number | null {
  return s.startedAt && s.completedAt ? Math.max(0, Math.round((s.completedAt.getTime() - s.startedAt.getTime()) / 1000)) : null;
}

export function eventForSnapshot(s: SnapshotLike, opts: { nairaRate: number; output?: { outputLength: number; words: number } | null; audience?: EventAudience }): GenerationEvent {
  const id = `${s.id}:${s.updatedAt.getTime()}`;
  const audience = opts.audience ?? "legacy";
  if (s.status === "COMPLETED") {
    const cost = { tokensUsed: tokensUsed(s), outputTokens: s.outputTokens, costNaira: Math.round(s.costUsd * opts.nairaRate * 100) / 100 };
    if (audience === "legacy") {
      return { event: "chapter_complete", id, data: { chapterNum: s.chapterNumber, outputLength: opts.output?.outputLength ?? 0, words: opts.output?.words ?? 0, ...cost } };
    }
    return {
      event: "chapter_complete",
      id,
      data: { chapterNum: s.chapterNumber, words: opts.output?.words ?? 0, durationSeconds: durationSeconds(s), ...(audience === "admin" ? cost : {}) },
    };
  }
  if (s.status === "FAILED" || s.status === "STALLED") {
    return {
      event: s.status === "STALLED" ? "chapter_stalled" : "chapter_failed",
      id,
      data: { chapterNum: s.chapterNumber, error: s.errorMessage ?? s.lastError ?? "Generation stopped", partsWritten: s.partCursor, partCount: s.partCount, progressPercent: s.progressPercent },
    };
  }
  return {
    event: "chapter_progress",
    id,
    data: {
      chapterNum: s.chapterNumber,
      progressPercent: s.progressPercent,
      status: statusName(s.status),
      part: s.partCount ? Math.min(s.partCursor + 1, s.partCount) : 0,
      partCount: s.partCount,
      ...(s.failedSteps > 0 ? { retrying: { attempt: s.failedSteps + 1, lastError: s.lastError } } : {}),
    },
  };
}

/** One SSE frame. Data is one line of JSON (JSON.stringify never emits a raw newline). */
export function formatSse(e: GenerationEvent): string {
  return `${e.id ? `id: ${e.id}\n` : ""}event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
}

/**
 * An unfinished run nobody is working on: its lease has lapsed and nothing has
 * moved for `staleMs` (longer than any wait between two slices). The stream
 * restarts such a run. This is the normal hand-over between slices (the
 * orchestrator calls it "quiet"), not the STALLED status: a chapter is STALLED
 * when the watchdog found no part finished for 90 minutes, and then only a
 * person restarts it.
 */
export function isStalled(s: SnapshotLike, now: number, staleMs = 75_000): boolean {
  if (!isActive(s)) return false;
  if (s.lockedUntil && s.lockedUntil.getTime() > now) return false;
  const last = (s.lastStepAt ?? s.createdAt).getTime();
  return now - last > staleMs;
}
