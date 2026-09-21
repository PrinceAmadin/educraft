import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { clientCodeEmail } from "@/lib/emails/client-code";
import type { MailResult } from "@/lib/mailer";
import { realEmail } from "@/lib/client-email";

/**
 * Client sign-in: Client ID + a one-time code emailed to the address stored on
 * that client.
 *
 *   Client ID  = "which client are you?"   (guessable, proves nothing)
 *   the code   = "prove you control that client's email"
 *
 * Rules that make it safe:
 *  - The code is only ever sent to the email ALREADY on the client, never to
 *    an address the visitor supplies.
 *  - Every ID gets the same response and the same work, so the form cannot be
 *    used to discover which IDs exist. Email delivery is deferred so timing
 *    does not give it away either.
 *  - Codes are 6 digits, stored only as an HMAC, valid 10 minutes, single use,
 *    superseded by a newer code, and locked after 5 wrong tries.
 *  - Per-client (60 s cooldown, 3 per 15 min) and per-IP limits apply whether
 *    or not the ID exists.
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
export const hashCode = (clientId: string, code: string) => mac("client-login-code", `${clientId}:${code}`);
export const hashIp = (ip: string) => mac("client-login-ip", ip);

/** "ec-c-00124 " -> "EC-C-00124"; anything that is not a Client ID -> null. */
export function normalizeClientId(input: string | null | undefined): string | null {
  const id = (input ?? "").trim().toUpperCase();
  return /^EC-C-\d{3,8}$/.test(id) ? id : null;
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

export interface RequestCodeResult {
  /** True when the caller's IP is over its cap: the only case that is not the generic answer. */
  limited: boolean;
}

export async function requestCode(opts: {
  clientIdInput: string;
  ip: string;
  send: SendFn;
  /** Runs the (slow) email send after the response, e.g. `waitUntil`. */
  defer: (work: Promise<unknown>) => void;
}): Promise<RequestCodeResult> {
  if (await ipLimited(opts.ip, "request")) return { limited: true };

  const clientId = normalizeClientId(opts.clientIdInput);
  if (!clientId) return { limited: false };

  const client = await db.client.findUnique({
    where: { clientId },
    select: { id: true, fullName: true, email: true },
  });
  const email = realEmail(client?.email);
  if (!client || !email) {
    console.warn("[client-otp] no code sent: unknown Client ID or no usable email on the client");
    return { limited: false };
  }

  // An address that belongs to an admin, worker or ambassador account is never a
  // client sign-in address: refuse quietly rather than mix the two.
  const owner = await db.user.findUnique({ where: { email }, select: { role: true } });
  if (owner && owner.role !== "CLIENT") {
    console.warn("[client-otp] no code sent: that client email belongs to a non-client login");
    return { limited: false };
  }

  const now = Date.now();
  const recent = await db.clientLoginCode.findMany({
    where: { clientId: client.id, createdAt: { gte: new Date(now - WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recent.length >= MAX_CODES_PER_WINDOW) return { limited: false };
  if (recent[0] && now - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS) return { limited: false };

  // A new code cancels every earlier one.
  await db.clientLoginCode.updateMany({
    where: { clientId: client.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.clientLoginCode.create({
    data: {
      clientId: client.id,
      codeHash: hashCode(clientId, code),
      expiresAt: new Date(now + CODE_TTL_MS),
      ipHash: hashIp(opts.ip),
    },
  });

  // Development only: the mail is off in tests, so print the code. `NODE_ENV`
  // is inlined at build time, so this branch does not exist in a production bundle.
  if (process.env.NODE_ENV === "development") {
    console.log(`[client-otp:dev] ${clientId} = ${code}`);
  }

  const mail = clientCodeEmail({ fullName: client.fullName, code, minutes: CODE_TTL_MS / 60_000 });
  opts.defer(
    opts.send({ to: email, ...mail }).then((res) => {
      if (!res.ok) console.error("[client-otp] email failed:", res.error);
    })
  );
  return { limited: false };
}

// ── Verify a code ────────────────────────────────────────────

export interface VerifiedClient {
  userId: string;
  email: string;
  name: string;
}

/**
 * Returns the signed-in user, or null for ANY failure (unknown ID, no email,
 * wrong/expired/used code, locked, rate limited). The reason is never revealed.
 */
export async function verifyCode(opts: {
  clientIdInput: string;
  code: string;
  ip: string;
}): Promise<VerifiedClient | null> {
  if (await ipLimited(opts.ip, "verify")) return null;

  const clientId = normalizeClientId(opts.clientIdInput);
  const code = (opts.code ?? "").trim();
  if (!clientId || !/^\d{6}$/.test(code)) return null;

  const client = await db.client.findUnique({
    where: { clientId },
    select: { id: true, fullName: true, email: true },
  });
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
  if (!safeEqual(row.codeHash, hashCode(clientId, code))) return null;

  // Single use: only one caller can flip usedAt.
  const used = await db.clientLoginCode.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (used.count !== 1) return null;

  return resolveClientUser({ email, fullName: client.fullName });
}

/**
 * The User behind an email that has just proven ownership. Created on first
 * sign-in with an unusable password, and every Client row with the same email
 * (intake makes a new one each time) is linked to it, so signing in with any of
 * a person's IDs shows all their projects.
 */
async function resolveClientUser(input: { email: string; fullName: string }): Promise<VerifiedClient | null> {
  const { email } = input;
  let user = await db.user.findUnique({ where: { email } });
  if (user && user.role !== "CLIENT") return null;
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
      if (!user || user.role !== "CLIENT") return null;
    }
  }

  await db.client.updateMany({
    where: { email: { equals: email, mode: "insensitive" }, OR: [{ userId: null }, { userId: user.id }] },
    data: { userId: user.id },
  });

  return { userId: user.id, email: user.email, name: user.displayName ?? input.fullName };
}

/** The Client rows a signed-in client owns. Every client-portal query must filter by these. */
export async function clientIdsForUser(userId: string): Promise<string[]> {
  const rows = await db.client.findMany({ where: { userId }, select: { id: true } });
  return rows.map((r) => r.id);
}

// ── Password (set once with a code, then sign in with ID + password) ──

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
  clientIdInput: string;
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
 * Client ID + password sign-in. Fails identically for an unknown ID, no password
 * set yet, or a wrong password. Wrong guesses are limited per IP and per account
 * (10 failures per 15 minutes, then the account waits it out).
 */
export async function verifyPassword(opts: {
  clientIdInput: string;
  password: string;
  ip: string;
}): Promise<VerifiedClient | null> {
  if (await ipLimited(opts.ip, "verify")) return null;

  const clientId = normalizeClientId(opts.clientIdInput);
  const password = opts.password ?? "";
  if (!clientId || !password || password.length > PASSWORD_MAX) return null;

  const acctKey = hashIp(`acct:${clientId}`);
  const failures = await db.clientLoginAttempt.count({
    where: { ipHash: acctKey, kind: "password-fail", createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
  });

  const client = await db.client.findUnique({
    where: { clientId },
    select: { fullName: true, email: true, user: true },
  });
  const user = client?.user ?? null;
  const hash = user && user.role === "CLIENT" && user.isActive ? user.passwordHash : DUMMY_HASH;
  const valid = await bcrypt.compare(password, hash);

  if (failures >= MAX_PASSWORD_FAILURES) return null;
  if (!client || !user || hash === DUMMY_HASH || !valid || !realEmail(client.email)) {
    await db.clientLoginAttempt.create({ data: { ipHash: acctKey, kind: "password-fail" } });
    return null;
  }
  return { userId: user.id, email: user.email, name: user.displayName ?? client.fullName };
}
