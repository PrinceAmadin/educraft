import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { TransitionError, holdProject, resumeFromHold } from "@/lib/services/projects";
import { holdBodySchema } from "@/lib/validations/projects";

/** POST with a `to` hold to apply one; POST with `{ resume: true }` to lift it. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  if (body && typeof body === "object" && (body as { resume?: unknown }).resume === true) {
    try {
      const project = await resumeFromHold(params.id, guard.session.userId);
      return NextResponse.json({ status: project.status });
    } catch (error) {
      if (error instanceof TransitionError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      return serverError("POST /api/admin/projects/[id]/hold (resume)", error);
    }
  }

  const parsed = holdBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("A reason is required", parsed.error.flatten());

  try {
    const project = await holdProject(params.id, parsed.data.to, parsed.data.note, guard.session.userId, {
      refundAmount: parsed.data.refundAmount,
    });
    return NextResponse.json({ status: project.status });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/admin/projects/[id]/hold", error);
  }
}
