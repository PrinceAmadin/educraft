import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, serverError } from "@/lib/api";
import { getExpectedHours, saveExpectedHours } from "@/lib/services/operations/pipeline";
import { DEFAULT_EXPECTED_HOURS } from "@/lib/operations/pipeline-stages";
import { expectedHoursBodySchema } from "@/lib/validations/operations";
import { parseBody } from "@/lib/services/operations/route-helpers";

export const dynamic = "force-dynamic";

/** GET — the expected hours per status (defaults with the founder's overrides). */
export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ hours: await getExpectedHours(), defaults: DEFAULT_EXPECTED_HOURS });
  } catch (error) {
    return serverError("GET /api/admin/settings/operations", error);
  }
}

/** PATCH { hours: { STATUS: number | null } } — null puts a status back on its default. */
export async function PATCH(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, expectedHoursBodySchema);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json({ hours: await saveExpectedHours(body.data.hours) });
  } catch (error) {
    return serverError("PATCH /api/admin/settings/operations", error);
  }
}
