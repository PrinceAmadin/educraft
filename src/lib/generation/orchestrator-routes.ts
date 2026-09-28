import { NextResponse } from "next/server";
import { z } from "zod";
import { serverError } from "@/lib/api";
import { OrchestratorError } from "./orchestrator";

/** Start: `confirmNoReferences` is the second confirmation for a project with no verified references. */
export const startBodySchema = z.object({ confirmNoReferences: z.boolean().optional() }).default({});

export const continueBodySchema = z
  .object({ choice: z.enum(["continue", "accept_no_statements", "rewrite_chapter_one", "confirm_no_references"]).default("continue") })
  .default({ choice: "continue" });

/** A refusal becomes its own status with the reasons; anything else is a 500. */
export function orchestratorErrorResponse(tag: string, error: unknown): NextResponse {
  if (error instanceof OrchestratorError) {
    return NextResponse.json({ error: error.message, code: error.code, ...error.details }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  return serverError(tag, error);
}

/** The body of a POST that may have none. */
export async function optionalJson(req: Request): Promise<unknown> {
  const text = await req.text().catch(() => "");
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
