import { escapeHtml } from "@/lib/mailer";
import { firstName } from "@/lib/utils";
import { SCREENING_TEXT } from "@/lib/screening/rules";
import { FINAL_TEXT } from "@/lib/screening/final-practical";
import type { HqFooter } from "@/lib/emails/application-decision";

/**
 * The one email a worker applicant gets when the COO sends them the Stage-1
 * screening test: a short note and the tokened link. No login, no password —
 * the link is the credential. (The decline, on failing, reuses
 * `applicationRejectedEmail`.)
 */
const footerText = (hq: HqFooter) =>
  `EduCraft, Academic & Technical Documentation Experts. Questions? Message us on WhatsApp at ${hq.phone}.`;

function shell(eyebrow: string, body: string, hq: HqFooter): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:32px 16px;background:#F8F9FA;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#0F172A">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:36px 32px;box-shadow:0 12px 40px rgba(15,23,42,0.06)">
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0D9488">${escapeHtml(eyebrow)}</p>
    ${body}
    <p style="margin:0;padding-top:18px;border-top:1px solid #E8EAED;font-size:12px;line-height:1.5;color:#64748B">${escapeHtml(footerText(hq))}</p>
  </div>
</body></html>`;
}

export function screeningInviteEmail(input: { fullName: string; url: string; hq: HqFooter }): {
  subject: string;
  html: string;
  text: string;
} {
  const first = firstName(input.fullName, input.fullName);
  const subject = SCREENING_TEXT.emailSubject;

  const text = [
    `Hi ${first},`,
    "",
    SCREENING_TEXT.emailLine,
    "",
    input.url,
    "",
    footerText(input.hq),
  ].join("\n");

  const html = shell(
    "EduCraft workers",
    `<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;color:#0F172A">Hi ${escapeHtml(first)},</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569">${escapeHtml(SCREENING_TEXT.emailLine)}</p>
    <p style="margin:0 0 24px"><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:12px 22px;background:#0D9488;color:#FFFFFF;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none">Take the screening test</a></p>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748B;word-break:break-word;overflow-wrap:anywhere">If the button does not work, open this link:<br/>${escapeHtml(input.url)}</p>`,
    input.hq
  );

  return { subject, html, text };
}

/** The invitation to the Stage-3 final assessment (sent after a screening pass). */
export function finalInviteEmail(input: { fullName: string; url: string; hq: HqFooter }): { subject: string; html: string; text: string } {
  const first = firstName(input.fullName, input.fullName);
  const text = [`Hi ${first},`, "", FINAL_TEXT.emailLine, "", input.url, "", footerText(input.hq)].join("\n");
  const html = shell(
    "EduCraft workers",
    `<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;color:#0F172A">Hi ${escapeHtml(first)},</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569">${escapeHtml(FINAL_TEXT.emailLine)}</p>
    <p style="margin:0 0 24px"><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:12px 22px;background:#0D9488;color:#FFFFFF;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none">Start the final assessment</a></p>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748B;word-break:break-word;overflow-wrap:anywhere">If the button does not work, open this link:<br/>${escapeHtml(input.url)}</p>`,
    input.hq
  );
  return { subject: FINAL_TEXT.emailSubject, html, text };
}
