import { db } from "@/lib/db";
import { ambassadorMessageEmail } from "@/lib/emails/ambassador-message";
import { sendMail } from "@/lib/mailer";
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

  let sent = 0;
  let failed = 0;
  // Sequential, not Promise.all — same as the old panel, easier on Gmail's
  // per-connection send rate than firing every message at once.
  for (const row of rows) {
    const mail = ambassadorMessageEmail({
      ambassadorName: row.fullName,
      title: subject,
      message,
      broadcast: true,
    });
    const result = await sendMail({ to: row.email as string, ...mail });
    if (result.ok) sent += 1;
    else failed += 1;
  }

  return { sent, failed, total: rows.length };
}
