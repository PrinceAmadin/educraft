/**
 * Sealing a secret so it can live in a `Setting` row.
 *
 * HQ stores one real credential in the database — the Anthropic API key, which
 * the founder changes from the admin settings rather than from a Vercel
 * environment variable. Plain text in `Setting` would mean a database dump, or
 * any future code that lists settings, hands out a live key, so it is sealed
 * with AES-256-GCM first.
 *
 * The encryption key is derived from AUTH_SECRET with a purpose string, the
 * same convention the HMAC helpers use (`unsubscribe.ts`, `files/ticket.ts`):
 * one secret, never replayable across purposes. GCM's auth tag means a
 * tampered blob fails to open rather than decrypting to rubbish.
 *
 * `openSecret` returns null instead of throwing — including when AUTH_SECRET
 * has been rotated and the blob can no longer be read. A key that cannot be
 * decrypted must degrade to the environment fallback and show the founder a
 * "re-enter it" notice, never break every report with an exception.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const PURPOSE = "educraft-secret-box-v1";
const VERSION = "v1";
const IV_BYTES = 12; // GCM's standard nonce length
const KEY_BYTES = 32; // AES-256

/** scrypt is deliberately slow, so the derived key is computed once per process. */
let cachedKey: Buffer | null = null;

function secretKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set, cannot seal or open secrets.");
  cachedKey = scryptSync(secret, PURPOSE, KEY_BYTES);
  return cachedKey;
}

/** Test seam: forget the derived key so a changed AUTH_SECRET is picked up. */
export function resetSecretBoxKey(): void {
  cachedKey = null;
}

/** True when a stored value looks like something this module wrote. */
export function isSealed(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(":");
  return parts.length === 4 && parts[0] === VERSION;
}

/** Seals a secret as `v1:<iv>:<tag>:<ciphertext>`, all base64. */
export function sealSecret(plain: string): string {
  if (!plain) throw new Error("Nothing to seal.");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), body.toString("base64")].join(":");
}

/**
 * Opens a sealed secret, or returns null when it cannot be read — a malformed
 * blob, a tampered one (the auth tag fails), or one sealed under a different
 * AUTH_SECRET. Callers treat null as "no saved secret".
 */
export function openSecret(sealed: string | null | undefined): string | null {
  if (!isSealed(sealed)) return null;
  const [, ivB64, tagB64, bodyB64] = (sealed as string).split(":");
  try {
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    if (iv.length !== IV_BYTES || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", secretKey(), iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(Buffer.from(bodyB64, "base64")), decipher.final()]);
    const text = out.toString("utf8");
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
