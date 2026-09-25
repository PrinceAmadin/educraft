import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { setLaunchNotice, wantsLaunchNotice } from "@/lib/services/ambassador-platform/growth-associates";

const bodySchema = z.object({ subscribe: z.boolean() });

/** Whether the signed-in person asked to be told when Growth Associates launch. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ subscribed: await wantsLaunchNotice(guard.session.userId) });
  } catch (error) {
    return serverError("GET /api/admin/ambassadors/growth-associates/notify", error);
  }
}

/** "Notify me when this launches" (or undo). */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());
  try {
    return NextResponse.json({ subscribed: await setLaunchNotice(guard.session.userId, parsed.data.subscribe) });
  } catch (error) {
    return serverError("POST /api/admin/ambassadors/growth-associates/notify", error);
  }
}
