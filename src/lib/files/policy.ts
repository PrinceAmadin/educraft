/**
 * Who may upload what, and when a client may download a released document.
 * Pure (no database): pages, API routes and scripts/check-client-access.ts all
 * use these, so the screen and the server can never disagree about a lock.
 */

export type AccessName = "DOWNPAYMENT" | "BALANCE" | "WITH_COMPLETE" | "ALWAYS" | "WITHHELD";

/** with_complete: a full report's Chapter 3 onwards, which the client only ever gets inside the complete project. */
export type LockReason = "downpayment" | "balance" | "with_complete" | "withheld" | "closed";

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
 *  4. released early by a super admin: open (the founder's override, even for Chapter 3 onwards)
 *  5. cancelled: locked
 *  6. a full report's Chapter 3 onwards: locked, it comes in the complete project
 *  7. downpayment not verified: locked
 *  8. downpayment tier: open
 *  9. balance tier: open once the balance is verified (both legs paid: 100%)
 * Pro bono projects have both payments verified, so everything but rule 6 opens.
 * "Released" is the COO's approval for a generated report's chapters (chapter-review.ts).
 */
export function deliverableGate(released: boolean, access: AccessName, project: GateProject): Gate {
  if (!released) return { state: "hidden" };
  if (project.status === "REFUNDED") return { state: "locked", reason: "closed" };
  if (access === "WITHHELD") return { state: "locked", reason: "withheld" };
  if (access === "ALWAYS") return { state: "open" };
  if (project.status === "CANCELLED") return { state: "locked", reason: "closed" };
  if (access === "WITH_COMPLETE") return { state: "locked", reason: "with_complete" };
  if (project.downpaymentStatus !== "Verified") return { state: "locked", reason: "downpayment" };
  if (access === "DOWNPAYMENT") return { state: "open" };
  return project.balanceStatus === "Verified" ? { state: "open" } : { state: "locked", reason: "balance" };
}

/** Both legs verified: the client has paid 100% (pro bono counts). */
export function isFullyPaid(project: Pick<GateProject, "downpaymentStatus" | "balanceStatus">): boolean {
  return project.downpaymentStatus === "Verified" && project.balanceStatus === "Verified";
}

export { LOCK_TEXT } from "@/lib/client-document-text";

// ── Uploads ──────────────────────────────────────────────────

/**
 * deliverable: a chapter or document version. message: an attachment in the client thread.
 * data: a data file at a report pipeline pause (D3c/D4): sent by the client, checked and
 * added to by the specialist.
 */
export type UploadPurpose = "deliverable" | "message" | "data";
export type UploaderRole = "WORKER" | "ADMIN" | "CLIENT";

export const UPLOAD_PURPOSES: readonly UploadPurpose[] = ["deliverable", "message", "data"];

/** Everything the private store holds: uploads plus server-written files.
 * - "source": court judgment PDFs (D3b) and Mode 5 datasets (D5).
 * - "receipt": one PDF per verified client payment (D10), rendered on Verify and streamed on click.
 * - "research": open-access PDFs fetched by the research pipeline's Step 4 (one per kept reference).
 * - "bank_confirmation": a bank-transfer confirmation a finance user attaches to a payout batch (Phase 5).
 * - "statement": a generated weekly financial statement, PDF or spreadsheet (Phase 7). */
export type StoredPurpose = UploadPurpose | "source" | "receipt" | "research" | "bank_confirmation" | "statement";

/** What the caller's route knows about the upload (D4): whose project it is and whether it is paused for data. */
export interface UploadContext {
  /** The uploader is the client who owns the project. */
  ownsProject?: boolean;
  /** The project has a data pause waiting for the client's files. */
  activeDataPause?: boolean;
}

/**
 * Who may upload what. Chapters: workers and admins only. Message attachments:
 * clients and admins. Data files: workers and admins, and a client only on
 * their own project while it waits for their data (the one narrow exception).
 */
export function canUpload(role: UploaderRole, purpose: UploadPurpose, ctx: UploadContext = {}): boolean {
  if (purpose === "deliverable") return role === "WORKER" || role === "ADMIN";
  if (purpose === "data") {
    if (role === "CLIENT") return ctx.ownsProject === true && ctx.activeDataPause === true;
    return role === "WORKER" || role === "ADMIN";
  }
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
  csv: "text/csv",
};

const EXTENSIONS: Record<StoredPurpose, readonly string[]> = {
  deliverable: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip", "png", "jpg", "jpeg"],
  message: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "png", "jpg", "jpeg", "webp"],
  // Written by the server only, never uploaded: judgment PDFs (D3b) and the fetched Mode 5 dataset (D5).
  source: ["pdf", "csv"],
  // What Claude can read directly (PDF, images) or what we turn into text (Word, Excel, CSV).
  data: ["pdf", "docx", "xlsx", "csv", "png", "jpg", "jpeg"],
  // Receipt PDFs generated by the server on payment Verify (D10). Never uploaded.
  receipt: ["pdf"],
  // Research PDFs the pipeline downloads from open-access hosts. Never uploaded.
  research: ["pdf"],
  // A finance user's bank-transfer confirmation for a payout batch (Phase 5).
  bank_confirmation: ["pdf", "png", "jpg", "jpeg", "webp"],
  // A generated weekly financial statement (Phase 7), server-written.
  statement: ["pdf", "csv", "xlsx"],
};

const MB = 1024 * 1024;
const MAX_BYTES: Record<StoredPurpose, number> = { deliverable: 50 * MB, message: 25 * MB, source: 25 * MB, data: 25 * MB, receipt: 512 * 1024, research: 25 * MB, bank_confirmation: 10 * MB, statement: 25 * MB };

export function maxBytesFor(purpose: StoredPurpose): number {
  return MAX_BYTES[purpose];
}

export function extensionOf(fileName: string): string {
  const m = /\.([a-z0-9]{1,6})$/i.exec(fileName.trim());
  return m ? m[1].toLowerCase() : "";
}

/** The content type for an allowed file, or null when this purpose doesn't take that kind of file. */
export function contentTypeFor(purpose: StoredPurpose, fileName: string): string | null {
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
  if (purpose === "data") return "PDF, Word, Excel, CSV or images (PNG, JPG), up to 25 MB each";
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
    case "csv": {
      // Plain text: no NUL bytes, and not an HTML page renamed to .csv.
      if (head.length === 0 || head.some((b) => b === 0)) return false;
      const start = new TextDecoder().decode(head).replace(/^\uFEFF/, "").trimStart().toLowerCase();
      return !start.startsWith("<");
    }
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
