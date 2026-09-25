import { db } from "@/lib/db";
import { AMBASSADOR_TIERS, PLATINUM_QUARTERLY_BONUS_PER_CLIENT, tierFor } from "@/lib/finance/commission-config";
import {
  RHYTHM_POSTS,
  contentConsistencyOf,
  platinumBonusQuarter,
  previousQuarterKey,
  quarterKeyOf,
  quarterSpan,
  type ContentConsistency,
} from "@/lib/command-center/derive";
import { DAY_MS, monthBounds, weekBuckets } from "@/lib/command-center/time";
import { formatWatDate } from "@/lib/command-center/presentation";
import type { CcAlert, FeedEvent, TierKey, TierPromotion } from "@/lib/command-center/types";
import { formatNaira } from "@/lib/utils";
import { afterMerge } from "./merge-guard";

/**
 * Phase 3 (Ambassador Platform) sources for the Command Center.
 *
 * `AmbassadorReferral`, `AmbassadorTierLog`, `AmbassadorContentLog`,
 * `Ambassador.lifetimeConversions` and `PayoutRecord.bonusKey` come with the
 * phase-3 branch (its migrations are already applied to the database, but
 * the branch is not merged into this one). Each query on them is written
 * against phase-3's schema and marked `// requires Phase 3 merge`. This
 * branch's Prisma client does not know them, so the queries reach them
 * through `p3` — `db` seen through the few methods used here — and
 * `afterMerge` skips them until the schema has them (see merge-guard.ts).
 * After the merge they run as written; change the `p3` line to
 * `const p3 = db;` to have tsc check them against the real schema.
 *
 * Every function returns null while its source is missing, and the caller
 * decides: main's own records where they give the same figure, or
 * "not yet on this dashboard".
 */

// requires Phase 3 merge: the models and columns phase-3 adds, as this file uses them.
interface Phase3Models {
  ambassadorReferral: { findMany(args: object): Promise<unknown> };
  ambassadorTierLog: { findMany(args: object): Promise<unknown> };
  ambassadorContentLog: { findMany(args: object): Promise<unknown> };
  ambassador: { findMany(args: object): Promise<unknown> };
  payoutRecord: { findMany(args: object): Promise<unknown> };
}
const p3 = db as unknown as Phase3Models;

/** Suspended and terminated ambassadors are outside the network's figures (`CLOSED` in Phase 3's services). */
export const CLOSED_AMBASSADOR_STATUSES = ["Suspended", "Terminated"] as const;

/** Days after a quarter ends before an unpaid Platinum bonus is an alert (spec: "unpaid >7 days after quarter end"). */
const PLATINUM_GRACE_DAYS = 7;

/** The rhythm posts' names in the HOG's picker (`CONTENT_PICKER_LABELS`, @/lib/ambassadors/content-types). */
const CONTENT_LABELS: Record<string, string> = {
  MONDAY_FLIER: "Monday flier",
  WEDS_CHECKIN: "Midweek check-in",
  FRIDAY_SPOTLIGHT: "Friday spotlight",
  OTHER: "Other post",
};

const TIER_ORDER: readonly string[] = AMBASSADOR_TIERS.map((t) => t.name);

function isTier(v: string): v is TierKey {
  return TIER_ORDER.includes(v);
}

