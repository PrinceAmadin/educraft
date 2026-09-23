import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { clientCodeEmail } from "@/lib/emails/client-code";
import type { MailResult } from "@/lib/mailer";
import { realEmail } from "@/lib/client-email";
import { normalizeClientIdInput } from "@/lib/id-format";
import { maskEmail, type CodeRequestResult, type CodeRequestStatus } from "@/lib/code-request";
import { isPersonRole, isStaffRole } from "@/lib/roles";

/**
 * Client sign-in: Client ID (ECC-0001) or email, plus a one-time code emailed
 * to the address stored on that client.
 *
 *   ID or email = "which client are you?"   (guessable, proves nothing)
 *   the code    = "prove you control that client's email"
 *
 * Rules that make it safe:
 *  - The code is only ever sent to the email ALREADY on the client, never to
 *    an address the visitor supplies (typing an email only looks the client up).
 *  - Asking for a code says plainly whether the ID or email is registered (the
 *    founder's call, Sept 2026: no "if that matches…" guesswork), see
 *    `src/lib/code-request.ts`. The per-IP cap below is what stops the lookup
 *    being used to test long lists of addresses. Verifying a code and signing
 *    in with a password still fail with one answer, whatever the reason.
 *  - Codes are 6 digits, stored only as an HMAC, valid 10 minutes, single use,
 *    superseded by a newer code, and locked after 5 wrong tries.
 *  - Per-client (60 s cooldown, 3 per 15 min) and per-IP limits apply whether
 *    or not the identifier exists.
 */

export const CODE_TTL_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_CODES_PER_WINDOW = 3;
export const WINDOW_MS = 15 * 60_000;
const IP_REQUEST_CAP = 10;
const IP_VERIFY_CAP = 25;

function secret(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set, cannot sign client login codes.");
  return s;
}

const mac = (purpose: string, value: string) => createHmac("sha256", secret()).update(`${purpose}:${value}`).digest("hex");
/** Keyed by the Client row's internal id, so a code survives a change of display ID. */
export const hashCode = (clientDbId: string, code: string) => mac("client-login-code", `${clientDbId}:${code}`);
export const hashIp = (ip: string) => mac("client-login-ip", ip);

type Identifier = { kind: "id"; clientId: string } | { kind: "email"; email: string };

/** "ecc 9" -> the Client ID ECC-0009; "Ada@X.com " -> an email; anything else -> null. */
export function readIdentifier(input: string | null | undefined): Identifier | null {
  const raw = (input ?? "").trim();
  const clientId = normalizeClientIdInput(raw);
  if (clientId) return { kind: "id", clientId };
  const email = raw.toLowerCase();
  if (email.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { kind: "email", email };
  return null;
}

const signInSelect = {
  id: true,
  clientId: true,
  fullName: true,
  email: true,
  user: {
    select: { id: true, email: true, displayName: true, role: true, isActive: true, passwordHash: true, emailVerifiedAt: true },
  },
} as const;

/** The client an identifier points at. By email: the oldest record with it (one per person since Sept 2026). */
async function findClient(identifier: Identifier) {
  if (identifier.kind === "id") {
    return db.client.findUnique({ where: { clientId: identifier.clientId }, select: signInSelect });
  }
  return db.client.findFirst({
    where: { email: { equals: identifier.email, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
    select: signInSelect,
  });
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Counts this attempt, and says whether the IP is over its cap. Old rows are pruned as we go. */
async function ipLimited(ip: string, kind: "request" | "verify"): Promise<boolean> {
  const ipHash = hashIp(ip);
  const since = new Date(Date.now() - WINDOW_MS);
  await db.clientLoginAttempt.create({ data: { ipHash, kind } });
  const count = await db.clientLoginAttempt.count({ where: { ipHash, kind, createdAt: { gte: since } } });
  if (Math.random() < 0.02) {
    await db.clientLoginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3_600_000) } } }).catch(() => {});
  }
  return count > (kind === "request" ? IP_REQUEST_CAP : IP_VERIFY_CAP);
}

// ── Request a code ───────────────────────────────────────────

export type SendFn = (message: { to: string; subject: string; html: string; text: string }) => Promise<MailResult>;

