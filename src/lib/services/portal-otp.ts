import { createHmac, randomInt, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { clientCodeEmail } from "@/lib/emails/client-code";
import { realEmail } from "@/lib/client-email";
import {
  hashIp,
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  MAX_CODES_PER_WINDOW,
  WINDOW_MS,
  PASSWORD_MIN,
  PASSWORD_MAX,
  type SendFn,
} from "@/lib/services/client-otp";

/**
 * Password setup / reset for workers and ambassadors, on ONE login per person.
 *
 * A person is identified by the email on their Worker / Ambassador record, and
 * ownership of that inbox is proven with a code (same rules as client sign-in:
 * the code goes only to the address already on file, every answer is identical
 * whether or not the account exists, codes are hashed, single use, 10 minutes,
 * 5 tries, rate limited per email and per IP).
 *
 * A valid code sets the password of the single User behind that email. If a
 * worker also has an ambassador record on the same email (or the reverse), both
 * profiles end up on that one User, which is what puts both dashboards behind
 * one sign-in. A profile already on a different login is never moved.
 */

const IP_REQUEST_CAP = 10;
const IP_VERIFY_CAP = 25;

function secret(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set, cannot sign login codes.");
  return s;
}

const hashCode = (email: string, code: string) =>
  createHmac("sha256", secret()).update(`portal-login-code:${email}:${code}`).digest("hex");

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function ipLimited(ip: string, kind: "portal-request" | "portal-verify"): Promise<boolean> {
  const ipHash = hashIp(ip);
  await db.clientLoginAttempt.create({ data: { ipHash, kind } });
  const count = await db.clientLoginAttempt.count({
    where: { ipHash, kind, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
  });
  return count > (kind === "portal-request" ? IP_REQUEST_CAP : IP_VERIFY_CAP);
}

interface PortalAccount {
  email: string;
  fullName: string;
  user: { id: string } | null;
  workerId: string | null;
  ambassadorId: string | null;
}

/** The single row, or null when there is none or it is ambiguous (two records on one email). */
function only<T>(rows: T[]): T | null {
  return rows.length === 1 ? rows[0] : null;
}

/**
 * Who is behind an email or an EC-A-/EC-W- ID: their login (if any) and their
 * worker / ambassador profiles that may be signed into it. Null when nobody
 * qualifies (unknown, suspended, staff/client email, profile on another login).
 */
async function findAccount(input: string): Promise<PortalAccount | null> {
  const value = (input ?? "").trim();

  let email: string | null = null;
  if (/^EC-A-\d{3,8}$/i.test(value)) {
    const row = await db.ambassador.findUnique({ where: { ambassadorId: value.toUpperCase() }, select: { email: true } });
    email = realEmail(row?.email);
  } else if (/^EC-W-\d{3,8}$/i.test(value)) {
    const row = await db.worker.findUnique({ where: { workerId: value.toUpperCase() }, select: { email: true } });
    email = realEmail(row?.email);
  } else {
    email = realEmail(value);
  }
  if (!email) return null;

  const [user, workers, ambassadors] = await Promise.all([
    db.user.findUnique({ where: { email }, select: { id: true, role: true, isActive: true, displayName: true } }),
    db.worker.findMany({
      where: { email: { equals: email, mode: "insensitive" }, status: { in: ["Active", "On Break"] } },
      select: { id: true, fullName: true, userId: true },
      take: 2,
    }),
    db.ambassador.findMany({
      where: { email: { equals: email, mode: "insensitive" }, status: "Active" },
      select: { id: true, fullName: true, userId: true },
      take: 2,
    }),
  ]);

  // Staff and client emails never sign in through here; an inactive login is a pending applicant or a suspension.
  if (user && (!user.isActive || (user.role !== "WORKER" && user.role !== "AMBASSADOR"))) return null;

  // A profile already on a different login is left alone.
  const usable = <T extends { userId: string | null }>(row: T | null) =>
    row && (row.userId === null || row.userId === user?.id) ? row : null;
  const worker = usable(only(workers));
  const ambassador = usable(only(ambassadors));
  if (!worker && !ambassador) return null;

  return {
    email,
    fullName: worker?.fullName ?? ambassador?.fullName ?? user?.displayName ?? "there",
    user: user ? { id: user.id } : null,
    workerId: worker?.id ?? null,
    ambassadorId: ambassador?.id ?? null,
  };
}

export async function requestPortalCode(opts: {
  identifier: string;
  ip: string;
  send: SendFn;
  defer: (work: Promise<unknown>) => void;
}): Promise<{ limited: boolean }> {
  if (await ipLimited(opts.ip, "portal-request")) return { limited: true };

  const account = await findAccount(opts.identifier);
  if (!account) return { limited: false };
  await issueCode({ email: account.email, fullName: account.fullName, ip: opts.ip, send: opts.send, defer: opts.defer });
  return { limited: false };
}

/** Creates and emails a code to `email` (which must already be a trusted address on file). Silent when cooling down or over the per-email cap. */
async function issueCode(opts: {
  email: string;
  fullName: string;
  ip: string;
  send: SendFn;
  defer: (work: Promise<unknown>) => void;
  purpose?: string;
}): Promise<void> {
  const { email } = opts;
  const now = Date.now();
  const recent = await db.portalLoginCode.findMany({
    where: { email, createdAt: { gte: new Date(now - WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recent.length >= MAX_CODES_PER_WINDOW) return;
  if (recent[0] && now - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS) return;

  await db.portalLoginCode.updateMany({ where: { email, usedAt: null }, data: { usedAt: new Date() } });

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.portalLoginCode.create({
    data: { email, codeHash: hashCode(email, code), expiresAt: new Date(now + CODE_TTL_MS), ipHash: hashIp(opts.ip) },
  });
  if (process.env.NODE_ENV === "development") console.log(`[portal-otp:dev] ${email} = ${code}`);

  const mail = clientCodeEmail({ fullName: opts.fullName, code, minutes: CODE_TTL_MS / 60_000, purpose: opts.purpose });
  opts.defer(
    opts.send({ to: email, ...mail }).then((res) => {
      if (!res.ok) console.error("[portal-otp] email failed:", res.error);
    })
  );
}

/** Spends a valid, unexpired code for `email`: counts the try atomically, single use. False for any failure. */
async function spendCode(email: string, codeInput: string, ip: string): Promise<boolean> {
  if (await ipLimited(ip, "portal-verify")) return false;
  const code = (codeInput ?? "").trim();
  if (!/^\d{6}$/.test(code)) return false;

  const row = await db.portalLoginCode.findFirst({
    where: { email, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return false;

  const counted = await db.portalLoginCode.updateMany({
    where: { id: row.id, usedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count !== 1 || !safeEqual(row.codeHash, hashCode(email, code))) return false;

  const used = await db.portalLoginCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  return used.count === 1;
}

/**
 * Applying for the OTHER role with an email that already has a login: a worker
 * applying as an ambassador, or an ambassador applying as a worker. Returns that
 * login when it is active and holds only the other profile; the application then
 * attaches to it (no new password, no second login) once the emailed code proves
 * the applicant owns the inbox.
 */
export async function findLoginForApplication(email: string, kind: "AMBASSADOR" | "WORKER"): Promise<{ userId: string; fullName: string } | null> {
  const address = realEmail(email);
  if (!address) return null;
  const user = await db.user.findUnique({
    where: { email: address },
    select: {
      id: true,
      role: true,
      isActive: true,
      displayName: true,
      workerProfile: { select: { fullName: true, status: true } },
      ambassadorProfile: { select: { fullName: true, status: true } },
    },
  });
  if (!user || !user.isActive || (user.role !== "WORKER" && user.role !== "AMBASSADOR")) return null;
  const has = kind === "AMBASSADOR" ? user.workerProfile : user.ambassadorProfile;
  const already = kind === "AMBASSADOR" ? user.ambassadorProfile : user.workerProfile;
  if (!has || already || !["Active", "On Break"].includes(has.status)) return null;
  return { userId: user.id, fullName: has.fullName ?? user.displayName ?? "there" };
}

/** Emails the proof-of-inbox code for an application to an existing login. */
export function sendApplicationCode(opts: { email: string; fullName: string; ip: string; send: SendFn; defer: (work: Promise<unknown>) => void }): Promise<void> {
  return issueCode({ ...opts, email: opts.email.trim().toLowerCase(), purpose: "Enter this code to confirm your email for your EduCraft application. Your current password stays the same." });
}

/** True when `code` is the live code for this email; spends it. */
export const verifyApplicationCode = (email: string, code: string, ip: string) => spendCode(email.trim().toLowerCase(), code, ip);

/** Verifies the code, then stores the password on the person's one login (creating it if needed) and links their profiles to it. Any failure is just false. */
export async function setPortalPasswordWithCode(opts: {
  identifier: string;
  code: string;
  password: string;
  ip: string;
}): Promise<boolean> {
  if (opts.password.length < PASSWORD_MIN || opts.password.length > PASSWORD_MAX) return false;
  const account = await findAccount(opts.identifier);
  if (!account) return false;
  const { email } = account;
  if (!(await spendCode(email, opts.code, opts.ip))) return false;

  const passwordHash = await bcrypt.hash(opts.password, 12);
  try {
    await db.$transaction(async (tx) => {
      let userId = account.user?.id;
      if (userId) {
        await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      } else {
        const created = await tx.user.create({
          data: {
            email,
            displayName: account.fullName,
            passwordHash,
            role: account.workerId ? "WORKER" : "AMBASSADOR",
            isActive: true,
          },
          select: { id: true },
        });
        userId = created.id;
      }
      // Only profiles not yet on a login are attached; one already on this login stays as it is.
      if (account.workerId) await tx.worker.updateMany({ where: { id: account.workerId, userId: null }, data: { userId } });
      if (account.ambassadorId) await tx.ambassador.updateMany({ where: { id: account.ambassadorId, userId: null }, data: { userId } });
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}
