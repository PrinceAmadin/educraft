import { db } from "@/lib/db";
import { watDayStart } from "@/lib/click-tracking/peak-hours";
import { ambassadorWeeklyEmail } from "@/lib/emails/ambassador-weekly";
import type { MailResult } from "@/lib/mailer";

/**
 * Weekly ambassador summary: last week's link performance, emailed every
 * Monday 08:00 WAT (Vercel cron, 07:00 UTC).
 *
 * "Last week" = the previous Monday 00:00 to this Monday 00:00, Nigerian time.
 * Archived (reset) clicks ARE included: a report about a past week is a
 * historical fact and an admin reset should not rewrite it. Test clicks and
 * bots are never counted, same as everywhere else.
 */

const DAY_MS = 86_400_000;
const WAT_OFFSET_MS = 3_600_000;
const COUNTED = ["UNIQUE", "RETURN", "DUPLICATE"] as const;
const SENT_WEEK_KEY = "ambassador_weekly_report_sent_week";
const SEND_BATCH = 5;

export interface WeekRange {
  /** Monday 00:00 WAT, as a UTC instant. */
  from: Date;
  /** The following Monday 00:00 WAT (exclusive). */
  to: Date;
}

/** The last complete Mon-Sun week (WAT) before `now`. */
export function previousWeek(now = Date.now()): WeekRange {
  const today = watDayStart(now);
  // Weekday of that WAT calendar day (0 = Sunday).
  const dow = new Date(today.getTime() + WAT_OFFSET_MS).getUTCDay();
  const thisMonday = new Date(today.getTime() - ((dow + 6) % 7) * DAY_MS);
  return { from: new Date(thisMonday.getTime() - 7 * DAY_MS), to: thisMonday };
}

export interface WeeklyReport {
  ambassadorId: string;
  name: string;
  email: string;
  slotCode: string;
  weekLabel: string;
  totalClicks: number;
  uniqueClicks: number;
  topCountry: { name: string; clicks: number } | null;
  /** Share of clicks on phones (mobile + tablet), 0-100. null with no clicks. */
  mobileShare: number | null;
  rank: number;
  rankOf: number;
}

