import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { broadcastToAmbassadors } from "@/lib/services/ambassador-messaging";
import { broadcastSchema } from "@/lib/validations/commission";

/** Email every active ambassador with an address on file — the old panel's Broadcast. */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = broadcastSchema.safeParse(body);
  if (!parsed.success) return badRequest("Enter a subject and a message", parsed.error.flatten());

  try {
    const result = await broadcastToAmbassadors(parsed.data.subject, parsed.data.message);
    return NextResponse.json(result);
  } catch (error) {
    return serverError("POST /api/admin/ambassadors/broadcast", error);
  }
}
