import crypto from "crypto";
import { db } from "@/lib/db";
import { ClaudeStreamError } from "@/lib/anthropic";
import { notifyUsers } from "@/lib/services/notifications";
import { selfBaseUrl } from "@/lib/self-base-url";
import { PromptAssemblyError } from "./prompt-loader";
import { ACTIVE_STATUSES, GenerationError, YieldToNextSlice, advanceChapterGeneration, failChapterGeneration } from "./generate-chapter";
import { isStalled, type SnapshotLike } from "./generation-events";

/*
 * Runs a chapter generation on the server, with every browser closed. Same
 * scheme as the research runner (see research-runner.ts for the why):
 *
 *  - A slice is one function invocation (/api/internal/generation/step). It
 *    takes the lease, then runs steps (the plan, then one part per step)
 *    back to back. A step only starts when its estimated time fits before the
 *    slice's deadline (SLICE_DEADLINE_MS after the invocation began, leaving
 *    time for saves inside Vercel's 300 s); otherwise the slice hands over.
 *    Every Claude call also gets that deadline as a hard stop.
 *  - Then it hands over to a fresh invocation. Vercel refuses a chain more
 *    than 5 deep (HTTP 508), so a run that needs more slices stops at
 *    MAX_HOPS; anything watching it (the progress stream, a status read)
 *    restarts it.
 *  - The lease belongs to the slice that took it: the exact lockedUntil it
 *    wrote is its token. The heartbeat (every 20 s), the release and the
 *    check between steps all compare against that value and run one at a
 *    time, so a late heartbeat can never re-lock a released run and a slice
 *    that lost its lease stops instead of racing its successor.
 *  - A failed step is retried with a growing delay, inside the slice when
 *    there is time (saving a hop), else in the next one. After
 *    MAX_CONSECUTIVE_FAILURES, or at once for an error retrying cannot fix,
 *    the run is FAILED (the parts written are kept) and its starter told.
 */

const LEASE_MS = 90_000;
const HEARTBEAT_MS = 20_000;
/** Claude calls in a slice stop by this long after the invocation began (Vercel's limit is 300 s; the rest is for saves and the handover). */
const SLICE_DEADLINE_MS = 270_000;
/** Vercel allows 5 functions deep in one request chain; the request that started the run is #1. */
const MAX_HOPS = 5;
export const MAX_CONSECUTIVE_FAILURES = 4;
const MAX_DELAY_SECONDS = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function tokenSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

/** Proves a request to the internal step endpoint came from us: the endpoint has no session. */
export function signGenerationToken(checkpointId: string): string {
  return crypto.createHmac("sha256", tokenSecret()).update(`generation-step:${checkpointId}`).digest("hex");
}

export function verifyGenerationToken(checkpointId: string, token: string | null): boolean {
  if (!token) return false;
  const expected = Buffer.from(signGenerationToken(checkpointId));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Asks for the next slice of a run in a fresh function invocation; returns once it is accepted, not once it is done. */
export async function scheduleGenerationStep(checkpointId: string, delaySeconds = 0, hop = 2): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-generation-token": signGenerationToken(checkpointId),
  };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
  const res = await fetch(`${selfBaseUrl()}/api/internal/generation/step`, {
    method: "POST",
    headers,
    body: JSON.stringify({ checkpointId, delaySeconds, hop }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 120);
    throw new Error(`HTTP ${res.status}${detail ? ` ${detail}` : ""}`);
  }
}

async function chain(checkpointId: string, delaySeconds: number, hop: number): Promise<void> {
  const backoffMs = [2000, 5000];
  let reason = "unknown";
  for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
    try {
      await scheduleGenerationStep(checkpointId, delaySeconds, hop);
      return;
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
      if (attempt < backoffMs.length) await sleep(backoffMs[attempt]);
    }
  }
  console.error("[generation runner] could not schedule the next slice", checkpointId, reason);
  // The lease was already released by the slice; only say why the run stopped.
  await db.generationCheckpoint
    .updateMany({ where: { id: checkpointId }, data: { lastError: `The background run was interrupted (${reason}). It restarts when its progress is next opened.` } })
    .catch(() => {});
}

/**
 * Restarts any of these runs that has stalled (its chain broke, or it reached
 * the request-chain limit). Called wherever a run is looked at (the progress
 * stream, the status routes); the lease makes a restart of a run that is in
 * fact going harmless. Returns the ids restarted.
 */
export async function resumeStalledRuns(runs: SnapshotLike[], now = Date.now()): Promise<string[]> {
  const stalled = runs.filter((r) => isStalled(r, now));
  await Promise.all(
    stalled.map((r) => scheduleGenerationStep(r.id).catch((error) => console.error("[generation runner] could not restart a stalled run", r.id, error))),
  );
  return stalled.map((r) => r.id);
}

/**
 * The lease one slice holds on a run. Its token is the exact lockedUntil it
 * last wrote; every operation is compare-and-set on it and queued behind the
 * previous one.
 */
class Lease {
  private queue: Promise<unknown> = Promise.resolve();
  lost = false;

  private constructor(
    private readonly id: string,
    private until: Date,
  ) {}

