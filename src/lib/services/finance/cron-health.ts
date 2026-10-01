import { db } from "@/lib/db";
import { schedulerSeenAt } from "@/lib/generation/orchestrator-view";

/**
 * Cron health (pre-launch hardening, Item 3). The cashflow tick records its last
 * run + outcome in `CronHealthLog`; the Command Center reads it (and the
 * orchestrator's heartbeat Setting) to warn the founder when a scheduled job has
 * gone quiet (>25h) or failed. The writer never throws — monitoring must not
 * take down the job it monitors.
 */

const STALE_MS = 25 * 60 * 60 * 1000;

/** Upsert the one row for a job after each run. Swallows its own errors. */
export async function recordCronRun(job: string, now: Date, status: "ok" | "error", error: string | null): Promise<void> {
  try {
    await db.cronHealthLog.upsert({
      where: { job },
      create: { job, lastRunAt: now, lastStatus: status, lastError: error },
      update: { lastRunAt: now, lastStatus: status, lastError: error },
    });
  } catch (e) {
    console.warn("[cron-health] could not record", job, e instanceof Error ? e.message : e);
  }
}

export interface CronHealthLine {
  job: string;
  label: string;
  lastRunAt: string | null;
  lastStatus: "ok" | "error" | "unknown";
  lastError: string | null;
  stale: boolean; // never run, or older than 25h
  warn: boolean; // stale or failed — the founder should look
}

/** The cashflow tick (from CronHealthLog) and the report orchestrator (from its heartbeat Setting). */
export async function cronHealth(now: Date = new Date()): Promise<CronHealthLine[]> {
  const lines: CronHealthLine[] = [];

  try {
    const row = await db.cronHealthLog.findUnique({ where: { job: "cashflow-tick" } });
    const stale = !row || now.getTime() - row.lastRunAt.getTime() > STALE_MS;
    const status = (row?.lastStatus as "ok" | "error" | undefined) ?? "unknown";
    lines.push({
      job: "cashflow-tick",
      label: "Payout scheduler",
      lastRunAt: row?.lastRunAt.toISOString() ?? null,
      lastStatus: status,
      lastError: row?.lastError ?? null,
      stale,
      warn: stale || status === "error",
    });
  } catch {
    lines.push({ job: "cashflow-tick", label: "Payout scheduler", lastRunAt: null, lastStatus: "unknown", lastError: null, stale: true, warn: true });
  }

  try {
    const seen = await schedulerSeenAt();
    const stale = !seen || now.getTime() - seen.getTime() > STALE_MS;
    lines.push({
      job: "orchestrator-tick",
      label: "Report orchestrator",
      lastRunAt: seen?.toISOString() ?? null,
      lastStatus: seen ? "ok" : "unknown",
      lastError: null,
      stale,
      warn: stale,
    });
  } catch {
    lines.push({ job: "orchestrator-tick", label: "Report orchestrator", lastRunAt: null, lastStatus: "unknown", lastError: null, stale: true, warn: true });
  }

  return lines;
}
