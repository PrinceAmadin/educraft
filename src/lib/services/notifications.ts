import { Prisma, type UserRole } from "@prisma/client";
import { waitUntil } from "@vercel/functions";
import { db } from "@/lib/db";
import { sendPushToUsers } from "@/lib/services/push";

export type NotificationType = "info" | "warning" | "urgent" | "success";

export interface NotificationInput {
  title: string;
  message: string;
  type?: NotificationType;
  link?: string;
}

/** Create the same notification for a set of users (skips empty). */
export async function notifyUsers(
  userIds: (string | null | undefined)[],
  input: NotificationInput
): Promise<void> {
  const ids = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
  if (ids.length === 0) return;
  await db.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      title: input.title,
      message: input.message,
      type: input.type ?? "info",
      link: input.link ?? null,
    })),
  });

  // Same message to their phones. Handed to waitUntil so the request that raised the
  // notification isn't held up by the push services.
  waitUntil(sendPushToUsers(ids, { title: input.title, body: input.message, url: input.link }));
}

/** Notify every active user holding a role (e.g. SUPER_ADMIN, OPS_MANAGER). */
export async function notifyRole(
  role: UserRole | UserRole[],
  input: NotificationInput
): Promise<void> {
  const users = await db.user.findMany({
    where: { role: { in: Array.isArray(role) ? role : [role] }, isActive: true },
    select: { id: true },
  });
  await notifyUsers(
    users.map((u) => u.id),
    input
  );
}

export const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "OPS_MANAGER"];

export function notifyAdmins(input: NotificationInput) {
  return notifyRole(ADMIN_ROLES, input);
}

/** Money events go to the founder and the CFO: payments awaiting verification, confirmations, refunds, payout submissions. */
export const FINANCE_ROLES: UserRole[] = ["SUPER_ADMIN", "CO_CEO_CFO"];

export function notifyFinance(input: NotificationInput) {
  return notifyRole(FINANCE_ROLES, input);
}

// ── Reads ────────────────────────────────────────────────────

export interface NotificationRow {
  id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export async function listForUser(
  userId: string,
  limit = 10
): Promise<{ items: NotificationRow[]; unread: number }> {
  const [rows, unread] = await db.$transaction([
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        message: true,
        type: true,
        link: true,
        read: true,
        createdAt: true,
      },
    }),
    db.notification.count({ where: { userId, read: false } }),
  ]);

  return {
    items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    unread,
  };
}

export async function markRead(id: string, userId: string): Promise<void> {
  await db.notification.updateMany({ where: { id, userId }, data: { read: true } });
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
  return result.count;
}

export function isPrismaKnownError(e: unknown): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError;
}
