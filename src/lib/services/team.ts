import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { Prisma, type UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { EXEC_ROLES, ROLE_TITLES, isExecRole } from "@/lib/rbac";
import type { BankDetailsInput, InviteExecutiveInput, UpdateExecutiveInput } from "@/lib/validations/team";

/** A refusal the API turns into its HTTP status; the message is safe to show. */
export class TeamError extends Error {
  constructor(
    message: string,
    public readonly status: 403 | 404 | 409 = 409
  ) {
    super(message);
  }
}

/** Who Team & Roles lists: the executive roles, plus the retired OPS_MANAGER value should a row still hold it. */
const TEAM_ROLES: UserRole[] = [...EXEC_ROLES, "OPS_MANAGER"];

export interface ExecutiveRow {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
  title: string;
  phone: string | null;
  isActive: boolean;
  /** False until their first password sign-in: an invited executive is "pending" until then. */
  hasSignedIn: boolean;
  createdAt: string;
}

function titleFor(role: UserRole): string {
  return isExecRole(role) ? ROLE_TITLES[role] : "Operations Manager";
}

export async function listExecutives(): Promise<ExecutiveRow[]> {
  const rows = await db.user.findMany({
    where: { role: { in: TEAM_ROLES } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      displayName: true,
      phone: true,
      role: true,
      isActive: true,
      lastSignInAt: true,
      createdAt: true,
      execProfile: { select: { fullName: true, title: true, phone: true } },
    },
  });
  // Founder first, then the executives in the order the matrix lists them.
  const rank = (role: UserRole) => (isExecRole(role) ? EXEC_ROLES.indexOf(role) : EXEC_ROLES.length);
  return rows
    .sort((a, b) => rank(a.role) - rank(b.role) || a.createdAt.getTime() - b.createdAt.getTime())
    .map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      fullName: r.execProfile?.fullName ?? r.displayName ?? r.email.split("@")[0],
      title: r.execProfile?.title ?? titleFor(r.role),
      phone: r.execProfile?.phone ?? r.phone,
      isActive: r.isActive,
      hasSignedIn: r.lastSignInAt !== null,
      createdAt: r.createdAt.toISOString(),
    }));
}

// No 0/O, 1/l/I: the founder reads this password out or pastes it into WhatsApp.
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** A one-time password like `Kq7m-Xw3p-Rt9v`, shown once and never stored in the clear. */
export function generateTemporaryPassword(): string {
  const pick = () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  const block = () => Array.from({ length: 4 }, pick).join("");
  return `${block()}-${block()}-${block()}`;
}

function uniqueViolation(err: unknown): string | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = (err.meta?.target as string[] | undefined)?.join(", ") ?? "";
    return target.includes("phone") ? "That phone number is already on another login" : "That email already has a login";
  }
  return null;
}

/**
 * Create an executive's login and record together. The password comes back
 * once, for the founder to pass on by hand (no email in Phase 1); the login
 * is live immediately.
 */
export async function inviteExecutive(
  input: InviteExecutiveInput
): Promise<{ id: string; email: string; fullName: string; temporaryPassword: string }> {
  const title = input.title?.trim() || ROLE_TITLES[input.role];
  const phone = input.phone?.trim() || null;
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  try {
    const user = await db.user.create({
      data: {
        email: input.email,
        displayName: input.fullName,
        phone,
        passwordHash,
        role: input.role,
        isActive: true,
        execProfile: { create: { fullName: input.fullName, title, email: input.email, phone } },
      },
      select: { id: true, email: true },
    });
    return { ...user, fullName: input.fullName, temporaryPassword };
  } catch (err) {
    const message = uniqueViolation(err);
    if (message) throw new TeamError(message);
    throw err;
  }
}

/**
 * Edit an executive. The role can only move between the three executive
 * roles (the schema never offers SUPER_ADMIN); the founder's own role and the
 * founder's login are never touched here.
 */
export async function updateExecutive(id: string, input: UpdateExecutiveInput, actingUserId: string): Promise<ExecutiveRow> {
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, role: true, email: true, displayName: true, execProfile: { select: { title: true } } },
  });
  if (!user || !TEAM_ROLES.includes(user.role)) throw new TeamError("Executive not found", 404);
  if (input.role !== undefined && user.role === "SUPER_ADMIN") {
    throw new TeamError("The Super Admin's role can't be changed here", 403);
  }
  if (input.isActive === false && id === actingUserId) throw new TeamError("You can't switch off your own login");

  const role = input.role ?? user.role;
  const phone = input.phone !== undefined ? input.phone.trim() || null : undefined;
  // A blank title means "the default for the role" — which follows a role change.
  const title =
    input.title !== undefined
      ? input.title.trim() || titleFor(role)
      : input.role !== undefined && user.execProfile?.title === titleFor(user.role)
        ? titleFor(role)
        : undefined;

  const userData: Prisma.UserUpdateInput = {};
  if (input.email !== undefined) userData.email = input.email;
  if (input.fullName !== undefined) userData.displayName = input.fullName;
  if (input.role !== undefined) userData.role = input.role;
  if (input.isActive !== undefined) userData.isActive = input.isActive;
  if (phone !== undefined) userData.phone = phone;

  try {
    await db.$transaction([
      db.user.update({ where: { id }, data: userData }),
      db.execProfile.upsert({
        where: { userId: id },
        update: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(title !== undefined ? { title } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(phone !== undefined ? { phone } : {}),
        },
        create: {
          userId: id,
          fullName: input.fullName ?? user.displayName ?? user.email.split("@")[0],
          title: title ?? titleFor(role),
          email: input.email ?? user.email,
          phone: phone ?? null,
        },
      }),
    ]);
  } catch (err) {
    const message = uniqueViolation(err);
    if (message) throw new TeamError(message);
    throw err;
  }

  const row = (await listExecutives()).find((r) => r.id === id);
  if (!row) throw new TeamError("Executive not found", 404);
  return row;
}

