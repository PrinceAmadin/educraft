import { escapeHtml } from "@/lib/mailer";

/** The verification code email (used to set or reset the password). Short and plain: the code, how long it lasts, and what to do if it was not them. */
export function clientCodeEmail(input: {
  fullName: string;
  code: string;
  minutes: number;
  /** The line above the code; defaults to the password-setup wording. */
  purpose?: string;
}): { subject: string; html: string; text: string } {
  const first = input.fullName.trim().split(/\s+/)[0] || "there";
  const subject = `${input.code} is your EduCraft verification code`;

  const text = [
    `Hi ${first},`,
    "",
    `Your EduCraft verification code is ${input.code}.`,
    `It works once and expires in ${input.minutes} minutes.`,
    "",
    "If you did not ask for this, ignore this email. Nobody can set or change your password without this code.",
    "",
    "EduCraft, Academic & Technical Documentation Experts",
  ].join("\n");

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:32px 16px;background:#F8F9FA;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#0F172A">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:36px 32px;box-shadow:0 12px 40px rgba(15,23,42,0.06)">
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0D9488">EduCraft sign-in</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:#0F172A">Your code, ${escapeHtml(first)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569">${escapeHtml(input.purpose ?? "Enter this code to set your dashboard password.")}</p>
    <p style="margin:0 0 20px;padding:18px 0;text-align:center;background:#F1F3F5;border-radius:12px;font-size:32px;font-weight:600;letter-spacing:10px;font-family:'JetBrains Mono',Consolas,monospace;color:#0F172A">${escapeHtml(input.code)}</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#475569">It works once and expires in ${input.minutes} minutes.</p>
    <p style="margin:0;padding-top:18px;border-top:1px solid #E8EAED;font-size:12px;line-height:1.6;color:#64748B">If you did not ask for this, ignore this email. Nobody can set or change your password without this code.<br/>EduCraft, Academic &amp; Technical Documentation Experts.</p>
  </div>
</body></html>`;

  return { subject, html, text };
}
