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
 * Password setup for EXISTING ambassadors (registered before /apply asked for a
 * login). Same rules as the client flow: the code goes only to the email already
 * on the ambassador's record, every answer is identical whether or not the
 * ambassador exists, codes are hashed, single use, 10 minutes, 5 tries, and
 * rate limited per ambassador and per IP. After a valid code the password is
 * saved (creating the login on first setup) and they sign in at /login.
 */

const IP_REQUEST_CAP = 10;
const IP_VERIFY_CAP = 25;

function secret(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set, cannot sign ambassador login codes.");
  return s;
}

const hashCode = (ambassadorId: string, code: string) =>
  createHmac("sha256", secret()).update(`ambassador-login-code:${ambassadorId}:${code}`).digest("hex");

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function ipLimited(ip: string, kind: "amb-request" | "amb-verify"): Promise<boolean> {
  const ipHash = hashIp(ip);
  await db.clientLoginAttempt.create({ data: { ipHash, kind } });
  const count = await db.clientLoginAttempt.count({
    where: { ipHash, kind, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
  });
  return count > (kind === "amb-request" ? IP_REQUEST_CAP : IP_VERIFY_CAP);
}

/** An active ambassador with a usable email, found by Ambassador ID (EC-A-00012) or by email. */
async function findAmbassador(input: string) {
  const value = (input ?? "").trim();
  const select = { id: true, fullName: true, email: true, status: true, userId: true } as const;
  let row;
  if (/^EC-A-\d{3,8}$/i.test(value)) {
    row = await db.ambassador.findUnique({ where: { ambassadorId: value.toUpperCase() }, select });
  } else {
    const email = realEmail(value);
    if (!email) return null;
    const rows = await db.ambassador.findMany({ where: { email: { equals: email, mode: "insensitive" } }, select, take: 2 });
    row = rows.length === 1 ? rows[0] : null; // two records on one email: they must use the ID
  }
  const email = realEmail(row?.email);
  if (!row || !email || row.status !== "Active") return null;
  return { ...row, email };
}

export async function requestAmbassadorCode(opts: {
  identifier: string;
  ip: string;
  send: SendFn;
  defer: (work: Promise<unknown>) => void;
}): Promise<{ limited: boolean }> {
  if (await ipLimited(opts.ip, "amb-request")) return { limited: true };

  const amb = await findAmbassador(opts.identifier);
  if (!amb) return { limited: false };

  // An email that already belongs to a non-ambassador account is never used here.
  const owner = await db.user.findUnique({ where: { email: amb.email }, select: { id: true, role: true } });
  if (owner && (owner.role !== "AMBASSADOR" || (amb.userId && owner.id !== amb.userId))) return { limited: false };

  const now = Date.now();
  const recent = await db.ambassadorLoginCode.findMany({
    where: { ambassadorId: amb.id, createdAt: { gte: new Date(now - WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recent.length >= MAX_CODES_PER_WINDOW) return { limited: false };
  if (recent[0] && now - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS) return { limited: false };

  await db.ambassadorLoginCode.updateMany({ where: { ambassadorId: amb.id, usedAt: null }, data: { usedAt: new Date() } });

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.ambassadorLoginCode.create({
    data: { ambassadorId: amb.id, codeHash: hashCode(amb.id, code), expiresAt: new Date(now + CODE_TTL_MS), ipHash: hashIp(opts.ip) },
  });
  if (process.env.NODE_ENV === "development") console.log(`[ambassador-otp:dev] ${amb.email} = ${code}`);

  const mail = clientCodeEmail({ fullName: amb.fullName, code, minutes: CODE_TTL_MS / 60_000 });
  opts.defer(
    opts.send({ to: amb.email, ...mail }).then((res) => {
      if (!res.ok) console.error("[ambassador-otp] email failed:", res.error);
    })
  );
  return { limited: false };
}

/** Verifies the code, then stores the password (creating the login if they never had one). Any failure is just false. */
export async function setAmbassadorPasswordWithCode(opts: {
  identifier: string;
  code: string;
  password: string;
  ip: string;
}): Promise<boolean> {
  if (opts.password.length < PASSWORD_MIN || opts.password.length > PASSWORD_MAX) return false;
  if (await ipLimited(opts.ip, "amb-verify")) return false;
  const code = (opts.code ?? "").trim();
  if (!/^\d{6}$/.test(code)) return false;

  const amb = await findAmbassador(opts.identifier);
  if (!amb) return false;

  const row = await db.ambassadorLoginCode.findFirst({
    where: { ambassadorId: amb.id, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return false;

  // Count the try first, atomically, so parallel guesses cannot exceed the limit.
  const counted = await db.ambassadorLoginCode.updateMany({
    where: { id: row.id, usedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count !== 1 || !safeEqual(row.codeHash, hashCode(amb.id, code))) return false;

  const used = await db.ambassadorLoginCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count !== 1) return false;

  const passwordHash = await bcrypt.hash(opts.password, 12);
  try {
    if (amb.userId) {
      const user = await db.user.findUnique({ where: { id: amb.userId }, select: { role: true, isActive: true } });
      if (!user || user.role !== "AMBASSADOR" || !user.isActive) return false;
      await db.user.update({ where: { id: amb.userId }, data: { passwordHash } });
      return true;
    }
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: amb.email, displayName: amb.fullName, passwordHash, role: "AMBASSADOR", isActive: true },
        select: { id: true },
      });
      await tx.ambassador.update({ where: { id: amb.id }, data: { userId: user.id } });
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}
