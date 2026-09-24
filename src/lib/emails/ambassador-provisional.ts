import { escapeHtml } from "@/lib/mailer";
import { firstName } from "@/lib/utils";

/**
 * The two provisional-slot emails: one reminder while the window is still open,
 * one when it has closed and the slot has gone back on the board.
 *
 * Both are transactional — they are the consequence of the terms the person
 * agreed to when they applied, so there is no opt-out check and no
 * List-Unsubscribe header (that is the weekly summary's business).
 */

const FOOTER =
  "EduCraft, Academic &amp; Technical Documentation Experts. Questions? Message us on WhatsApp at 07063421088.";
const FOOTER_TEXT =
  "EduCraft, Academic & Technical Documentation Experts. Questions? Message us on WhatsApp at 07063421088.";

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

const p = (text: string, color = "#475569") =>
  `<p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:${color}">${escapeHtml(text)}</p>`;

const button = (href: string, label: string) =>
  `<p style="margin:0 0 24px"><a href="${escapeHtml(
    href
  )}" style="display:inline-block;padding:12px 22px;background:#0D9488;color:#FFFFFF;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(
    label
  )}</a></p>`;

// ── Reminder: the window is closing ──────────────────────────

export function provisionalReminderEmail(input: {
  fullName: string;
  daysLeft: number;
  referralLink: string;
  dashboardUrl: string;
}): { subject: string; html: string; text: string } {
  const first = firstName(input.fullName, input.fullName);
  const days = input.daysLeft === 1 ? "1 day" : `${input.daysLeft} days`;
  const subject = `${days} left to confirm your EduCraft slot`;

  const lines = [
    `Hi ${first},`,
    "",
    `You have ${days} left to confirm your ambassador slot. One order from someone you referred is all it takes, and the slot is yours for good.`,
    "",
    `Your client link: ${input.referralLink}`,
    "",
    "Share it with a final-year student who needs help with a project, seminar report, term paper or CV. When they open it, WhatsApp opens with a message that already says you referred them.",
    "",
    `Your dashboard: ${input.dashboardUrl}`,
    "",
    "If nothing comes through before the deadline, the slot goes back on the board for another applicant. You are welcome to apply again.",
    "",
    FOOTER_TEXT,
  ];

  const html = shell(
    "EduCraft ambassador programme",
    `<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;color:#0F172A">${escapeHtml(
      `${days} left to confirm your slot`
    )}</h1>
    ${p(`Hi ${first}, one order from someone you referred confirms your ambassador slot for good.`, "#0F172A")}
    <div style="margin:0 0 20px;padding:16px 18px;background:#F1F3F5;border-radius:12px">
      <p style="margin:0 0 4px;font-size:12px;color:#64748B">Your client link</p>
      <p style="margin:0;font-size:14px;word-break:break-all"><a href="${escapeHtml(
        input.referralLink
      )}" style="color:#0D9488;text-decoration:none;font-weight:600">${escapeHtml(input.referralLink)}</a></p>
    </div>
    ${p(
      "Share it with a final-year student who needs help with a project, seminar report, term paper or CV. When they open it, WhatsApp opens with a message that already says you referred them."
    )}
    ${button(input.dashboardUrl, "Open my dashboard")}
    ${p("If nothing comes through before the deadline, the slot goes back on the board for another applicant. You are welcome to apply again.")}`
  );

  return { subject, html, text: lines.join("\n") };
}

// ── The window closed ────────────────────────────────────────

export function provisionalLapsedEmail(input: {
  fullName: string;
  applyUrl: string;
}): { subject: string; html: string; text: string } {
  const first = firstName(input.fullName, input.fullName);
  const subject = "Your EduCraft ambassador slot has been released";

  const lines = [
    `Hi ${first},`,
    "",
    "Your ambassador slot was held for 30 days and no referred order came through, so it has gone back on the board for another applicant.",
    "",
    "There is nothing wrong on your side and no hard feelings — the slots are limited, so they go to whoever is actively using them.",
    "",
    `If you want another go, apply again here: ${input.applyUrl}`,
    "",
    FOOTER_TEXT,
  ];

  const html = shell(
    "EduCraft ambassador programme",
    `<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;color:#0F172A">Your slot has been released</h1>
    ${p(
      `Hi ${first}, your ambassador slot was held for 30 days and no referred order came through, so it has gone back on the board for another applicant.`,
      "#0F172A"
    )}
    ${p("There is nothing wrong on your side and no hard feelings — the slots are limited, so they go to whoever is actively using them.")}
    ${button(input.applyUrl, "Apply again")}`
  );

  return { subject, html, text: lines.join("\n") };
}
