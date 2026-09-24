import { escapeHtml } from "@/lib/mailer";

/**
 * Internal alerts to the EduCraft team's inbox (the "alert_emails" setting):
 * a new ambassador application, a new worker application, and a client order
 * whose downpayment has been paid. Same palette as the other emails (white
 * surface, teal accent, slate text, no decorative icons). Details only; the
 * button opens the record in HQ, where the admin acts on it.
 */

export interface AlertEmail {
  subject: string;
  html: string;
  text: string;
}

interface AlertRow {
  label: string;
  value: string | null | undefined;
  /** IDs, money and codes: monospace, like HQ's data. */
  mono?: boolean;
}

function alertEmail(input: {
  subject: string;
  eyebrow: string;
  heading: string;
  intro: string;
  rows: AlertRow[];
  /** A longer free-text answer shown below the table (motivation, notes). */
  quote?: { label: string; body: string | null | undefined };
  actionLabel: string;
  actionUrl: string;
}): AlertEmail {
  const rows = input.rows.filter((r) => r.value != null && String(r.value).trim() !== "");
  const quote = input.quote?.body?.trim() ? { label: input.quote.label, body: input.quote.body.trim() } : null;

  const text = [
    input.heading,
    "",
    input.intro,
    "",
    ...rows.map((r) => `${r.label}: ${r.value}`),
    ...(quote ? ["", `${quote.label}:`, quote.body] : []),
    "",
    `${input.actionLabel}: ${input.actionUrl}`,
    "",
    "EduCraft HQ alert. Change who receives these in Settings > General.",
  ].join("\n");

  const row = (r: AlertRow) =>
    `<tr><td style="padding:10px 12px 10px 0;color:#64748B;font-size:14px;border-bottom:1px solid #E8EAED;width:38%;vertical-align:top">${escapeHtml(r.label)}</td>` +
    `<td style="padding:10px 0;color:#0F172A;font-size:14px;border-bottom:1px solid #E8EAED;text-align:right;word-break:break-word;overflow-wrap:anywhere;${r.mono ? "font-family:'JetBrains Mono',Consolas,monospace;" : ""}">${escapeHtml(r.value)}</td></tr>`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:32px 16px;background:#F8F9FA;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#0F172A">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:32px 28px;box-shadow:0 12px 40px rgba(15,23,42,0.06)">
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0D9488">${escapeHtml(input.eyebrow)}</p>
    <h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;font-weight:700;color:#0F172A">${escapeHtml(input.heading)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569">${escapeHtml(input.intro)}</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 20px">
      ${rows.map(row).join("\n      ")}
    </table>
    ${
      quote
        ? `<p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#64748B">${escapeHtml(quote.label)}</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#0F172A;background:#F1F3F5;border-radius:10px;padding:12px 14px;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere">${escapeHtml(quote.body)}</p>`
        : ""
    }
    <a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#0D9488;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:10px">${escapeHtml(input.actionLabel)}</a>
    <p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #E8EAED;font-size:12px;line-height:1.5;color:#64748B">EduCraft HQ alert. Change who receives these in Settings &gt; General.</p>
  </div>
</body></html>`;

  return { subject: input.subject, html, text };
}

// ── New ambassador application ───────────────────────────────

export function ambassadorApplicationAlert(input: {
  fullName: string;
  phone: string;
  email: string | null;
  university: string | null;
  department: string | null;
  level: string | null;
  slotCode: string | null;
  /** Only on applications from before the screening questions. */
  motivation: string | null;
  firstWeekPlan: string | null;
  reach: string | null;
  roles: string;
  expectedReferrals: number | null;
  score: { total: number; max: number } | null;
  /** Applied with the login they already use (a worker applying as an ambassador). */
  existingLogin: boolean;
  submittedAt: string;
  reviewUrl: string;
}): AlertEmail {
  return alertEmail({
    subject: `New ambassador application: ${input.fullName}${input.slotCode ? ` (slot ${input.slotCode})` : ""}`,
    eyebrow: "Ambassador programme",
    heading: "New ambassador application",
    intro: `${input.fullName} applied to become an EduCraft ambassador. The application is waiting for your review.`,
    rows: [
      { label: "Name", value: input.fullName },
      { label: "Phone", value: input.phone, mono: true },
      { label: "Email", value: input.email },
      { label: "University", value: input.university },
      { label: "Department", value: input.department },
      { label: "Level", value: input.level },
      { label: "Slot held", value: input.slotCode, mono: true },
      { label: "Score", value: input.score ? `${input.score.total}/${input.score.max}` : null, mono: true },
      { label: "Reach", value: input.reach },
      { label: "Roles", value: input.roles || null },
      {
        label: "Expects in 30 days",
        value: input.expectedReferrals == null ? null : `${input.expectedReferrals} students`,
      },
      { label: "Login", value: input.existingLogin ? "Already a worker, same login" : null },
      { label: "Submitted", value: input.submittedAt },
    ],
    quote: input.firstWeekPlan
      ? { label: "Their first move in week one", body: input.firstWeekPlan }
      : { label: "Why they want to be an ambassador", body: input.motivation },
    actionLabel: "Review application",
    actionUrl: input.reviewUrl,
  });
}

// ── New worker application ───────────────────────────────────

export function workerApplicationAlert(input: {
  fullName: string;
  phone: string;
  email: string;
  educationLevel: string | null;
  specialties: string[];
  skills: string[];
  /** Applied with the login they already use (an ambassador applying as a worker). */
  existingLogin: boolean;
  submittedAt: string;
  reviewUrl: string;
}): AlertEmail {
  return alertEmail({
    subject: `New worker application: ${input.fullName}`,
    eyebrow: "Worker applications",
    heading: "New worker application",
    intro: `${input.fullName} applied to work with EduCraft. The application is waiting for your review.`,
    rows: [
      { label: "Name", value: input.fullName },
      { label: "Phone", value: input.phone, mono: true },
      { label: "Email", value: input.email },
      { label: "Education", value: input.educationLevel },
      { label: "Specialties", value: input.specialties.join(", ") },
      { label: "Skills", value: input.skills.join(", ") },
      { label: "Login", value: input.existingLogin ? "Already an ambassador, same login" : null },
      { label: "Submitted", value: input.submittedAt },
    ],
    actionLabel: "Review application",
    actionUrl: input.reviewUrl,
  });
}

// ── Paid client order ────────────────────────────────────────

export function paidOrderAlert(input: {
  projectCode: string;
  /** True when the order was created by this payment (pay-first intake). */
  newOrder: boolean;
  /**
   * The project's status label once the payment was credited, when it did
   * not move to "Downpayment verified" (cancelled or on hold while the client
   * was paying): the alert then asks for a decision instead.
   */
  notAdvancedStatus: string | null;
  clientName: string;
  clientCode: string;
  phone: string;
  email: string | null;
  university: string | null;
  department: string | null;
  service: string;
  option: string | null;
  title: string | null;
  express: boolean;
  deadline: string | null;
  /** Already formatted (formatNaira). */
  price: string;
  paid: string;
  balance: string;
  paymentMethod: string | null;
  reference: string;
  referredBy: string | null;
  paidAt: string;
  instructions: string | null;
  projectUrl: string;
}): AlertEmail {
  return alertEmail({
    subject: input.notAdvancedStatus
      ? `Decision needed: ${input.paid} paid on ${input.projectCode} (marked ${input.notAdvancedStatus.toLowerCase()})`
      : `Paid order ${input.projectCode}: ${input.service}, ${input.paid} downpayment`,
    eyebrow: "Client orders",
    heading: input.notAdvancedStatus
      ? `Downpayment paid on a project marked ${input.notAdvancedStatus.toLowerCase()}`
      : input.newOrder
        ? "New order, downpayment paid"
        : "Downpayment paid",
    intro: input.notAdvancedStatus
      ? `${input.clientName} paid the downpayment on ${input.projectCode}, but the project is marked ${input.notAdvancedStatus.toLowerCase()}. Decide whether to reinstate it or refund the client.`
      : input.newOrder
        ? `${input.clientName} placed an order and paid the downpayment. The project is ready for requirements review and assignment.`
        : `${input.clientName} paid the downpayment on ${input.projectCode}. The project is ready for requirements review and assignment.`,
    rows: [
      { label: "Project", value: input.projectCode, mono: true },
      { label: "Service", value: input.service },
      { label: "Option", value: input.option },
      { label: "Topic", value: input.title },
      { label: "Express delivery", value: input.express ? "Yes" : null },
      { label: "Client deadline", value: input.deadline },
      { label: "Client", value: input.clientName },
      { label: "Client ID", value: input.clientCode, mono: true },
      { label: "Phone", value: input.phone, mono: true },
      { label: "Email", value: input.email },
      { label: "University", value: input.university },
      { label: "Department", value: input.department },
      { label: "Referred by", value: input.referredBy },
      { label: "Total price", value: input.price, mono: true },
      { label: "Downpayment paid", value: input.paid, mono: true },
      { label: "Balance due after QA", value: input.balance, mono: true },
      { label: "Paid with", value: input.paymentMethod },
      { label: "Reference", value: input.reference, mono: true },
      { label: "Paid on", value: input.paidAt },
    ],
    quote: { label: "Special instructions", body: input.instructions },
    actionLabel: "Open project",
    actionUrl: input.projectUrl,
  });
}

// ── Paid, but no project was created ─────────────────────────

/**
 * The one paid case that needs a person: Paystack confirmed the downpayment
 * on a pay-first order, but the order could not become a project (the
 * service or option was switched off while the client was paying). Nothing
 * else in HQ shows this payment, so the alert carries what is needed to
 * create the project by hand or refund.
 */
export function paidIntakeFailedAlert(input: {
  reference: string;
  /** Already formatted (formatNaira). */
  amount: string;
  reason: string;
  clientName: string | null;
  phone: string | null;
  email: string | null;
  service: string;
  paidAt: string;
  newProjectUrl: string;
}): AlertEmail {
  return alertEmail({
    subject: `Action needed: ${input.amount} paid but no project was created (${input.reference})`,
    eyebrow: "Client orders",
    heading: "Payment received, order not created",
    intro:
      "Paystack confirmed this downpayment, but the order could not be turned into a project, so it does not appear anywhere in HQ. Contact the client, then create the project by hand, or refund them from the Paystack dashboard.",
    rows: [
      { label: "Reason", value: input.reason },
      { label: "Client", value: input.clientName },
      { label: "Phone", value: input.phone, mono: true },
      { label: "Email", value: input.email },
      { label: "Service", value: input.service },
      { label: "Amount paid", value: input.amount, mono: true },
      { label: "Reference", value: input.reference, mono: true },
      { label: "Paid on", value: input.paidAt },
    ],
    actionLabel: "Create the project",
    actionUrl: input.newProjectUrl,
  });
}
