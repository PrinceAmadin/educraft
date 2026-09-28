/**
 * Phase D10: fires once per calendar month when month-to-date Claude spend
 * crosses the threshold the founder set on /admin/finance/ai-usage.
 *
 * Called from ai-usage-log.ts's `logAiUsage` in waitUntil after every write:
 * a cheap read of two Setting rows plus one aggregate, unless the threshold
 * is unset or the month's alert has already fired. Reuses the founder's alert
 * inbox path (getAlertEmails → sendMail); no COO/HOG routing.
 *
 * Idempotency: the last-sent-month key ("2026-09") is compared to the current
 * month. If they match, the check returns without touching the database. If
 * they differ AND the threshold is crossed, the key is written first (compare-
 * and-set on the row we read), then the email is sent. Two racing calls
 * therefore send at most once, and a failed send does not send twice: the
 * key was already written.
 */

import { getAlertEmails } from "@/lib/services/settings";
import { sendMail } from "@/lib/mailer";
import { mayNotify } from "@/lib/qa-scope";
import { aiUsageThresholdAlert } from "@/lib/emails/ai-usage-alerts";
import { db } from "@/lib/db";
import { MONTHLY_THRESHOLD_KEY, MONTHLY_THRESHOLD_LAST_SENT_KEY, getMonthlySummary, monthKey } from "@/lib/services/ai-usage";

const TAG = "[ai-usage-alert]";

/** Human-readable month for the email subject and body: "September 2026" (Africa/Lagos date). */
function monthLabel(now = new Date()): string {
  return new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric", timeZone: "Africa/Lagos" }).format(now);
}

/**
 * Returns:
 *  - "already_sent" — the key equals this month.
 *  - "not_set" — no threshold in Setting.
 *  - "below" — spend under the threshold.
 *  - "sent" — the email went out.
 *  - "not_sent" — over threshold, key claim succeeded but sendMail failed (logged; no retry).
 */
export type AiUsageAlertResult = "already_sent" | "not_set" | "below" | "sent" | "not_sent";

export async function checkMonthlyThreshold(now = new Date()): Promise<AiUsageAlertResult> {
  const currentMonth = monthKey(now);
  const [thresholdRow, lastSentRow] = await Promise.all([
    db.setting.findUnique({ where: { key: MONTHLY_THRESHOLD_KEY }, select: { value: true } }),
    db.setting.findUnique({ where: { key: MONTHLY_THRESHOLD_LAST_SENT_KEY }, select: { id: true, value: true } }),
  ]);
  if (lastSentRow?.value === currentMonth) return "already_sent";
  const threshold = Number(thresholdRow?.value);
  if (!Number.isFinite(threshold) || threshold <= 0) return "not_set";

  const summary = await getMonthlySummary(now);
  if (summary.monthlyTotal < threshold) return "below";

  // Claim the alert for this month before the email goes out. Compare-and-set on the row we
  // just read: a second racer sees the fresh value and drops "already_sent" on the next tick.
  const claimed = lastSentRow
    ? await db.setting.updateMany({ where: { id: lastSentRow.id, value: lastSentRow.value ?? "" }, data: { value: currentMonth } })
    : await db.setting
        .create({ data: { key: MONTHLY_THRESHOLD_LAST_SENT_KEY, value: currentMonth } })
        .then(() => ({ count: 1 }))
        .catch(() => ({ count: 0 })); // another racer created it a moment ago
  if (claimed.count === 0) return "already_sent";

  const recipients = (await getAlertEmails()).map((e) => e.trim().toLowerCase()).filter((e) => e.length > 0 && mayNotify(e));
  if (recipients.length === 0) {
    console.warn(`${TAG} threshold crossed but no recipients (getAlertEmails returned nothing that passes mayNotify).`);
    return "not_sent";
  }
  try {
    const email = aiUsageThresholdAlert({
      monthLabel: monthLabel(now),
      monthlyTotal: summary.monthlyTotal,
      thresholdNaira: threshold,
      dailyBurn: summary.dailyBurn,
      projectedMonthEnd: summary.projectedMonthEnd,
      daysElapsed: summary.daysElapsed,
      daysRemaining: summary.daysRemaining,
    });
    const sent = await sendMail({ to: recipients.join(", "), ...email });
    if (sent.ok) {
      console.info(`${TAG} threshold ${threshold} crossed; emailed ${recipients.length} inbox(es)`);
      return "sent";
    }
    console.error(`${TAG} threshold crossed but the email failed: ${sent.error}`);
    return "not_sent";
  } catch (error) {
    console.error(`${TAG} threshold crossed but the email threw`, error);
    return "not_sent";
  }
}
