import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireWorker, serverError } from "@/lib/api";
import { updateWorkerBank } from "@/lib/services/worker-portal";
import { workerBankSchema } from "@/lib/validations/worker";

export async function PATCH(req: NextRequest) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = workerBankSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const result = await updateWorkerBank(guard.workerId, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return serverError("PATCH /api/worker/profile", error);
  }
}
