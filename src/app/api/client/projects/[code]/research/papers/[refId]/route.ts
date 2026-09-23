import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/api";
import { contentDisposition } from "@/lib/files/policy";
import { downloadDriveFile } from "@/lib/google-drive";
import { clientPaper } from "@/lib/services/client-research";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET: one open-access paper from the project's research, streamed from our
 * Drive folder so the client never needs (or sees) the Drive link.
 */
export async function GET(_req: NextRequest, { params }: { params: { code: string; refId: string } }) {
  const guard = await requireClient();
  if (!guard.ok) return guard.response;

  const paper = await clientPaper(guard.scope, params.code, params.refId);
  if (!paper) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const file = await downloadDriveFile(paper.driveFileId);
    if (!file) return NextResponse.json({ error: "This paper is no longer available. Message us." }, { status: 404 });
    return new Response(file.stream, {
      headers: {
        "Content-Type": "application/pdf",
        ...(file.size ? { "Content-Length": String(file.size) } : {}),
        "Content-Disposition": contentDisposition(paper.downloadAs),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  } catch (error) {
    console.error("[client paper download]", error);
    return NextResponse.json({ error: "The download failed. Try again in a minute." }, { status: 502 });
  }
}
