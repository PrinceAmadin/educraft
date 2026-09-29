import crypto from "crypto";

/**
 * Short-lived HMAC-signed swap token used by the "account-switch" credentials
 * provider in `src/lib/auth.ts` to replace the current session's JWT with
 * another login's JWT, without asking for a password. The API route mints the
 * token only after checking that both logins belong to the same person via
 * `ExecProfile.otherEmails` (see `sameExecPerson` in
 * `src/lib/services/executives.ts`); the provider re-checks the same rule
 * before it swaps, so a `otherEmails` edit inside the 60-second window cancels
 * the swap. Same pattern as `signJobToken` in `research-runner.ts`.
 */

const TOKEN_TTL_MS = 60_000;

export interface SwapTokenPayload {
  fromUserId: string;
  toUserId: string;
  /** Milliseconds since epoch; the token is valid until this time. */
  exp: number;
}

function tokenSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

function payloadInput(p: SwapTokenPayload): string {
  return `account-switch:${p.fromUserId}:${p.toUserId}:${p.exp}`;
}

export function signSwapToken(p: SwapTokenPayload): string {
  return crypto.createHmac("sha256", tokenSecret()).update(payloadInput(p)).digest("hex");
}

export function verifySwapToken(p: SwapTokenPayload, token: string | null | undefined): boolean {
  if (!token) return false;
  if (!Number.isFinite(p.exp) || p.exp <= Date.now()) return false;
  const expected = Buffer.from(signSwapToken(p));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Convenience for the API route: builds a payload with the standard TTL. */
export function newSwapPayload(fromUserId: string, toUserId: string): SwapTokenPayload {
  return { fromUserId, toUserId, exp: Date.now() + TOKEN_TTL_MS };
}
