import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { TransitionError, createProjectManual } from "@/lib/services/projects";
import { createProjectSchema } from "@/lib/validations/projects";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const result = await createProjectManual(parsed.data, guard.session.userId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/admin/projects", error);
  }
}
