/**
 * Phase D7: the assembled report as an HTTP download, shared by the worker and
 * admin routes. The file is built on demand; nothing is stored.
 *
 * Chapter review: the specialist gets the complete report only once every
 * chapter is approved (source "approved", 409 CHAPTERS_NOT_APPROVED before);
 * the founder and the COO get a working copy at any time (approved chapters
 * where there are some, the AI text elsewhere), named "(working copy)".
 */

import { NextResponse } from "next/server";
import { contentDisposition } from "@/lib/files/policy";
import type { ChapterTextSource } from "@/lib/services/chapter-texts";
import { assembleReport, AssemblyError } from "./assemble";

export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function reportDownload(projectDbId: string, opts: { source?: ChapterTextSource } = {}): Promise<NextResponse> {
  try {
    const { buffer, fileName, report, source } = await assembleReport(projectDbId, opts);
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
        // "approved" (every chapter approved) or "working-copy" (some AI text still in it).
        "X-Assembly-Source": source ?? "ai",
      },
    });
  } catch (error) {
    if (error instanceof AssemblyError) {
      return NextResponse.json({ error: error.message, code: error.code, ...error.details }, { status: error.status });
    }
    throw error;
  }
}
