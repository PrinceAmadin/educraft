import { NextResponse } from "next/server";
import { serverError } from "@/lib/api";
import { UploadCheckError } from "@/lib/files/register";
import { StorageNotConfigured } from "@/lib/files/storage";
import { DataPauseError } from "@/lib/services/data-pause";

/** The data-pause routes' error answers: the service's own status and problems, a failed upload check as 400. */
export function dataPauseErrorResponse(tag: string, error: unknown): NextResponse {
  if (error instanceof DataPauseError) {
    return NextResponse.json({ error: error.message, ...(error.problems.length ? { problems: error.problems } : {}) }, { status: error.status });
  }
  if (error instanceof UploadCheckError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof StorageNotConfigured) {
    console.error(`[${tag}] private file store is not configured:`, error.message);
    return NextResponse.json({ error: "Files aren't available right now. Tell an admin." }, { status: 503 });
  }
  return serverError(tag, error);
}
