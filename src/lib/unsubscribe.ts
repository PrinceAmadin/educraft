import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signed, login-free unsubscribe links for the weekly ambassador summary.
 *
 * The token is `{ambassadorId}.{signature}` where the signature is an HMAC of
 * the id under AUTH_SECRET, prefixed with a purpose string so it can never be
 * replayed as some other kind of token. Nobody can unsubscribe someone else
 * without the secret, and the link needs no sign-in, which matters for an
 * ambassador reading the email on a phone. It deliberately never expires:
 * an old email must still be able to stop the emails.
 */

const PURPOSE = "weekly-summary-unsubscribe";

function secret(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set, cannot sign unsubscribe links.");
  return s;
}

function sign(ambassadorId: string): string {
  return createHmac("sha256", secret()).update(`${PURPOSE}:${ambassadorId}`).digest("base64url");
}

export function makeUnsubscribeToken(ambassadorId: string): string {
  return `${ambassadorId}.${sign(ambassadorId)}`;
}

/** The ambassador id a token was issued for, or null if it is malformed or forged. */
export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  if (!token || token.length > 300) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const id = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(id));
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

/** Confirmation page (asks first, so a mail scanner opening the link cannot unsubscribe anyone). */
export const weeklyUnsubscribePageUrl = (siteUrl: string, token: string) =>
  `${siteUrl}/unsubscribe/weekly?t=${encodeURIComponent(token)}`;

/** Endpoint mail clients POST to for one-click unsubscribe (RFC 8058). */
export const weeklyUnsubscribeApiUrl = (siteUrl: string, token: string) =>
  `${siteUrl}/api/unsubscribe/weekly?t=${encodeURIComponent(token)}`;
