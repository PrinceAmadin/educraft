import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireSuperAdmin } from "@/lib/api";

/**
 * Mints a short upload token so the founder's browser can send a training
 * episode (COO tutorials, worker series) straight to the PUBLIC Blob store —
 * the ambassador tour's upload route with a `training/` prefix. The file
 * never passes through a function; only the token does.
 *
 * Founder only: `/api/admin/settings` is SUPER_ADMIN in `API_PERMISSIONS`
 * and longest-prefix-wins covers this child; `requireSuperAdmin` is the
 * second layer.
 *
 * Public-by-unguessable-URL is the right level: workers and the COO stream
 * these without any token handshake, `addRandomSuffix` keeps the URL from
 * being guessed, and nothing confidential is in a tutorial we show every
 * worker. Never serve these from /public/images — the service worker's
 * cache-first ignores Range requests, which breaks seeking.
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
        if (!pathname.startsWith("training/")) throw new Error("Invalid upload path");
        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        };
      },
      // Nothing to record: the browser puts the returned URL into the episode
      // via the management PATCH, like the settings form does.
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
