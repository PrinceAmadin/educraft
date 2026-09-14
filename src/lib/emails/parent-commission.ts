import { escapeHtml } from "@/lib/mailer";
import { formatNaira } from "@/lib/utils";

export interface ParentCommissionEmailInput {
  parentName: string;
  subName: string;
  projectCode: string;
  jobDescription: string;
  jobAmount: number;
  rate: number;
  commission: number;
}

/**
 * "A sub-ambassador you brought in landed a job" — sent to a parent (Core)
 * ambassador when one of their subs is allocated a commission. Same shape as
 * the direct commission email, with the sub named as the source.
 */
export function parentCommissionEmail(
  input: ParentCommissionEmailInput
): { subject: string; html: string; text: string } {
  const first = input.parentName.trim().split(/\s+/)[0] || input.parentName;
  const amount = formatNaira(input.jobAmount);
  const commission = formatNaira(input.commission);

  const subject = `EduCraft — ${commission} parent commission on ${input.projectCode}`;

  const text = [
    `Hi ${first},`,
    "",
    `${input.subName}, a sub-ambassador you brought in, has a confirmed job.`,
    "",
    `Job: ${input.jobDescription}`,
    `Reference: ${input.projectCode}`,
    `Job amount: ${amount}`,
    `Your parent commission (${input.rate}%): ${commission}`,
    "",
    "Your commission is paid to the bank account on your ambassador record.",
    "",
    "EduCraft — Academic & Technical Documentation Experts",
  ].join("\n");

  const row = (label: string, value: string, mono = false) =>
    `<tr><td style="padding:10px 0;color:#64748B;font-size:14px;border-bottom:1px solid #E8EAED;width:45%">${label}</td>` +
    `<td style="padding:10px 0;color:#0F172A;font-size:14px;border-bottom:1px solid #E8EAED;text-align:right;${mono ? "font-family:'JetBrains Mono',Consolas,monospace;" : ""}">${value}</td></tr>`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:32px 16px;background:#F8F9FA;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#0F172A">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:36px 32px;box-shadow:0 12px 40px rgba(15,23,42,0.06)">
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0D9488">EduCraft ambassador programme</p>
    <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;color:#0F172A">You earned ${escapeHtml(commission)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569">Hi ${escapeHtml(first)}, ${escapeHtml(input.subName)} — a sub-ambassador you brought in — has a confirmed job.</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 24px">
      ${row("Job", escapeHtml(input.jobDescription))}
      ${row("Reference", escapeHtml(input.projectCode), true)}
      ${row("Job amount", escapeHtml(amount), true)}
      ${row(`Your parent commission (${input.rate}%)`, `<strong style="color:#0D9488">${escapeHtml(commission)}</strong>`, true)}
    </table>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569">Your commission is paid to the bank account on your ambassador record.</p>
    <p style="margin:0;padding-top:18px;border-top:1px solid #E8EAED;font-size:12px;color:#64748B">EduCraft — Academic &amp; Technical Documentation Experts. This is an automated message; reply on WhatsApp at 07063421088 with any questions.</p>
  </div>
</body></html>`;

  return { subject, html, text };
}
