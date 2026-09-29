/**
 * One place that knows how to read a research reference's PDF and whether the
 * reference has one at all. Since 29 Sept 2026 new writes go to the private
 * Blob store; rows written before then still have their `driveFileId` set
 * (the string `"SKIPPED"` meant "the download failed") and are read from
 * Google Drive as a fallback. `hasPdf` is what every "does this row have a
 * downloadable PDF" check should call; components should never touch the raw
 * field names.
 */
import type { Prisma } from "@prisma/client";
import { readFile, deleteStoredFile } from "@/lib/files/storage";
import { downloadDriveFile, deleteFile as deleteDriveFile, GoogleDriveError } from "@/lib/google-drive";

export interface ReferencePdfFields {
  pdfBlobPath: string | null;
  driveFileId: string | null;
}

/** True when the reference has a downloadable PDF (new-flow Blob, or an old-flow Drive file). */
export function hasPdf(ref: ReferencePdfFields): boolean {
  if (ref.pdfBlobPath) return true;
  return Boolean(ref.driveFileId) && ref.driveFileId !== "SKIPPED";
}

/** A Prisma `where` fragment for KEPT references with a downloadable PDF (either flow). */
export const KEPT_HAS_PDF: Prisma.ReferenceWhereInput = {
  status: "KEPT",
  OR: [
    { pdfBlobPath: { not: null } },
    { AND: [{ driveFileId: { not: null } }, { NOT: { driveFileId: "SKIPPED" } }] },
  ],
};

/** The bytes of a reference's PDF as a stream. Prefers the Blob path; falls back to Drive for old rows. */
export async function readReferencePdf(
  ref: ReferencePdfFields,
): Promise<{ stream: ReadableStream<Uint8Array>; size: number | null } | null> {
  if (ref.pdfBlobPath) {
    const file = await readFile(ref.pdfBlobPath);
    return file ? { stream: file.stream, size: file.size } : null;
  }
  if (ref.driveFileId && ref.driveFileId !== "SKIPPED") {
    try {
      return await downloadDriveFile(ref.driveFileId);
    } catch (error) {
      // A dead Google token used to throw an ugly 500. We hand back null so
      // the caller can show "This paper is no longer available." cleanly.
      if (error instanceof GoogleDriveError) return null;
      // Also swallow the "env vars not set" error once GOOGLE_OAUTH_* is removed.
      if (error instanceof Error && error.message.includes("Google OAuth env vars")) return null;
      throw error;
    }
  }
  return null;
}

/** Delete a reference's stored PDF (Blob or Drive), swallowing errors so a re-run always makes forward progress. */
export async function deleteReferencePdf(ref: ReferencePdfFields): Promise<void> {
  if (ref.pdfBlobPath) {
    await deleteStoredFile(ref.pdfBlobPath).catch((error) => {
      console.error("[research files] could not delete Blob PDF", ref.pdfBlobPath, error);
    });
  }
  if (ref.driveFileId && ref.driveFileId !== "SKIPPED") {
    await deleteDriveFile(ref.driveFileId).catch((error) => {
      // A dead Google token used to block cleanup entirely. Now it's a warn.
      console.error("[research files] could not delete Drive PDF", ref.driveFileId, error);
    });
  }
}
