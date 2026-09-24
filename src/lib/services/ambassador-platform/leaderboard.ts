import type { AmbassadorTier, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { badgesFor, isBackFromDormant, isPromotion, type Badge } from "@/lib/ambassadors/badges";
import { spotlightMessage } from "@/lib/ambassadors/spotlight";
import { shortDay, weekEnd, weekStart } from "@/lib/ambassadors/weeks";
import { currentMonthKey, monthLabel } from "@/lib/services/finance/surplus";
import { CHALLENGE_TARGET, currentQuarterKey, quarterFromKey } from "@/lib/services/ambassador-platform/commissions";

/**
 * The Leaderboard (Phase 3 Section 5): four views ranked by conversions —
 * all time (lifetime), this month, this quarter, this week (Monday start,
 * WAT) — with the commission those conversions earned and the badges, plus
 * the Friday spotlight suggestion. Months and quarters are UTC like every
 * finance figure; weeks follow the HOG's WhatsApp rhythm in WAT.
 */

export type LeaderboardView = "all" | "month" | "quarter" | "week";
export const LEADERBOARD_VIEWS: { key: LeaderboardView; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "week", label: "Weekly" },
];

const CLOSED = ["Suspended", "Terminated"];
const DAY = 86_400_000;

export interface LeaderboardRow {
  rank: number;
  id: string;
  code: string;
  fullName: string;
  school: string | null;
  tier: AmbassadorTier;
  conversions: number;
  /** Commission on the conversions counted in this view: personal + Core override on their Subs'. */
  earnings: number;
  badges: Badge[];
}

export interface Leaderboard {
  view: LeaderboardView;
  title: string;
  periodLabel: string;
  rows: LeaderboardRow[];
  totalConversions: number;
  /** Open ambassadors with no conversion in the period (not ranked). */
  unranked: number;
  generatedAt: string;
}

function monthBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function periodFor(view: LeaderboardView, now: Date): { start: Date | null; end: Date | null; title: string; periodLabel: string } {
  if (view === "all") return { start: null, end: null, title: "Leaderboard — All time", periodLabel: "All time, ranked by lifetime conversions" };
  if (view === "month") {
    const { start, end } = monthBounds(now);
    const label = monthLabel(currentMonthKey(now));
    return { start, end, title: `Leaderboard — This month (${label})`, periodLabel: `${label}, ranked by conversions this month` };
  }
  if (view === "quarter") {
    const q = quarterFromKey(currentQuarterKey(now));
    return { start: q.start, end: q.end, title: `Leaderboard — This quarter (${q.label})`, periodLabel: `${q.label}, ranked by conversions this quarter` };
  }
  const start = weekStart(now);
  const end = weekEnd(now);
  const label = `${shortDay(start)} – ${shortDay(new Date(end.getTime() - 1))}`;
  return { start, end, title: `Leaderboard — This week (${label})`, periodLabel: `Week of ${label} (resets Monday), ranked by conversions this week` };
}

/** Earnings on a set of converted referrals: the ledger amount when there is one, else the job's allocated commission. */
function tallyEarnings(
  refs: {
    ambassadorId: string;
    project: {
      ambassadorId: string | null;
      ambassadorCommission: number | null;
      parentAmbassadorId: string | null;
      parentCommission: number | null;
      payoutRecords: { leg: string; recipientId: string; amount: number }[];
    } | null;
  }[]
): Map<string, number> {
  const earnings = new Map<string, number>();
  const add = (id: string, amount: number) => earnings.set(id, (earnings.get(id) ?? 0) + amount);
  for (const r of refs) {
    const p = r.project;
    if (!p) continue;
    const personal = p.payoutRecords.find((x) => x.leg === "AMBASSADOR" && x.recipientId === r.ambassadorId);
    if (personal) add(r.ambassadorId, personal.amount);
    else if (p.ambassadorId === r.ambassadorId && p.ambassadorCommission) add(r.ambassadorId, p.ambassadorCommission);
    if (p.parentAmbassadorId) {
      const override = p.payoutRecords.find((x) => x.leg === "PARENT" && x.recipientId === p.parentAmbassadorId);
      if (override) add(p.parentAmbassadorId, override.amount);
      else if (p.parentCommission) add(p.parentAmbassadorId, p.parentCommission);
    }
  }
  return earnings;
}

const REF_SELECT = {
  ambassadorId: true,
  convertedAt: true,
  project: {
    select: {
      ambassadorId: true,
      ambassadorCommission: true,
      parentAmbassadorId: true,
      parentCommission: true,
      payoutRecords: { where: { status: { not: "CANCELLED" }, leg: { in: ["AMBASSADOR", "PARENT"] } }, select: { leg: true, recipientId: true, amount: true } },
    },
  },
} satisfies Prisma.AmbassadorReferralSelect;

