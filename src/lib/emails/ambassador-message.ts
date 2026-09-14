import { escapeHtml } from "@/lib/mailer";

/**
 * A one-off message from the admin to a single ambassador, or the same
 * message broadcast to all of them. Mirrors the old panel's Message /
 * Broadcast emails in HQ's palette: white surface, teal accent, no icons.
 */
export function ambassadorMessageEmail(input: {
  ambassadorName: string;
  title: string;
  message: string;
  /** True for a broadcast — drops the "sent directly to you" footer line. */
  broadcast?: boolean;
}): { subject: string; html: string; text: string } {
  const first = input.ambassadorName.trim().split(/\s+/)[0] || input.ambassadorName;
  const subject = `EduCraft — ${input.title}`;
  const bodyText = input.message.trim();

  const text = [`Hi ${first},`, "", bodyText, "", "EduCraft — Academic & Technical Documentation Experts"].join(
    "\n"
  );

  const bodyHtml = escapeHtml(bodyText).replace(/\n/g, "<br/>");
  const footer = input.broadcast
    ? "This message was sent to every active EduCraft ambassador."
    : "This message was sent directly to you by the EduCraft admin team.";

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:32px 16px;background:#F8F9FA;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#0F172A">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:36px 32px;box-shadow:0 12px 40px rgba(15,23,42,0.06)">
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0D9488">EduCraft ambassador programme</p>
    <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;color:#0F172A">${escapeHtml(input.title)}</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569">Hi ${escapeHtml(first)},</p>
    <div style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#0F172A">${bodyHtml}</div>
    <p style="margin:0;padding-top:18px;border-top:1px solid #E8EAED;font-size:12px;color:#64748B">EduCraft — Academic &amp; Technical Documentation Experts. ${footer}</p>
  </div>
</body></html>`;

  return { subject, html, text };
}
