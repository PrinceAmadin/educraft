import { NextRequest, NextResponse } from "next/server";
import { badRequest, serverError } from "@/lib/api";
import { ScreeningError, submitScreening } from "@/lib/services/screening";
import { screeningSubmitSchema } from "@/lib/validations/screening";

/**
 * Scores and records a candidate's screening answers. The token is the
 * credential; scoring is server-side (no answer key ever reaches the browser),
 * and the submit is claimed atomically so a double click cannot re-score.
 */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = screeningSubmitSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const result = await submitScreening(params.token, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ScreeningError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("screening-submit", error);
  }
}