/** Badges for a set of ambassadors, as of `now`. */
export async function badgesForAmbassadors(ambassadors: { id: string; lifetimeConversions: number; createdAt: Date }[], now: Date = new Date()): Promise<Map<string, Badge[]>> {
  const ids = ambassadors.map((a) => a.id);
  const out = new Map<string, Badge[]>();
  if (ids.length === 0) return out;
  const { start: mStart } = monthBounds(now);
  const qKey = currentQuarterKey(now);
  const quarter = quarterFromKey(qKey);
  const d7 = new Date(now.getTime() - 7 * DAY);
  const [challenges, tierLogs, previous] = await Promise.all([
    db.ambassadorQuarterlyChallenge.findMany({ where: { quarter: qKey, ambassadorId: { in: ids } }, select: { ambassadorId: true, targetCount: true, completed: true, extensionGranted: true, extensionEndDate: true } }),
    db.ambassadorTierLog.findMany({ where: { ambassadorId: { in: ids }, createdAt: { gte: mStart } }, orderBy: { createdAt: "asc" }, select: { ambassadorId: true, fromTier: true, toTier: true } }),
    db.ambassadorReferral.groupBy({ by: ["ambassadorId"], where: { ambassadorId: { in: ids }, status: "CONVERTED", convertedAt: { lt: mStart } }, _max: { convertedAt: true } }),
  ]);
  const latestExtension = challenges.reduce<Date | null>((m, c) => (c.extensionGranted && c.extensionEndDate && (!m || c.extensionEndDate > m) ? c.extensionEndDate : m), null);
  const windowStart = new Date(Math.min(quarter.start.getTime(), mStart.getTime(), d7.getTime()));
  const windowEnd = latestExtension && latestExtension > quarter.end ? latestExtension : new Date(Math.max(quarter.end.getTime(), now.getTime() + 1));
  const recent = await db.ambassadorReferral.findMany({
    where: { ambassadorId: { in: ids }, status: "CONVERTED", convertedAt: { gte: windowStart, lt: windowEnd } },
    select: { ambassadorId: true, convertedAt: true },
  });
  const prevOf = new Map(previous.map((p) => [p.ambassadorId, p._max.convertedAt]));
  for (const a of ambassadors) {
    const mine = recent.filter((r) => r.ambassadorId === a.id && r.convertedAt);
    const ch = challenges.find((c) => c.ambassadorId === a.id);
    const challengeEnd = ch?.extensionGranted && ch.extensionEndDate ? ch.extensionEndDate : quarter.end;
    const inChallenge = mine.filter((r) => r.convertedAt! >= quarter.start && r.convertedAt! < challengeEnd).length;
    const target = ch?.targetCount ?? CHALLENGE_TARGET;
    const thisMonth = mine.filter((r) => r.convertedAt! >= mStart).map((r) => r.convertedAt!).sort((x, y) => x.getTime() - y.getTime());
    // Tier logs store the tier names as plain strings.
    const promotions = tierLogs.filter((t) => t.ambassadorId === a.id && isPromotion(t.fromTier as AmbassadorTier, t.toTier as AmbassadorTier));
    out.set(
      a.id,
      badgesFor({
        lifetimeConversions: a.lifetimeConversions,
        conversionsLast7Days: mine.filter((r) => r.convertedAt! >= d7).length,
        challengeComplete: Boolean(ch?.completed) || inChallenge >= target,
        tierUpThisMonthTo: promotions.length ? (promotions[promotions.length - 1].toTier as AmbassadorTier) : null,
        backFromDormant: isBackFromDormant(thisMonth[0] ?? null, prevOf.get(a.id) ?? null, a.createdAt),
      })
    );
  }
  return out;
}