  static async take(id: string): Promise<Lease | null> {
    const until = new Date(Date.now() + LEASE_MS);
    const taken = await db.generationCheckpoint.updateMany({
      where: { id, status: { in: ACTIVE_STATUSES }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] },
      data: { lockedUntil: until },
    });
    return taken.count === 1 ? new Lease(id, until) : null;
  }

  /** Extends the lease; marks it lost when someone else holds it now (or the run was settled or replaced). */
  renew(): Promise<unknown> {
    this.queue = this.queue
      .then(async () => {
        if (this.lost) return;
        const next = new Date(Date.now() + LEASE_MS);
        const res = await db.generationCheckpoint.updateMany({
          where: { id: this.id, lockedUntil: this.until, status: { in: ACTIVE_STATUSES } },
          data: { lockedUntil: next },
        });
        if (res.count === 1) this.until = next;
        else this.lost = true;
      })
      .catch(() => {}); // a failed renewal is retried by the next heartbeat; the lease has 90 s
    return this.queue;
  }

  /** Frees the run, but only if this slice still holds it. */
  release(): Promise<unknown> {
    this.queue = this.queue
      .then(async () => {
        if (this.lost) return;
        await db.generationCheckpoint.updateMany({ where: { id: this.id, lockedUntil: this.until }, data: { lockedUntil: null } });
        this.lost = true;
      })
      .catch(() => {});
    return this.queue;
  }
}

/**
 * Runs one slice of a chapter run. `invokedAt` is when the invocation began
 * (the deadline counts from there, so a delay before the slice eats into it).
 */
export async function runGenerationSlice(checkpointId: string, delaySeconds = 0, hop = 2, invokedAt = Date.now()): Promise<void> {
  if (delaySeconds > 0) await sleep(Math.min(delaySeconds, MAX_DELAY_SECONDS) * 1000);
  const deadline = invokedAt + SLICE_DEADLINE_MS;

  const lease = await Lease.take(checkpointId);
  if (!lease) return; // another slice has it, it is finished or failed, or it was replaced
  const heartbeat = setInterval(() => void lease.renew(), HEARTBEAT_MS);

  let next: { delaySeconds: number } | null = null;
  try {
    for (;;) {
      // Confirm the lease before every step (and extend it for the step): a slice that lost it stops here.
      await lease.renew();
      if (lease.lost) return;
      let retryInSliceMs: number | null = null;
      try {
        const { done } = await advanceChapterGeneration(checkpointId, { deadline });
        if (done) return;
        await db.generationCheckpoint.updateMany({ where: { id: checkpointId }, data: { failedSteps: 0, lastError: null } });
        continue; // the next step checks for itself whether it fits before the deadline
      } catch (error) {
        if (error instanceof YieldToNextSlice) {
          next = { delaySeconds: 0 };
          return;
        }
        const failure = await handleStepFailure(checkpointId, error);
        if (failure === "stop") return;
        retryInSliceMs = failure.retryInSliceMs;
        next = { delaySeconds: failure.delaySeconds };
      }
      // Retry here when the wait still leaves room for a step; otherwise in the next slice.
      if (retryInSliceMs !== null && Date.now() + retryInSliceMs + 60_000 < deadline) {
        next = null;
        await sleep(retryInSliceMs);
        continue;
      }
      return;
    }
  } finally {
    clearInterval(heartbeat);
    await lease.release();
    // At the request-chain limit the run waits until something restarts it (the progress stream or a status read).
    if (next && hop < MAX_HOPS) await chain(checkpointId, next.delaySeconds, hop + 1);
  }
}


/** Is this error one that retrying cannot fix? */
function isFatal(error: unknown): boolean {
  if (error instanceof GenerationError) return error.fatal;
  if (error instanceof ClaudeStreamError) return !error.info.retryable;
  if (error instanceof PromptAssemblyError) return true;
  return false;
}

async function handleStepFailure(
  checkpointId: string,
  error: unknown,
): Promise<{ retryInSliceMs: number | null; delaySeconds: number } | "stop"> {
  const row = await db.generationCheckpoint.findUnique({
    where: { id: checkpointId },
    select: { status: true, failedSteps: true, chapterNumber: true, requestedById: true, project: { select: { projectId: true } } },
  });
  if (!row || !ACTIVE_STATUSES.includes(row.status)) return "stop"; // replaced or already settled mid-step

  const message = error instanceof Error ? error.message : String(error);
  const failedSteps = row.failedSteps + 1;
  console.error(`[generation runner] step failed (${failedSteps}/${MAX_CONSECUTIVE_FAILURES})`, checkpointId, error);

  if (isFatal(error) || failedSteps >= MAX_CONSECUTIVE_FAILURES) {
    const failed = await failChapterGeneration(checkpointId, message, failedSteps);
    if (failed && row.requestedById) {
      await notifyUsers([row.requestedById], {
        title: `Chapter ${row.chapterNumber} generation stopped`,
        message: `${row.project.projectId}: ${message} The parts already written are kept.`,
        type: "warning",
        link: `/worker/projects/${row.project.projectId}`,
      }).catch(() => {});
    }
    return "stop";
  }

  await db.generationCheckpoint.updateMany({ where: { id: checkpointId }, data: { failedSteps, lastError: message, lastStepAt: new Date() } });
  const deadlineHit = error instanceof ClaudeStreamError && error.info.deadline;
  const delaySeconds = Math.min(MAX_DELAY_SECONDS, 5 * failedSteps);
  // Out of time in this invocation: carry on at once in a fresh one; otherwise wait and retry here if the slice allows.
  return deadlineHit ? { retryInSliceMs: null, delaySeconds: 0 } : { retryInSliceMs: delaySeconds * 1000, delaySeconds };
}
