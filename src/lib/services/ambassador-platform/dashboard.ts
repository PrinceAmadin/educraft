import type { AmbassadorTier, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { activityStatus, calculateTier, conversionsTillNextTier, isEligibleForSubTeam, nextTier, tierLabel } from "@/lib/ambassadors/tier-utils";
import { AMBASSADOR_TIERS } from "@/lib/finance/commission-config";
import { lastWeeks, weekStart } from "@/lib/ambassadors/weeks";
import { currentMonthKey, monthLabel, quarterOf } from "@/lib/services/finance/surplus";
import { weekRhythm, type WeekRhythm } from "@/lib/services/ambassador-platform/content";
import { weeklySpotlight, type Spotlight } from "@/lib/services/ambassador-platform/leaderboard";
import { renewalDueWhere } from "@/lib/services/ambassador-platform/partnerships";

/**
 * The Ambassador Dashboard (Phase 3 Section 1): "what is the network doing
 * right now?" — four stats against last month, the tier mix, what needs a
 * hand, twelve weeks of referrals vs conversions, and the HOG's rhythm.
 * Everything is derived from Ambassador / AmbassadorReferral rows.
 */

const DAY = 86_400_000;
const OPEN: Prisma.AmbassadorWhereInput = { status: { notIn: ["Suspended", "Terminated"] } };

/** Activation target (spec: 25%, growing to 35%). */
export const ACTIVATION_TARGET = 0.25;
export const ACTIVATION_STRETCH = 0.35;

export interface DashboardStats {
  total: number;
  newThisMonth: number;
  active: { count: number; rate: number; lastRate: number; target: number; tone: "success" | "gold" | "danger" };
  referralsMtd: { count: number; lastMonth: number };
  conversionsMtd: { count: number; lastMonth: number };
  month: string;
  monthLabel: string;
}

export interface TierSlice {
  tier: AmbassadorTier;
  label: string;
  count: number;
  percent: number;
}

export interface AttentionCounts {
  inactive60: number;
  nearPromotion: number;
  platinumBonus: number;
  readySubTeams: number;
  renewalsDue: number;
}

export interface WeekPoint {
  key: string;
  label: string;
  referrals: number;
  conversions: number;
}

/** The Friday spotlight is computed once, by the leaderboard service, so both pages always suggest the same person. */
export type { Spotlight } from "@/lib/services/ambassador-platform/leaderboard";

export interface AmbassadorDashboard {
  stats: DashboardStats;
  tiers: TierSlice[];
  attention: AttentionCounts;
  weekly: WeekPoint[];
  rhythm: WeekRhythm;
  spotlight: Spotlight | null;
  generatedAt: string;
}

function monthStart(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

function previousMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextMonthStart(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1));
}

