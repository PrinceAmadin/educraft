import { NextRequest, NextResponse } from "next/server";
import { WorkerApplicationError, submitWorkerApplication } from "@/lib/services/worker-applications";
import { workerRegistrationSchema } from "@/lib/validations/worker-application";

/** Public — no auth. Anyone can apply to become a worker. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const parsed = workerRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the form", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await submitWorkerApplication(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof WorkerApplicationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[POST /api/worker-applications]", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