function tierLabel(tier: string): string {
  return AMBASSADOR_TIERS.find((t) => t.name === tier)?.label ?? tier;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ── Tier changes ──────────────────────────────────────────────────

interface TierLogRow {
  id: string;
  fromTier: string;
  toTier: string;
  conversions: number;
  createdAt: Date;
  ambassador: { id: string; fullName: string };
}

async function tierLogBetween(from: Date, to: Date | null): Promise<TierLogRow[] | null> {
  return afterMerge(3, "AmbassadorTierLog", [{ model: "AmbassadorTierLog" }], async () => {
    // requires Phase 3 merge: AmbassadorTierLog, one row per tier change (written by recountAmbassador).
    return (await p3.ambassadorTierLog.findMany({
      where: { createdAt: to ? { gte: from, lt: to } : { gte: from } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        fromTier: true,
        toTier: true,
        conversions: true,
        createdAt: true,
        ambassador: { select: { id: true, fullName: true } },
      },
    })) as TierLogRow[];
  });
}

/** Feed lines for every tier change since midnight: "Ambassador tier up: David Obi → Silver (6 conversions reached)". */
export async function tierChangesToday(dayStart: Date): Promise<FeedEvent[] | null> {
  const rows = await tierLogBetween(dayStart, null);
  if (!rows) return null;
  return rows.map((r) => {
    const up = TIER_ORDER.indexOf(r.toTier) > TIER_ORDER.indexOf(r.fromTier);
    return {
      id: `tier:${r.id}`,
      kind: "tier" as const,
      at: r.createdAt.toISOString(),
      title: up
        ? `Ambassador tier up: ${r.ambassador.fullName} → ${tierLabel(r.toTier)} (${plural(r.conversions, "conversion")} reached)`
        : `Ambassador tier down: ${r.ambassador.fullName} → ${tierLabel(r.toTier)} (${plural(r.conversions, "conversion")})`,
      detail: `${tierLabel(r.fromTier)} → ${tierLabel(r.toTier)}`,
      href: `/admin/ambassadors/${r.ambassador.id}`,
    };
  });
}

/** Promotions (a move up the ladder) during the month, newest first. */
export async function tierPromotions(month: string): Promise<TierPromotion[] | null> {
  const { start, end } = monthBounds(month);
  const rows = await tierLogBetween(start, end);
  if (!rows) return null;
  return rows.flatMap((r) => {
    const from = r.fromTier;
    const to = r.toTier;
    if (!isTier(from) || !isTier(to) || TIER_ORDER.indexOf(to) <= TIER_ORDER.indexOf(from)) return [];
    return [
      {
        ambassadorId: r.ambassador.id,
        name: r.ambassador.fullName,
        from,
        to,
        at: r.createdAt.toISOString(),
        href: `/admin/ambassadors/${r.ambassador.id}`,
      },
    ];
  });
}

// ── Platinum quarterly bonuses ────────────────────────────────────

interface BonusRecordRow {
  bonusKey: string | null;
  recipientId: string;
  amount: number;
}

/**
 * CRITICAL: a Platinum quarterly bonus still unpaid more than 7 days after
 * its quarter ended. Two ways that happens:
 * - processed but not paid: a PENDING "platinum:Qn-YYYY:<id>" payout record,
 *   grouped into one row per quarter;
 * - never processed: last quarter's Platinum ambassadors had clients in it
 *   but nobody pressed "Process Qn bonuses", so no record exists yet.
 *   Eligibility mirrors Phase 3's quarterly tracker: Platinum by lifetime
 *   conversions, not suspended or terminated, ₦3,000 per client converted
 *   in the quarter.
 */
export async function platinumBonusAlerts(now: Date): Promise<CcAlert[] | null> {
  const needs = [
    { model: "PayoutRecord", fields: ["bonusKey"] },
    { model: "AmbassadorReferral" },
    { model: "Ambassador", fields: ["lifetimeConversions"] },
  ];
  return afterMerge(3, "Platinum quarterly bonuses", needs, async () => {
    const graceMs = PLATINUM_GRACE_DAYS * DAY_MS;
    const alerts: CcAlert[] = [];

    // requires Phase 3 merge: PayoutRecord.bonusKey ("platinum:Q3-2026:<ambassadorId>", leg BONUS).
    const pending = (await p3.payoutRecord.findMany({
      where: { leg: "BONUS", status: "PENDING", bonusKey: { startsWith: "platinum:" } },
      select: { bonusKey: true, recipientId: true, amount: true },
    })) as BonusRecordRow[];
    const byQuarter = new Map<string, { recipients: Set<string>; amount: number }>();
    for (const r of pending) {
      const key = platinumBonusQuarter(r.bonusKey);
      if (!key) continue;
      const q = byQuarter.get(key) ?? { recipients: new Set<string>(), amount: 0 };
      q.recipients.add(r.recipientId);
      q.amount += r.amount;
      byQuarter.set(key, q);
    }
    for (const key of [...byQuarter.keys()].sort()) {
      const span = quarterSpan(key);
      const q = byQuarter.get(key);
      if (!span || !q || now.getTime() < span.end.getTime() + graceMs) continue;
      alerts.push({
        key: `platinum_bonus:unpaid:${key}`,
        severity: "critical",
        kind: "platinum_bonus",
        title: "Platinum quarterly bonuses unpaid",
        detail: `${span.label} — ${plural(q.recipients.size, "ambassador")}, ${formatNaira(Math.round(q.amount))} pending`,
        meta: `Due since ${formatWatDate(new Date(span.end.getTime() + graceMs))} · Finance action needed`,
        href: `/admin/finance/payouts?month=${span.payoutMonth}`,
        hrefLabel: "Go to payouts",
      });
    }

    const lastKey = previousQuarterKey(quarterKeyOf(now));
    const last = lastKey ? quarterSpan(lastKey) : null;
    if (last && now.getTime() >= last.end.getTime() + graceMs) {
      // requires Phase 3 merge: AmbassadorReferral (status CONVERTED, convertedAt).
      const converted = (await p3.ambassadorReferral.findMany({
        where: { status: "CONVERTED", convertedAt: { gte: last.start, lt: last.end } },
        select: { ambassadorId: true },
      })) as { ambassadorId: string }[];
      const clients = new Map<string, number>();
      for (const c of converted) clients.set(c.ambassadorId, (clients.get(c.ambassadorId) ?? 0) + 1);
      if (clients.size > 0) {
        const [ambassadors, records] = await Promise.all([
          // requires Phase 3 merge: Ambassador.lifetimeConversions (what the tier ladder counts).
          p3.ambassador.findMany({
            where: { id: { in: [...clients.keys()] }, status: { notIn: [...CLOSED_AMBASSADOR_STATUSES] } },
            select: { id: true, lifetimeConversions: true },
          }) as Promise<{ id: string; lifetimeConversions: number }[]>,
          // requires Phase 3 merge: PayoutRecord.bonusKey.
          p3.payoutRecord.findMany({
            where: { bonusKey: { startsWith: `platinum:${last.key}:` }, status: { not: "CANCELLED" } },
            select: { bonusKey: true, recipientId: true, amount: true },
          }) as Promise<BonusRecordRow[]>,
        ]);
        const recorded = new Set(records.map((r) => r.recipientId));
        const owed = ambassadors.filter((a) => tierFor(a.lifetimeConversions) === "PLATINUM" && !recorded.has(a.id));
        if (owed.length > 0) {
          const amount = owed.reduce((sum, a) => sum + (clients.get(a.id) ?? 0) * PLATINUM_QUARTERLY_BONUS_PER_CLIENT, 0);
          alerts.push({
            key: `platinum_bonus:unprocessed:${last.key}`,
            severity: "critical",
            kind: "platinum_bonus",
            title: "Platinum quarterly bonuses not processed",
            detail: `${last.label} — ${plural(owed.length, "ambassador")}, ${formatNaira(amount)} earned`,
            meta: `Due since ${formatWatDate(new Date(last.end.getTime() + graceMs))} · HOG action needed`,
            href: `/admin/ambassadors/commissions?tab=quarterly&quarter=${last.key}`,
            hrefLabel: "Go to bonus tracker",
          });
        }
      }
    }
    return alerts;
  });
}

// ── Content rhythm ────────────────────────────────────────────────

/** Weeks judged for content consistency: the last four full weeks (the current one may not have reached Friday). */
export const CONTENT_WEEKS = 4;

/**
 * Share of the three weekly rhythm posts (Monday flier, midweek check-in,
 * Friday spotlight) the HOG logged over the last four full weeks, from
 * `AmbassadorContentLog`: the Content Hub's check, over a month.
 */
export async function contentConsistency(now: Date): Promise<ContentConsistency | null> {
  const weeks = weekBuckets(CONTENT_WEEKS + 1, now).slice(0, CONTENT_WEEKS);
  return afterMerge(3, "AmbassadorContentLog", [{ model: "AmbassadorContentLog" }], async () => {
    // requires Phase 3 merge: AmbassadorContentLog (contentType, postedAt; `week` is the ISO week of postedAt).
    const posts = (await p3.ambassadorContentLog.findMany({
      where: {
        contentType: { in: [...RHYTHM_POSTS] },
        postedAt: { gte: weeks[0].start, lt: weeks[weeks.length - 1].end },
      },
      select: { contentType: true, postedAt: true },
    })) as { contentType: string; postedAt: Date }[];
    return contentConsistencyOf(weeks, posts);
  });
}

/** Feed lines for content the HOG logged as posted today: "Content posted: Monday flier". */
export async function contentPostsToday(dayStart: Date): Promise<FeedEvent[] | null> {
  return afterMerge(3, "AmbassadorContentLog", [{ model: "AmbassadorContentLog" }], async () => {
    // requires Phase 3 merge: AmbassadorContentLog.
    const rows = (await p3.ambassadorContentLog.findMany({
      where: { postedAt: { gte: dayStart } },
      orderBy: { postedAt: "desc" },
      take: 20,
      select: { id: true, contentType: true, postedAt: true, note: true },
    })) as { id: string; contentType: string; postedAt: Date; note: string | null }[];
    return rows.map((r) => ({
      id: `content:${r.id}`,
      kind: "document" as const,
      at: r.postedAt.toISOString(),
      title: `Content posted: ${CONTENT_LABELS[r.contentType] ?? CONTENT_LABELS.OTHER}`,
      detail: r.note,
      href: "/admin/ambassadors/content",
    }));
  });
}

// ── Referrals and conversions ─────────────────────────────────────

/** A referral logged in the window (not cancelled): the funnel's first step. */
export interface SubmittedReferral {
  ambassadorId: string;
  submittedAt: Date;
}

/** Referrals submitted in [from, to), cancelled ones left out: the Ambassador Dashboard's "referrals". */
export async function referralsSubmitted(from: Date, to: Date): Promise<SubmittedReferral[] | null> {
  return afterMerge(3, "AmbassadorReferral", [{ model: "AmbassadorReferral" }], async () => {
    // requires Phase 3 merge: AmbassadorReferral (submittedAt, status).
    return (await p3.ambassadorReferral.findMany({
      where: { status: { not: "CANCELLED" }, submittedAt: { gte: from, lt: to } },
      select: { ambassadorId: true, submittedAt: true },
    })) as SubmittedReferral[];
  });
}

/** One conversion: a referral whose client paid the downpayment (`recordConversion` stamps it). */
export interface ConvertedReferral {
  id: string;
  ambassadorId: string;
  clientId: string | null;
  convertedAt: Date;
  ambassador: { fullName: string; universityId: string; status: string };
  client: { fullName: string; universityId: string; university: { name: string; abbreviation: string } } | null;
  project: {
    id: string;
    projectId: string;
    ambassadorCommission: number | null;
    parentAmbassadorId: string | null;
    parentCommission: number | null;
  } | null;
}

/** CONVERTED referrals with `convertedAt` in [from, to): either end may be open. Newest first. */
export async function convertedReferrals(from: Date | null, to: Date | null = null): Promise<ConvertedReferral[] | null> {
  return afterMerge(3, "AmbassadorReferral", [{ model: "AmbassadorReferral" }], async () => {
    const convertedAt = { not: null, ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
    // requires Phase 3 merge: AmbassadorReferral (status CONVERTED, convertedAt, clientId, projectId).
    return (await p3.ambassadorReferral.findMany({
      where: { status: "CONVERTED", convertedAt },
      orderBy: { convertedAt: "desc" },
      select: {
        id: true,
        ambassadorId: true,
        clientId: true,
        convertedAt: true,
        ambassador: { select: { fullName: true, universityId: true, status: true } },
        client: {
          select: { fullName: true, universityId: true, university: { select: { name: true, abbreviation: true } } },
        },
        project: {
          select: {
            id: true,
            projectId: true,
            ambassadorCommission: true,
            parentAmbassadorId: true,
            parentCommission: true,
          },
        },
      },
    })) as ConvertedReferral[];
  });
}

// ── Links ─────────────────────────────────────────────────────────

/**
 * Where the Growth tab sends the founder. The full leaderboard is Phase 3's
 * `/admin/ambassadors/leaderboard` (the spec's link); until that page is in
 * this build, the click-tracking board it grew from.
 */
export function growthLinks(phase3Pages: boolean): { leaderboard: string; platform: string } {
  return {
    leaderboard: phase3Pages ? "/admin/ambassadors/leaderboard?view=month" : "/admin/ambassadors/tracking",
    platform: "/admin/ambassadors",
  };
}
