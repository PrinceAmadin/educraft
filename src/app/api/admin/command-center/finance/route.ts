import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, serverError } from "@/lib/api";
import { wantsFresh } from "@/lib/validations/command-center";
import { CACHE, NO_STORE_HEADERS, cachedPayload, freshPayload } from "@/lib/services/command-center/cache";
import { getFinance } from "@/lib/services/command-center/finance";

export const dynamic = "force-dynamic";

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
