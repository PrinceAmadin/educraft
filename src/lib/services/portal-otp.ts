import { createHmac, randomInt, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { clientCodeEmail } from "@/lib/emails/client-code";
import { realEmail } from "@/lib/client-email";
import { normalizeClientIdInput, normalizeWorkerIdInput } from "@/lib/id-format";
import { maskEmail, type CodeRequestResult, type CodeRequestStatus } from "@/lib/code-request";
import { isPersonRole } from "@/lib/roles";
import { linkClientOrders } from "@/lib/services/account-links";
import {
  hashIp,
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  WINDOW_MS,
  PASSWORD_MIN,
  PASSWORD_MAX,
  sendClientCode,
  waitBeforeNewCode,
  type RequestCodeResult,
  type SendFn,
} from "@/lib/services/client-otp";

/**
 * Password setup / reset for workers and ambassadors, on ONE login per person.
 *
 * A person is identified by the email on their Worker / Ambassador record, and
 * ownership of that inbox is proven with a code (same rules as client sign-in:
 * the code goes only to the address already on file, codes are hashed, single
 * use, 10 minutes, 5 tries, rate limited per email and per IP).
 *
 * /login/set-password is the forgot-password page for all three kinds of login:
 * it works out whether the email or ID is a worker's, an ambassador's or a
 * client's. A client's gets a client code (`sendClientCode`) and the form then
 * saves a client password. Anything else is told plainly (not registered, an
 * application under review, a suspended account…): the founder's call, Sept
 * 2026, see `src/lib/code-request.ts`. The per-IP cap is what stops that being
 * used to test long lists of addresses.
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
  /** Where the code goes: the email on the worker / ambassador record. */
  email: string;
  /** The email they sign in with: always the same inbox the code went to. */
  loginEmail: string;
  fullName: string;
  /** Their existing login, or null when one has to be created. */
  userId: string | null;
  /** An inactive leftover login (a rejected application) being reused: reactivate it. */
  reclaim: boolean;
  workerId: string | null;
  ambassadorId: string | null;
}

type Refusal = Exclude<CodeRequestStatus, "sent" | "wait">;

type Lookup =
  | { ok: true; account: PortalAccount; typedEmail: boolean }
  | { ok: false; status: Refusal }
  /** Not a worker or ambassador, but a client has this email: send a client code instead. */
  | { ok: false; status: "client"; email: string };

/** Why no code was sent: logged (Vercel runtime logs) and told to the caller as `status`. */
function refuse(status: Refusal, reason: string): Lookup {
  console.warn(`[portal-otp] no code sent (${status}): ${reason}`);
  return { ok: false, status };
}

const sameEmail = (email: string) => ({ email: { equals: email, mode: "insensitive" as const } });

/**
 * Who is behind an email or an EC-A-/ECW- ID. The PROFILES decide: the worker
 * and ambassador records that carry this email, and the one login they already
 * sit on (a person's worker login may use a different email than the record).
 * Otherwise says why nobody qualifies (unknown, suspended, pending, a client's
 * or staff email, records on two different logins).
 */
