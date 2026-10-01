import type { StoredPurpose, UploadPurpose } from "@/lib/files/policy";

/**
 * Private-store paths: projects/{projectCuid}/{purpose}/{targetCuid}/{random}.{ext}
 *
 * Only internal ids and a random name: no student names, project codes or
 * matric numbers ever appear in a path (the original file name lives on the
 * ProjectFile row). The server always chooses the path; an upload can only
 * land where a ticket for that exact path allows.
 */

const ID = /^[a-z0-9]{8,40}$/;
const TARGET = /^[a-z0-9-]{3,40}$/;
const NAME = /^[a-f0-9]{24}\.[a-z0-9]{1,6}$/;

export interface PrivatePath {
  projectDbId: string;
  purpose: UploadPurpose;
  targetId: string;
  name: string;
}

export function buildPrivatePath(input: {
  projectDbId: string;
  purpose: StoredPurpose;
  targetId: string;
  random: string;
  ext: string;
}): string {
  return `projects/${input.projectDbId}/${input.purpose}/${input.targetId}/${input.random}.${input.ext}`;
}

/** A path an UPLOAD may use (chapters and message attachments only). */
export function parsePrivatePath(pathname: string): PrivatePath | null {
  const parsed = parseStoredPath(pathname);
  if (!parsed || (parsed.purpose !== "deliverable" && parsed.purpose !== "message" && parsed.purpose !== "data")) return null;
  return { ...parsed, purpose: parsed.purpose };
}

export interface StoredPath {
  projectDbId: string;
  purpose: StoredPurpose;
  targetId: string;
  name: string;
}

/**
 * Any path in the private store, including "source" files the server writes
 * itself (Supreme Court judgment PDFs, D3b) and "receipt" PDFs generated on
 * payment Verify (D10). Never accepted from an upload.
 */
export function parseStoredPath(pathname: string): StoredPath | null {
  const parts = pathname.split("/");
  if (parts.length !== 5 || parts[0] !== "projects") return null;
  const [, projectDbId, purpose, targetId, name] = parts;
  if (!ID.test(projectDbId) || !TARGET.test(targetId) || !NAME.test(name)) return null;
  if (
    purpose !== "deliverable" &&
    purpose !== "message" &&
    purpose !== "data" &&
    purpose !== "source" &&
    purpose !== "receipt" &&
    purpose !== "research"
  ) return null;
  return { projectDbId, purpose, targetId, name };
}

// ─── Finance files (Phase 5): organisation-level, not under a project ───────

/** The finance purposes that live under the `finance/` root (not project-scoped). */
export type FinancePurpose = "bank_confirmation" | "statement";
const FINANCE_PURPOSES: FinancePurpose[] = ["bank_confirmation", "statement"];

export interface FinancePath {
  purpose: FinancePurpose;
  targetId: string;
  name: string;
}

/** finance/{purpose}/{targetId}/{random}.{ext} — a bank confirmation or a statement. */
export function buildFinancePath(input: { purpose: FinancePurpose; targetId: string; random: string; ext: string }): string {
  return `finance/${input.purpose}/${input.targetId}/${input.random}.${input.ext}`;
}

export function parseFinancePath(pathname: string): FinancePath | null {
  const parts = pathname.split("/");
  if (parts.length !== 4 || parts[0] !== "finance") return null;
  const [, purpose, targetId, name] = parts;
  if (!TARGET.test(targetId) || !NAME.test(name)) return null;
  if (!FINANCE_PURPOSES.includes(purpose as FinancePurpose)) return null;
  return { purpose: purpose as FinancePurpose, targetId, name };
}

/**
 * The common facts storage.ts needs for ANY private path (project or finance):
 * its purpose (for the content type and size cap) and its random name (for the
 * extension). Keeps parseStoredPath project-only so its callers are unaffected.
 */
export function storedPathInfo(pathname: string): { purpose: StoredPurpose; name: string } | null {
  const project = parseStoredPath(pathname);
  if (project) return { purpose: project.purpose, name: project.name };
  const finance = parseFinancePath(pathname);
  if (finance) return { purpose: finance.purpose, name: finance.name };
  return null;
}

/** Message attachments are uploaded before the message exists, so their target is the thread. */
export const MESSAGE_TARGET = "thread";

/**
 * D10: a receipt lands at projects/{projectDbId}/receipt/{paymentDbId}/{random}.pdf.
 * paymentDbId is the target, so `deleteStoredFile` on a refunded payment removes it cleanly,
 * and `random` (24 hex chars) is fresh on every write in case a re-verify replaces one.
 */
export function buildReceiptPath(input: { projectDbId: string; paymentDbId: string; random: string }): string {
  return buildPrivatePath({ projectDbId: input.projectDbId, purpose: "receipt", targetId: input.paymentDbId, random: input.random, ext: "pdf" });
}
