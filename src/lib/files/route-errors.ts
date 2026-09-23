import { NextResponse } from "next/server";
import { serverError } from "@/lib/api";
import { UploadCheckError } from "@/lib/files/register";
import { StorageNotConfigured } from "@/lib/files/storage";
import { DeliverableError } from "@/lib/services/deliverables";
import { TransitionError } from "@/lib/services/projects";

/** One answer for every expected failure of a file or document action. */
export function fileActionError(tag: string, error: unknown): NextResponse {
  if (error instanceof DeliverableError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof UploadCheckError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof TransitionError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof StorageNotConfigured) {
    console.error(`[${tag}] private file store is not configured:`, error.message);
    return NextResponse.json({ error: "Files aren't available right now. Tell an admin." }, { status: 503 });
  }
  return serverError(tag, error);
}
