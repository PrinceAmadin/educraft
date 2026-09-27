import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { EXEC_ROLES, type ExecRole } from "@/lib/rbac";
import { PERSON_ROLES } from "@/lib/roles";
import { buildExecIndex, execRoleForRecord, normaliseEmail, type ExecIdentity, type ExecIndex } from "@/lib/executive-identity";

/**
 * Reads the executives' emails (their login email plus the "Other emails" the
 * founder lists on Team & roles) so ambassador and worker records can be
 * matched to them. The matching rules live in `executive-identity.ts`.
 */

type Db = Prisma.TransactionClient | typeof db;

/** Executive logins, plus the retired OPS_MANAGER (judged as COO). */
const EXEC_LOGIN_ROLES = [...EXEC_ROLES, "OPS_MANAGER"] as const;

/** email → executive, from one small query (a handful of logins). */
export async function loadExecIndex(tx: Db = db): Promise<ExecIndex> {
  const users = await tx.user.findMany({
    where: { role: { in: [...EXEC_LOGIN_ROLES] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, role: true, execProfile: { select: { fullName: true, title: true, otherEmails: true } } },
  });
  return buildExecIndex(
    users.map((u) => ({
      userId: u.id,
      role: u.role,
      email: u.email,
      fullName: u.execProfile?.fullName,
      title: u.execProfile?.title,
      otherEmails: u.execProfile?.otherEmails,
    }))
  );
}

const RECORD_IDENTITY = { email: true, user: { select: { email: true, role: true } } } as const;

/** The executive role an ambassador record belongs to (for the tag on its page), or null. */
export async function execRoleOfAmbassador(id: string): Promise<ExecRole | null> {
  const [record, index] = await Promise.all([db.ambassador.findUnique({ where: { id }, select: RECORD_IDENTITY }), loadExecIndex()]);
  return record ? execRoleForRecord(index, record) : null;
}

/** The executive role a worker record belongs to (for the tag on its page), or null. */
export async function execRoleOfWorker(id: string): Promise<ExecRole | null> {
  const [record, index] = await Promise.all([db.worker.findUnique({ where: { id }, select: RECORD_IDENTITY }), loadExecIndex()]);
  return record ? execRoleForRecord(index, record) : null;
}

/** Prisma `where` pieces matching any of these emails, ignoring case. */
export function emailEquals(emails: readonly string[]): { equals: string; mode: "insensitive" }[] {
  return [...new Set(emails.map(normaliseEmail).filter(Boolean))].map((e) => ({ equals: e, mode: "insensitive" as const }));
}

/**
 * The executive a non-executive login belongs to, when its email is one of an
 * executive's other emails. Null for an executive's own login and for everyone else.
 */
export async function execForLoginEmail(email: string | null | undefined): Promise<ExecIdentity | null> {
  const key = normaliseEmail(email);
  if (!key) return null;
  const exec = (await loadExecIndex()).get(key) ?? null;
  return exec && exec.primaryEmail !== key ? exec : null;
}

export type LinkedPortal = "worker" | "ambassador" | "client";

export interface LinkedAccount {
  email: string;
  /** The dashboards that login opens, in good standing. */
  holds: LinkedPortal[];
}

/**
 * The other logins an executive can switch to (by signing in): active
 * worker/ambassador/client logins on their other emails that open at least
 * one dashboard.
 */
export async function linkedAccountsFor(execUserId: string): Promise<LinkedAccount[]> {
  const profile = await db.execProfile.findUnique({ where: { userId: execUserId }, select: { otherEmails: true } });
  const emails = emailEquals(profile?.otherEmails ?? []);
  if (emails.length === 0) return [];
  const logins = await db.user.findMany({
    where: { isActive: true, role: { in: [...PERSON_ROLES] }, OR: emails.map((email) => ({ email })) },
    select: {
      email: true,
      workerProfile: { select: { status: true } },
      ambassadorProfile: { select: { status: true } },
      _count: { select: { clientProfiles: true } },
    },
  });
  return logins
    .map((u) => {
      const holds: LinkedPortal[] = [];
      if (u.workerProfile && (u.workerProfile.status === "Active" || u.workerProfile.status === "On Break")) holds.push("worker");
      if (u.ambassadorProfile?.status === "Active") holds.push("ambassador");
      if (u._count.clientProfiles > 0) holds.push("client");
      return { email: normaliseEmail(u.email), holds };
    })
    .filter((a) => a.holds.length > 0);
}

/**
 * What each email holds, for Team & roles: "worker, ambassador" when a login or
 * a record without a login uses it, "no account yet" otherwise.
 */
export async function holdingsForEmails(emails: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>(emails.map((e) => [normaliseEmail(e), []]));
  const match = emailEquals(emails);
  if (match.length === 0) return out;
  const [logins, loose] = await Promise.all([
    db.user.findMany({
      where: { OR: match.map((email) => ({ email })) },
      select: { email: true, workerProfile: { select: { workerId: true } }, ambassadorProfile: { select: { ambassadorId: true } }, _count: { select: { clientProfiles: true } } },
    }),
    Promise.all([
      db.worker.findMany({ where: { userId: null, OR: match.map((email) => ({ email })) }, select: { email: true, workerId: true } }),
      db.ambassador.findMany({ where: { userId: null, OR: match.map((email) => ({ email })) }, select: { email: true, ambassadorId: true } }),
    ]),
  ]);
  const add = (email: string | null, label: string) => {
    const list = out.get(normaliseEmail(email));
    if (list && !list.includes(label)) list.push(label);
  };
  for (const u of logins) {
    if (u.workerProfile) add(u.email, `worker ${u.workerProfile.workerId}`);
    if (u.ambassadorProfile) add(u.email, `ambassador ${u.ambassadorProfile.ambassadorId}`);
    if (u._count.clientProfiles > 0) add(u.email, "client orders");
  }
  for (const w of loose[0]) add(w.email, `worker ${w.workerId}`);
  for (const a of loose[1]) add(a.email, `ambassador ${a.ambassadorId}`);
  return out;
}
