import { NextResponse } from "next/server";
import { requireSuperAdmin, serverError } from "@/lib/api";
import { NO_STORE_HEADERS } from "@/lib/services/command-center/cache";
import { getToday } from "@/lib/services/command-center/today";

export const dynamic = "force-dynamic";

/**
 * The Today tab: alerts, the day's feed and today's numbers. Never cached —
 * this is the founder's live view. The edge already limits
 * /api/admin/command-center/* to SUPER_ADMIN (fail-closed API_PERMISSIONS);
 * the handler checks again.
 */
export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(await getToday(), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return serverError("GET /api/admin/command-center/today", error);
  }
}
