import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { createWorker } from "@/lib/services/workers";
import { createWorkerSchema } from "@/lib/validations/workers";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = createWorkerSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const worker = await createWorker(parsed.data);
    return NextResponse.json(worker, { status: 201 });
  } catch (error) {
    return serverError("POST /api/admin/workers", error);
  }
}
