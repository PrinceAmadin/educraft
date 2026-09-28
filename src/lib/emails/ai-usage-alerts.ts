/**
 * Phase D10: the monthly Claude-spend alert email.
 *
 * The founder sets a threshold on /admin/finance/ai-usage. When month-to-date
 * Claude spend crosses it, one email lands in the alert inboxes (Settings >
 * General > Email alerts; default amadinprince26@gmail.com) with the current
 * month total, the threshold, the daily burn and the projected month-end.
 *
 * Founder-only signal (no COO, no HOG): a cost overrun is his call to make.
 */

import { escapeHtml } from "@/lib/mailer";
import { siteUrl } from "@/lib/site-url";

export interface AiUsageAlertEmail {
  subject: string;
  html: string;
  text: string;
}

function formatNaira(n: number): string {
  return "NGN " + n.toLocaleString("en-NG", { maximumFractionDigits: 0 });
}

export function aiUsageThresholdAlert(input: {
  monthLabel: string; // "September 2026"
  monthlyTotal: number;
  thresholdNaira: number;
  dailyBurn: number;
  projectedMonthEnd: number;
  daysElapsed: number;
  daysRemaining: number;
}): AiUsageAlertEmail {
  const url = `${siteUrl()}/admin/finance/ai-usage`;
  const subject = `Claude spend for ${input.monthLabel} crossed ${formatNaira(input.thresholdNaira)}`;
  const rows: [string, string][] = [
    ["Month to date", formatNaira(input.monthlyTotal)],
    ["Threshold", formatNaira(input.thresholdNaira)],
    ["Daily burn (average so far)", formatNaira(input.dailyBurn) + " / day"],
    ["Projected month-end", formatNaira(input.projectedMonthEnd)],
    ["Days elapsed", `${input.daysElapsed}`],
    ["Days remaining", `${input.daysRemaining}`],
  ];
  const text = [
    `Claude spend for ${input.monthLabel} has crossed the threshold you set.`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "This is the one email you get this month for this threshold. The next one only fires next month, or after you change the threshold.",
    "",
    `Open the token-usage page: ${url}`,
    "",
    "EduCraft HQ, D10 monthly Claude-spend alert. Sent to the founder's inbox only.",
  ].join("\n");
  const rowHtml = ([label, value]: [string, string]) =>
    `<tr><td style="padding:10px 12px 10px 0;color:#64748B;font-size:14px;border-bottom:1px solid #E8EAED;width:52%;vertical-align:top">${escapeHtml(label)}</td>` +
    `<td style="padding:10px 0;color:#0F172A;font-size:14px;border-bottom:1px solid #E8EAED;text-align:right;font-family:'JetBrains Mono',Consolas,monospace">${escapeHtml(value)}</td></tr>`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:32px 16px;background:#F8F9FA;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#0F172A">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:32px 28px;box-shadow:0 12px 40px rgba(15,23,42,0.06)">
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0D9488">CLAUDE SPEND</p>
    <h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;font-weight:700;color:#0F172A">${escapeHtml(subject)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569">This is the one email for this month at this threshold. The next one fires next month, or after you change the threshold.</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 20px">
      ${rows.map(rowHtml).join("\n      ")}
    </table>
    <a href="${escapeHtml(url)}" style="display:inline-block;background:#0D9488;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:10px">Open the token-usage page</a>
    <p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #E8EAED;font-size:12px;line-height:1.5;color:#64748B">EduCraft HQ, D10 monthly Claude-spend alert. Sent to the founder's alert inbox (Settings &gt; General).</p>
  </div>
</body></html>`;
  return { subject, html, text };
}