function countryName(code: string | null): string {
  if (!code) return "Unknown";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

const DATE = new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short" });
export function weekLabel(range: WeekRange): string {
  // `to` is exclusive: the last day of the week is 1 ms before it.
  return `${DATE.format(range.from)} to ${DATE.format(new Date(range.to.getTime() - 1))}`;
}

/** One pass over the week's clicks, then one report per emailable ambassador. */
export async function buildWeeklyReports(range: WeekRange = previousWeek()) {
  const where = {
    isTestClick: false,
    ambassadorId: { not: null },
    timestamp: { gte: range.from, lt: range.to },
  } as const;

  const [ambassadors, unique, total, countries, devices] = await Promise.all([
    db.ambassador.findMany({
      where: { status: "Active" },
      select: { id: true, fullName: true, email: true, legacySlotId: true },
    }),
    db.clickEvent.groupBy({ by: ["ambassadorId"], where: { ...where, quality: "UNIQUE" }, _count: { _all: true } }),
    db.clickEvent.groupBy({ by: ["ambassadorId"], where: { ...where, quality: { in: [...COUNTED] } }, _count: { _all: true } }),
    db.clickEvent.groupBy({ by: ["ambassadorId", "country"], where: { ...where, quality: { in: [...COUNTED] }, country: { not: null } }, _count: { _all: true } }),
    db.clickEvent.groupBy({ by: ["ambassadorId", "device"], where: { ...where, quality: { in: [...COUNTED] } }, _count: { _all: true } }),
  ]);

  const uniqueBy = new Map(unique.map((g) => [g.ambassadorId!, g._count._all]));
  const totalBy = new Map(total.map((g) => [g.ambassadorId!, g._count._all]));

  const topCountryBy = new Map<string, { code: string; clicks: number }>();
  for (const g of countries) {
    const cur = topCountryBy.get(g.ambassadorId!);
    if (!cur || g._count._all > cur.clicks) topCountryBy.set(g.ambassadorId!, { code: g.country!, clicks: g._count._all });
  }
  const phoneBy = new Map<string, number>();
  for (const g of devices) {
    if (g.device === "mobile" || g.device === "tablet") {
      phoneBy.set(g.ambassadorId!, (phoneBy.get(g.ambassadorId!) ?? 0) + g._count._all);
    }
  }

  // Rank among every active ambassador by last week's unique clicks (ties by name).
  const ranked = [...ambassadors].sort(
    (a, b) => (uniqueBy.get(b.id) ?? 0) - (uniqueBy.get(a.id) ?? 0) || a.fullName.localeCompare(b.fullName)
  );
  const rankOf = new Map(ranked.map((a, i) => [a.id, i + 1]));
  const label = weekLabel(range);

  const reports: WeeklyReport[] = ambassadors
    // Only people we can email and who have a link to track.
    .filter((a) => a.email && a.legacySlotId)
    .map((a) => {
      const clicks = totalBy.get(a.id) ?? 0;
      const top = topCountryBy.get(a.id);
      return {
        ambassadorId: a.id,
        name: a.fullName,
        email: a.email!,
        slotCode: a.legacySlotId!,
        weekLabel: label,
        totalClicks: clicks,
        uniqueClicks: uniqueBy.get(a.id) ?? 0,
        topCountry: top ? { name: countryName(top.code), clicks: top.clicks } : null,
        mobileShare: clicks > 0 ? Math.round(((phoneBy.get(a.id) ?? 0) / clicks) * 100) : null,
        rank: rankOf.get(a.id)!,
        rankOf: ambassadors.length,
      };
    });

  return { range, label, reports };
}

// ── Running the job ──────────────────────────────────────────

export type SendFn = (message: { to: string; subject: string; html: string; text: string }) => Promise<MailResult>;

export interface WeeklyRunResult {
  week: string;
  weekStart: string;
  recipients: number;
  sent: number;
  failed: number;
  failures: { ambassadorId: string; error: string }[];
  skipped?: string;
  dryRun: boolean;
}

/**
 * Sends (or, with `dry`, only counts) the weekly emails.
 *
 * A Setting row remembers which week was already sent, so a duplicate cron
 * delivery cannot email everyone twice. The week is claimed BEFORE sending and
 * released if nothing went out, so a total failure can be retried.
 */
export async function runWeeklyReport(opts: {
  send: SendFn;
  dashboardUrl: string;
  dry?: boolean;
  force?: boolean;
  now?: number;
}): Promise<WeeklyRunResult> {
  const range = previousWeek(opts.now);
  const { reports, label } = await buildWeeklyReports(range);

  // Only report a week that click tracking covered from its first hour.
  // Otherwise a week that began before tracking would tell every ambassador
  // "no clicks last week", which is wrong and discouraging. Archived rows count
  // here: a reset must not make tracking look like it started later.
  const firstTracked = await db.clickEvent.findFirst({
    where: { isTestClick: false, ambassadorId: { not: null } },
    orderBy: { timestamp: "asc" },
    select: { timestamp: true },
  });
  const coverage: string | undefined =
    !firstTracked || firstTracked.timestamp > range.from
      ? "Click tracking did not cover all of this week yet, so no report was sent."
      : undefined;

  const base: WeeklyRunResult = {
    week: label,
    weekStart: range.from.toISOString(),
    recipients: reports.length,
    sent: 0,
    failed: 0,
    failures: [],
    dryRun: Boolean(opts.dry),
  };
  if (coverage && !opts.force) return { ...base, skipped: coverage };
  if (opts.dry) return base;

  const already = await db.setting.findUnique({ where: { key: SENT_WEEK_KEY } });
  if (already?.value === base.weekStart && !opts.force) {
    return { ...base, skipped: "This week's report was already sent." };
  }
  await db.setting.upsert({
    where: { key: SENT_WEEK_KEY },
    create: { key: SENT_WEEK_KEY, value: base.weekStart },
    update: { value: base.weekStart },
  });

  for (let i = 0; i < reports.length; i += SEND_BATCH) {
    const batch = reports.slice(i, i + SEND_BATCH);
    const results = await Promise.all(
      batch.map(async (r) => {
        try {
          const mail = ambassadorWeeklyEmail(r, { dashboardUrl: opts.dashboardUrl });
          return { r, res: await opts.send({ to: r.email, ...mail }) };
        } catch (e) {
          return { r, res: { ok: false, error: e instanceof Error ? e.message : String(e) } as MailResult };
        }
      })
    );
    for (const { r, res } of results) {
      if (res.ok) base.sent += 1;
      else {
        base.failed += 1;
        base.failures.push({ ambassadorId: r.ambassadorId, error: res.error ?? "send failed" });
      }
    }
  }

  // Nothing went out at all: release the claim so the next run can retry.
  if (base.sent === 0 && base.recipients > 0) {
    await db.setting.deleteMany({ where: { key: SENT_WEEK_KEY, value: base.weekStart } });
  }
  return base;
}
