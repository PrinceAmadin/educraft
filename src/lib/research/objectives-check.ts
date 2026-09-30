/**
 * Runs and stores the independent check of a brief's aim and objectives
 * (objectives-judge.ts: Claude Opus 5.5, blind to the drafter). Every check
 * starts from the founder's or the COO's click: a Draft (the draft's own save
 * takes the lease and hands the check to its own invocation), Draft the aim,
 * Save aim, or Check again. Nothing re-checks on its own.
 *
 * A lease (ProjectBrief.objectivesCheckLockedUntil, its exact value is the
 * token) keeps two checks from running at once; the result is stored only by
 * the holder of the lease, with the key of what was checked, so the card can
 * tell when the aim or objectives have changed since.
 */

import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getDegreeFromDepartment } from "@/lib/generation/department-map";
import { objectivesCheckKey, type ObjectivesCheckInput, type StoredObjectivesCheck } from "@/lib/generation/objectives-check-rules";
import { JUDGE_MODEL, JUDGE_STEP, judgeObjectives } from "@/lib/generation/objectives-judge";
import { isModeNumber } from "@/lib/mode-classifier";
import { selfBaseUrl } from "@/lib/self-base-url";

/** The source stage's AI usage subsystem (SOURCE_STAGE_SUBSYSTEM in source-stage.ts, not imported: that file imports this one), so the check counts in the card's cost. */
const SOURCE_STAGE_SUBSYSTEM = "source_stage";

/** Two judge attempts of at most 100 s each, plus the saves. */
export const CHECK_LEASE_MS = 240_000;

export class CheckRunningError extends Error {
  constructor() {
    super("A check of the aim and objectives is already running. Its result shows here in a minute.");
  }
}

/** A new lease value (the token), for an update that takes it together with other writes. */
export function newCheckLease(now = Date.now()): Date {
  return new Date(now + CHECK_LEASE_MS);
}

/** Takes the lease when it is free; the token, or null when a check is running. */
export async function takeCheckLease(briefId: string): Promise<Date | null> {
  const token = newCheckLease();
  const taken = await db.projectBrief.updateMany({
    where: { id: briefId, OR: [{ objectivesCheckLockedUntil: null }, { objectivesCheckLockedUntil: { lt: new Date() } }] },
    data: { objectivesCheckLockedUntil: token },
  });
  return taken.count === 1 ? token : null;
}

async function releaseLease(briefId: string, token: Date, data: Prisma.ProjectBriefUpdateManyMutationInput = {}): Promise<boolean> {
  const res = await db.projectBrief.updateMany({ where: { id: briefId, objectivesCheckLockedUntil: token }, data: { ...data, objectivesCheckLockedUntil: null } });
  return res.count === 1;
}

/** What the judge is given for this brief now, or null when there is nothing to check (no objectives, no saved mode). */
export async function checkInputFor(briefId: string): Promise<{ projectDbId: string; input: ObjectivesCheckInput } | null> {
  const b = await db.projectBrief.findUnique({
    where: { id: briefId },
    select: {
      projectId: true,
      aim: true,
      objectives: true,
      department: true,
      project: { select: { projectTitle: true, client: { select: { department: true } }, researchMode: { select: { department: true, modeNumber: true } } } },
    },
  });
  const mode = b?.project.researchMode?.modeNumber;
  if (!b || !b.objectives.length || !isModeNumber(mode)) return null;
  const department = b.project.researchMode?.department ?? b.department ?? b.project.client.department ?? "";
  return {
    projectDbId: b.projectId,
    input: { title: b.project.projectTitle ?? "", department, degree: getDegreeFromDepartment(department), modeNumber: mode, aim: b.aim, objectives: b.objectives },
  };
}

const asJson = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * Runs the check for the holder of `token` and stores its result (or the
 * failure), then releases the lease. Never throws: a failed check is stored
 * as failed, and the card offers Check again.
 */
export async function runObjectivesCheck(briefId: string, token: Date): Promise<StoredObjectivesCheck | null> {
  const startedAt = new Date();
  let found: Awaited<ReturnType<typeof checkInputFor>> = null;
  try {
    found = await checkInputFor(briefId);
    if (!found) {
      await releaseLease(briefId, token);
      return null;
    }
    const inputKey = objectivesCheckKey(found.input);
    const judged = await judgeObjectives(found.input, { projectId: found.projectDbId, subsystem: SOURCE_STAGE_SUBSYSTEM, step: JUDGE_STEP });
    const spend = await db.aiUsageLog.findMany({
      where: { projectId: found.projectDbId, subsystem: SOURCE_STAGE_SUBSYSTEM, step: { startsWith: JUDGE_STEP }, createdAt: { gte: startedAt } },
      select: { costNaira: true, model: true },
      orderBy: { createdAt: "desc" },
    });
    const check: StoredObjectivesCheck = {
      status: "done",
      model: spend[0]?.model ?? JUDGE_MODEL,
      checkedAt: new Date().toISOString(),
      inputKey,
      overall: judged.overall,
      rows: judged.rows,
      costNaira: Math.round(spend.reduce((a, l) => a + l.costNaira, 0) * 100) / 100,
      error: null,
    };
    if (!(await releaseLease(briefId, token, { objectivesCheck: asJson(check) }))) {
      console.warn("[objectives check] lease lost before the result was saved", briefId);
      return null;
    }
    return check;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[objectives check] failed", briefId, message);
    const failed: StoredObjectivesCheck = {
      status: "failed",
      model: JUDGE_MODEL,
      checkedAt: new Date().toISOString(),
      inputKey: found ? objectivesCheckKey(found.input) : "",
      overall: null,
      rows: [],
      costNaira: 0,
      error: message.slice(0, 300),
    };
    await releaseLease(briefId, token, { objectivesCheck: asJson(failed) }).catch(() => {});
    return failed;
  }
}

// ─── Its own invocation (a Draft's check runs apart from the drafting slice) ──

function tokenSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

export function signCheckRequest(briefId: string): string {
  return crypto.createHmac("sha256", tokenSecret()).update(`objectives-check:${briefId}`).digest("hex");
}

export function verifyCheckRequest(briefId: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signCheckRequest(briefId));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/**
 * Hands a check whose lease is already taken to /api/internal/objectives-check/run
 * (202 + waitUntil). If the hand-over fails, the lease is released so the card
 * offers Check again instead of spinning.
 */
export async function requestObjectivesCheck(briefId: string, token: Date): Promise<boolean> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json", "x-objectives-check-token": signCheckRequest(briefId) };
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    const res = await fetch(`${selfBaseUrl()}/api/internal/objectives-check/run`, {
      method: "POST",
      headers,
      body: JSON.stringify({ briefId, lease: token.toISOString() }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (error) {
    console.error("[objectives check] could not start the check", briefId, error instanceof Error ? error.message : error);
    await releaseLease(briefId, token).catch(() => {});
    return false;
  }
}
