import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/api";
import { fileDownloadResponse } from "@/lib/files/download";
import { LOCK_TEXT } from "@/lib/files/policy";
import { fileForClient } from "@/lib/services/file-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET: a released chapter or document (when its payment rule is met), or an
 * attachment in the client's own thread. 404 for anything else, 403 when it is
 * released but still locked.
 */
export async function GET(_req: NextRequest, { params }: { params: { code: string; fileId: string } }) {
  const guard = await requireClient();
  if (!guard.ok) return guard.response;
  const result = await fileForClient(guard.scope, params.code, params.fileId);
  if (result.kind === "missing") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result.kind === "locked") return NextResponse.json({ error: LOCK_TEXT[result.reason] }, { status: 403 });
  return fileDownloadResponse(result.file, { downloadAs: result.downloadAs, allowLinks: false });
}
