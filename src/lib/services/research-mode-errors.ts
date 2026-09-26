import { NextResponse } from "next/server";
import { serverError } from "@/lib/api";
import { ModeDecisionError, ModeLockedError, ModeStateError } from "@/lib/services/research-mode";

/**
 * The mode routes' error answers: a locked mode is 403 { error: "MODE_LOCKED" }, a
 * decision that breaks a rule is 400 with every problem, a state the project is not in
 * is 404/409, anything else 500.
 */
export function modeErrorResponse(tag: string, error: unknown): NextResponse {
  if (error instanceof ModeLockedError) {
    return NextResponse.json({ error: "MODE_LOCKED", reason: error.reason, message: error.message }, { status: 403 });
  }
  if (error instanceof ModeDecisionError) {
    return NextResponse.json({ error: error.message, problems: error.problems }, { status: 400 });
  }
  if (error instanceof ModeStateError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return serverError(tag, error);
}
