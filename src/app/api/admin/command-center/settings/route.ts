import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { thresholdPatchSchema, wantsFresh } from "@/lib/validations/command-center";
import { CACHE, NO_STORE_HEADERS, cached, freshPayload, revalidateCommandCenter } from "@/lib/services/command-center/cache";
import { getSettingsPayload, getThresholds, updateThreshold } from "@/lib/services/command-center/settings";
import { thresholdConflict } from "@/lib/command-center/rag";

export const dynamic = "force-dynamic";

/** The RAG thresholds (effective values, defaults, overrides), cached an hour; `?fresh=1` re-reads. */
export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  try {
    const data = wantsFresh(req.nextUrl.searchParams)
      ? await freshPayload(CACHE.settings, getSettingsPayload)
      : await cached(CACHE.settings, [], getSettingsPayload);
    return NextResponse.json(data, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return serverError("GET /api/admin/command-center/settings", error);
  }
}

/**
 * Change one threshold: `{ key, value }`. The only write the Command Center
 * makes. A value that would contradict its sibling (a watch level above its
 * target, a critical reserve above the minimum) is refused. Then every tab's
 * cache is flushed — Health and Growth judge against thresholds — and the
 * fresh settings are returned.
 */
export async function PATCH(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = thresholdPatchSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the value", parsed.error.flatten());
  try {
    const conflict = thresholdConflict(parsed.data.key, Number(parsed.data.value), await getThresholds());
    if (conflict) return badRequest(conflict);
    await updateThreshold(parsed.data.key, parsed.data.value);
    revalidateCommandCenter();
    return NextResponse.json(await getSettingsPayload(), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return serverError("PATCH /api/admin/command-center/settings", error);
  }
}