/** The caller's IP is over its cap (a 429), or what the form should tell them. */
export type RequestCodeResult = CodeRequestResult | { status: "limited" };

/** A code recently issued for one inbox or client, newest first. */
export interface RecentCode {
  createdAt: Date;
  usedAt: Date | null;
  expiresAt: Date;
  attempts: number;
}

/**
 * Null when a new code may be sent now. Otherwise how long until one may (the
 * 60 s cooldown, or the 3-per-15-minutes cap), and whether the newest code sent
 * still works, so the form can send them to it instead of leaving them stuck.
 * `recent` is every code created in the last WINDOW_MS, newest first.
 */
export function waitBeforeNewCode(recent: RecentCode[], now: number): { retryAfter: number; codeStillValid: boolean } | null {
  let until = 0;
  // The cap frees up when the MAX-th newest code leaves the window.
  if (recent.length >= MAX_CODES_PER_WINDOW) until = recent[MAX_CODES_PER_WINDOW - 1].createdAt.getTime() + WINDOW_MS;
  const latest = recent[0];
  if (latest) until = Math.max(until, latest.createdAt.getTime() + RESEND_COOLDOWN_MS);
  if (until <= now) return null;
  const codeStillValid = !!latest && !latest.usedAt && latest.expiresAt.getTime() > now && latest.attempts < MAX_ATTEMPTS;
  return { retryAfter: Math.ceil((until - now) / 1000), codeStillValid };
}

/** Why no code was sent: logged (Vercel runtime logs) and told to the caller. */
function refused(status: Exclude<CodeRequestStatus, "sent" | "wait">, reason: string): CodeRequestResult {
  console.warn(`[client-otp] no code sent (${status}): ${reason}`);
  return { status };
}

/**
 * An email that no client has: a staff address, a worker's or ambassador's, or nobody's.
 * "team" only when the team page will recognise it too (a worker/ambassador record or a
 * pending application), never for a bare leftover login, so the two pages never send
 * someone back and forth.
 */
async function classifyNonClientEmail(email: string): Promise<CodeRequestResult> {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (user?.role === "SUPER_ADMIN" || user?.role === "OPS_MANAGER") return refused("unavailable", "that email belongs to a staff login");
  const match = { email: { equals: email, mode: "insensitive" as const } };
  const pending = { status: "PENDING" as const, OR: [match, ...(user ? [{ userId: user.id }] : [])] };
  const [workers, ambassadors, workerApps, ambassadorApps] = await Promise.all([
    db.worker.count({ where: match }),
    db.ambassador.count({ where: match }),
    db.workerApplication.count({ where: pending }),
    db.ambassadorApplication.count({ where: pending }),
  ]);
  if (workers || ambassadors || workerApps || ambassadorApps) return refused("team", "that email is on a worker/ambassador record or application");
  return refused("not_registered", "no client has that email");
}

interface ClientCodeRequest {
  identifierInput: string;
  ip: string;
  send: SendFn;
  /** Runs the (slow) email send after the response, e.g. `waitUntil`. */
  defer: (work: Promise<unknown>) => void;
}

export async function requestCode(opts: ClientCodeRequest): Promise<RequestCodeResult> {
  if (await ipLimited(opts.ip, "request")) return { status: "limited" };
  return sendClientCode(opts);
}

/**
 * Everything after the per-IP check. Also used by the forgot-password page
 * (portal-otp.ts) when the email or ID it was given turns out to be a client's;
 * that page has already counted the request against its own IP cap.
 */
