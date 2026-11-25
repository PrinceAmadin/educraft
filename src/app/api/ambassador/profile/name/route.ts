import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAmbassador, serverError } from "@/lib/api";
import { rateLimited } from "@/lib/rate-limit";
import { NameChangeError, changeOwnName } from "@/lib/services/ambassador-name";
import { ambassadorNameSchema } from "@/lib/validations/ambassador";

/**
 * PATCH /api/ambassador/profile/name  { "fullName": "Chidi Nwosu" }
 *
 * The signed-in ambassador corrects their own name. The ambassador comes from
 * the session, so it can only ever be their own record.
 *
 * The real throttle is the 30-day window inside `changeOwnName`, judged from the
 * stored history; the rate limit here is only there to stop someone hammering
 * the endpoint to probe which names exist at their school.
 */
export async function PATCH(req: NextRequest) {
  const guard = await requireAmbassador();
  if (!guard.ok) return guard.response;

  const limited = await rateLimited(guard.userId, "ambassador-name", 10, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = ambassadorNameSchema.safeParse(body);
  if (!parsed.success) return badRequest("Type your name.");

  try {
    const result = await changeOwnName(guard.ambassadorId, parsed.data.fullName, guard.userId);
    return NextResponse.json(result);
  } catch (error) {
    // Every refusal carries the sentence the ambassador should read.
    if (error instanceof NameChangeError) {
      return NextResponse.json({ error: error.message, reason: error.reason }, { status: 400 });
    }
    return serverError("PATCH /api/ambassador/profile/name", error);
  }
}
