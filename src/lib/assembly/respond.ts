/**
 * Phase D7: the assembled report as an HTTP download, shared by the worker and
 * admin routes. The file is built on demand; nothing is stored.
 */

import { NextResponse } from "next/server";
import { contentDisposition } from "@/lib/files/policy";
import { assembleReport, AssemblyError } from "./assemble";

export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function reportDownload(projectDbId: string): Promise<NextResponse> {
  try {
    const { buffer, fileName, report } = await assembleReport(projectDbId);
    const placeholders = report.chapters.reduce((n, c) => n + c.placeholders.length, 0) + report.prelimPlaceholders.length;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": DOCX_TYPE,
        "Content-Disposition": contentDisposition(fileName),
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        // What the specialist still has to fill in (the placeholders), for the page to show if it wants.
        "X-Assembly-Placeholders": String(placeholders),
      },
    });
  } catch (error) {
    if (error instanceof AssemblyError) {
      return NextResponse.json({ error: error.message, code: error.code, ...error.details }, { status: error.status });
    }
    throw error;
  }
}
