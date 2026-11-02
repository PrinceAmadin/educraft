import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireSuperAdmin } from "@/lib/api";

/**
 * Mints a short upload token so the founder's browser can send the ambassador
 * tutorial video straight to the PUBLIC Blob store. A 5–7 minute film is far
 * past the 4.5 MB a function may receive, so it never passes through here —
 * only the token does.
 *
 * Founder only. `/api/admin/settings` is already SUPER_ADMIN in
 * `API_PERMISSIONS` and longest-prefix-wins covers this child, so the edge
 * middleware refuses everyone else before the handler runs; `requireSuperAdmin`
 * is the second layer, for the same reason the sensitive settings routes do
 * both.
 *
 * Public-by-unguessable-URL is the right level for this file: every ambassador
 * has to be able to stream it, including before the page's JavaScript has
 * resolved a session, and `addRandomSuffix` keeps the URL from being guessed.
 * The video is not confidential — it is the tutorial we hand to every new
 * ambassador.
 */
const ALLOWED_TYPES = ["video/mp4", "video/webm", "image/png", "image/jpeg", "image/webp"];

/** A 7-minute 1080p export lands around 100–200 MB; this leaves generous room. */
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  // Always name this store's token: the private store is also connected to the
  // project, and the SDK's own guess could otherwise put a public video there.
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "File upload is not available right now." }, { status: 503 });
  }

  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      token,
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("ambassador-tour/")) throw new Error("Invalid upload path");
        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        };
      },
      // Nothing to record: the browser puts the returned URL into the settings
      // form, and the founder saves it like any other field.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 }
    );
  }
}
