import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { ApplicationError, approveApplication } from "@/lib/services/applications";
import { approveApplicationSchema } from "@/lib/validations/application";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }

  const parsed = approveApplicationSchema.safeParse(body ?? {});
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const result = await approveApplication(params.id, guard.session.userId, parsed.data.universityId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ApplicationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/admin/ambassadors/applications/[id]/approve", error);
  }
}