/**
 * Take someone off the executive team: the login stays (demoted to WORKER,
 * which opens nothing on its own) and the executive record goes. With
 * `deactivate` the login is switched off as well.
 */
export async function removeExecutive(
  id: string,
  actingUserId: string,
  options: { deactivate?: boolean } = {}
): Promise<{ ok: true }> {
  if (id === actingUserId) throw new TeamError("You can't remove yourself from the team");
  const user = await db.user.findUnique({ where: { id }, select: { role: true } });
  if (!user || !TEAM_ROLES.includes(user.role)) throw new TeamError("Executive not found", 404);
  if (user.role === "SUPER_ADMIN") throw new TeamError("A Super Admin can't be removed here", 403);

  await db.$transaction([
    db.execProfile.deleteMany({ where: { userId: id } }),
    db.user.update({
      where: { id },
      data: { role: "WORKER", ...(options.deactivate ? { isActive: false } : {}) },
    }),
  ]);
  return { ok: true };
}

// ── Bank details ─────────────────────────────────────────────

export interface BankDetailsRow {
  userId: string;
  fullName: string;
  title: string;
  role: UserRole;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  updatedAt: string | null;
}

function toBankRow(u: {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  execProfile: { fullName: string; title: string; bankName: string | null; accountNumber: string | null; accountName: string | null; updatedAt: Date } | null;
}): BankDetailsRow {
  return {
    userId: u.id,
    fullName: u.execProfile?.fullName ?? u.displayName ?? u.email.split("@")[0],
    title: u.execProfile?.title ?? titleFor(u.role),
    role: u.role,
    bankName: u.execProfile?.bankName ?? null,
    accountNumber: u.execProfile?.accountNumber ?? null,
    accountName: u.execProfile?.accountName ?? null,
    updatedAt: u.execProfile?.updatedAt.toISOString() ?? null,
  };
}

const BANK_SELECT = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  execProfile: { select: { fullName: true, title: true, bankName: true, accountNumber: true, accountName: true, updatedAt: true } },
} as const;

/** Every executive's payout account — the founder's view. */
export async function listBankDetails(): Promise<BankDetailsRow[]> {
  const rows = await db.user.findMany({ where: { role: { in: TEAM_ROLES } }, orderBy: { createdAt: "asc" }, select: BANK_SELECT });
  const rank = (role: UserRole) => (isExecRole(role) ? EXEC_ROLES.indexOf(role) : EXEC_ROLES.length);
  return rows.sort((a, b) => rank(a.role) - rank(b.role)).map(toBankRow);
}

/** One executive's own payout account (null for a login that is not on the team). */
export async function getBankDetails(userId: string): Promise<BankDetailsRow | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: BANK_SELECT });
  if (!user || !TEAM_ROLES.includes(user.role)) return null;
  return toBankRow(user);
}

/** Save an executive's payout account. Creates the executive record if a login predates Team & Roles. */
export async function saveBankDetails(userId: string, input: BankDetailsInput): Promise<BankDetailsRow> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, displayName: true, role: true } });
  if (!user || !TEAM_ROLES.includes(user.role)) throw new TeamError("Executive not found", 404);

  const clean = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
  const bank = { bankName: clean(input.bankName), accountNumber: clean(input.accountNumber?.replace(/\s+/g, "")), accountName: clean(input.accountName) };

  await db.execProfile.upsert({
    where: { userId },
    update: bank,
    create: {
      userId,
      fullName: user.displayName ?? user.email.split("@")[0],
      title: titleFor(user.role),
      email: user.email,
      bankName: bank.bankName ?? null,
      accountNumber: bank.accountNumber ?? null,
      accountName: bank.accountName ?? null,
    },
  });
  const row = await getBankDetails(userId);
  if (!row) throw new TeamError("Executive not found", 404);
  return row;
}

/** A fresh one-time password for an executive, returned once. */
export async function resetExecutivePassword(id: string): Promise<{ email: string; fullName: string; temporaryPassword: string }> {
  const user = await db.user.findUnique({
    where: { id },
    select: { email: true, displayName: true, role: true, execProfile: { select: { fullName: true } } },
  });
  if (!user || !TEAM_ROLES.includes(user.role)) throw new TeamError("Executive not found", 404);

  const temporaryPassword = generateTemporaryPassword();
  await db.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(temporaryPassword, 12) } });
  return { email: user.email, fullName: user.execProfile?.fullName ?? user.displayName ?? user.email, temporaryPassword };
}
