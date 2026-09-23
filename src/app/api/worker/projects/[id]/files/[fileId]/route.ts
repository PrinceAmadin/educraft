import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/api";
import { fileDownloadResponse } from "@/lib/files/download";
import { fileForWorker } from "@/lib/services/file-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** GET: a file on the worker's own assignment (never message attachments or hidden files). */
export async function GET(_req: NextRequest, { params }: { params: { id: string; fileId: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;
  const file = await fileForWorker(guard.workerId, params.id, params.fileId);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return fileDownloadResponse(file, { allowLinks: true });
}
