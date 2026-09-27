import type { UserRole } from "@prisma/client";
import { waitUntil } from "@vercel/functions";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import { siteUrl } from "@/lib/site-url";
import {
  ALERT_AUDIENCE_EXEC,
  ambassadorApplicationAlert,
  paidIntakeFailedAlert,
  paidOrderAlert,
  workerApplicationAlert,
  type AlertAudience,
  type AlertEmail,
} from "@/lib/emails/team-alerts";
import { getAlertEmails } from "@/lib/services/settings";
import { statusLabel } from "@/lib/status";
import { REACH_ROLES } from "@/lib/constants";
import { isLegacyApplication, reachSizeLabel, scoreApplication } from "@/lib/ambassador-score";
import { formatDate, formatNaira } from "@/lib/utils";

/**
 * Gmail alerts for the moments someone outside HQ asks for our attention: an
 * ambassador applies, a worker applies, a client's downpayment is confirmed by
 * Paystack on an order (and the rare paid order that could not become a
 * project).
 *
 * Who gets them: the founder's inbox (Settings > General > Email alerts) gets
 * every alert; ambassador applications also go to the Head of Growth, worker
 * applications and paid orders to the COO, at the email they sign in with
 * (Team & roles), so changing an executive's email there moves their alerts too.
 *
 * Each one is the email twin of an in-app notification. Callers queue it
 * straight after their database commit, before anything else that could
 * throw. It runs after the response (waitUntil), so the applicant or the
 * Paystack poll is never held up by Gmail's ~5 s login, and a failed send is
 * logged as `[team-alert]` and never undoes what triggered it.
 */

/** The executive logins each audience reaches, besides the founder's inbox. OPS_MANAGER is the retired spelling of COO. */
const AUDIENCE_ROLES: Record<AlertAudience, UserRole[]> = {
  growth: ["HOG"],
  operations: ["COO", "OPS_MANAGER"],
};

/**
 * The seed gives the executives placeholder logins on this domain, which
 * EduCraft does not own; a re-seed recreates them as active logins. Alerts
 * carry client and applicant details, so they never go there.
 */
const PLACEHOLDER_EMAIL_DOMAIN = "@educraft.com";

/**
 * The founder's inboxes plus the executives', lower-cased, each once, in that
 * order. Placeholder addresses are dropped and returned separately for the log.
 * Pure, so the rules can be checked without a database.
 */
export function mergeAlertRecipients(
  founderInboxes: readonly string[],
  execEmails: readonly string[]
): { to: string[]; skipped: string[] } {
  const to: string[] = [];
  const skipped: string[] = [];
  for (const raw of [...founderInboxes, ...execEmails]) {
    const email = raw.trim().toLowerCase();
    if (!email || to.includes(email) || skipped.includes(email)) continue;
    if (email.endsWith(PLACEHOLDER_EMAIL_DOMAIN)) skipped.push(email);
    else to.push(email);
  }
  return { to, skipped };
}

/** Active logins holding an audience's roles, oldest first. */
async function audienceLogins(audience: AlertAudience) {
  return db.user.findMany({
    where: { role: { in: AUDIENCE_ROLES[audience] }, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { email: true, displayName: true, execProfile: { select: { fullName: true } } },
  });
}

/** Everyone an alert for this audience goes to. */
export async function alertRecipients(audience: AlertAudience): Promise<{ to: string[]; skipped: string[] }> {
  const [founder, logins] = await Promise.all([getAlertEmails(), audienceLogins(audience)]);
  return mergeAlertRecipients(
    founder,
    logins.map((u) => u.email)
  );
}

export interface AlertRoleRecipient {
  audience: AlertAudience;
  /** "Head of Growth" / "COO". */
  role: string;
  /** What they are emailed about. */
  covers: string;
  people: { name: string; email: string }[];
}

/** The executives who get alerts besides the founder, for Settings > General. */
export async function getAlertRoleRecipients(): Promise<AlertRoleRecipient[]> {
  const covers: Record<AlertAudience, string> = {
    growth: "Ambassador applications",
    operations: "Worker applications and paid orders",
  };
  const audiences: AlertAudience[] = ["growth", "operations"];
  return Promise.all(
    audiences.map(async (audience) => {
      const logins = await audienceLogins(audience);
      return {
        audience,
        role: ALERT_AUDIENCE_EXEC[audience],
        covers: covers[audience],
        people: logins
          .filter((u) => !u.email.toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN))
          .map((u) => ({ name: u.execProfile?.fullName ?? u.displayName ?? u.email, email: u.email.toLowerCase() })),
      };
    })
  );
}

