import { db } from "@/lib/db";
import { PROVISIONAL_WARN_DAYS, provisionalDaysLeft } from "@/lib/ambassador";
import { releaseSlotFor } from "@/lib/services/ambassador-roster";
import { notifyAdmins, notifyUsers } from "@/lib/services/notifications";
import { provisionalLapsedEmail, provisionalReminderEmail } from "@/lib/emails/ambassador-provisional";
import type { SendFn } from "@/lib/services/ambassador-weekly-report";

/**
 * The provisional-slot sweep.
 *
 * A new ambassador holds their slot for 30 days. One confirmed order and it is
 * theirs (see `graduateProvisional`); none, and this releases it so the next
 * applicant can have it. A reminder goes out once, nine days before.
 *
 * The lapse deliberately does NOT switch off their login: since "the email is
 * the person", that login may also carry their own client orders, and
 * deactivating it would lock a paying client out of their own dashboard. The
 * portal guard already refuses a non-Active ambassador profile, which is all
 * that is needed here.
 */

export const SWEEP_DAY_KEY = "ambassador_provisional_sweep_day";

export interface ProvisionalSweepResult {
  day: string;
  warned: number;
  lapsed: number;
  failed: number;
  failures: { ambassadorId: string; error: string }[];
  names: { warned: string[]; lapsed: string[] };
  skipped?: string;
  dryRun: boolean;
}

const selection = {
  id: true,
  ambassadorId: true,
  fullName: true,
  email: true,
  userId: true,
  legacySlotId: true,
  provisionalUntil: true,
} as const;

const dayKey = (now: Date) => now.toISOString().slice(0, 10);

export async function runProvisionalSweep(opts: {
  send: SendFn;
  siteUrl: string;
  dry?: boolean;
  force?: boolean;
  now?: Date;
}): Promise<ProvisionalSweepResult> {
  const now = opts.now ?? new Date();
  const day = dayKey(now);
  const warnFrom = new Date(now.getTime() + PROVISIONAL_WARN_DAYS * 86_400_000);

  const [toWarn, toLapse] = await Promise.all([
    db.ambassador.findMany({
      where: {
        activatedAt: null,
        provisionalWarnedAt: null,
        provisionalUntil: { gt: now, lte: warnFrom },
        status: "Active",
      },
      select: selection,
    }),
    db.ambassador.findMany({
      where: { activatedAt: null, provisionalUntil: { lte: now }, status: "Active" },
      select: selection,
    }),
  ]);

  const base: ProvisionalSweepResult = {
    day,
    warned: toWarn.length,
    lapsed: toLapse.length,
    failed: 0,
    failures: [],
    names: { warned: toWarn.map((a) => a.fullName), lapsed: toLapse.map((a) => a.fullName) },
    dryRun: Boolean(opts.dry),
  };

  if (opts.dry) return base;
  if (toWarn.length === 0 && toLapse.length === 0) return base;

  // Claim the day before sending, so a retried cron delivery cannot email the
  // same people twice; release it again if nothing actually went out.
  const already = await db.setting.findUnique({ where: { key: SWEEP_DAY_KEY } });
  if (already?.value === day && !opts.force) {
    return { ...base, skipped: "Today's sweep already ran." };
  }
  await db.setting.upsert({
    where: { key: SWEEP_DAY_KEY },
    create: { key: SWEEP_DAY_KEY, value: day },
    update: { value: day },
  });

  const fail = (id: string, err: unknown) => {
    base.failed += 1;
    base.failures.push({ ambassadorId: id, error: err instanceof Error ? err.message : String(err) });
  };

  for (const a of toWarn) {
    try {
      const daysLeft = provisionalDaysLeft(a.provisionalUntil!, now);
      if (a.email && a.legacySlotId) {
        const mail = provisionalReminderEmail({
          fullName: a.fullName,
          daysLeft,
          referralLink: `${opts.siteUrl}/EduCraftA/${a.legacySlotId}`,
          dashboardUrl: `${opts.siteUrl}/ambassador`,
        });
        const sent = await opts.send({ to: a.email, ...mail });
        if (!sent.ok) fail(a.ambassadorId, sent.error ?? "send failed");
      }
      if (a.userId) {
        await notifyUsers([a.userId], {
          title: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left to confirm your slot`,
          message: "One confirmed order from someone you referred makes your ambassador slot permanent.",
          type: "warning",
          link: "/ambassador",
        });
      }
      await db.ambassador.update({ where: { id: a.id }, data: { provisionalWarnedAt: now } });
    } catch (err) {
      fail(a.ambassadorId, err);
    }
  }

  for (const a of toLapse) {
    try {
      await db.$transaction(async (tx) => {
        // Claim it first: only the run that flips the status does the release.
        const claimed = await tx.ambassador.updateMany({
          where: { id: a.id, activatedAt: null, status: "Active" },
          data: { status: "Lapsed", provisionalUntil: null },
        });
        if (claimed.count === 0) return;
        if (a.legacySlotId) await releaseSlotFor(tx, a.legacySlotId);
      });

      if (a.email) {
        const mail = provisionalLapsedEmail({ fullName: a.fullName, applyUrl: `${opts.siteUrl}/apply` });
        const sent = await opts.send({ to: a.email, ...mail });
        if (!sent.ok) fail(a.ambassadorId, sent.error ?? "send failed");
      }
    } catch (err) {
      fail(a.ambassadorId, err);
    }
  }

  if (toLapse.length > 0) {
    await notifyAdmins({
      title: `${toLapse.length} ambassador slot${toLapse.length === 1 ? "" : "s"} released`,
      message: `${toLapse.map((a) => a.fullName).join(", ")} brought no confirmed order in 30 days.`,
      type: "info",
      link: "/admin/ambassadors",
    });
  }

  return base;
}
