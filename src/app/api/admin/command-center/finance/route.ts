import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, serverError } from "@/lib/api";
import { wantsFresh } from "@/lib/validations/command-center";
import { CACHE, NO_STORE_HEADERS, cachedPayload, freshPayload } from "@/lib/services/command-center/cache";
import { getFinance } from "@/lib/services/command-center/finance";

export const dynamic = "force-dynamic";

/**
 * Run next to the database. The Supabase pooler is in eu-west-1 (Dublin);
 * Vercel's default function region for this project is iad1 (Washington).
 * Through pgbouncer every Prisma call costs four round trips, so the ~30
 * calls behind a tab would spend seconds crossing the Atlantic (measured on
 * production: ~50 calls took 9 s from iad1). See CLAUDE.md, Phase 5.
 */
export const preferredRegion = ["dub1"];

/** The Financial pulse tab, cached 5 minutes server-side; `?fresh=1` recomputes. */
export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  try {
    const data = wantsFresh(req.nextUrl.searchParams)
      ? await freshPayload(CACHE.finance, () => getFinance())
      : await cachedPayload(CACHE.finance, () => getFinance());
    return NextResponse.json(data, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return serverError("GET /api/admin/command-center/finance", error);
  }
}
