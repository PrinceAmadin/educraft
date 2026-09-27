import crypto from "crypto";
import { db } from "@/lib/db";
import { AnthropicError } from "@/lib/anthropic";
import { ObjectivesDraftError } from "@/lib/generation/objectives-drafter";
import { notifyOperations } from "@/lib/services/notifications";
import { selfBaseUrl } from "@/lib/self-base-url";
import { ACTIVE_STAGE_STATUSES, SourceStageError, YieldToNextSlice, advanceSourceStage, failSourceStage } from "./source-stage";

/*
 * Runs a project's source stage (objectives, then Law cases or History
 * archives) on the server, with every browser closed. The same scheme as the
 * chapter runner (generation-runner.ts):
 *
 *  - A slice is one invocation of /api/internal/source-stage/step. It takes
 *    the lease and runs steps back to back; a step starts only when its
 *    estimate fits before the slice deadline (270 s after the invocation
 *    began), otherwise the slice hands over to a fresh invocation.
 *  - The lease belongs to the slice that took it: the exact lockedUntil it
 *    wrote is its token, and the heartbeat, the check before each step and the
 *    release compare against it, so a slice that lost its lease stops.
 *  - A failed step is retried with a growing delay. After
 *    MAX_STAGE_FAILURES in a row the stage stops where it is (everything found
 *    is kept) and the COO's card offers "Carry on"; an error retrying cannot
 *    fix marks it FAILED.
 *  - Nothing restarts a stopped stage on its own: the next browser request that
 *    looks at it (the COO's card, the worker's research poll) does, and only
 *    while it has not hit MAX_STAGE_FAILURES.
 */

const LEASE_MS = 150_000; // a web-search step may take 100 s
const HEARTBEAT_MS = 20_000;
const SLICE_DEADLINE_MS = 270_000;
const MAX_HOPS = 5;
export const MAX_STAGE_FAILURES = 4;
const MAX_DELAY_SECONDS = 20;
/** A stage whose lease lapsed and that has not moved for this long is restarted when looked at. */
export const STAGE_STALL_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function tokenSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

export function signSourceStageToken(briefId: string): string {
  return crypto.createHmac("sha256", tokenSecret()).update(`source-stage:${briefId}`).digest("hex");
}

export function verifySourceStageToken(briefId: string, token: string | null): boolean {
  if (!token) return false;
  const expected = Buffer.from(signSourceStageToken(briefId));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Asks for a slice in a fresh invocation; returns once it is accepted, not once it is done. */
export async function scheduleSourceStage(briefId: string, delaySeconds = 0, hop = 2): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "x-source-stage-token": signSourceStageToken(briefId) };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const res = await fetch(`${selfBaseUrl()}/api/internal/source-stage/step`, {
    method: "POST",
    headers,
    body: JSON.stringify({ briefId, delaySeconds, hop }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 120);
    throw new Error(`HTTP ${res.status}${detail ? ` ${detail}` : ""}`);
  }
}

async function chain(briefId: string, delaySeconds: number, hop: number): Promise<void> {
  for (const wait of [0, 2000, 5000]) {
    if (wait) await sleep(wait);
    try {
      await scheduleSourceStage(briefId, delaySeconds, hop);
      return;
    } catch (error) {
      if (wait === 5000) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error("[source stage runner] could not schedule the next slice", briefId, reason);
        await db.projectBrief
          .updateMany({ where: { id: briefId }, data: { lastError: `The background run was interrupted (${reason}). It restarts when the Report tab is next opened.` } })
          .catch(() => {});
      }
    }
  }
}

class Lease {
  private queue: Promise<unknown> = Promise.resolve();
  lost = false;

  private constructor(
    private readonly id: string,
    private until: Date,
  ) {}

  static async take(id: string): Promise<Lease | null> {
    const until = new Date(Date.now() + LEASE_MS);
    const taken = await db.projectBrief.updateMany({
      where: {
        id,
        status: { in: ACTIVE_STAGE_STATUSES },
        failedSteps: { lt: MAX_STAGE_FAILURES },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
      },
      data: { lockedUntil: until },
    });
    return taken.count === 1 ? new Lease(id, until) : null;
  }

