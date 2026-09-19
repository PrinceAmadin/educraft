import { escapeHtml } from "@/lib/mailer";
import type { WeeklyReport } from "@/lib/services/ambassador-weekly-report";

/**
 * The Monday summary email. Same palette as the other ambassador emails (white
 * surface on the light page, teal accent), laid out with tables so it holds up
 * in Gmail, Outlook and phone clients. Only the ambassador's own numbers: no
 * orders, no other people's stats.
 */
export function ambassadorWeeklyEmail(
  r: WeeklyReport,
  opts: { dashboardUrl: string; unsubscribeUrl: string }
): { subject: string; html: string; text: string } {
  const first = r.name.trim().split(/\s+/)[0] || r.name;
  const quiet = r.totalClicks === 0;
  const n = (v: number) => v.toLocaleString("en-NG");
  const rankLine = `#${r.rank} of ${r.rankOf} ambassadors`;

  const subject = quiet
    ? `Your EduCraft week: a fresh start, ${r.weekLabel}`
    : `Your EduCraft week: ${n(r.totalClicks)} click${r.totalClicks === 1 ? "" : "s"}, ranked #${r.rank}`;

  const headline = quiet
    ? "No clicks on your link last week"
    : `${n(r.uniqueClicks)} different people opened your link`;
  const intro = quiet
    ? "Nobody opened your link last week. Share it in your class group or on your status on Monday and it will start counting straight away."
    : `Here is how your link did from ${r.weekLabel}.`;

  const stats: { label: string; value: string }[] = [
    { label: "Total clicks", value: n(r.totalClicks) },
    { label: "Unique clicks", value: n(r.uniqueClicks) },
    { label: "Top country", value: r.topCountry ? `${r.topCountry.name} (${n(r.topCountry.clicks)})` : "None yet" },
    {
      label: "Top device",
      value:
        r.mobileShare === null
          ? "None yet"
          : r.mobileShare >= 50
            ? `Mobile, ${r.mobileShare}%`
            : `Desktop, ${100 - r.mobileShare}%`,
    },
  ];

  const text = [
    `Hi ${first},`,
    "",
    headline + ".",
    intro,
    "",
    ...stats.map((s) => `${s.label}: ${s.value}`),
    ...(quiet ? [] : [`Leaderboard: ${rankLine}`]),
    "",
    `Open your dashboard: ${opts.dashboardUrl}`,
    "",
    "EduCraft, Academic & Technical Documentation Experts",
    `Stop the weekly summary: ${opts.unsubscribeUrl}`,
  ].join("\n");

  const cell = (s: { label: string; value: string }) => `
        <td width="50%" style="padding:14px 16px;vertical-align:top">
          <p style="margin:0 0 4px;font-size:12px;color:#64748B">${escapeHtml(s.label)}</p>
          <p style="margin:0;font-size:20px;font-weight:600;color:#0F172A;font-family:'JetBrains Mono',Consolas,monospace">${escapeHtml(s.value)}</p>
        </td>`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:32px 16px;background:#F8F9FA;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#0F172A">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:36px 32px;box-shadow:0 12px 40px rgba(15,23,42,0.06)">
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0D9488">Your week on EduCraft, ${escapeHtml(r.weekLabel)}</p>
    <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:700;color:#0F172A">${escapeHtml(headline)}</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#475569">Hi ${escapeHtml(first)}, ${escapeHtml(intro.charAt(0).toLowerCase() + intro.slice(1))}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;background:#F1F3F5;border-radius:12px">
      <tr>${cell(stats[0])}${cell(stats[1])}</tr>
      <tr>${cell(stats[2])}${cell(stats[3])}</tr>
    </table>
    ${
      quiet
        ? ""
        : `<p style="margin:0 0 24px;padding:14px 16px;background:#E6F4F2;border-radius:12px;font-size:15px;color:#0F172A">
      <span style="color:#475569">Leaderboard position</span><br/>
      <strong style="font-size:18px;color:#0D9488">${escapeHtml(rankLine)}</strong>
    </p>`
    }
    <p style="margin:0 0 26px"><a href="${escapeHtml(opts.dashboardUrl)}" style="display:inline-block;padding:12px 22px;background:#0D9488;color:#FFFFFF;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none">Open my dashboard</a></p>
    <p style="margin:0;padding-top:18px;border-top:1px solid #E8EAED;font-size:12px;line-height:1.6;color:#64748B">EduCraft, Academic &amp; Technical Documentation Experts.<br/>You get this every Monday because you are an EduCraft ambassador. <a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#64748B;text-decoration:underline">Stop the weekly summary</a></p>
  </div>
</body></html>`;

  return { subject, html, text };
}
