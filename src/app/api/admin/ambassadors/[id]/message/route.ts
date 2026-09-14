import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { MessagingError, messageAmbassador } from "@/lib/services/ambassador-messaging";
import { messageAmbassadorSchema } from "@/lib/validations/commission";

/** Email one ambassador directly — the old panel's Tracking "Message". */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = messageAmbassadorSchema.safeParse(body);
  if (!parsed.success) return badRequest("Enter a subject and a message", parsed.error.flatten());

  try {
    const result = await messageAmbassador(params.id, parsed.data.title, parsed.data.message);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MessagingError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverError("POST /api/admin/ambassadors/[id]/message", error);
  }
}
