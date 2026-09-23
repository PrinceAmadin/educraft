import { NextResponse } from "next/server";
import { storageHealth } from "@/lib/files/storage";

export const dynamic = "force-dynamic";

let cached: { at: number; body: Awaited<ReturnType<typeof storageHealth>> } | null = null;

/**
 * GET: can this deployment reach the private file store? A read-only check
 * (a lookup of a file that doesn't exist), cached for five minutes per
 * instance. Says nothing about any file or credential.
 */
export async function GET() {
  if (!cached || Date.now() - cached.at > 5 * 60_000) {
    cached = { at: Date.now(), body: await storageHealth() };
  }
  return NextResponse.json(cached.body, {
    status: cached.body.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