export async function getAmbassadorDashboard(now: Date = new Date()): Promise<AmbassadorDashboard> {
  const month = currentMonthKey(now);
  const lastMonth = previousMonthKey(month);
  const mStart = monthStart(month);
  const mNext = nextMonthStart(month);
  const lmStart = monthStart(lastMonth);
  const d30 = new Date(now.getTime() - 30 * DAY);
  const d60 = new Date(now.getTime() - 60 * DAY);
  const weeks = lastWeeks(12, now);
  const thisWeekStart = weekStart(now);
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * DAY);
  const quarter = quarterOf(month);
  const [qy, qm] = quarter.months[0].split("-").map(Number);
  const qStart = new Date(Date.UTC(qy, qm - 1, 1));
  const quarterKey = `Q${quarter.key.split("-Q")[1]}-${qy}`;

  // Small sequential batches: Prisma's pool is shared with every other page.
  const ambassadors = await db.ambassador.findMany({
    where: OPEN,
    select: { id: true, fullName: true, tier: true, lifetimeConversions: true, lastConversionAt: true, lastReferralAt: true, createdAt: true, parentId: true, university: { select: { abbreviation: true } }, _count: { select: { children: true } } },
  });
  const [referralsMtd, referralsLast, conversionsMtd, conversionsLast] = await Promise.all([
    db.ambassadorReferral.count({ where: { status: { not: "CANCELLED" }, submittedAt: { gte: mStart, lt: mNext } } }),
    db.ambassadorReferral.count({ where: { status: { not: "CANCELLED" }, submittedAt: { gte: lmStart, lt: mStart } } }),
    db.ambassadorReferral.count({ where: { status: "CONVERTED", convertedAt: { gte: mStart, lt: mNext } } }),
    db.ambassadorReferral.count({ where: { status: "CONVERTED", convertedAt: { gte: lmStart, lt: mStart } } }),
  ]);
  const [recent, weekRows, quarterConversions, challengesPaid, renewalsDue, rhythm] = await Promise.all([
    // Activity over the last 60 days, per ambassador, for "active this month" vs the previous window.
    db.ambassadorReferral.findMany({ where: { status: "CONVERTED", convertedAt: { gte: d60 } }, select: { ambassadorId: true, convertedAt: true } }),
    db.ambassadorReferral.findMany({ where: { status: { not: "CANCELLED" }, OR: [{ submittedAt: { gte: weeks[0].start } }, { convertedAt: { gte: weeks[0].start } }] }, select: { ambassadorId: true, submittedAt: true, convertedAt: true, status: true } }),
    db.ambassadorReferral.groupBy({ by: ["ambassadorId"], where: { status: "CONVERTED", convertedAt: { gte: qStart } }, _count: { _all: true } }),
    db.ambassadorQuarterlyChallenge.findMany({ where: { quarter: quarterKey, bonusPaid: true }, select: { ambassadorId: true } }),
    db.partnership.count({ where: renewalDueWhere(now) }),
    weekRhythm(now),
  ]);

  // ── Stats ──
  const total = ambassadors.length;
  const newThisMonth = ambassadors.filter((a) => a.createdAt >= mStart).length;
  // "Active this month" = a conversion in the last 30 days (a referral that
  // has not paid does not count); "last month" = the same rule as it stood 30
  // days ago (a conversion in days 30–60).
  const activeNow = new Set<string>();
  const activeBefore = new Set<string>();
  for (const r of recent) {
    const d = r.convertedAt;
    if (!d) continue;
    if (d >= d30) activeNow.add(r.ambassadorId);
    else if (d >= d60) activeBefore.add(r.ambassadorId);
  }
  const openIds = new Set(ambassadors.map((a) => a.id));
  const activeCount = [...activeNow].filter((id) => openIds.has(id)).length;
  const beforeCount = [...activeBefore].filter((id) => openIds.has(id)).length;
  const rate = total > 0 ? activeCount / total : 0;
  const lastRate = total > 0 ? beforeCount / total : 0;
  const tone: DashboardStats["active"]["tone"] = rate >= ACTIVATION_STRETCH ? "success" : rate >= ACTIVATION_TARGET ? "gold" : "danger";

  // ── Tiers ──
  const tiers: TierSlice[] = [...AMBASSADOR_TIERS]
    .sort((a, b) => a.minConversions - b.minConversions)
    .map((t) => {
      const count = ambassadors.filter((a) => a.tier === t.name).length;
      return { tier: t.name, label: t.label, count, percent: total > 0 ? Math.round((count / total) * 100) : 0 };
    });

  // ── Needs attention ──
  const inactive60 = ambassadors.filter((a) => activityStatus(a, now) === "INACTIVE").length;
  const nearPromotion = ambassadors.filter((a) => {
    const left = conversionsTillNextTier(a.lifetimeConversions);
    return left != null && left > 0 && left <= 2;
  }).length;
  const paidSet = new Set(challengesPaid.map((c) => c.ambassadorId));
  const quarterMap = new Map(quarterConversions.map((q) => [q.ambassadorId, q._count._all]));
  const platinumBonus = ambassadors.filter((a) => calculateTier(a.lifetimeConversions) === "PLATINUM" && (quarterMap.get(a.id) ?? 0) > 0 && !paidSet.has(a.id)).length;
  const readySubTeams = ambassadors.filter((a) => !a.parentId && isEligibleForSubTeam(a.tier) && a._count.children === 0).length;

  // ── Weekly chart ──
  const weekly: WeekPoint[] = weeks.map((w) => ({
    key: w.key,
    label: w.label,
    referrals: weekRows.filter((r) => r.submittedAt >= w.start && r.submittedAt < w.end).length,
    conversions: weekRows.filter((r) => r.status === "CONVERTED" && r.convertedAt != null && r.convertedAt >= w.start && r.convertedAt < w.end).length,
  }));

  // ── Friday spotlight (shared with the leaderboard) ──
  const spotlight = (await weeklySpotlight(now)).top;

  return {
    stats: {
      total,
      newThisMonth,
      active: { count: activeCount, rate: Math.round(rate * 100), lastRate: Math.round(lastRate * 100), target: Math.round(ACTIVATION_TARGET * 100), tone },
      referralsMtd: { count: referralsMtd, lastMonth: referralsLast },
      conversionsMtd: { count: conversionsMtd, lastMonth: conversionsLast },
      month,
      monthLabel: monthLabel(month),
    },
    tiers,
    attention: { inactive60, nearPromotion, platinumBonus, readySubTeams, renewalsDue },
    weekly,
    rhythm,
    spotlight,
    generatedAt: now.toISOString(),
  };
}

/** Where a tier's next step is, for the tier cards' captions. */
export function tierCaption(tier: AmbassadorTier): string {
  const next = nextTier(tier);
  const t = AMBASSADOR_TIERS.find((x) => x.name === tier)!;
  const range = !Number.isFinite(t.maxConversions) ? `${t.minConversions}+` : `${t.minConversions}–${t.maxConversions}`;
  return next ? `${range} conversions · ${Math.round(t.rate * 100)}% · next ${tierLabel(next)}` : `${range} conversions · ${Math.round(t.rate * 100)}% + quarterly bonus`;
}
