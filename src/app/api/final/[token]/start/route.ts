import { NextRequest, NextResponse } from "next/server";
import { serverError } from "@/lib/api";
import { ScreeningError } from "@/lib/services/screening";
import { startFinalAssessment } from "@/lib/services/final-practical";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const result = await startFinalAssessment(params.token);
    return NextResponse.json({ deadlineAt: result.deadlineAt });
  } catch (error) {
    if (error instanceof ScreeningError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("final-start", error);
  }
}
