import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { fileDownloadResponse } from "@/lib/files/download";
import { fileForAdmin } from "@/lib/services/file-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** GET: any file on the project. */
export async function GET(_req: NextRequest, { params }: { params: { id: string; fileId: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const file = await fileForAdmin(params.id, params.fileId);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return fileDownloadResponse(file, { allowLinks: true });
}
