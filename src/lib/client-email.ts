/** Placeholder address used when a client gave no email (Paystack needs one). */
export const PLACEHOLDER_EMAIL_DOMAIN = "@no-email.educraft.ng";

/**
 * A usable inbox for the client's sign-in code: valid-looking, lower-cased, and
 * not the placeholder. Pure (no database) so admin screens can use it too.
 */
export function realEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  if (!e || e.endsWith(PLACEHOLDER_EMAIL_DOMAIN)) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}
