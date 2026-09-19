import crypto from "crypto";
import { db } from "@/lib/db";
import { advanceResearchJob, ResearchError } from "@/lib/services/research";
import { notifyUsers } from "@/lib/services/notifications";

/*
 * Runs a research job on the server, with every browser closed.
 *
 * A job is a series of short steps (see advanceResearchJob). One invocation
 * ("slice") works through as many steps as fit in about 3.5 minutes, then asks
 * for the next slice by calling /api/internal/research/step.
 *
 * Why slices rather than one step per invocation: Vercel refuses a request
 * chain where functions call each other more than 5 deep (HTTP 508,
 * INFINITE_LOOP_DETECTED — verified: it trips on the 5th hop however the call
 * is made). A ~10 minute job is dozens of steps, so it has to be done in a few
 * long hops, not many short ones. A job that outruns MAX_HOPS slices simply
 * pauses until something resumes it (the panel does, when open).
 *
 * Safety:
 *  - A lease (lockedUntil) is held while a slice runs and renewed every step,
 *    so a chain and a Resume click can never work the same job at once, and a
 *    slice that dies stops holding the job within LEASE_MS.
 *  - A failing step is retried a few times with a growing delay; after that
 *    the chain stops, records why, and tells the worker.
 *  - If a link is ever lost, the job just stops advancing. lastStepAt going
 *    stale is how that's noticed, and any Resume restarts it.
 */

const LEASE_MS = 90_000; // renewed after every step; longer than the slowest single step
/** Don't start another step after this long into a slice — the function limit is 300s and one step can take ~40s. */
const SLICE_BUDGET_MS = 220_000;
/** Vercel allows 5 functions deep in one request chain; the request that started the job is #1. */
const MAX_HOPS = 5;
const MAX_CONSECUTIVE_FAILURES = 4;
const MAX_DELAY_SECONDS = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function tokenSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

/**
 * Where this deployment can reach itself. Deliberately not the Paystack
 * callback URL: that one may be an override for a custom domain, whereas this
 * must be an address that serves this very deployment.
 */
function selfBaseUrl(): string {
  if (process.env.RESEARCH_BASE_URL) return process.env.RESEARCH_BASE_URL;
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Proves a request to the internal step endpoint came from us — the endpoint has no session. */
export function signJobToken(jobId: string): string {
  return crypto.createHmac("sha256", tokenSecret()).update(`research-step:${jobId}`).digest("hex");
}

export function verifyJobToken(jobId: string, token: string | null): boolean {
  if (!token) return false;
  const expected = Buffer.from(signJobToken(jobId));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Asks for the next slice of a job to run, in a fresh function invocation. `hop` is that slice's depth in the request chain (a slice started from a route handler is hop 2).
 * Returns once it's accepted, not once it's done. */
export async function scheduleResearchStep(jobId: string, delaySeconds = 0, hop = 2): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-research-token": signJobToken(jobId),
  };
  // Only needed if Vercel Deployment Protection is switched on for this deployment.
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }

  const res = await fetch(`${selfBaseUrl()}/api/internal/research/step`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jobId, delaySeconds, hop }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 120);
    throw new Error(`HTTP ${res.status}${detail ? ` ${detail}` : ""}`);
  }
}

/** Schedules the next slice, retrying with backoff; if it still fails the chain is marked broken so a Resume can restart it. */
async function chain(jobId: string, delaySeconds: number, hop: number): Promise<void> {
  const backoffMs = [2000, 5000];
  let reason = "unknown";
  for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
    try {
      await scheduleResearchStep(jobId, delaySeconds, hop);
      return;
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
      if (attempt < backoffMs.length) await sleep(backoffMs[attempt]);
    }
  }
  console.error("[research runner] could not schedule the next slice", jobId, reason);
  await db.researchJob
    .updateMany({
      where: { id: jobId },
      data: { lockedUntil: null, lastError: `The background run was interrupted (${reason}). Press Resume to carry on.` },
    })
    .catch(() => {});
}

/**
 * Runs one slice: takes the lease, then advances the job step after step until
 * it finishes, runs out of slice time, or a step fails.
 */
export async function runResearchStep(jobId: string, delaySeconds = 0, hop = 2): Promise<void> {
  if (delaySeconds > 0) await sleep(Math.min(delaySeconds, MAX_DELAY_SECONDS) * 1000);

  const sliceStart = Date.now();
  const lease = () => new Date(Date.now() + LEASE_MS);

  const leased = await db.researchJob.updateMany({
    where: {
      id: jobId,
      status: { notIn: ["PASSED", "FAILED_NEEDS_REVIEW"] },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
    },
    data: { lockedUntil: lease(), lastError: null },
  });
  if (leased.count === 0) return; // another runner has it, it's finished, or it was deleted

  for (;;) {
    try {
      const result = await advanceResearchJob(jobId);

      if (result.done) {
        await db.researchJob.updateMany({ where: { id: jobId }, data: { lockedUntil: null, lastStepAt: new Date(), failedSteps: 0 } });
        return;
      }
      if (Date.now() - sliceStart < SLICE_BUDGET_MS) {
        // Keep the lease and carry on with the next step in this same invocation.
        await db.researchJob.updateMany({ where: { id: jobId }, data: { lockedUntil: lease(), lastStepAt: new Date(), failedSteps: 0 } });
        continue;
      }

      // Out of slice time: hand over to a fresh invocation.
      await db.researchJob.updateMany({ where: { id: jobId }, data: { lockedUntil: null, lastStepAt: new Date(), failedSteps: 0 } });
      if (hop < MAX_HOPS) await chain(jobId, 0, hop + 1);
      // else: at the request-chain limit. The job stays put until something resumes it.
      return;
    } catch (error) {
      await handleStepFailure(jobId, error, hop);
      return;
    }
  }
}

async function handleStepFailure(jobId: string, error: unknown, hop: number): Promise<void> {
  // The job was reset (deleted) while a step was in flight — nothing left to do.
  const job = await db.researchJob.findUnique({
    where: { id: jobId },
    select: { failedSteps: true, requestedById: true, project: { select: { projectId: true } } },
  });
  if (!job) return;

  const message = error instanceof Error ? error.message : String(error);
  const failedSteps = job.failedSteps + 1;
  console.error(`[research runner] step failed (${failedSteps}/${MAX_CONSECUTIVE_FAILURES})`, jobId, error);

  const fatal = error instanceof ResearchError && /needs a title|missing a title/.test(message);
  if (failedSteps >= MAX_CONSECUTIVE_FAILURES || fatal) {
    await db.researchJob.update({ where: { id: jobId }, data: { lockedUntil: null, failedSteps, lastError: message } });
    if (job.requestedById) {
      await notifyUsers([job.requestedById], {
        title: "Research paused",
        message: `${job.project.projectId}: ${message} Open the project and press Resume.`,
        type: "warning",
        link: `/worker/projects/${job.project.projectId}`,
      }).catch(() => {});
    }
    return;
  }

  await db.researchJob.update({ where: { id: jobId }, data: { lockedUntil: null, failedSteps, lastStepAt: new Date() } });
  if (hop < MAX_HOPS) await chain(jobId, 5 * failedSteps, hop + 1);
}
