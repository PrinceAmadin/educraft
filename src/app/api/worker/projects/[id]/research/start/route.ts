import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireWorker, serverError } from "@/lib/api";
import { ResearchError, startResearchJob } from "@/lib/services/research";
import { startResearchBodySchema } from "@/lib/validations/research";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  let body: unknown = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = startResearchBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const job = await startResearchJob(
      guard.workerId,
      params.id,
      guard.userId,
      parsed.data.targetCount
    );
    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof ResearchError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/worker/projects/[id]/research/start", error);
  }
}
