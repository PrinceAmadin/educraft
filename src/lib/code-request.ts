/**
 * The answer to "email me a code", shared by the forgot-password page
 * (/login/set-password: workers, ambassadors AND clients, it works out which)
 * and the client sign-in form (/client/login).
 *
 * Since Sept 2026 the forms say plainly whether an email or ID is registered
 * (founder's call) instead of "if that matches an account, we have sent…". The
 * code still only ever goes to the address already on the record, and the
 * per-IP cap (10 requests per 15 minutes) keeps the lookup from being used to
 * test long lists of addresses.
 *
 * Pure (no database), so the forms can import it.
 */

export type CodeRequestStatus =
  /** A new code is on its way to `sentTo`. */
  | "sent"
  /** A code went out moments ago, or this email has asked for too many: see `retryAfter`. */
  | "wait"
  /** Not an email address or an ID. */
  | "invalid"
  /** Nothing in the system has this email or ID. */
  | "not_registered"
  /** The record exists but has no usable email on it. */
  | "no_email"
  /** Worker/ambassador page: an application with this email is still under review. */
  | "pending"
  /** The account is suspended, paused, terminated or switched off. */
  | "inactive"
  /** Client page: the email belongs to a worker or ambassador (the forgot-password page handles them). */
  | "team"
  /** Found, but the records disagree and an admin has to align them first. */
  | "needs_admin"
  /** A staff email: never reset from a public form. */
  | "unavailable";

/** Which password the code sets: a worker/ambassador login, or a client login. */
export type CodeAccount = "team" | "client";

export interface CodeRequestResult {
  status: CodeRequestStatus;
  /** "sent" / "wait" on the forgot-password page: which password the code sets, so the form saves it in the right place. */
  account?: CodeAccount;
  /** "sent" / "wait": the inbox the code went to, masked when they typed an ID rather than the email. */
  sentTo?: string;
  /** "wait": seconds before a new code can be asked for. */
  retryAfter?: number;
  /** "wait": the last code sent still works, so the form can go straight to the code step. */
  codeStillValid?: boolean;
}

export const EDUCRAFT_WHATSAPP_URL = "https://wa.me/2347063421088";

/** "amadinprince26@gmail.com" -> "am•••6@gmail.com". Shown when someone typed an ID, so they know which inbox to open. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return email;
  const local = email.slice(0, at);
  const head = local.slice(0, local.length <= 3 ? 1 : 2);
  const tail = local.length > 4 ? local.slice(-1) : "";
  return `${head}•••${tail}${email.slice(at)}`;
}

/** 45 -> "45s", 125 -> "3 min". */
export function formatWait(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return s < 60 ? `${s}s` : `${Math.ceil(s / 60)} min`;
}