export async function getLeaderboard(view: LeaderboardView, now: Date = new Date()): Promise<Leaderboard> {
  const period = periodFor(view, now);
  const [ambassadors, refs] = await Promise.all([
    db.ambassador.findMany({
      where: { status: { notIn: CLOSED } },
      select: { id: true, ambassadorId: true, fullName: true, tier: true, lifetimeConversions: true, createdAt: true, university: { select: { abbreviation: true } } },
    }),
    db.ambassadorReferral.findMany({
      where: { status: "CONVERTED", ...(period.start && period.end ? { convertedAt: { gte: period.start, lt: period.end } } : {}) },
      select: REF_SELECT,
    }),
  ]);
  const open = new Set(ambassadors.map((a) => a.id));
  const counts = new Map<string, number>();
  for (const r of refs) counts.set(r.ambassadorId, (counts.get(r.ambassadorId) ?? 0) + 1);
  const earnings = tallyEarnings(refs);

  const ranked = ambassadors
    .map((a) => ({ a, conversions: view === "all" ? a.lifetimeConversions : (counts.get(a.id) ?? 0), earnings: Math.round(earnings.get(a.id) ?? 0) }))
    .filter((x) => x.conversions > 0)
    .sort((x, y) => y.conversions - x.conversions || y.earnings - x.earnings || x.a.fullName.localeCompare(y.a.fullName));
  const badges = await badgesForAmbassadors(ranked.map((x) => x.a), now);

  // Competition ranking: equal conversions and equal earnings share a rank (1, 2, 2, 4).
  const rows: LeaderboardRow[] = [];
  ranked.forEach((x, i) => {
    const prev = ranked[i - 1];
    const rank = prev && prev.conversions === x.conversions && prev.earnings === x.earnings ? rows[i - 1].rank : i + 1;
    rows.push({ rank, id: x.a.id, code: x.a.ambassadorId, fullName: x.a.fullName, school: x.a.university?.abbreviation ?? null, tier: x.a.tier, conversions: x.conversions, earnings: x.earnings, badges: badges.get(x.a.id) ?? [] });
  });

  return {
    view,
    title: period.title,
    periodLabel: period.periodLabel,
    rows,
    totalConversions: view === "all" ? rows.reduce((s, r) => s + r.conversions, 0) : refs.filter((r) => open.has(r.ambassadorId)).length,
    unranked: ambassadors.length - rows.length,
    generatedAt: now.toISOString(),
  };
}

// ── Friday spotlight ─────────────────────────────────────────────────────

export interface SpotlightCandidate {
  ambassadorId: string;
  fullName: string;
  school: string | null;
  tier: AmbassadorTier;
  thisWeek: number;
  lastWeek: number;
  thisMonth: number;
  referralsThisWeek: number;
}

export interface Spotlight extends SpotlightCandidate {
  message: string;
}

export interface WeeklySpotlight {
  top: Spotlight | null;
  /** Everyone with activity this week or a conversion this month, best first — the HOG may pick any. */
  candidates: SpotlightCandidate[];
  weekLabel: string;
}

/** Top ambassador this week: conversions, then referrals submitted, then lifetime conversions. */
export async function weeklySpotlight(now: Date = new Date()): Promise<WeeklySpotlight> {
  const thisWeek = weekStart(now);
  const lastWeek = new Date(thisWeek.getTime() - 7 * DAY);
  const { start: mStart } = monthBounds(now);
  const since = new Date(Math.min(lastWeek.getTime(), mStart.getTime()));
  const [ambassadors, rows] = await Promise.all([
    db.ambassador.findMany({ where: { status: { notIn: CLOSED } }, select: { id: true, fullName: true, tier: true, lifetimeConversions: true, university: { select: { abbreviation: true } } } }),
    db.ambassadorReferral.findMany({
      where: { status: { not: "CANCELLED" }, OR: [{ submittedAt: { gte: since } }, { convertedAt: { gte: since } }] },
      select: { ambassadorId: true, status: true, submittedAt: true, convertedAt: true },
    }),
  ]);
  const stats = new Map<string, { thisWeek: number; lastWeek: number; thisMonth: number; referralsThisWeek: number }>();
  for (const r of rows) {
    const s = stats.get(r.ambassadorId) ?? { thisWeek: 0, lastWeek: 0, thisMonth: 0, referralsThisWeek: 0 };
    if (r.submittedAt >= thisWeek) s.referralsThisWeek += 1;
    if (r.status === "CONVERTED" && r.convertedAt) {
      if (r.convertedAt >= thisWeek) s.thisWeek += 1;
      else if (r.convertedAt >= lastWeek) s.lastWeek += 1;
      if (r.convertedAt >= mStart) s.thisMonth += 1;
    }
    stats.set(r.ambassadorId, s);
  }
  const candidates: SpotlightCandidate[] = ambassadors
    .map((a) => {
      const s = stats.get(a.id) ?? { thisWeek: 0, lastWeek: 0, thisMonth: 0, referralsThisWeek: 0 };
      return { ambassadorId: a.id, fullName: a.fullName, school: a.university?.abbreviation ?? null, tier: a.tier, ...s, lifetime: a.lifetimeConversions };
    })
    .filter((c) => c.thisWeek > 0 || c.referralsThisWeek > 0 || c.thisMonth > 0)
    .sort((x, y) => y.thisWeek - x.thisWeek || y.referralsThisWeek - x.referralsThisWeek || y.thisMonth - x.thisMonth || y.lifetime - x.lifetime || x.fullName.localeCompare(y.fullName))
    .map(({ lifetime: _lifetime, ...c }) => c);
  const first = candidates.find((c) => c.thisWeek > 0 || c.referralsThisWeek > 0) ?? null;
  const end = new Date(weekEnd(now).getTime() - 1);
  return {
    top: first ? { ...first, message: spotlightMessage(first) } : null,
    candidates,
    weekLabel: `${shortDay(thisWeek)} – ${shortDay(end)}`,
  };
}
