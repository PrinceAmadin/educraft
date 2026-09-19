import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, requireAmbassador, serverError } from "@/lib/api";
import { db } from "@/lib/db";

const schema = z.object({ weeklyEmail: z.boolean() });

/**
 * PATCH /api/ambassador/profile/email-prefs  { "weeklyEmail": true | false }
 *
 * Turns the Monday summary email on or off for the signed-in ambassador. The
 * ambassador comes from the session, so it can only ever change their own
 * setting. (The unsubscribe link in the email itself uses /api/unsubscribe/weekly.)
 */
export async function PATCH(req: NextRequest) {
  const guard = await requireAmbassador();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Expected { weeklyEmail: boolean }");

  try {
    await db.ambassador.update({
      where: { id: guard.ambassadorId },
      data: { weeklyEmailOptOut: !parsed.data.weeklyEmail },
    });
    return NextResponse.json({ weeklyEmail: parsed.data.weeklyEmail });
  } catch (error) {
    return serverError("PATCH /api/ambassador/profile/email-prefs", error);
  }
}
