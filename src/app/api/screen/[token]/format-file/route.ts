import { NextRequest, NextResponse } from "next/server";
import { serverError } from "@/lib/api";
import { getFormatFile } from "@/lib/services/screening";

export const runtime = "nodejs";

/**
 * Streams the broken formatting-test .docx for a sitting. The token is the
 * credential; the file is built on demand from the planted faults, so it holds
 * no answer and nothing is stored.
 */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const file = await getFormatFile(params.token);
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return serverError("screening-format-file", error);
  }
}
