import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { maxBytesFor } from "@/lib/files/policy";
import { parsePrivatePath } from "@/lib/files/paths";
import { UPLOAD_WINDOW_MS, verifyTicket } from "@/lib/files/ticket";
import { storageDriver, writeLocalFile } from "@/lib/files/storage";

export const dynamic = "force-dynamic";

/**
 * PUT ?path=&ticket=  (local development only)
 *
 * With PRIVATE_FILES_DRIVER=local the browser sends the file body here instead
 * of to Vercel Blob. The same ticket rules apply. On Vercel this route does
 * not exist (404).
 */
export async function PUT(req: NextRequest) {
  let local = false;
  try {
    local = storageDriver() === "local";
  } catch {
    local = false;
  }
  if (!local) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pathname = req.nextUrl.searchParams.get("path") ?? "";
  const ticket = req.nextUrl.searchParams.get("ticket") ?? "";
  const parsed = parsePrivatePath(pathname);
  if (!parsed || !verifyTicket(ticket, pathname, session.user.id, UPLOAD_WINDOW_MS)) {
    return NextResponse.json({ error: "This upload is not allowed. Try again." }, { status: 403 });
  }
  if (!req.body) return NextResponse.json({ error: "No file" }, { status: 400 });

  try {
    const size = await writeLocalFile(pathname, req.body, maxBytesFor(parsed.purpose));
    return NextResponse.json({ pathname, size });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message.includes("EEXIST") ? "Already uploaded" : message }, { status: 400 });
  }
}
