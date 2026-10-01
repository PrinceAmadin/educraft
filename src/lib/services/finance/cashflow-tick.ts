import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { currentRunner } from "@/lib/generation/orchestrator-view";
import { dueBatches } from "@/lib/finance/payout-schedule";
import { buildDueBatches, finalizeDueBatches, sendBankReminders } from "@/lib/services/finance/payout-batches";

/**
 * The cashflow tick (Phase 5): the heartbeat that builds the batches due today,
 * finalises the ones whose ten-minute undo window has closed (sending the
 * delayed confirmation emails), and reminds anyone owed money who has no bank
 * details. Called every minute by a Supabase pg_cron job — never from a page or
 * a request path — so the delayed emails depend only on this one scheduler.
 */

const SEEN_PREFIX = "cashflow_scheduler_seen:";
const QUIET_MS = 5 * 60 * 1000;
const NOTE_MIN_MS = 60 * 1000;

function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}
function routeToken(): string {
  return createHmac("sha256", authSecret()).update("cashflow-tick").digest("base64url");
}
function sameToken(expected: string, got: string | null): boolean {
  if (!got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Who is calling the tick: the Supabase scheduler (Bearer secret) or one of HQ's own routes (HMAC). */
export function cashflowTickCaller(headers: Headers): "route" | "scheduler" | null {
  if (sameToken(routeToken(), headers.get("x-cashflow-token"))) return "route";
  const secret = process.env.CASHFLOW_TICK_SECRET;
  if (!secret) return null;
  return sameToken(`Bearer ${secret}`, headers.get("authorization")) ? "scheduler" : null;
}

/** Writes down that the scheduler called, at most once a minute (so the queue can show "scheduler quiet"). */
export async function noteCashflowSchedulerTick(now: Date = new Date()): Promise<void> {
  try {
    const key = SEEN_PREFIX + currentRunner();
    const row = await db.setting.findUnique({ where: { key }, select: { value: true } });
    const last = row?.value ? new Date(row.value) : null;
    if (last && now.getTime() - last.getTime() < NOTE_MIN_MS) return;
    await db.setting.upsert({ where: { key }, update: { value: now.toISOString() }, create: { key, value: now.toISOString() } });
  } catch (error) {
    console.warn("[cashflow] the scheduler's call could not be written down", error instanceof Error ? error.message : error);
  }
}

/** True when the scheduler has not called for over five minutes — the one failure the tick cannot notice itself. */
export async function cashflowSchedulerQuiet(now: Date = new Date()): Promise<boolean> {
  const key = SEEN_PREFIX + currentRunner();
  const row = await db.setting.findUnique({ where: { key }, select: { value: true } });
  if (!row?.value) return true;
  return now.getTime() - new Date(row.value).getTime() > QUIET_MS;
}

export interface CashflowTickReport {
  built: number;
  finalised: number;
  remindersSent: number;
}

/** One tick: build due batches, finalise any whose window has closed, remind missing-bank recipients on build days. */
export async function runCashflowTick(now: Date = new Date()): Promise<CashflowTickReport> {
  const due = dueBatches(now);
  const built = (await buildDueBatches(now)).built;
  // Always, every minute: a batch cleared ten minutes ago now has its emails sent.
  const finalised = (await finalizeDueBatches(now)).finalised;
  // Only on build days (the EmailLog guard keeps it to once per period even then).
  const remindersSent = due.length ? (await sendBankReminders(now)).sent : 0;
  return { built, finalised, remindersSent };
}
