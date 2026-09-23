import crypto from "crypto";

/**
 * An upload ticket: proof that THIS user was allowed to upload to THIS path.
 * The server hands one out with the path (POST .../upload), the store only
 * accepts an upload for a path with a valid, fresh ticket, and the action that
 * registers the file (submit a chapter, send a message) checks it again, so a
 * file uploaded by one person can never be claimed by another.
 *
 * Format: "<issuedAtMs>.<hmac>", signed with AUTH_SECRET.
 */

/** Long enough to pick a file and start the upload. */
export const UPLOAD_WINDOW_MS = 15 * 60_000;
/** The file must be registered within a day of its ticket. */
export const REGISTER_WINDOW_MS = 24 * 3_600_000;

function secret(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function sign(pathname: string, userId: string, issuedAt: number): string {
  return crypto.createHmac("sha256", secret()).update(`upload|${pathname}|${userId}|${issuedAt}`).digest("base64url");
}

export function issueTicket(pathname: string, userId: string, now = Date.now()): string {
  return `${now}.${sign(pathname, userId, now)}`;
}

/** True when the ticket was issued for this path and user within `maxAgeMs`. */
export function verifyTicket(ticket: string, pathname: string, userId: string, maxAgeMs: number, now = Date.now()): boolean {
  const m = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(ticket ?? "");
  if (!m) return false;
  const issuedAt = Number(m[1]);
  if (!Number.isFinite(issuedAt) || issuedAt > now + 60_000 || now - issuedAt > maxAgeMs) return false;
  const expected = Buffer.from(sign(pathname, userId, issuedAt));
  const given = Buffer.from(m[2]);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
