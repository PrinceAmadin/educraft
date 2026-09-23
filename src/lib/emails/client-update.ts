import { escapeHtml } from "@/lib/mailer";

/**
 * A short update to a client about their project: one heading, a line or two,
 * and a button into their dashboard. Same look as the sign-in code email.
 */
export function clientUpdateEmail(input: {
  fullName: string;
  projectCode: string;
  heading: string;
  lines: string[];
  ctaLabel: string;
  ctaUrl: string;
}): { subject: string; html: string; text: string } {
  const first = input.fullName.trim().split(/\s+/)[0] || "there";
  const subject = `${input.heading} · ${input.projectCode}`;

  const text = [
    `Hi ${first},`,
    "",
    input.heading,
    ...input.lines,
    "",
    `${input.ctaLabel}: ${input.ctaUrl}`,
    "",
    "Sign in with your Client ID or email. Questions? Reply on WhatsApp: 07063421088.",
    "EduCraft, Academic & Technical Documentation Experts",
  ].join("\n");

  const paragraphs = input.lines
    .map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#475569">${escapeHtml(l)}</p>`)
    .join("");

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:32px 16px;background:#F8F9FA;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#0F172A">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:36px 32px;box-shadow:0 12px 40px rgba(15,23,42,0.06)">
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0D9488">Project <span style="font-family:'JetBrains Mono',Consolas,monospace">${escapeHtml(input.projectCode)}</span></p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:#0F172A">${escapeHtml(input.heading)}</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#475569">Hi ${escapeHtml(first)},</p>
    ${paragraphs}
    <p style="margin:24px 0 28px"><a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;background:#0D9488;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:13px 22px;border-radius:10px">${escapeHtml(input.ctaLabel)}</a></p>
    <p style="margin:0;padding-top:18px;border-top:1px solid #E8EAED;font-size:12px;line-height:1.6;color:#64748B">Sign in with your Client ID or email. Questions? WhatsApp us on 07063421088.<br/>EduCraft, Academic &amp; Technical Documentation Experts.</p>
  </div>
</body></html>`;

  return { subject, html, text };
}