async function lookupAccount(input: string): Promise<Lookup> {
  const value = (input ?? "").trim();

  let email: string | null = null;
  let typedEmail = false;
  if (/^EC-A-\d{3,8}$/i.test(value)) {
    const row = await db.ambassador.findUnique({ where: { ambassadorId: value.toUpperCase() }, select: { email: true } });
    if (!row) return refuse("not_registered", "no ambassador has that ID");
    email = realEmail(row.email);
    if (!email) return refuse("no_email", "the ambassador record has no usable email");
  } else if (normalizeWorkerIdInput(value)) {
    const row = await db.worker.findUnique({ where: { workerId: normalizeWorkerIdInput(value)! }, select: { email: true } });
    if (!row) return refuse("not_registered", "no worker has that ID");
    email = realEmail(row.email);
    if (!email) return refuse("no_email", "the worker record has no usable email");
  } else {
    email = realEmail(value);
    if (!email) return refuse("invalid", "not an email or a worker/ambassador ID");
    typedEmail = true;
  }

  const [workers, ambassadors] = await Promise.all([
    db.worker.findMany({
      where: { ...sameEmail(email), status: { in: ["Active", "On Break"] } },
      select: { id: true, fullName: true, userId: true },
      take: 2,
    }),
    db.ambassador.findMany({
      where: { ...sameEmail(email), status: "Active" },
      select: { id: true, fullName: true, userId: true },
      take: 2,
    }),
  ]);
  if (workers.length > 1 || ambassadors.length > 1) return refuse("needs_admin", "two active worker or ambassador records share that email");
  const worker = workers[0] ?? null;
  const ambassador = ambassadors[0] ?? null;
  if (!worker && !ambassador) return classifyNoActiveProfile(email);

  const fullName = worker?.fullName ?? ambassador?.fullName ?? "there";
  const linked = Array.from(new Set([worker?.userId, ambassador?.userId].filter((id): id is string => Boolean(id))));
  if (linked.length > 1) return refuse("needs_admin", "worker and ambassador records sit on two different logins");

  const base = { email, fullName, workerId: worker?.id ?? null, ambassadorId: ambassador?.id ?? null };
  const found = (account: PortalAccount): Lookup => ({ ok: true, account, typedEmail });

  // 1. A record is already on a login: that is their login, whatever its email.
  if (linked.length === 1) {
    const login = await db.user.findUnique({ where: { id: linked[0] }, select: { id: true, email: true, role: true, isActive: true } });
    if (!login || !login.isActive || !isPersonRole(login.role)) {
      return refuse("needs_admin", "the login their record is on is inactive or a staff login");
    }
    // The code only proves the inbox it was sent to. Never let it set the password of a
    // login under a different email: an admin has to align the record and the login first.
    if (login.email.toLowerCase() !== email) {
      return refuse("needs_admin", "their record's email differs from the email of the login it is linked to (admin must align them)");
    }
    return found({ ...base, loginEmail: login.email, userId: login.id, reclaim: false });
  }

  // 2. Neither record has a login yet: use the login with this email if there is one.
  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      isActive: true,
      workerProfile: { select: { id: true } },
      ambassadorProfile: { select: { id: true } },
    },
  });
  if (!user) return found({ ...base, loginEmail: email, userId: null, reclaim: false });
  // A client login with this email is the same person: their worker/ambassador
  // record joins it (one login). Staff logins never take a profile.
  if (!isPersonRole(user.role)) return refuse("needs_admin", "that email belongs to a staff login");
  if (user.isActive) {
    if (user.workerProfile || user.ambassadorProfile) return refuse("needs_admin", "that email's login already owns a different profile");
    return found({ ...base, loginEmail: email, userId: user.id, reclaim: false });
  }

  // An inactive login: a pending applicant (leave alone), a suspended person (has a profile,
  // leave alone), or a leftover from a rejected application (nothing attached: reuse it).
  const [pendingWorker, pendingAmbassador] = await Promise.all([
    db.workerApplication.count({ where: { userId: user.id, status: "PENDING" } }),
    db.ambassadorApplication.count({ where: { userId: user.id, status: "PENDING" } }),
  ]);
  if (pendingWorker || pendingAmbassador) return refuse("pending", "that email's login belongs to an application under review");
  if (user.workerProfile || user.ambassadorProfile) return refuse("needs_admin", "that email's login is inactive and holds a different profile");
  return found({ ...base, loginEmail: email, userId: user.id, reclaim: true });
}

/** No active worker or ambassador has this email: say what it is instead (suspended, applying, a client, staff, or nobody). */
async function classifyNoActiveProfile(email: string): Promise<Lookup> {
  const [workers, ambassadors, user] = await Promise.all([
    db.worker.count({ where: sameEmail(email) }),
    db.ambassador.count({ where: sameEmail(email) }),
    db.user.findUnique({ where: { email }, select: { id: true, role: true } }),
  ]);
  if (workers || ambassadors) return refuse("inactive", "their worker/ambassador record is suspended, paused or terminated");

  const ownLogin = user ? [{ userId: user.id }] : [];
  const [pendingWorker, pendingAmbassador, clients] = await Promise.all([
    db.workerApplication.count({ where: { status: "PENDING", OR: [sameEmail(email), ...ownLogin] } }),
    db.ambassadorApplication.count({ where: { status: "PENDING", OR: [sameEmail(email), ...ownLogin] } }),
    db.client.count({ where: sameEmail(email) }),
  ]);
  if (pendingWorker || pendingAmbassador) return refuse("pending", "an application with that email is under review");
  if (user?.role === "SUPER_ADMIN" || user?.role === "OPS_MANAGER") return refuse("unavailable", "that email belongs to a staff login");
  // Only a real client record, never a bare leftover login: the client code needs one.
  if (clients) return { ok: false, status: "client", email };
  return refuse("not_registered", "no worker, ambassador, application or client has that email");
}

/** Only the verify step needs this: the account, or null for any refusal. */
async function findAccount(input: string): Promise<PortalAccount | null> {
  const lookup = await lookupAccount(input);
  return lookup.ok ? lookup.account : null;
}

export async function requestPortalCode(opts: {
  identifier: string;
  ip: string;
  send: SendFn;
  defer: (work: Promise<unknown>) => void;
}): Promise<RequestCodeResult> {
  if (await ipLimited(opts.ip, "portal-request")) return { status: "limited" };

  // A client (their Client ID, or an email only a client has): same page, client code.
  const asClient = async (identifierInput: string): Promise<CodeRequestResult> => {
    const result = await sendClientCode({ identifierInput, ip: opts.ip, send: opts.send, defer: opts.defer });
    return result.status === "sent" || result.status === "wait" ? { ...result, account: "client" } : result;
  };
  if (normalizeClientIdInput(opts.identifier)) return asClient(opts.identifier);

  const lookup = await lookupAccount(opts.identifier);
  if (!lookup.ok) return lookup.status === "client" ? asClient(lookup.email) : { status: lookup.status };
  const { account } = lookup;
  const sentTo = lookup.typedEmail ? account.email : maskEmail(account.email);
  const issued = await issueCode({ email: account.email, fullName: account.fullName, ip: opts.ip, send: opts.send, defer: opts.defer });
  return { ...issued, sentTo, account: "team" };
}

