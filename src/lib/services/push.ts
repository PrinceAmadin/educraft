import webpush from "web-push";
import { db } from "@/lib/db";

export interface PushPayload {
  title: string;
  body: string;
  /** Where tapping the notification lands. */
  url?: string;
}

let configured: boolean | null = null;

/** VAPID keys come from env; without them push quietly does nothing (dev, or not yet set up). */
function configure(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:educraft611@gmail.com", publicKey, privateKey);
  configured = true;
  return true;
}

/**
 * A lock screen is visible to anyone holding the phone, so money never goes in
 * a push: a message that mentions an amount is replaced with a generic line.
 */
function lockScreenSafe(body: string): string {
  return /₦|\bNGN\b|naira/i.test(body) ? "Open EduCraft HQ to see the details." : body;
}

/**
 * Push to every device of these users. Never throws — a failed push must not
 * break the action that triggered it — and prunes devices the push service says are gone.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  try {
    if (userIds.length === 0 || !configure()) return;

    const subs = await db.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    if (subs.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: lockScreenSafe(payload.body),
      url: payload.url ?? "/dashboard",
    });

    const gone: string[] = [];
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
            { TTL: 60 * 60 * 24 }
          );
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(sub.id);
          else console.error("[push] send failed", status ?? error);
        }
      })
    );

    if (gone.length > 0) await db.pushSubscription.deleteMany({ where: { id: { in: gone } } });
  } catch (error) {
    console.error("[push] sendPushToUsers", error);
  }
}
