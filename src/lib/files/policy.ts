/**
 * Who may upload what, and when a client may download a released document.
 * Pure (no database): pages, API routes and scripts/check-client-access.ts all
 * use these, so the screen and the server can never disagree about a lock.
 */

export type AccessName = "DOWNPAYMENT" | "BALANCE" | "ALWAYS" | "WITHHELD";

export type LockReason = "downpayment" | "balance" | "withheld" | "closed";

export type Gate = { state: "hidden" } | { state: "locked"; reason: LockReason } | { state: "open" };

export interface GateProject {
  status: string;
  downpaymentStatus: string;
  balanceStatus: string;
}

/**
 * Whether the client can download a deliverable's released version. First
 * match wins:
 *  1. nothing released yet: hidden
 *  2. refunded: locked
 *  3. withheld by an admin: locked
 *  4. released early by a super admin: open
 *  5. cancelled: locked
 *  6. downpayment not verified: locked
 *  7. downpayment tier: open
 *  8. balance tier: open once the balance is verified
 * Pro bono projects have both payments verified, so everything opens.
 */
export function deliverableGate(released: boolean, access: AccessName, project: GateProject): Gate {
  if (!released) return { state: "hidden" };
  if (project.status === "REFUNDED") return { state: "locked", reason: "closed" };
  if (access === "WITHHELD") return { state: "locked", reason: "withheld" };
  if (access === "ALWAYS") return { state: "open" };
  if (project.status === "CANCELLED") return { state: "locked", reason: "closed" };
  if (project.downpaymentStatus !== "Verified") return { state: "locked", reason: "downpayment" };
  if (access === "DOWNPAYMENT") return { state: "open" };
  return project.balanceStatus === "Verified" ? { state: "open" } : { state: "locked", reason: "balance" };
}

export const LOCK_TEXT: Record<LockReason, string> = {
  downpayment: "Pay your downpayment to download",
  balance: "Pay your balance to download",
  withheld: "Not available yet. Message us if you need it",
  closed: "No longer available",
};

// ── Uploads ──────────────────────────────────────────────────

/** deliverable: a chapter or document version. message: an attachment in the client thread. */
export type UploadPurpose = "deliverable" | "message";
export type UploaderRole = "WORKER" | "ADMIN" | "CLIENT";

export const UPLOAD_PURPOSES: readonly UploadPurpose[] = ["deliverable", "message"];

export function canUpload(role: UploaderRole, purpose: UploadPurpose): boolean {
  if (purpose === "deliverable") return role === "WORKER" || role === "ADMIN";
  return role === "CLIENT" || role === "ADMIN";
}

/** Extension -> content type we serve it as. Nothing executable, no HTML/SVG. */
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const EXTENSIONS: Record<UploadPurpose, readonly string[]> = {
  deliverable: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip", "png", "jpg", "jpeg"],
  message: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "png", "jpg", "jpeg", "webp"],
};

const MB = 1024 * 1024;
const MAX_BYTES: Record<UploadPurpose, number> = { deliverable: 50 * MB, message: 25 * MB };

export function maxBytesFor(purpose: UploadPurpose): number {
  return MAX_BYTES[purpose];
}

export function extensionOf(fileName: string): string {
  const m = /\.([a-z0-9]{1,6})$/i.exec(fileName.trim());
  return m ? m[1].toLowerCase() : "";
}

/** The content type for an allowed file, or null when this purpose doesn't take that kind of file. */
export function contentTypeFor(purpose: UploadPurpose, fileName: string): string | null {
  const ext = extensionOf(fileName);
  return EXTENSIONS[purpose].includes(ext) ? TYPES[ext] : null;
}

export function allowedContentTypes(purpose: UploadPurpose): string[] {
  return [...new Set(EXTENSIONS[purpose].map((e) => TYPES[e]))];
}

/** For the file picker's `accept` attribute. */
export function acceptAttribute(purpose: UploadPurpose): string {
  return EXTENSIONS[purpose].map((e) => `.${e}`).join(",");
}

export function allowedKindsLabel(purpose: UploadPurpose): string {
  return purpose === "deliverable"
    ? "Word, PDF, PowerPoint, Excel, ZIP or images, up to 50 MB"
    : "Word, PDF, PowerPoint, Excel or photos, up to 25 MB";
}

/**
 * Does a file's first bytes match what its extension claims? Blocks an HTML
 * page or a script renamed to .pdf. Office files are ZIP (docx, pptx, xlsx)
 * or the old compound-file format (doc, ppt, xls).
 */
export function magicMatches(fileName: string, head: Uint8Array): boolean {
  const ext = extensionOf(fileName);
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  switch (ext) {
    case "pdf":
      return starts(0x25, 0x50, 0x44, 0x46, 0x2d); // %PDF-
    case "docx":
    case "xlsx":
    case "pptx":
    case "zip":
      return starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06);
    case "doc":
    case "xls":
    case "ppt":
      return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    case "png":
      return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "jpg":
    case "jpeg":
      return starts(0xff, 0xd8, 0xff);
    case "webp":
      return starts(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
    default:
      return false;
  }
}

/** A file name safe for a Content-Disposition header and a download dialog. */
export function downloadName(parts: string[], ext: string): string {
  const base = parts
    .filter(Boolean)
    .join(" ")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return ext ? `${base || "EduCraft file"}.${ext}` : base || "EduCraft file";
}

export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
