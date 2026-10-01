import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * A per-user, per-action rolling-window rate limiter for finance mutations
 * (pre-launch hardening, Item 7). One `RateLimit` row per `<userId>:<action>`;
 * the window resets once it expires. Postgres-backed so it holds across
 * serverless instances (Fluid Compute reuses instances but not reliably, so an
 * in-memory Map would leak). It is a SECONDARY control — the auth guard is the
 * real gate — so it FAILS OPEN: a limiter DB hiccup never blocks finance work.
 */

const DEFAULT_WINDOW_MS = 60_000;

/** True = allowed, false = over the limit. Never throws. */
export async function checkRateLimit(userId: string, action: string, max: number, windowMs: number = DEFAULT_WINDOW_MS): Promise<boolean> {
  const key = `${userId}:${action}`;
  const now = new Date();
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.rateLimit.findUnique({ where: { key }, select: { windowStart: true, count: true } });
      if (!row || now.getTime() - row.windowStart.getTime() >= windowMs) {
        await tx.rateLimit.upsert({ where: { key }, create: { key, windowStart: now, count: 1 }, update: { windowStart: now, count: 1 } });
        return true;
      }
      if (row.count >= max) return false;
      await tx.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
      return true;
    });
  } catch {
    return true; // fail open — a secondary control must not take down finance
  }
}

/** 429 response the handlers return verbatim on a breach. */
export function tooManyRequests(): NextResponse {
  return NextResponse.json({ error: "Too many requests" }, { status: 429 });
}

/**
 * One-liner for a handler: returns a 429 NextResponse to return, or null to
 * carry on. Call after the auth guard, keyed by the session user id.
 */
export async function rateLimited(userId: string, action: string, max: number, windowMs: number = DEFAULT_WINDOW_MS): Promise<NextResponse | null> {
  const ok = await checkRateLimit(userId, action, max, windowMs);
  if (ok) {
    // Opportunistically prune stale rows so the table never grows unbounded.
    if (Math.random() < 0.02) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await db.rateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } }).catch(() => undefined);
    }
    return null;
  }
  return tooManyRequests();
}
