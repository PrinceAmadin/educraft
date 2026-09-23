import { contentTypeFor, extensionOf, magicMatches, maxBytesFor, type UploadPurpose } from "@/lib/files/policy";
import { parsePrivatePath } from "@/lib/files/paths";
import { REGISTER_WINDOW_MS, verifyTicket } from "@/lib/files/ticket";
import { deleteStoredFile, headFile, readFirstBytes } from "@/lib/files/storage";

/**
 * Checks an uploaded file before anything refers to it: the right place, the
 * uploader's own ticket, a sensible size, and first bytes that match its
 * extension. A file that fails the content check is deleted.
 */

export class UploadCheckError extends Error {}

export interface UploadedFileInput {
  pathname: string;
  ticket: string;
  fileName: string;
}

export interface CheckedUpload {
  pathname: string;
  fileName: string;
  size: number;
  contentType: string;
  url: string;
}

export async function checkUploadedFile(
  input: UploadedFileInput,
  expect: { userId: string; projectDbId: string; purpose: UploadPurpose; targetId: string }
): Promise<CheckedUpload> {
  const parsed = parsePrivatePath(input.pathname);
  if (
    !parsed ||
    parsed.projectDbId !== expect.projectDbId ||
    parsed.purpose !== expect.purpose ||
    parsed.targetId !== expect.targetId
  ) {
    throw new UploadCheckError("That upload doesn't belong here. Upload the file again.");
  }
  if (!verifyTicket(input.ticket, input.pathname, expect.userId, REGISTER_WINDOW_MS)) {
    throw new UploadCheckError("That upload has expired. Upload the file again.");
  }

  const fileName = input.fileName.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 200) || "file";
  const contentType = contentTypeFor(expect.purpose, fileName);
  if (!contentType || extensionOf(fileName) !== extensionOf(parsed.name)) {
    throw new UploadCheckError("That kind of file can't be uploaded here.");
  }

  const info = await headFile(input.pathname);
  if (!info) throw new UploadCheckError("The upload didn't finish. Upload the file again.");
  if (info.size <= 0 || info.size > maxBytesFor(expect.purpose)) {
    await deleteStoredFile(input.pathname).catch(() => undefined);
    throw new UploadCheckError("That file is empty or too large.");
  }

  const head = await readFirstBytes(input.pathname, 16);
  if (!head || !magicMatches(fileName, head)) {
    await deleteStoredFile(input.pathname).catch(() => undefined);
    throw new UploadCheckError(`That file isn't a real .${extensionOf(fileName)} file. Save it again and re-upload.`);
  }

  return { pathname: input.pathname, fileName, size: info.size, contentType, url: info.url };
}
