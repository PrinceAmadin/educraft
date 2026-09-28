import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { serverError } from "@/lib/api";
import { QualityGateError, type QualityActor } from "@/lib/quality-gate";

/** A refused quality request keeps its code and details (e.g. the recall window's end); anything else is a 500. */
export function qualityErrorResponse(tag: string, error: unknown): NextResponse {
  if (error instanceof QualityGateError) {
    return NextResponse.json({ error: error.message, code: error.code, ...error.details }, { status: error.status });
  }
  return serverError(tag, error);
}

/** The assigned specialist, by name, for the run and recall records. */
export async function workerActor(workerId: string, userId: string): Promise<QualityActor> {
  const w = await db.worker.findUnique({ where: { id: workerId }, select: { fullName: true } });
  return { userId, name: w?.fullName ?? "The specialist", role: "WORKER" };
}

export const regenerateBodySchema = z.object({ chapter: z.number().int().min(1).max(5) });
