import crypto from "node:crypto";
import { db } from "@/lib/db";
import { buildFinancePath, type FinancePurpose } from "@/lib/files/paths";
import { contentTypeFor, extensionOf, magicMatches, maxBytesFor } from "@/lib/files/policy";
import { putPrivateFile } from "@/lib/files/storage";
import type { DownloadableFile } from "@/lib/services/file-access";

/**
 * Organisation-level finance documents (Phase 5): a bank-transfer confirmation
 * attached to a payout batch, or a generated weekly statement. They live under
 * the `finance/` root of the private store, outside the project-scoped
 * ProjectFile world, as `FinanceFile` rows. Finance role only — guarded in the
 * routes, not here.
 */

export class FinanceFileError extends Error {}

/**
 * Store a finance document the server already holds the bytes for (a small
 * bank-confirmation upload read from the request, or a generated statement).
 * Validates the type, the size and the first bytes, then writes it and records
 * a FinanceFile row.
 */
export async function putFinanceFile(input: {
  purpose: FinancePurpose;
  targetId: string;
  fileName: string;
  bytes: Uint8Array;
  uploadedById?: string | null;
}): Promise<{ id: string; fileName: string; fileType: string; fileSize: number }> {
  const contentType = contentTypeFor(input.purpose, input.fileName);
  if (!contentType) throw new FinanceFileError("That file type is not allowed here.");
  if (input.bytes.byteLength === 0) throw new FinanceFileError("The file is empty.");
  if (input.bytes.byteLength > maxBytesFor(input.purpose)) throw new FinanceFileError("That file is too large.");
  if (!magicMatches(input.fileName, input.bytes.slice(0, 16))) throw new FinanceFileError("That file does not look like what its name says.");

  const ext = extensionOf(input.fileName);
  const pathname = buildFinancePath({ purpose: input.purpose, targetId: input.targetId, random: crypto.randomBytes(12).toString("hex"), ext });
  await putPrivateFile(pathname, input.bytes, contentType);

  const row = await db.financeFile.create({
    data: {
      purpose: input.purpose,
      targetId: input.targetId,
      fileName: input.fileName.slice(0, 200),
      fileType: contentType,
      fileSize: input.bytes.byteLength,
      blobPathname: pathname,
      uploadedById: input.uploadedById ?? null,
    },
    select: { id: true, fileName: true, fileType: true, fileSize: true },
  });
  return row;
}

/** A finance file as a streamable download (for fileDownloadResponse). Finance role gates the route. */
export async function fileForFinance(id: string): Promise<DownloadableFile | null> {
  const row = await db.financeFile.findUnique({ where: { id }, select: { id: true, fileName: true, fileType: true, fileSize: true, blobPathname: true } });
  if (!row) return null;
  return { id: row.id, fileName: row.fileName, fileUrl: "", fileType: row.fileType, fileSize: row.fileSize, storage: "PRIVATE_BLOB", blobPathname: row.blobPathname };
}

/** A quick summary of a finance file for showing on a batch (name + id). */
export async function financeFileSummary(id: string | null): Promise<{ id: string; fileName: string } | null> {
  if (!id) return null;
  const row = await db.financeFile.findUnique({ where: { id }, select: { id: true, fileName: true } });
  return row;
}
