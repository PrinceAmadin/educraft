import { NextRequest, NextResponse } from "next/server";
import { opsGuard } from "@/lib/services/operations/route-helpers";
import { fileDownloadResponse } from "@/lib/files/download";
import { sourceFileForAdmin } from "@/lib/research/source-stage-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET: D3b, a confirmed case's Supreme Court judgment, streamed from the
 * private store (or, if the copy failed, a redirect to the court's own PDF).
 * Founder and COO only.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string; sourceId: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  const file = await sourceFileForAdmin(params.id, params.sourceId);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return fileDownloadResponse(file, { allowLinks: true });
}
