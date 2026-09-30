import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { contentDisposition, downloadName } from "@/lib/files/policy";
import { readReferencePdf } from "@/lib/services/research-files";
import { loadSupervisorReference, recordSupervisorPdfDownload } from "@/lib/services/supervisor-package";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET: one open-access paper from the public supervisor package. Token is the
 * credential; no login. Only KEPT references with a stored PDF are ever
 * served (paywalled papers get their DOI link on the page, nothing else).
 */
export async function GET(_req: Request, { params }: { params: { token: string; refId: string } }) {
  const found = await loadSupervisorReference(params.token, params.refId);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const file = await readReferencePdf(found.ref);
    if (!file) return NextResponse.json({ error: "This paper is no longer available." }, { status: 404 });
    // Count the download, never block the response on it.
    waitUntil(recordSupervisorPdfDownload(params.token));
    const firstAuthor = (found.ref.authors ?? "").split(";")[0]?.split(",")[0]?.trim() ?? "";
    const title = (found.ref.title ?? found.ref.proposedTitle).trim().split(/\s+/).slice(0, 10).join(" ");
    const filename = downloadName([firstAuthor, found.ref.year ? String(found.ref.year) : "", title], "pdf");
    return new Response(file.stream, {
      headers: {
        "Content-Type": "application/pdf",
        ...(file.size ? { "Content-Length": String(file.size) } : {}),
        "Content-Disposition": contentDisposition(filename),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  } catch (error) {
    console.error("[supervisor pdf]", error);
    return NextResponse.json({ error: "The download failed. Try again in a minute." }, { status: 502 });
  }
}