/** Dates in alerts read in Nigerian time, whatever the server's zone. */
function watDateTime(value: Date): string {
  return `${new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  }).format(value)} WAT`;
}

async function deliver(
  label: string,
  audience: AlertAudience,
  build: () => Promise<AlertEmail | null>
): Promise<void> {
  try {
    const mail = await build();
    if (!mail) return;
    const { to, skipped } = await alertRecipients(audience);
    if (skipped.length) console.warn(`[team-alert] ${label}: skipped placeholder ${skipped.join(", ")}`);
    const sent = await sendMail({ to: to.join(", "), ...mail });
    // Emails are not logged: the count is enough to tell whether the executive was included.
    if (sent.ok) console.info(`[team-alert] ${label}: sent to ${to.length} inbox(es) (founder + ${ALERT_AUDIENCE_EXEC[audience]})`);
    else console.error(`[team-alert] ${label}: not sent: ${sent.error}`);
  } catch (error) {
    console.error(`[team-alert] ${label}: failed`, error);
  }
}

/** Hands the send to waitUntil and returns at once; never throws. */
function queue(label: string, audience: AlertAudience, build: () => Promise<AlertEmail | null>): void {
  waitUntil(deliver(label, audience, build));
}

/**
 * The apply forms are public, and every email comes out of the one Gmail
 * account (~500 a day) that also sends clients their sign-in codes. Past this
 * many applications in an hour (both kinds together) the emails stop, so a
 * scripted flood cannot use up that quota; the in-app notifications still
 * list every application.
 */
const APPLICATION_ALERTS_PER_HOUR = 20;

async function applicationFlood(label: string): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [ambassadors, workers] = await Promise.all([
    db.ambassadorApplication.count({ where: { createdAt: { gte: since } } }),
    db.workerApplication.count({ where: { createdAt: { gte: since } } }),
  ]);
  const total = ambassadors + workers;
  if (total <= APPLICATION_ALERTS_PER_HOUR) return false;
  console.warn(`[team-alert] ${label}: skipped, ${total} applications in the last hour (cap ${APPLICATION_ALERTS_PER_HOUR})`);
  return true;
}

// ── New ambassador application ───────────────────────────────

export function alertAmbassadorApplication(applicationId: string, { existingLogin }: { existingLogin: boolean }): void {
  const label = `ambassador application ${applicationId}`;
  queue(label, "growth", async () => {
    if (await applicationFlood(label)) return null;
    const app = await db.ambassadorApplication.findUnique({
      where: { id: applicationId },
      select: {
        fullName: true,
        phone: true,
        email: true,
        otherUniversity: true,
        university: { select: { name: true, abbreviation: true } },
        department: true,
        level: true,
        slotCode: true,
        motivation: true,
        reachRoles: true,
        reachSize: true,
        reachGroups: true,
        expectedReferrals: true,
        firstWeekPlan: true,
        createdAt: true,
      },
    });
    if (!app) return null;
    return ambassadorApplicationAlert({
      fullName: app.fullName,
      phone: app.phone,
      email: app.email,
      university: app.university
        ? `${app.university.name}${app.university.abbreviation ? ` (${app.university.abbreviation})` : ""}`
        : app.otherUniversity,
      department: app.department,
      level: app.level,
      slotCode: app.slotCode,
      motivation: app.motivation,
      firstWeekPlan: app.firstWeekPlan,
      reach: reachSizeLabel(app.reachSize),
      roles: app.reachRoles
        .filter((r) => r !== "NONE")
        .map((r) => REACH_ROLES.find((o) => o.value === r)?.label ?? r)
        .join(", "),
      expectedReferrals: app.expectedReferrals,
      // The founder and the HOG triage from Gmail, so the alert carries the same verdict
      // the applications list shows.
      score: isLegacyApplication(app) ? null : scoreApplication(app),
      existingLogin,
      submittedAt: watDateTime(app.createdAt),
      reviewUrl: `${siteUrl()}/admin/ambassadors/applications`,
    });
  });
}

// ── New worker application ───────────────────────────────────

export function alertWorkerApplication(applicationId: string, { existingLogin }: { existingLogin: boolean }): void {
  const label = `worker application ${applicationId}`;
  queue(label, "operations", async () => {
    if (await applicationFlood(label)) return null;
    const app = await db.workerApplication.findUnique({
      where: { id: applicationId },
      select: {
        fullName: true,
        phone: true,
        email: true,
        educationLevel: true,
        specialties: true,
        skills: true,
        createdAt: true,
      },
    });
    if (!app) return null;
    return workerApplicationAlert({
      ...app,
      existingLogin,
      submittedAt: watDateTime(app.createdAt),
      reviewUrl: `${siteUrl()}/admin/workers/applications`,
    });
  });
}

