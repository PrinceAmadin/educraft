import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { WorkerApplicationError, rejectWorkerApplication } from "@/lib/services/worker-applications";
import { rejectWorkerApplicationSchema } from "@/lib/validations/worker-application";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }

  const parsed = rejectWorkerApplicationSchema.safeParse(body ?? {});
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    await rejectWorkerApplication(params.id, guard.session.userId, parsed.data.note);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof WorkerApplicationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/admin/workers/applications/[id]/reject", error);
  }
}
