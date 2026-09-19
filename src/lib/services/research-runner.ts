import crypto from "crypto";
import { db } from "@/lib/db";
import { advanceResearchJob, ResearchError } from "@/lib/services/research";
import { notifyUsers } from "@/lib/services/notifications";

/*
 * Runs a research job on the server, with every browser closed.
 *
 * A job is a series of short steps (see advanceResearchJob). Each step runs in
 * its own function invocation and, when it finishes, asks for the next one by
 * calling /api/internal/research/step — so no single invocation ever has to
 * outlive Vercel's per-function time limit, however long the whole job takes.
 *
 * Safety:
 *  - A lease (lockedUntil) is taken before every step, so a chain and a
 *    Resume click can never work the same job at once.
 *  - A failing step is retried a few times with a growing delay; after that
 *    the chain stops, records why, and tells the worker.
 *  - If a chain link is ever lost (a function killed mid-step), the job just
 *    stops advancing. lastStepAt going stale is how that's noticed, and any
 *    Resume — including the panel's automatic one on page load — restarts it.
 */

const LEASE_MS = 80_000; // longer than the 60s function limit, so a dead step's lease still expires
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

/** Asks for the next step of a job to run, in a fresh function invocation. Returns once it's accepted, not once it's done. */
export async function scheduleResearchStep(jobId: string, delaySeconds = 0): Promise<void> {
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
    body: JSON.stringify({ jobId, delaySeconds }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Could not schedule the next research step (${res.status})`);
}

/** Schedules the next step, retrying once; if it still fails the chain is marked broken so a Resume can restart it. */
async function chain(jobId: string, delaySeconds = 0): Promise<void> {
  try {
    await scheduleResearchStep(jobId, delaySeconds);
  } catch {
    await sleep(2000);
    try {
      await scheduleResearchStep(jobId, delaySeconds);
    } catch (error) {
      console.error("[research runner] could not schedule the next step", jobId, error);
      await db.researchJob
        .updateMany({
          where: { id: jobId },
          data: { lastError: "The background run was interrupted. Press Resume to carry on." },
        })
        .catch(() => {});
    }
  }
}

/** Runs exactly one step under the lease, then schedules the next. */
export async function runResearchStep(jobId: string, delaySeconds = 0): Promise<void> {
  if (delaySeconds > 0) await sleep(Math.min(delaySeconds, MAX_DELAY_SECONDS) * 1000);

  const now = new Date();
  const leased = await db.researchJob.updateMany({
    where: {
      id: jobId,
      status: { notIn: ["PASSED", "FAILED_NEEDS_REVIEW"] },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    data: { lockedUntil: new Date(now.getTime() + LEASE_MS), lastError: null },
  });
  if (leased.count === 0) return; // another runner has it, it's finished, or it was deleted

  try {
    const result = await advanceResearchJob(jobId);
    await db.researchJob.updateMany({
      where: { id: jobId },
      data: { lockedUntil: null, lastStepAt: new Date(), failedSteps: 0 },
    });
    if (!result.done) await chain(jobId);
  } catch (error) {
    // The job was reset (deleted) while a step was in flight — nothing left to do.
    const job = await db.researchJob.findUnique({
      where: { id: jobId },
      select: { failedSteps: true, requestedById: true, projectId: true, project: { select: { projectId: true } } },
    });
    if (!job) return;

    const message = error instanceof Error ? error.message : String(error);
    const failedSteps = job.failedSteps + 1;
    console.error(`[research runner] step failed (${failedSteps}/${MAX_CONSECUTIVE_FAILURES})`, jobId, error);

    if (failedSteps >= MAX_CONSECUTIVE_FAILURES || (error instanceof ResearchError && /needs a title|missing a title/.test(message))) {
      await db.researchJob.update({
        where: { id: jobId },
        data: { lockedUntil: null, failedSteps, lastError: message },
      });
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

    await db.researchJob.update({
      where: { id: jobId },
      data: { lockedUntil: null, failedSteps, lastStepAt: new Date() },
    });
    await chain(jobId, 5 * failedSteps);
  }
}
