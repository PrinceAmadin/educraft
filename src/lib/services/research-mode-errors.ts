import { NextResponse } from "next/server";
import { serverError } from "@/lib/api";
import { ModeDecisionError, ModeLockedError, ModeStateError } from "@/lib/services/research-mode";
import { AnthropicError } from "@/lib/anthropic";
import { ObjectivesDraftError } from "@/lib/generation/objectives-drafter";
import { CheckRunningError } from "@/lib/research/objectives-check";

/**
 * The mode routes' error answers: a locked mode is 403 { error: "MODE_LOCKED" }, a
 * decision that breaks a rule is 400 with every problem, a state the project is not in
 * is 404/409, a check already running 409 { error: "CHECK_RUNNING" }, a draft Claude
 * could not write 502, anything else 500.
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
  if (error instanceof CheckRunningError) {
    return NextResponse.json({ error: "CHECK_RUNNING", message: error.message }, { status: 409 });
  }
  if (error instanceof ObjectivesDraftError || error instanceof AnthropicError) {
    return NextResponse.json({ error: `Claude could not write it this time (${error.message}). Try again.` }, { status: 502 });
  }
  return serverError(tag, error);
}
