import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sendMail, escapeHtml } from "@/lib/mailer";
import { getHqContact } from "@/lib/services/hq-contact";
import { siteUrl } from "@/lib/site-url";
import { commissionEmail } from "@/lib/emails/commission";
import { payoutPaidEmail } from "@/lib/emails/payout";

/**
 * The email test harness (pre-launch hardening, Item 5): send one of each
 * cashflow email — a commission accrual, a payout-cleared notice and a weekly
 * statement summary — with sample data, so the founder can confirm delivery and
 * formatting before the first real run. It deliberately bypasses QA_NOTIFY_ONLY
 * (the whole point is one real email) and logs to the console + a CashflowAuditLog
 * row. Recipient = EMAIL_TEST_RECIPIENT, default clanc2181@gmail.com.
 */

export const DEFAULT_TEST_RECIPIENT = "clanc2181@gmail.com";

export function testEmailRecipient(): string {
  return process.env.EMAIL_TEST_RECIPIENT?.trim() || DEFAULT_TEST_RECIPIENT;
}

export interface TestEmailResult {
  kind: string;
  subject: string;
  ok: boolean;
  error: string | null;
}

function statementDigestSample(url: string, hq: { phone: string }): { subject: string; html: string; text: string } {
  const rows: [string, string][] = [
    ["Revenue (net)", "₦250,000"],
    ["Commissions accrued", "₦52,500"],
    ["Paid out", "₦40,000"],
    ["Cash position", "₦157,500"],
    ["Outstanding owed", "₦12,500"],
  ];
  const subject = "Weekly financial statement is ready (sample)";
  const html = [
    '<div style="font-family:Inter,Arial,sans-serif;color:#0F172A;max-width:520px;margin:0 auto;">',
    '<h1 style="font-size:19px;">Weekly financial statement (sample)</h1>',
    '<p style="font-size:14px;color:#475569;">Here is a sample of the weekly summary finance receives.</p>',
    '<table style="width:100%;border-collapse:collapse;font-size:14px;">',
    rows.map(([k, v]) => `<tr><td style="padding:4px 0;color:#475569;">${escapeHtml(k)}</td><td style="padding:4px 0;text-align:right;font-family:'JetBrains Mono',monospace;">${escapeHtml(v)}</td></tr>`).join(""),
    "</table>",
    `<p style="margin-top:16px;"><a href="${escapeHtml(url)}" style="color:#0D9488;">Open the full statement</a></p>`,
    `<p style="margin-top:16px;font-size:12px;color:#64748B;">EduCraft — Providing Affordable Academic Services. ${escapeHtml(hq.phone)}.</p>`,
    "</div>",
  ].join("");
  const text = ["Weekly financial statement (sample)", "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `Open the full statement: ${url}`].join("\n");
  return { subject, html, text };
}

export async function sendTestEmails(actorId: string): Promise<{ recipient: string; results: TestEmailResult[] }> {
  const recipient = testEmailRecipient();
  const hq = await getHqContact();
  const hqPhone = { phone: hq.phone };
  const dashboardUrl = `${siteUrl()}/ambassador`;

  const samples: { kind: string; build: () => { subject: string; html: string; text: string } }[] = [
    {
      kind: "commission-accrual",
      build: () => commissionEmail({ ambassadorName: "Test Ambassador", projectCode: "EC-00000", jobDescription: "Final year project (sample)", jobAmount: 70000, rate: 10, commission: 7000, hq: hqPhone }),
    },
    {
      kind: "payout-cleared",
      build: () => payoutPaidEmail({ recipientKind: "ambassador", name: "Test Ambassador", amount: 7000, periodLabel: "this week (sample)", lines: [{ label: "Commission · EC-00000", amount: 7000 }], accountLast4: "1234", dashboardUrl, reference: "BATCH-SAMPLE", hq: hqPhone }),
    },
    {
      kind: "weekly-statement",
      build: () => statementDigestSample(`${siteUrl()}/admin/finance/statements`, hqPhone),
    },
  ];

  const results: TestEmailResult[] = [];
  for (const s of samples) {
    const { subject, html, text } = s.build();
    const res = await sendMail({ to: recipient, subject: `[EduCraft test] ${subject}`, html, text });
    console.log(`[email-harness] ${s.kind} -> ${recipient}: ${res.ok ? "sent" : `error: ${res.error ?? "unknown"}`}`);
    results.push({ kind: s.kind, subject, ok: res.ok, error: res.error ?? null });
  }

  await db.cashflowAuditLog
    .create({ data: { actorUserId: actorId, action: "email_test", entityType: "EmailHarness", entityId: recipient, afterJson: { recipient, results } as unknown as Prisma.InputJsonValue } })
    .catch(() => undefined);

  return { recipient, results };
}
