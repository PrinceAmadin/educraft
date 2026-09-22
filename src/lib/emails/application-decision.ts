import { escapeHtml } from "@/lib/mailer";
import { firstName } from "@/lib/utils";

/**
 * The applicant hears from us once, when an admin decides: approved or not.
 * (An approved ambassador gets `ambassadorWelcomeEmail` instead, which carries
 * their slot and client link.) Nothing is sent at submission; the form's own
 * confirmation screen covers that. The admin's rejection note is "for the
 * record" and is never quoted here.
 */

const FOOTER = "EduCraft, Academic &amp; Technical Documentation Experts. Questions? Message us on WhatsApp at 07063421088.";
const FOOTER_TEXT = "EduCraft, Academic & Technical Documentation Experts. Questions? Message us on WhatsApp at 07063421088.";

function shell(eyebrow: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:32px 16px;background:#F8F9FA;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#0F172A">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:36px 32px;box-shadow:0 12px 40px rgba(15,23,42,0.06)">
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0D9488">${escapeHtml(eyebrow)}</p>
    ${body}
    <p style="margin:0;padding-top:18px;border-top:1px solid #E8EAED;font-size:12px;line-height:1.5;color:#64748B">${FOOTER}</p>
  </div>
</body></html>`;
}

// ── Worker approved ──────────────────────────────────────────

export function workerApprovedEmail(input: {
  fullName: string;
  workerCode: string;
  /** The email their login uses. */
  loginEmail: string;
  loginUrl: string;
  /** Applied with a login they already had (an ambassador), so no new password. */
  existingLogin: boolean;
}): { subject: string; html: string; text: string } {
  const first = firstName(input.fullName, input.fullName);
  const subject = "Your EduCraft worker application is approved";
  const signIn = input.existingLogin
    ? `Sign in with your usual EduCraft login (${input.loginEmail}). If your ambassador dashboard opens, choose "Switch to worker dashboard" in the account menu.`
    : `Sign in with ${input.loginEmail} and the password you chose when you applied.`;

  const text = [
    `Hi ${first},`,
    "",
    "Your application to work with EduCraft has been approved.",
    "",
    `Your worker ID: ${input.workerCode}`,
    "",
    signIn,
    `Sign in: ${input.loginUrl}`,
    "",
    "Your dashboard shows the projects assigned to you, your deadlines and your earnings. We will notify you when your first project is assigned.",
    "",
    FOOTER_TEXT,
  ].join("\n");

  const html = shell(
    "EduCraft workers",
    `<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;color:#0F172A">Welcome to the team, ${escapeHtml(first)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569">Your application to work with EduCraft has been approved.</p>
    <div style="margin:0 0 20px;padding:16px 18px;background:#F1F3F5;border-radius:12px">
      <p style="margin:0 0 4px;font-size:12px;color:#64748B">Your worker ID</p>
      <p style="margin:0;font-size:16px;font-weight:600;font-family:'JetBrains Mono',Consolas,monospace;color:#0F172A">${escapeHtml(input.workerCode)}</p>
    </div>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#0F172A;word-break:break-word;overflow-wrap:anywhere">${escapeHtml(signIn)}</p>
    <p style="margin:0 0 24px"><a href="${escapeHtml(input.loginUrl)}" style="display:inline-block;padding:12px 22px;background:#0D9488;color:#FFFFFF;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none">Open my dashboard</a></p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#475569">Your dashboard shows the projects assigned to you, your deadlines and your earnings. We will notify you when your first project is assigned.</p>`
  );

  return { subject, html, text };
}

// ── Application not approved (ambassador or worker) ──────────

export function applicationRejectedEmail(input: {
  fullName: string;
  role: "ambassador" | "worker";
}): { subject: string; html: string; text: string } {
  const first = firstName(input.fullName, input.fullName);
  const what = input.role === "ambassador" ? "ambassador" : "worker";
  const subject = `Your EduCraft ${what} application`;
  const eyebrow = input.role === "ambassador" ? "EduCraft ambassador programme" : "EduCraft workers";
  const lines = [
    `Thank you for applying to be an EduCraft ${what}. After reviewing your application, we have decided not to take it forward.`,
    "We appreciate the time you took to apply and wish you the very best.",
  ];

  const text = [`Hi ${first},`, "", ...lines.flatMap((l) => [l, ""]), FOOTER_TEXT].join("\n");

  const html = shell(
    eyebrow,
    `<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;color:#0F172A">Hi ${escapeHtml(first)},</h1>
    ${lines
      .map((l) => `<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569">${escapeHtml(l)}</p>`)
      .join("\n    ")}`
  );

  return { subject, html, text };
}
