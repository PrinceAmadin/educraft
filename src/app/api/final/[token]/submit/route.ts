import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, serverError } from "@/lib/api";
import { ScreeningError } from "@/lib/services/screening";
import { submitFinalAssessment } from "@/lib/services/final-practical";

export const runtime = "nodejs";

const schema = z.object({
  memoResponse: z.string().trim().max(10_000),
  promptResponse: z.string().trim().max(10_000),
});

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());
  try {
    const result = await submitFinalAssessment(params.token, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ScreeningError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("final-submit", error);
  }
}
