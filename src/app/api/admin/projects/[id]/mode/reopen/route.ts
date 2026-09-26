import { NextRequest, NextResponse } from "next/server";
import { opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import { reopenMode } from "@/lib/services/research-mode";
import { modeErrorResponse } from "@/lib/services/research-mode-errors";
import { reopenModeSchema } from "@/lib/validations/research-mode";

export const dynamic = "force-dynamic";

/**
 * POST { reason }: unlocks an approved mode so it can be changed, logged on the
 * project's timeline. Only while no chapter has been generated: after that it is
 * 403 MODE_LOCKED for good. Founder and COO only.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, reopenModeSchema);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json(await reopenMode(params.id, body.data.reason, guard.actor));
  } catch (error) {
    return modeErrorResponse("POST /api/admin/projects/[id]/mode/reopen", error);
  }
}
