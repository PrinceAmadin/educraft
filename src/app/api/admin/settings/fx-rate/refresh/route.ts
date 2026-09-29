import { NextResponse } from "next/server";
import { requireSuperAdmin, serverError } from "@/lib/api";
import { refreshFxRate } from "@/lib/fx-fetch";
import { resolveFxRate } from "@/lib/fx-rate";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST /api/admin/settings/fx-rate/refresh — super admin. Fetches the current mid-market rate and returns the resolved snapshot. */
export async function POST() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  try {
    const fetched = await refreshFxRate();
    const snapshot = await resolveFxRate();
    if (!fetched.ok) {
      return NextResponse.json({ ok: false, reason: fetched.reason, snapshot }, { status: 200 });
    }
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return serverError("POST /api/admin/settings/fx-rate/refresh", error);
  }
}
