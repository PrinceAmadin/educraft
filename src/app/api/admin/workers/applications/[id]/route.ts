import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { WorkerApplicationError, editWorkerApplication, getWorkerApplication } from "@/lib/services/worker-applications";
import { editWorkerApplicationSchema } from "@/lib/validations/worker-application";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const row = await getWorkerApplication(params.id);
  if (!row) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  return NextResponse.json({ row });
}

/** Admin correcting an applicant's details before approving/rejecting. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = editWorkerApplicationSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const row = await editWorkerApplication(params.id, parsed.data);
    return NextResponse.json({ row });
  } catch (error) {
    if (error instanceof WorkerApplicationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("PATCH /api/admin/workers/applications/[id]", error);
  }
}