export async function sendClientCode(opts: ClientCodeRequest): Promise<CodeRequestResult> {
  const identifier = readIdentifier(opts.identifierInput);
  if (!identifier) return refused("invalid", "not a Client ID or an email");

  const client = await findClient(identifier);
  if (!client) {
    return identifier.kind === "id" ? refused("not_registered", "no client has that Client ID") : classifyNonClientEmail(identifier.email);
  }
  const email = realEmail(client.email);
  if (!email) return refused("no_email", "the client has no usable email on record");

  // One login per person: a client whose email is also their worker or ambassador
  // login signs in to that same login (the code proves the inbox). A staff address
  // is never a client's: an admin has to give the client another email.
  const owner = await db.user.findUnique({ where: { email }, select: { role: true, isActive: true } });
  if (owner && isStaffRole(owner.role)) return refused("needs_admin", "that client email belongs to a staff login");
  if (owner && !isPersonRole(owner.role)) return refused("needs_admin", "that client email belongs to a login of an unknown kind");
  // A switched-off client login can never be signed into (resolveClientUser refuses it), so don't send a dead code.
  if (owner && !owner.isActive) return refused("inactive", "the client login is switched off");

  const sentTo = identifier.kind === "email" ? email : maskEmail(email);

  const now = Date.now();
  const recent = await db.clientLoginCode.findMany({
    where: { clientId: client.id, createdAt: { gte: new Date(now - WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, usedAt: true, expiresAt: true, attempts: true },
  });
  const wait = waitBeforeNewCode(recent, now);
  if (wait) return { status: "wait", sentTo, ...wait };

  // A new code cancels every earlier one.
  await db.clientLoginCode.updateMany({
    where: { clientId: client.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.clientLoginCode.create({
    data: {
      clientId: client.id,
      codeHash: hashCode(client.id, code),
      expiresAt: new Date(now + CODE_TTL_MS),
      ipHash: hashIp(opts.ip),
    },
  });

  // Development only: the mail is off in tests, so print the code. `NODE_ENV`
  // is inlined at build time, so this branch does not exist in a production bundle.
  if (process.env.NODE_ENV === "development") {
    console.log(`[client-otp:dev] ${client.clientId} = ${code}`);
  }

  const mail = clientCodeEmail({ fullName: client.fullName, code, minutes: CODE_TTL_MS / 60_000 });
  opts.defer(
    opts.send({ to: email, ...mail }).then((res) => {
      if (!res.ok) console.error("[client-otp] email failed:", res.error);
    })
  );
  return { status: "sent", sentTo };
}

// ── Verify a code ────────────────────────────────────────────

export interface VerifiedClient {
  userId: string;
  email: string;
  name: string;
  /** The login's own role (a client may sign in to their worker or ambassador login). */
  role: string;
}

/**
 * Returns the signed-in user, or null for ANY failure (unknown ID or email, no
 * email on the client, wrong/expired/used code, locked, rate limited). The
 * reason is never revealed.
 */
export async function verifyCode(opts: {
  identifierInput: string;
  code: string;
  ip: string;
}): Promise<VerifiedClient | null> {
  if (await ipLimited(opts.ip, "verify")) return null;

  const identifier = readIdentifier(opts.identifierInput);
  const code = (opts.code ?? "").trim();
  if (!identifier || !/^\d{6}$/.test(code)) return null;

  const client = await findClient(identifier);
  const email = realEmail(client?.email);
  if (!client || !email) return null;

  const row = await db.clientLoginCode.findFirst({
    where: { clientId: client.id, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;

  // Count the try first (atomically, and only while under the limit) so that
  // parallel guesses cannot exceed MAX_ATTEMPTS.
  const counted = await db.clientLoginCode.updateMany({
    where: { id: row.id, usedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count !== 1) return null;
  if (!safeEqual(row.codeHash, hashCode(client.id, code))) return null;

  // Single use: only one caller can flip usedAt.
  const used = await db.clientLoginCode.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (used.count !== 1) return null;

  return resolveClientUser({ email, fullName: client.fullName });
}

/**
 * Attaches every Client row carrying this email to the login, so the person
 * sees all their projects (older rows from before one-ID-per-person, and any an
 * admin created). Never takes a row that already belongs to another login.
 */
async function linkClientRows(userId: string, email: string): Promise<void> {
  await db.client.updateMany({
    where: { email: { equals: email, mode: "insensitive" }, OR: [{ userId: null }, { userId }] },
    data: { userId },
  });
}

/**
 * The User behind an email that has just proven ownership. A person who is
 * already a worker or ambassador keeps their one login (their orders join it);
 * anyone else gets a client login, created with an unusable password. Either
 * way the email is now proved and every Client row with it is linked.
 */
async function resolveClientUser(input: { email: string; fullName: string }): Promise<VerifiedClient | null> {
  const { email } = input;
  let user = await db.user.findUnique({ where: { email } });
  if (user && !isPersonRole(user.role)) return null;
  if (user && !user.isActive) return null;

  if (!user) {
    try {
      user = await db.user.create({
        data: {
          email,
          displayName: input.fullName,
          // Nobody knows this: clients sign in with codes, never a password.
          passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10),
          role: "CLIENT",
          isActive: true,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      user = await db.user.findUnique({ where: { email } });
      if (!user || !isPersonRole(user.role) || !user.isActive) return null;
    }
  }

  await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  await linkClientRows(user.id, email);

  return { userId: user.id, email: user.email, name: user.displayName ?? input.fullName, role: user.role };
}

/** The Client rows a signed-in client owns. Every client-portal query must filter by these. */
export async function clientIdsForUser(userId: string): Promise<string[]> {
  const rows = await db.client.findMany({ where: { userId }, select: { id: true } });
  return rows.map((r) => r.id);
}

// ── Password (set once with a code, then sign in with ID or email + password) ──

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt ignores anything longer
const MAX_PASSWORD_FAILURES = 10;

/**
 * First-time setup and "forgot password": proves control of the client's email
 * with a code, then stores the chosen password. The code is only spent when the
 * password is acceptable. Returns null for ANY failure. The password is hashed
 * and never emailed or logged.
 */
export async function setPasswordWithCode(opts: {
  identifierInput: string;
  code: string;
  password: string;
  ip: string;
}): Promise<VerifiedClient | null> {
  if (opts.password.length < PASSWORD_MIN || opts.password.length > PASSWORD_MAX) return null;
  const verified = await verifyCode(opts);
  if (!verified) return null;
  await db.user.update({
    where: { id: verified.userId },
    data: { passwordHash: await bcrypt.hash(opts.password, 10) },
  });
  return verified;
}

// A real hash to compare against when the ID is unknown, so timing does not reveal it.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

/**
 * Client ID (or email) + password sign-in. Fails identically for an unknown ID
 * or email, no password set yet, or a wrong password. Wrong guesses are limited
 * per IP and per account (10 failures per 15 minutes, then the account waits
 * it out), however the account was named.
 */
export async function verifyPassword(opts: {
  identifierInput: string;
  password: string;
  ip: string;
}): Promise<VerifiedClient | null> {
  if (await ipLimited(opts.ip, "verify")) return null;

  const identifier = readIdentifier(opts.identifierInput);
  const password = opts.password ?? "";
  if (!identifier || !password || password.length > PASSWORD_MAX) return null;

  const client = await findClient(identifier);
  const email = realEmail(client?.email);

  // The login behind the client: its own link, else the CLIENT login with the
  // same email (a record that was never linked, e.g. one an admin created).
  let user = client?.user ?? null;
  if (!user && email) {
    user = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true, displayName: true, role: true, isActive: true, passwordHash: true, emailVerifiedAt: true },
    });
  }

  const acctKey = hashIp(`acct:${client?.id ?? (identifier.kind === "id" ? identifier.clientId : identifier.email)}`);
  const failures = await db.clientLoginAttempt.count({
    where: { ipHash: acctKey, kind: "password-fail", createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
  });

  // Any person's login (a client may be signing in to their worker or ambassador
  // login with their Client ID); never a staff login.
  const usable = user && isPersonRole(user.role) && user.isActive;
  const hash = usable ? user!.passwordHash : DUMMY_HASH;
  const valid = await bcrypt.compare(password, hash);

  if (failures >= MAX_PASSWORD_FAILURES) return null;
  if (!client || !user || !usable || hash === DUMMY_HASH || !valid || !email) {
    await db.clientLoginAttempt.create({ data: { ipHash: acctKey, kind: "password-fail" } });
    return null;
  }

  // Orders join a login only once its inbox is proved (client logins always are).
  if (user.role === "CLIENT" || user.emailVerifiedAt) await linkClientRows(user.id, user.email);
  return { userId: user.id, email: user.email, name: user.displayName ?? client.fullName, role: user.role };
}
