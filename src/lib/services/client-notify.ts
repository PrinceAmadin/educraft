import { waitUntil } from "@vercel/functions";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import { realEmail } from "@/lib/client-email";
import { siteUrl } from "@/lib/site-url";
import { clientUpdateEmail } from "@/lib/emails/client-update";
import { notifyUsers, type NotificationType } from "@/lib/services/notifications";

/**
 * Tells a client something happened on their project.
 *
 * - Always: the in-app bell and a phone notification (when they have signed in
 *   and turned notifications on). Push hides money amounts on the lock screen.
 * - Email only for moments worth an email (payment confirmed, a chapter or the
 *   final ready, something needed from them, a reply from EduCraft). Gmail
 *   allows about 500 emails a day and sign-in codes share that allowance, so
 *   client emails are capped per day (CLIENT_EMAIL_DAILY_CAP, default 200) and
 *   a project is emailed at most once per kind per 30 minutes.
 *
 * Called after the database work is committed. Never throws: a failed
 * notification must not undo or fail the action that triggered it.
 */

export type ClientTab = "progress" | "payments" | "messages";

export interface ClientNotice {
  title: string;
  message: string;
  type?: NotificationType;
  tab?: ClientTab;
  email?: {
    /** Groups the 30-minute limit, e.g. "payment", "message", "awaiting-input". */
    kind: string;
    heading: string;
    lines: string[];
    ctaLabel: string;
  };
}

const THROTTLE_MS = 30 * 60_000;

function dailyCap(): number {
  const n = parseInt(process.env.CLIENT_EMAIL_DAILY_CAP ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : 200;
}

export function clientProjectPath(projectCode: string, tab?: ClientTab): string {
  const path = `/client/projects/${encodeURIComponent(projectCode)}`;
  return tab && tab !== "progress" ? `${path}?tab=${tab}` : path;
}

export async function notifyClient(projectDbId: string, notice: ClientNotice): Promise<void> {
  try {
    const project = await db.project.findUnique({
      where: { id: projectDbId },
      select: { projectId: true, client: { select: { fullName: true, email: true, userId: true } } },
    });
    if (!project) return;
    const path = clientProjectPath(project.projectId, notice.tab);

    await notifyUsers([project.client.userId], {
      title: notice.title,
      message: notice.message,
      type: notice.type ?? "info",
      link: path,
    });

    const to = realEmail(project.client.email);
    if (!notice.email || !to) return;

    const since = new Date(Date.now() - THROTTLE_MS);
    const [recentSame, sentToday] = await Promise.all([
      db.emailLog.count({ where: { projectId: projectDbId, kind: notice.email.kind, ok: true, createdAt: { gte: since } } }),
      db.emailLog.count({ where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
    ]);
    if (recentSame > 0) return;
    if (sentToday >= dailyCap()) {
      console.warn(`[client-notify] daily email cap reached; skipped ${notice.email.kind} for ${project.projectId}`);
      return;
    }

    const mail = clientUpdateEmail({
      fullName: project.client.fullName,
      projectCode: project.projectId,
      heading: notice.email.heading,
      lines: notice.email.lines,
      ctaLabel: notice.email.ctaLabel,
      ctaUrl: `${siteUrl()}${path}`,
    });
    const kind = notice.email.kind;
    waitUntil(
      sendMail({ to, ...mail })
        .then((res) =>
          db.emailLog.create({ data: { kind, to, projectId: projectDbId, ok: res.ok, error: res.ok ? null : res.error ?? null } })
        )
        .catch((error) => console.error("[client-notify] email failed:", error))
    );
  } catch (error) {
    console.error("[client-notify]", error);
  }
}