// ── Paid client order ────────────────────────────────────────

/**
 * A client's downpayment was confirmed by Paystack: either the pay-first
 * intake that created the order (`newOrder`), or a variable-priced order
 * paid after it was submitted. Not raised for a downpayment an admin
 * verifies by hand (the admin is the one who knows) or for pro bono jobs
 * (nothing is paid).
 */
export function alertPaidOrder(
  projectDbId: string,
  payment: {
    reference: string;
    paymentMethod: string | null;
    paidOn: Date;
    newOrder: boolean;
    /** False when the project was not at NEW (cancelled or on hold while the client paid). */
    advanced: boolean;
  }
): void {
  queue(`paid order ${projectDbId}`, "operations", async () => {
    const project = await db.project.findUnique({
      where: { id: projectDbId },
      select: {
        projectId: true,
        status: true,
        isProBono: true,
        projectTitle: true,
        isExpressDelivery: true,
        clientDeadline: true,
        serviceVariantId: true,
        specialInstructions: true,
        price: true,
        downpaymentAmount: true,
        balanceAmount: true,
        service: { select: { serviceName: true, variants: { select: { id: true, name: true } } } },
        ambassador: { select: { fullName: true } },
        client: {
          select: {
            clientId: true,
            fullName: true,
            phone: true,
            email: true,
            department: true,
            university: { select: { name: true, abbreviation: true } },
          },
        },
      },
    });
    if (!project || project.isProBono) return null;

    const option = project.serviceVariantId
      ? (project.service.variants.find((v) => v.id === project.serviceVariantId)?.name ?? null)
      : null;
    const uni = project.client.university;

    return paidOrderAlert({
      projectCode: project.projectId,
      newOrder: payment.newOrder,
      notAdvancedStatus: payment.advanced ? null : statusLabel(project.status),
      clientName: project.client.fullName,
      clientCode: project.client.clientId,
      phone: project.client.phone,
      email: project.client.email,
      university: uni ? `${uni.name}${uni.abbreviation ? ` (${uni.abbreviation})` : ""}` : null,
      department: project.client.department,
      service: project.service.serviceName,
      option,
      title: project.projectTitle,
      express: project.isExpressDelivery,
      deadline: project.clientDeadline ? formatDate(project.clientDeadline) : null,
      price: formatNaira(project.price),
      paid: formatNaira(project.downpaymentAmount),
      balance: formatNaira(project.balanceAmount),
      paymentMethod: payment.paymentMethod,
      reference: payment.reference,
      referredBy: project.ambassador?.fullName ?? null,
      paidAt: watDateTime(payment.paidOn),
      instructions: project.specialInstructions,
      projectUrl: `${siteUrl()}/admin/projects/${project.projectId}`,
    });
  });
}

// ── Paid, but no project was created ─────────────────────────

/**
 * Paystack confirmed a pay-first downpayment but `submitIntake` refused the
 * staged order (service or option switched off mid-checkout). The money is in
 * and nothing in HQ shows it, so this goes out as an urgent alert with the
 * client's details from the staged form.
 */
export function alertPaidIntakeFailed(
  pendingIntakeId: string,
  payment: { reference: string; amountNaira: number; paidOn: Date; reason: string }
): void {
  queue(`paid intake failed ${pendingIntakeId}`, "operations", async () => {
    const pending = await db.pendingIntake.findUnique({
      where: { id: pendingIntakeId },
      select: { serviceCode: true, payload: true },
    });
    const form = (pending?.payload ?? {}) as { fullName?: unknown; phone?: unknown; email?: unknown };
    const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const service = pending
      ? ((await db.service.findUnique({ where: { serviceCode: pending.serviceCode }, select: { serviceName: true } }))
          ?.serviceName ?? pending.serviceCode)
      : "Unknown";

    return paidIntakeFailedAlert({
      reference: payment.reference,
      amount: formatNaira(payment.amountNaira),
      reason: payment.reason,
      clientName: text(form.fullName),
      phone: text(form.phone),
      email: text(form.email),
      service,
      paidAt: watDateTime(payment.paidOn),
      newProjectUrl: `${siteUrl()}/admin/projects/new`,
    });
  });
}
