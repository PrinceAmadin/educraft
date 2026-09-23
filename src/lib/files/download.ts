import { NextResponse } from "next/server";
import { safeHref } from "@/lib/safe-href";
import { contentDisposition } from "@/lib/files/policy";
import { readFile, StorageNotConfigured } from "@/lib/files/storage";
import type { DownloadableFile } from "@/lib/services/file-access";

/**
 * Streams a private file to someone already allowed to have it. Headers keep
 * it out of every cache, force a download, and stop the browser from running
 * anything in it (nosniff + a sandboxing CSP) even if it were opened inline.
 *
 * Older files that are only a link (pasted by a worker, or a public intake
 * upload) are redirected to, for staff only.
 */
export async function fileDownloadResponse(
  file: DownloadableFile,
  opts: { downloadAs?: string; allowLinks: boolean }
): Promise<Response> {
  if (file.storage !== "PRIVATE_BLOB" || !file.blobPathname) {
    const href = opts.allowLinks ? safeHref(file.fileUrl) : null;
    if (!href) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.redirect(href, 302);
  }

  try {
    const stored = await readFile(file.blobPathname);
    if (!stored) return NextResponse.json({ error: "This file is missing. Tell EduCraft." }, { status: 404 });
    return new Response(stored.stream, {
      headers: {
        "Content-Type": file.fileType || "application/octet-stream",
        "Content-Length": String(stored.size),
        "Content-Disposition": contentDisposition(opts.downloadAs ?? file.fileName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  } catch (error) {
    if (error instanceof StorageNotConfigured) {
      console.error("[download] private file store is not configured:", error.message);
      return NextResponse.json({ error: "Downloads aren't available right now. Try again later." }, { status: 503 });
    }
    console.error("[download]", error);
    return NextResponse.json({ error: "The download failed. Try again." }, { status: 500 });
  }
}
