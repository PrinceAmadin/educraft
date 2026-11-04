import { NextRequest, NextResponse } from "next/server";
import { serverError } from "@/lib/api";
import { ScreeningError, startScreening } from "@/lib/services/screening";

/**
 * Starts a candidate's screening clock. No login: the unguessable token in the
 * URL is the only credential, and there is nothing in the body to tamper with.
 * Idempotent — re-starting keeps the first deadline.
 */
export async function POST(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const result = await startScreening(params.token);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ScreeningError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("screening-start", error);
  }
}