  renew(): Promise<unknown> {
    this.queue = this.queue
      .then(async () => {
        if (this.lost) return;
        const next = new Date(Date.now() + LEASE_MS);
        const res = await db.projectBrief.updateMany({
          where: { id: this.id, lockedUntil: this.until, status: { in: ACTIVE_STAGE_STATUSES } },
          data: { lockedUntil: next },
        });
        if (res.count === 1) this.until = next;
        else this.lost = true;
      })
      .catch(() => {});
    return this.queue;
  }

  release(): Promise<unknown> {
    this.queue = this.queue
      .then(async () => {
        if (this.lost) return;
        await db.projectBrief.updateMany({ where: { id: this.id, lockedUntil: this.until }, data: { lockedUntil: null } });
        this.lost = true;
      })
      .catch(() => {});
    return this.queue;
  }
}

export async function runSourceStageSlice(briefId: string, delaySeconds = 0, hop = 2, invokedAt = Date.now()): Promise<void> {
  if (delaySeconds > 0) await sleep(Math.min(delaySeconds, MAX_DELAY_SECONDS) * 1000);
  const deadline = invokedAt + SLICE_DEADLINE_MS;
  const lease = await Lease.take(briefId);
  if (!lease) return; // another slice has it, it is settled, or it stopped after repeated failures
  const heartbeat = setInterval(() => void lease.renew(), HEARTBEAT_MS);

  let next: { delaySeconds: number } | null = null;
  try {
    for (;;) {
      await lease.renew();
      if (lease.lost) return;
      let retryInSliceMs: number | null = null;
      try {
        const { done } = await advanceSourceStage(briefId, { deadline });
        if (done) return;
        await db.projectBrief.updateMany({ where: { id: briefId }, data: { failedSteps: 0, lastError: null } });
        continue;
      } catch (error) {
        if (error instanceof YieldToNextSlice) {
          next = { delaySeconds: 0 };
          return;
        }
        const failure = await handleStepFailure(briefId, error);
        if (failure === "stop") return;
        retryInSliceMs = failure.delaySeconds * 1000;
        next = { delaySeconds: failure.delaySeconds };
      }
      if (retryInSliceMs !== null && Date.now() + retryInSliceMs + 110_000 < deadline) {
        next = null;
        await sleep(retryInSliceMs);
        continue;
      }
      return;
    }
  } finally {
    clearInterval(heartbeat);
    await lease.release();
    if (next && hop < MAX_HOPS) await chain(briefId, next.delaySeconds, hop + 1);
  }
}

function isFatal(error: unknown): boolean {
  if (error instanceof SourceStageError) return error.fatal;
  // A 400 from the API means the request itself is wrong; sending it again will not help.
  if (error instanceof AnthropicError && /invalid_request|not supported|400\b/i.test(error.message)) return true;
  return false;
}

async function handleStepFailure(briefId: string, error: unknown): Promise<{ delaySeconds: number } | "stop"> {
  const row = await db.projectBrief.findUnique({
    where: { id: briefId },
    select: { status: true, failedSteps: true, project: { select: { projectId: true } } },
  });
  if (!row || !ACTIVE_STAGE_STATUSES.includes(row.status)) return "stop";
  const message = error instanceof Error ? error.message : String(error);
  const failedSteps = row.failedSteps + 1;
  console.error(`[source stage runner] step failed (${failedSteps}/${MAX_STAGE_FAILURES})`, briefId, error);

  if (isFatal(error)) {
    await failSourceStage(briefId, message);
    await notifyStopped(row.project.projectId, message);
    return "stop";
  }
  await db.projectBrief.updateMany({ where: { id: briefId }, data: { failedSteps, lastError: message } });
  if (failedSteps >= MAX_STAGE_FAILURES || error instanceof ObjectivesDraftError) {
    if (error instanceof ObjectivesDraftError) await db.projectBrief.updateMany({ where: { id: briefId }, data: { failedSteps: MAX_STAGE_FAILURES } });
    await notifyStopped(row.project.projectId, message);
    return "stop";
  }
  return { delaySeconds: Math.min(MAX_DELAY_SECONDS, 5 * failedSteps) };
}

async function notifyStopped(projectCode: string, message: string): Promise<void> {
  await notifyOperations({
    title: "Objectives and sources stopped",
    message: `${projectCode}: ${message} Open the Report tab and press Carry on.`,
    type: "warning",
    link: `/admin/projects/${projectCode}?tab=report`,
  }).catch(() => {});
}
