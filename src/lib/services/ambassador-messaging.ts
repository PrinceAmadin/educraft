import { db } from "@/lib/db";
import { ambassadorMessageEmail } from "@/lib/emails/ambassador-message";
import { sendMail, sendMailBatch } from "@/lib/mailer";
import { notifyUsers } from "@/lib/services/notifications";

/**
 * One-off email from the admin to ambassadors — the old panel's Message
 * (one recipient) and Broadcast (everyone). Both also drop an in-app
 * notification for anyone with a portal login; the email itself never blocks
 * on Gmail being configured — it just reports what happened.
 */

export class MessagingError extends Error {}

export interface MessageResult {
  sent: boolean;
  to: string | null;
  error?: string;
}

export async function messageAmbassador(
  ambassadorId: string,
  title: string,
  message: string
): Promise<MessageResult> {
  const ambassador = await db.ambassador.findUnique({
    where: { id: ambassadorId },
    select: { fullName: true, email: true, userId: true },
  });
  if (!ambassador) throw new MessagingError("Ambassador not found");

  if (ambassador.userId) {
    await notifyUsers([ambassador.userId], {
      title,
      message: message.length > 140 ? `${message.slice(0, 139)}…` : message,
      type: "info",
      link: "/ambassador",
    }).catch(() => {});
  }

  if (!ambassador.email) return { sent: false, to: null, error: "No email address on file" };

  const mail = ambassadorMessageEmail({ ambassadorName: ambassador.fullName, title, message });
  const result = await sendMail({ to: ambassador.email, ...mail });
  return { sent: result.ok, to: ambassador.email, error: result.error };
}

export interface BroadcastResult {
  sent: number;
  failed: number;
  total: number;
  /** Who did not get it, and why — so a typo in an address can be fixed. */
  failures: { name: string; email: string; error: string }[];
}

/** Every active ambassador with an email on file — the same pool as allocation. */
export async function broadcastToAmbassadors(subject: string, message: string): Promise<BroadcastResult> {
  const rows = await db.ambassador.findMany({
    where: { status: "Active", email: { not: null } },
    select: { email: true, fullName: true, userId: true },
  });

  const userIds = rows.map((r) => r.userId).filter((id): id is string => id != null);
  if (userIds.length > 0) {
    await notifyUsers(userIds, {
      title: subject,
      message: message.length > 140 ? `${message.slice(0, 139)}…` : message,
      type: "info",
      link: "/ambassador",
    }).catch(() => {});
  }

  // A small connection pool, not one login per email — see sendMailBatch.
  const results = await sendMailBatch(
    rows.map((row) => ({
      to: row.email as string,
      ...ambassadorMessageEmail({ ambassadorName: row.fullName, title: subject, message, broadcast: true }),
    })),
    { connections: 5 }
  );

  const failures = rows.flatMap((row, i) =>
    results[i].ok
      ? []
      : [{ name: row.fullName, email: row.email as string, error: results[i].error ?? "Could not send" }]
  );
  return { sent: rows.length - failures.length, failed: failures.length, total: rows.length, failures };
}
