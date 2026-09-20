import { escapeHtml } from "@/lib/mailer";

/**
 * Sent when an admin approves an ambassador application: their slot ID, the
 * client link to share, and how to sign in to their own dashboard. Same
 * palette as the other ambassador emails (white surface, teal accent).
 */
export function ambassadorWelcomeEmail(input: {
  fullName: string;
  slotCode: string;
  referralLink: string;
  loginUrl: string;
  /** False for older applications that never set a password. */
  hasLogin: boolean;
}): { subject: string; html: string; text: string } {
  const first = input.fullName.trim().split(/\s+/)[0] || input.fullName;
  const subject = "Welcome to the EduCraft ambassador programme";
  const slotLabel = `EduCraftA-${input.slotCode}`;

  const loginLine = input.hasLogin
    ? "Sign in to your dashboard with your email and password."
    : "We will send your dashboard login separately.";

  const text = [
    `Hi ${first},`,
    "",
    "Your application has been approved. You are now an EduCraft ambassador.",
    "",
    `Your slot ID: ${slotLabel}`,
    `Your client link: ${input.referralLink}`,
    "",
    "Share this link with students. When they open it, WhatsApp opens with a message that already says you referred them.",
    "",
    loginLine,
    input.hasLogin ? `Dashboard: ${input.loginUrl}` : "",
    "",
    "EduCraft, Academic & Technical Documentation Experts",
  ]
    .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    .join("\n");

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:32px 16px;background:#F8F9FA;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#0F172A">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:36px 32px;box-shadow:0 12px 40px rgba(15,23,42,0.06)">
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0D9488">EduCraft ambassador programme</p>
    <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;color:#0F172A">Welcome aboard, ${escapeHtml(first)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569">Your application has been approved. You are now an EduCraft ambassador.</p>
    <div style="margin:0 0 20px;padding:16px 18px;background:#F1F3F5;border-radius:12px">
      <p style="margin:0 0 4px;font-size:12px;color:#64748B">Your slot ID</p>
      <p style="margin:0 0 14px;font-size:16px;font-weight:600;font-family:'JetBrains Mono',Consolas,monospace;color:#0F172A">${escapeHtml(slotLabel)}</p>
      <p style="margin:0 0 4px;font-size:12px;color:#64748B">Your client link</p>
      <p style="margin:0;font-size:14px;word-break:break-all"><a href="${escapeHtml(input.referralLink)}" style="color:#0D9488;text-decoration:none;font-weight:600">${escapeHtml(input.referralLink)}</a></p>
    </div>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#0F172A">Share this link with students. When they open it, WhatsApp opens with a message that already says you referred them.</p>
    <p style="margin:0 0 ${input.hasLogin ? "20" : "24"}px;font-size:15px;line-height:1.7;color:#475569">${escapeHtml(loginLine)}</p>
    ${
      input.hasLogin
        ? `<p style="margin:0 0 24px"><a href="${escapeHtml(input.loginUrl)}" style="display:inline-block;padding:12px 22px;background:#0D9488;color:#FFFFFF;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none">Open my dashboard</a></p>`
        : ""
    }
    <p style="margin:0;padding-top:18px;border-top:1px solid #E8EAED;font-size:12px;color:#64748B">EduCraft, Academic &amp; Technical Documentation Experts.</p>
  </div>
</body></html>`;

  return { subject, html, text };
}
