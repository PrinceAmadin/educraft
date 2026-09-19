import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireWorker, serverError } from "@/lib/api";
import { ResearchError, startResearchJob } from "@/lib/services/research";
import { scheduleResearchStep } from "@/lib/services/research-runner";
import { ResearchApprovalRequiredError } from "@/lib/services/research-runs";
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
    // Hand the job to the server to run on its own — the browser can close.
    await scheduleResearchStep(job.id);
    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof ResearchApprovalRequiredError) {
      return NextResponse.json({ error: error.message, code: "APPROVAL_REQUIRED" }, { status: 403 });
    }
    if (error instanceof ResearchError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/worker/projects/[id]/research/start", error);
  }
}
