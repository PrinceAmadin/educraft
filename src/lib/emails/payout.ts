import { escapeHtml } from "@/lib/mailer";

/**
 * Payout emails (Phase 5), pure builders returning { subject, html, text }.
 * All dynamic data — the pre-built dashboard URL and the HQ contact — arrives
 * as props; the service layer resolves siteUrl()/getHqContact(). The amount in
 * the email is the same figure the queue screen and the Excel export show.
 */

const naira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");

function shell(title: string, bodyHtml: string, hq: { phone: string }): string {
  return [
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>',
    '<body style="margin:0;padding:24px;background:#F8F9FA;font-family:Inter,Segoe UI,Arial,sans-serif;color:#475569;">',
    '<div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;box-shadow:0 12px 40px rgba(15,23,42,0.06);padding:28px;">',
    `<h1 style="margin:0 0 16px;font-size:19px;color:#0F172A;">${escapeHtml(title)}</h1>`,
    bodyHtml,
    `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #E8EAED;font-size:12px;color:#64748B;">EduCraft — Providing Affordable Academic Services<br/>Questions? WhatsApp or call ${escapeHtml(hq.phone)}.</p>`,
    "</div></body></html>",
  ].join("");
}

export interface PayoutPaidInput {
  recipientKind: "worker" | "ambassador" | "executive";
  name: string;
  amount: number;
  periodLabel: string;
  /** The breakdown lines (e.g. "Chapter work · EC-01234" → amount), may be empty. */
  lines: { label: string; amount: number }[];
  /** Last 4 of the account the transfer went to, or null. */
  accountLast4: string | null;
  dashboardUrl: string;
  reference: string | null;
  hq: { phone: string };
}

export function payoutPaidEmail(input: PayoutPaidInput): { subject: string; html: string; text: string } {
  const noun = input.recipientKind === "worker" ? "payment" : "commission";
  const subject = `Your EduCraft ${noun} of ${naira(input.amount)} has been sent`;
  const linesHtml = input.lines.length
    ? `<table style="width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:14px;">${input.lines
        .map(
          (l) =>
            `<tr><td style="padding:4px 0;color:#475569;">${escapeHtml(l.label)}</td><td style="padding:4px 0;text-align:right;font-family:'JetBrains Mono',monospace;color:#0F172A;">${naira(l.amount)}</td></tr>`
        )
        .join("")}</table>`
    : "";
  const toLine = input.accountLast4 ? `<p style="margin:0 0 12px;font-size:14px;">Sent to your account ending ${escapeHtml(input.accountLast4)}.</p>` : "";
  const refLine = input.reference ? `<p style="margin:0 0 12px;font-size:13px;color:#64748B;">Reference: ${escapeHtml(input.reference)}</p>` : "";
  const body = [
    `<p style="margin:0 0 12px;font-size:15px;">Hi ${escapeHtml(input.name)},</p>`,
    `<p style="margin:0 0 12px;font-size:15px;">Your ${noun} for ${escapeHtml(input.periodLabel)} has been transferred.</p>`,
    `<p style="margin:0 0 8px;font-size:28px;font-family:'JetBrains Mono',monospace;color:#0D9488;">${naira(input.amount)}</p>`,
    linesHtml,
    toLine,
    refLine,
    `<p style="margin:16px 0 0;"><a href="${escapeHtml(input.dashboardUrl)}" style="display:inline-block;background:#0D9488;color:#FFFFFF;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px;">View your dashboard</a></p>`,
  ].join("");
  const text = [
    `Hi ${input.name},`,
    "",
    `Your ${noun} for ${input.periodLabel} has been transferred: ${naira(input.amount)}.`,
    ...input.lines.map((l) => `  ${l.label}: ${naira(l.amount)}`),
    input.accountLast4 ? `Sent to your account ending ${input.accountLast4}.` : "",
    input.reference ? `Reference: ${input.reference}` : "",
    "",
    `View your dashboard: ${input.dashboardUrl}`,
    "",
    `EduCraft — Providing Affordable Academic Services. Questions? WhatsApp or call ${input.hq.phone}.`,
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, html: shell(`Your ${noun} has been sent`, body, input.hq), text };
}

export interface BankReminderInput {
  name: string;
  amount: number;
  addBankUrl: string;
  hq: { phone: string };
}

export function bankDetailsReminderEmail(input: BankReminderInput): { subject: string; html: string; text: string } {
  const subject = "Add your bank details to receive your EduCraft payment";
  const body = [
    `<p style="margin:0 0 12px;font-size:15px;">Hi ${escapeHtml(input.name)},</p>`,
    `<p style="margin:0 0 12px;font-size:15px;">You have <strong>${naira(input.amount)}</strong> ready to be paid, but we do not have your bank details on file yet, so we could not include you in the latest payout.</p>`,
    `<p style="margin:0 0 16px;font-size:15px;">Please add your bank name, account number and account name so we can send it in the next run.</p>`,
    `<p style="margin:0;"><a href="${escapeHtml(input.addBankUrl)}" style="display:inline-block;background:#0D9488;color:#FFFFFF;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px;">Add my bank details</a></p>`,
  ].join("");
  const text = [
    `Hi ${input.name},`,
    "",
    `You have ${naira(input.amount)} ready to be paid, but we do not have your bank details yet, so we could not include you in the latest payout.`,
    "Please add your bank name, account number and account name so we can send it next time:",
    input.addBankUrl,
    "",
    `EduCraft — Providing Affordable Academic Services. Questions? WhatsApp or call ${input.hq.phone}.`,
  ].join("\n");
  return { subject, html: shell("Add your bank details", body, input.hq), text };
}