/**
 * Creates and emails a code to `email` (which must already be a trusted address on file),
 * unless one went out moments ago or this inbox is over its cap: then says how long to wait.
 */
async function issueCode(opts: {
  email: string;
  fullName: string;
  ip: string;
  send: SendFn;
  defer: (work: Promise<unknown>) => void;
  purpose?: string;
}): Promise<CodeRequestResult> {
  const { email } = opts;
  const now = Date.now();
  const recent = await db.portalLoginCode.findMany({
    where: { email, createdAt: { gte: new Date(now - WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, usedAt: true, expiresAt: true, attempts: true },
  });
  const wait = waitBeforeNewCode(recent, now);
  if (wait) return { status: "wait", ...wait };

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
  return { status: "sent" };
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
 * Applying with an email that already has a login: a worker applying as an
 * ambassador, an ambassador applying as a worker, or a client applying as
 * either. Returns that login when it is active and does not already hold the
 * profile applied for; the application then attaches to it (no new password,
 * no second login) once the emailed code proves the applicant owns the inbox.
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
  if (!user || !user.isActive || !isPersonRole(user.role)) return null;
  const already = kind === "AMBASSADOR" ? user.ambassadorProfile : user.workerProfile;
  if (already) return null;
  // A client login: their orders are the other profile.
  if (user.role === "CLIENT") return { userId: user.id, fullName: user.displayName ?? "there" };
  const has = kind === "AMBASSADOR" ? user.workerProfile : user.ambassadorProfile;
  if (!has || !["Active", "On Break"].includes(has.status)) return null;
  return { userId: user.id, fullName: has.fullName ?? user.displayName ?? "there" };
}

/** Emails the proof-of-inbox code for an application to an existing login. */
export async function sendApplicationCode(opts: { email: string; fullName: string; ip: string; send: SendFn; defer: (work: Promise<unknown>) => void }): Promise<void> {
  await issueCode({ ...opts, email: opts.email.trim().toLowerCase(), purpose: "Enter this code to confirm your email for your EduCraft application. Your current password stays the same." });
}

/**
 * True when `code` is the live code for this email; spends it. The code proves
 * the inbox, so that login's email counts as proved from now on and client
 * orders with the same email join it.
 */
export async function verifyApplicationCode(email: string, code: string, ip: string): Promise<boolean> {
  const address = email.trim().toLowerCase();
  if (!(await spendCode(address, code, ip))) return false;
  await markEmailProved(address);
  return true;
}

/** An emailed code for this address was just used: record the proof and pull in their client orders. */
async function markEmailProved(email: string): Promise<void> {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (!user || !isPersonRole(user.role)) return;
  await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  await linkClientOrders(user.id, email);
}

/** Verifies the code, then stores the password on the person's one login (creating it if needed) and links their profiles to it. Any failure is just false. */
export async function setPortalPasswordWithCode(opts: {
  identifier: string;
  code: string;
  password: string;
  ip: string;
}): Promise<{ signInEmail: string } | null> {
  if (opts.password.length < PASSWORD_MIN || opts.password.length > PASSWORD_MAX) return null;
  const account = await findAccount(opts.identifier);
  if (!account) return null;
  const { email } = account;
  if (!(await spendCode(email, opts.code, opts.ip))) return null;

  const passwordHash = await bcrypt.hash(opts.password, 12);
  try {
    const userId = await db.$transaction(async (tx) => {
      let id = account.userId;
      if (id) {
        await tx.user.update({
          where: { id },
          data: {
            passwordHash,
            // Reusing a leftover login from a rejected application: bring it back as the right kind.
            ...(account.reclaim
              ? { isActive: true, role: account.workerId ? "WORKER" : "AMBASSADOR", displayName: account.fullName }
              : {}),
          },
        });
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
        id = created.id;
      }
      // Only profiles not yet on a login are attached; one already on this login stays as it is.
      if (account.workerId) await tx.worker.updateMany({ where: { id: account.workerId, userId: null }, data: { userId: id } });
      if (account.ambassadorId) await tx.ambassador.updateMany({ where: { id: account.ambassadorId, userId: null }, data: { userId: id } });
      return id;
    });
    void userId;
    // The code proved the inbox: the login's email counts as proved, and any client
    // orders under it join this login (one dashboard per person).
    await markEmailProved(account.loginEmail.toLowerCase());
    return { signInEmail: account.loginEmail };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }
}
