/**
 * Send the three sample cashflow emails (commission accrual, payout cleared,
 * weekly statement summary) to EMAIL_TEST_RECIPIENT (default clanc2181@gmail.com).
 * Pre-launch hardening, Item 5 — the founder's "run the email harness" step.
 *
 *   npm run email:test
 *
 * Uses the live Gmail sender and writes one CashflowAuditLog row. It sends a
 * REAL email, on purpose.
 */
import { sendTestEmails, testEmailRecipient } from "@/lib/services/finance/email-harness";

async function main() {
  console.log(`Sending test emails to ${testEmailRecipient()} …`);
  const { recipient, results } = await sendTestEmails("cli");
  for (const r of results) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.kind}: ${r.ok ? "sent" : r.error ?? "error"}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? `\n${failed.length} failed. Check GMAIL_USER / GMAIL_APP_PASSWORD.` : `\nAll sent to ${recipient}. Check the inbox.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
